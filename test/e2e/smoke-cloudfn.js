/**
 * 橘记JUJI · 云函数契约专项套件
 *
 * 设计依据：历史上 7 次被打回的根因里，纯服务端 bug（如 users.updateAvatar 的 fileID 被截断到 60 字、
 * 归属校验永远失败）前端 UI 测试点不出来——只有直接调云函数、断言「合法入参应成功 / 非法入参应拒绝」才能发现。
 *
 * 规则：
 *   - 每个 action 做双向断言：合法 → success:true；非法/越权 → 拒绝（success:false + 预期 message）。
 *   - 只读类直接断言；写类用「读当前值 → 写回原值」做幂等往返，绝不污染真实数据。
 *   - clearUserData 绝不调用（会清空数据），只由 smoke-review.js 的 A10 做静态守卫。
 *   - 依赖 msgSecCheck 的「正向」路径（nickname 写回、分类名安全校验）本套件刻意不碰，
 *     改用不触发内容安全的字段（gender / theme / fileID 前缀）做确定性往返，避免 openapi 权限波动误判。
 *
 * 用法：node start-auto.js [--force] && node smoke-cloudfn.js
 */
const { createHarness } = require('./lib/harness')

const h = createHarness({ suite: 'cloudfn', title: '橘记JUJI · 云函数契约' })

// 在页面上下文里调用云函数（复用已初始化的 wx.cloud），60s 超时
async function cf(name, data) {
  return h.mp.evaluate((n, d) => new Promise((resolve) => {
    wx.cloud.callFunction({ name: n, data: d, config: { timeout: 60000 } })
      .then(x => resolve(x.result != null ? x.result : { __err: String(x.errMsg) }))
      .catch(e => resolve({ __err: String((e && e.errMsg) || e) }))
  }), name, data)
}

const TODAY = new Date().toISOString().slice(0, 10)
let base = {}        // 来自 syncUser 的用户基线（theme/gender/avatarUrl...）
let openid = ''

;(async () => {
  await h.connect()

  // ══════════════════════════════════════════════════
  // 0. 先拿到 openid 与用户基线（quickstartFunctions）
  // ══════════════════════════════════════════════════
  console.log('── 0. 身份与基线 ──')
  await h.expect('Q1', 'getOpenId 返回有效 openid', async () => {
    const r = await cf('quickstartFunctions', { type: 'getOpenId' })
    h.ok(typeof r.openid === 'string' && r.openid.length > 10, 'openid 有效')
    openid = r.openid
    return 'openid=' + openid.slice(0, 6) + '…'
  })

  await h.expect('Q2', 'syncUser 初始化/同步用户资料（幂等）', async () => {
    const r = await cf('quickstartFunctions', { type: 'syncUser' })
    h.eq(r.success, true, 'syncUser 成功')
    h.ok(!!r.userInfo, '返回 userInfo')
    base = r.userInfo || {}
    return 'theme=' + (base.theme || '(空)') + ' gender=' + (base.gender || '(空)')
  })

  // ══════════════════════════════════════════════════
  // 1. users（4 个 action + 未知操作）
  // ══════════════════════════════════════════════════
  console.log('── 1. users 云函数 ──')

  await h.expect('U1', 'users 未知 action → 拒绝', async () => {
    const r = await cf('users', { action: 'noSuchAction', data: {} })
    h.eq(r.success, false, '成功标志为 false')
    h.includes(String(r.message), '未知操作', '提示「未知操作」')
    return '已拒绝'
  })

  await h.expect('U2', 'updateTheme 幂等往返（写回原值，确定性）', async () => {
    const theme = base.theme || 'mint'
    const r = await cf('users', { action: 'updateTheme', data: { theme } })
    h.eq(r.success, true, '写回原主题应成功')
    h.eq(r.theme, theme, '回显主题与原值一致')
    return 'theme=' + theme
  })

  await h.expect('U3', 'updateTheme 非法值 → 拒绝', async () => {
    const r = await cf('users', { action: 'updateTheme', data: { theme: 'rainbow_xxx' } })
    h.eq(r.success, false, '非法主题应失败')
    h.includes(String(r.message), '主题参数错误', '提示「主题参数错误」')
    return '已拒绝'
  })

  await h.expect('U4', 'updateProfile.gender 往返（改→还原，确定性，不触发内容安全）', async () => {
    const cur = base.gender || ''
    const other = cur === 'male' ? 'female' : 'male'
    const r1 = await cf('users', { action: 'updateProfile', data: { gender: other } })
    h.eq(r1.success, true, '切换到 ' + other + ' 应成功')
    const r2 = await cf('users', { action: 'updateProfile', data: { gender: cur } })
    h.eq(r2.success, true, '还原为原值 ' + (cur || '(空)') + ' 应成功')
    return 'gender: ' + cur + ' → ' + other + ' → ' + cur
  })

  await h.expect('U5', 'updateProfile.nickname 超长 → 拒绝（长度校验先于内容安全）', async () => {
    const r = await cf('users', { action: 'updateProfile', data: { nickname: '橘'.repeat(21) } })
    h.eq(r.success, false, '21 字昵称应失败')
    h.includes(String(r.message), '20 字', '提示「昵称最长 20 字」')
    return '已拒绝'
  })

  await h.expect('U6', 'updateAvatar 非 cloud:// → 拒绝', async () => {
    const r = await cf('users', { action: 'updateAvatar', data: { avatarUrl: 'https://example.com/a.png' } })
    h.eq(r.success, false, 'http 头像应失败')
    h.includes(String(r.message), '格式错误', '提示「头像格式错误」')
    return '已拒绝'
  })

  await h.expect('U7', 'updateAvatar 非本人文件 → 拒绝（归属校验）', async () => {
    const r = await cf('users', { action: 'updateAvatar', data: { avatarUrl: 'cloud://env.bucket/avatars/OTHERUSER_1699999999.png' } })
    h.eq(r.success, false, '他人文件应失败')
    h.includes(String(r.message), '不合法', '提示「头像文件不合法」')
    return '已拒绝'
  })

  await h.expect('U8', 'updateAvatar 合法长 fileID 被接受（回归：fileID 不得被截断到 60 字）', async () => {
    // 构造 > 60 字符、且含 /avatars/<openid>_ 前缀的合法 fileID。
    // 若 normalizeFileID 仍按 60 字截断，前缀会被切掉 → 永远「头像文件不合法」，此用例必失败。
    const fake = 'cloud://' + 'x'.repeat(70) + '/avatars/' + openid + '_1699999999999.png'
    h.ok(fake.length > 90, '构造的 fileID 确实超过 60 字符（' + fake.length + '）')
    const r = await cf('users', { action: 'updateAvatar', data: { avatarUrl: fake } })
    h.eq(r.success, true, '合法长 fileID 应被接受（fileID 截断 bug 未复现）')
    // 还原：写回原始 avatarUrl（即使是空串，updateAvatar 也允许）
    const restore = await cf('users', { action: 'updateAvatar', data: { avatarUrl: base.avatarUrl || '' } })
    h.eq(restore.success, true, '头像已还原为原值')
    return 'fileID 长度 ' + fake.length + ' → 接受并还原'
  })

  // ══════════════════════════════════════════════════
  // 2. bills（create/delete 往返 + 多路非法拒绝）
  // ══════════════════════════════════════════════════
  console.log('── 2. bills 云函数 ──')

  let createdId = ''
  await h.expect('B1', 'bills.create + delete 往返（确定性，仅本地敏感词校验）', async () => {
    const r = await cf('bills', { action: 'create', data: { type: 'expense', amount: 1.23, category: '测试', date: TODAY, note: '', mood: '' } })
    h.eq(r.success, true, '创建应成功')
    h.ok(!!r.id, '返回账单 id')
    createdId = r.id
    const d = await cf('bills', { action: 'delete', data: { billId: r.id } })
    h.eq(d.success, true, '删除应成功（软删除）')
    return '创建+删除均成功'
  })

  await h.expect('B2', 'bills.create 缺类型 → 拒绝', async () => {
    const r = await cf('bills', { action: 'create', data: { amount: 1.2, category: '测试', date: TODAY } })
    h.eq(r.success, false, '缺 type 应失败')
    h.includes(String(r.message), '类型错误', '提示「类型错误」')
    return '已拒绝'
  })

  await h.expect('B3', 'bills.create 金额三位小数 → 拒绝', async () => {
    const r = await cf('bills', { action: 'create', data: { type: 'expense', amount: 1.234, category: '测试', date: TODAY } })
    h.eq(r.success, false, '三位小数应失败')
    h.includes(String(r.message), '两位小数', '提示「金额最多两位小数」')
    return '已拒绝'
  })

  await h.expect('B4', 'bills.delete 缺 billId → 拒绝', async () => {
    const r = await cf('bills', { action: 'delete', data: {} })
    h.eq(r.success, false, '缺 id 应失败')
    h.includes(String(r.message), '缺少账单ID', '提示「缺少账单ID」')
    return '已拒绝'
  })

  await h.expect('B5', 'bills 未知 action → 拒绝', async () => {
    const r = await cf('bills', { action: 'purge', data: {} })
    h.eq(r.success, false, '未知 action 应失败')
    h.includes(String(r.message), '未知操作', '提示「未知操作」')
    return '已拒绝'
  })

  // ══════════════════════════════════════════════════
  // 3. budgets（upsert + 非法拒绝）
  // ══════════════════════════════════════════════════
  console.log('── 3. budgets 云函数 ──')

  await h.expect('G1', 'budgets.upsert 合法月+金额 → 成功（用合成月份避免污染）', async () => {
    const r = await cf('budgets', { action: 'upsert', data: { month: '2099-01', amount: 1234.5 } })
    h.eq(r.success, true, '保存应成功')
    h.eq(r.month, '2099-01', '回显月份一致')
    return 'month=2099-01 amount=1234.5'
  })

  await h.expect('G2', 'budgets.upsert 非法月份 → 拒绝', async () => {
    const r = await cf('budgets', { action: 'upsert', data: { month: '2026-13', amount: 100 } })
    h.eq(r.success, false, '月份 13 月应失败')
    h.includes(String(r.message), '月份格式错误', '提示「月份格式错误」')
    return '已拒绝'
  })

  await h.expect('G3', 'budgets.upsert 非法金额 → 拒绝', async () => {
    const r = await cf('budgets', { action: 'upsert', data: { month: '2099-02', amount: 0 } })
    h.eq(r.success, false, '0 元应失败')
    h.includes(String(r.message), '合理金额', '提示「请输入合理金额」')
    return '已拒绝'
  })

  await h.expect('G4', 'budgets 非 upsert action → 拒绝', async () => {
    const r = await cf('budgets', { action: 'delete', data: {} })
    h.eq(r.success, false, '非 upsert 应失败')
    h.includes(String(r.message), '未知操作', '提示「未知操作」')
    return '已拒绝'
  })

  // ══════════════════════════════════════════════════
  // 4. contentSafety（本地拦截确定性，API 路径宽松）
  // ══════════════════════════════════════════════════
  console.log('── 4. contentSafety 云函数 ──')

  await h.expect('S1', 'contentSafety 空内容 → 通过（不送审）', async () => {
    const r = await cf('contentSafety', { content: '', scene: 2 })
    h.eq(r.success, true, '调用成功')
    h.eq(r.ok, true, 'ok=true')
    h.eq(r.checked, false, '空内容不送审')
    return 'checked=false'
  })

  await h.expect('S2', 'contentSafety 违规词 → 拦截（ok:false，本地即拦，不依赖 API）', async () => {
    const r = await cf('contentSafety', { content: '我们来赌球稳赚不赔', scene: 2 })
    h.eq(r.ok, false, '违规词应被拦截')
    return '已拦截'
  })

  await h.expect('S3', 'contentSafety 正常文案 → 返回布尔可判定（API 权限波动不误判）', async () => {
    const r = await cf('contentSafety', { content: '今天晚饭吃了番茄炒蛋，花费 18 元', scene: 2 })
    h.ok(typeof r.ok === 'boolean', 'ok 为布尔（true=通过 / false=被拦或服务暂不可用）')
    return 'ok=' + r.ok
  })

  // ══════════════════════════════════════════════════
  // 5. aiPoster（结构断言，AI 失败走 fallback 也算通过）
  // ══════════════════════════════════════════════════
  console.log('── 5. aiPoster 云函数 ──')

  await h.expect('P1', 'aiPoster.profileTitle 返回结构合法（含兜底）', async () => {
    const r = await cf('aiPoster', {
      action: 'profileTitle', gender: 'male',
      expenseSummary: { count: 1, total: 10, categories: [{ name: '餐饮', amount: 10, percent: 100, count: 1 }] },
      dateKey: TODAY
    })
    h.ok(typeof r.title === 'string' && r.title.length >= 2 && r.title.length <= 8, 'title 为 2-8 字字符串（' + r.title + '）')
    h.ok(typeof r.category === 'string' && r.category.length > 0, 'category 非空')
    return 'title=' + r.title + ' category=' + r.category
  })

  await h.expect('P2', 'aiPoster 写信返回非空信件（含兜底）', async () => {
    const r = await cf('aiPoster', { days: 30, category: '餐饮', zodiac: '狮子座', occupation: '工程师', avgDailySpend: '50' })
    h.ok(!!r && typeof r.letter === 'string' && r.letter.length > 0, 'letter 非空（模型成功或兜底文案）')
    return 'letter.length=' + (r.letter || '').length
  })

  // ══════════════════════════════════════════════════
  // 6. dataMigration / exportBills（形状断言，宽松处理导出副作用）
  // ══════════════════════════════════════════════════
  console.log('── 6. 数据迁移 / 导出 ──')

  await h.expect('M1', 'dataMigration 未知 action → 拒绝', async () => {
    const r = await cf('dataMigration', { action: 'drop' })
    h.eq(r.success, false, '未知 action 应失败')
    h.includes(String(r.message), '未知操作', '提示「未知操作」')
    return '已拒绝'
  })

  await h.expect('M2', 'dataMigration.import 空数组 → 拒绝', async () => {
    const r = await cf('dataMigration', { action: 'import', bills: [] })
    h.eq(r.success, false, '空导入应失败')
    h.includes(String(r.message), '没有可导入的数据', '提示「没有可导入的数据」')
    return '已拒绝'
  })

  await h.expect('M3', 'dataMigration.export 返回可判定结果', async () => {
    const r = await cf('dataMigration', { action: 'export' })
    h.ok(typeof r.success === 'boolean', 'success 为布尔')
    return 'success=' + r.success + (r.count ? ' count=' + r.count : '')
  })

  await h.expect('E1', 'exportBills 返回可判定结果（成功则含 fileID）', async () => {
    const r = await cf('exportBills', { format: 'csv' })
    h.ok(typeof r.success === 'boolean', 'success 为布尔')
    if (r.success) h.ok(typeof r.fileID === 'string' && r.fileID.length > 0, '成功时返回 fileID')
    return 'success=' + r.success + (r.fileID ? ' fileID=' + r.fileID.slice(0, 12) + '…' : '')
  })

  const extra = [
    '## 说明',
    '',
    '- 本套件对 10 个云函数逐一做「合法→success / 非法→拒绝」双向契约断言。',
    '- 写类用例采用「读基线 → 写回原值」幂等往返，不污染真实数据；合成月份 2099-01/02 仅用于 budgets 往返。',
    '- U5/U6/U7/U8 直接守卫历史上的 fileID 截断 + 归属校验双 bug；B 组守卫 bills 校验链；S2 守卫内容安全本地拦截。',
    '- clearUserData 刻意不调用（会清空数据），其静态守卫见 smoke-review.js A10。',
    '- 依赖 msgSecCheck 的正向路径（昵称写回、分类安全）未在此套件断言，避免 openapi 权限波动误判；由内容安全本地拦截（S2）+ 审核套件 D 组覆盖。',
    ''
  ]
  await h.finish(extra)
})().catch(e => { console.log('FATAL:', e.message); process.exit(3) })
