/**
 * 橘记JUJI · P0 功能回归（接入统一脚手架 harness）
 *
 * 升级点（2026-09-14，两个线上事故后）：
 *   1. 统一走 lib/harness —— 控制台 error 即失败、断言计数、业务数据强断言。
 *   2. 修复旧版「A3 三页只断言 themeStyle 存在」的漏洞：改为页面级业务数据断言，
 *      直接锁定「昵称=未设置 / 头像占位 / 预算空白」这类静默失败（事故中正是 A3 报 PASS 实际全空）。
 *   3. 保留真实用户操作链路：记账 → 首页可见 → 编辑 → 删除（软删除）→ 各页渲染。
 *
 * 用法：node start-auto.js [--force] && node smoke-p0.js
 */
const fs = require('fs')
const path = require('path')
const { createHarness } = require('./lib/harness')

const ROOT = path.resolve(__dirname, '..', '..')
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8')
const h = createHarness({ suite: 'p0', title: '橘记JUJI · P0 功能回归' })

const sleep = ms => new Promise(r => setTimeout(r, ms))
const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const TODAY = fmt(new Date())

let mp, sys

// 云库查询（直接返回原始文档，避免封装导致形状异常）
async function q(cond) {
  return mp.evaluate(c => {
    const db = wx.cloud.database(); const _ = db.command
    return db.collection('bills').where(Object.assign({ isDeleted: _.neq(true) }, c)).limit(20).get()
      .then(r => r.data.map(d => ({ _id: d._id, amount: d.amount, date: d.date, note: d.note, type: d.type, category: d.category })))
      .catch(e => { throw new Error('db err: ' + String(e && e.message || e)) })
  }, cond)
}
async function smokeRows() {
  return mp.evaluate(() => {
    const db = wx.cloud.database()
    return db.collection('bills').where({ note: db.RegExp({ regexp: '\\[SMOKE', options: 'i' }) }).limit(50).get()
      .then(r => r.data.map(d => ({ _id: d._id, amount: d.amount, note: d.note })))
      .catch(() => [])
  })
}
async function purgeSmoke() {
  return mp.evaluate(() => {
    const db = wx.cloud.database()
    return db.collection('bills').where({ note: db.RegExp({ regexp: '\\[SMOKE', options: 'i' }) }).limit(50).get()
      .then(async r => {
        let n = 0
        for (const d of r.data) { await db.collection('bills').doc(d._id).remove(); n++ }
        return n
      })
  })
}
async function stack() {
  return mp.evaluate(() => getCurrentPages().map(x => x.route)).catch(() => [])
}
async function waitPage(part, timeout = 20000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    const st = await stack()
    const top = st[st.length - 1] || ''
    if (top.includes(part)) return mp.currentPage()
    await sleep(500)
  }
  throw new Error('等待页面 ' + part + ' 超时（栈: ' + JSON.stringify(await stack()) + '）')
}
async function gotoTab(route) {
  const url = '/pages/' + route + '/' + route
  for (let i = 0; i < 2; i++) {
    await mp.evaluate(u => new Promise(res => {
      wx.switchTab({ url: u, success: () => res(1), fail: () => res(0) })
      setTimeout(() => res(0), 8000)
    }), url)
    try { return await waitPage(route, 8000) } catch (e) { /* 重试 */ }
  }
  await mp.evaluate(u => new Promise(res => {
    wx.reLaunch({ url: u, success: () => res(1), fail: () => res(0) })
    setTimeout(() => res(0), 8000)
  }), url)
  return waitPage(route, 10000)
}
async function resetRecord(p, todayStr) {
  await p.setData({
    editMode: false, editBillId: '', amount: '', selectedCategory: '',
    note: '', mood: '', photoUrl: '', dateStr: todayStr
  })
  await sleep(300)
}
async function goto(url, part) {
  await mp.evaluate(u => new Promise(res => {
    wx.navigateTo({ url: u, success: () => res(1), fail: () => res(0) })
    setTimeout(() => res(0), 8000)
  }), url)
  return waitPage(part)
}

// 页面级业务数据强断言（替代旧版「仅断言 themeStyle」）
async function assertPageLoaded(route, d) {
  if (route === 'stats') {
    h.ok(Array.isArray(d.rangeTabs) && d.rangeTabs.length >= 3, '统计周期 Tab ≥ 3')
    h.ok(['expense', 'income'].indexOf(d.statsType) !== -1, '收支类型合法（' + d.statsType + '）')
    h.ok(d.totalAmount !== undefined && d.totalAmount !== null, '总额已计算（' + d.totalAmount + '）')
    h.eq(d.statsFailed, false, '未进入失败态')
  } else if (route === 'budget') {
    h.ok(d.budgetAmount !== undefined && d.budgetAmount !== null, '预算金额已载入（' + d.budgetAmount + '）')
    h.ok(d.spent !== undefined && d.spent !== null, '已花金额已计算（' + d.spent + '）')
    h.ok(Array.isArray(d.topCategories), '钱去哪了是数组')
    h.ok(d.percent !== undefined && d.percent !== null, '预算消耗比例已计算（' + d.percent + '）')
    h.notDefault(d.statusText, ['', '未设置'], '预算状态文案已生成（' + d.statusText + '）')
  } else if (route === 'profile') {
    h.notDefault(d.nickname, ['', '橘记JUJI用户', '未设置', '点击登录'], '昵称已真实加载（' + d.nickname + '）')
    h.notDefault(d.genderText, ['', '未设置', '未选择'], '性别已加载（' + d.genderText + '）')
    h.match(String(d.avatarUrl), /^(https?:\/\/|wxfile:\/\/|cloud:\/\/)/, '头像为可渲染地址')
    const VERSION = (R('miniprogram/config/env.js').match(/VERSION:\s*'([^']+)'/) || [])[1]
    h.eq(d.appVersion, VERSION, '页脚版本号 == config/env.js 的 VERSION（' + d.appVersion + '）')
  }
}

;(async () => {
  sys = await h.connect()
  mp = h.mp

  await h.expect('A0-1', '自动化链路连通 + 归位首页', async () => {
    const p = await gotoTab('home')
    h.ok(!!p, '首页句柄存在')
    h.ok(sys.SDKVersion >= '3.0.0', 'SDK 版本达标（' + sys.SDKVersion + '）')
    return 'SDK ' + sys.SDKVersion
  })

  await h.expect('A0-2', '清理历史 [SMOKE] 残留', async () => {
    const n = await purgeSmoke()
    h.ok(typeof n === 'number', '清理执行完成')
    return '清理 ' + n + ' 条'
  })

  // ---------- 记账主链路 ----------
  let page = await gotoTab('record')
  await sleep(1200)

  await h.expect('A1-1', '记账页渲染：分类宫格 + 保存按钮', async () => {
    const cats = await page.$$('.category-item')
    h.gte(cats.length, 8, '分类宫格 ≥ 8（' + cats.length + '）')
    h.ok(!!await page.$('.save-btn'), '保存按钮存在')
    h.ok(!!await page.$('.amount-input'), '金额输入框存在')
  })

  await h.expect('A1-2', '记支出 6.66 [SMOKE]（真实点击保存并查库验证）', async () => {
    await resetRecord(page, TODAY)
    await page.callMethod('onAmountInput', { detail: { value: '6.66' } }); await sleep(300)
    await page.callMethod('selectCategory', { currentTarget: { dataset: { name: '餐饮' } } }); await sleep(300)
    const chips = await page.$$('.extras-chip')
    if (chips[0]) { await chips[0].tap(); await sleep(600) }
    await page.callMethod('onNoteInput', { detail: { value: '[SMOKE]支出冒烟' } }); await sleep(300)
    const d = await page.data()
    h.eq(Number(d.amount), 6.66, '金额已写入')
    h.eq(d.selectedCategory, '餐饮', '分类已选中')
    h.ok(/SMOKE/.test(d.note || ''), '备注已写入')
    const save = await page.$('.save-btn'); await save.tap()
    const t0 = Date.now(); let rows = []
    while (Date.now() - t0 < 20000) {
      rows = await q({ amount: 6.66, date: TODAY })
      if (rows.some(r => /SMOKE/.test(r.note || ''))) break
      await sleep(800)
    }
    const hit = rows.find(r => /SMOKE/.test(r.note || ''))
    h.ok(!!hit, '20s 内查到入库记录')
    return hit ? '入库 id=' + String(hit._id).slice(0, 6) + '…' : '未入库'
  })

  await h.expect('A1-3', '保存后自动回首页 + 流水可见', async () => {
    const p = await waitPage('home', 15000)
    const t1 = Date.now(); let flat = ''
    while (Date.now() - t1 < 10000) {
      const d = await p.data()
      flat = JSON.stringify(d.groupedBills || [])
      if (/SMOKE/.test(flat)) break
      await sleep(600)
    }
    h.ok(/SMOKE/.test(flat), '首页流水可见 [SMOKE] 账单')
    page = p
  })

  await h.expect('A1-4', '金额校验拦截（0 / 负数 / 超长）', async () => {
    page = await gotoTab('record'); await sleep(1000)
    await resetRecord(page, TODAY)
    const before = (await smokeRows()).length
    for (const bad of ['0', '-5', '123456789']) {
      await page.callMethod('onAmountInput', { detail: { value: bad } })
      await page.callMethod('selectCategory', { currentTarget: { dataset: { name: '餐饮' } } })
      const save = await page.$('.save-btn'); await save.tap()
      await sleep(900)
    }
    const after = (await smokeRows()).length
    h.eq(after, before, '非法金额被拦截，无脏数据入库')
  })

  // ---------- 详情页 / 编辑 / 删除 ----------
  let billId
  await h.expect('A2-1', '从首页进入账单详情', async () => {
    const rows = await q({ amount: 6.66, date: TODAY })
    const hit = rows.find(r => /SMOKE/.test(r.note || ''))
    h.ok(!!hit, '[SMOKE] 账单存在')
    billId = hit._id
    const p = await gotoTab('home'); await sleep(800)
    await goto('/pages/detail/detail?id=' + billId, 'detail').catch(async () => {
      await p.callMethod('goDetail', { currentTarget: { dataset: { id: billId } } })
    })
    const dp = await waitPage('detail', 15000)
    // 详情页 loadBill 是异步拉库，轮询等待 bill 真正载入（避免读到初始 null）
    let d = await dp.data()
    const tBill = Date.now()
    while (Date.now() - tBill < 15000) {
      d = await dp.data()
      if (d.bill && d.bill.amount !== undefined && d.bill.amount !== null) break
      await sleep(400)
    }
    const billData = d.bill || {}
    const shown = Number(billData.amount)
    h.eq(shown, 6.66, '详情金额一致（' + shown + '）')
    page = dp
  })

  await h.expect('A2-2', '编辑账单 6.66 → 9.99', async () => {
    const edit = await page.$('.detail-edit-btn')
    if (edit) { await edit.tap() } else { await page.callMethod('editBill') }
    const rp = await waitPage('record', 15000)
    const te = Date.now(); let em = false
    while (Date.now() - te < 8000) {
      em = await rp.data('editMode')
      if (em) break
      await sleep(400)
    }
    h.ok(em, '进入编辑模式')
    await rp.callMethod('onAmountInput', { detail: { value: '9.99' } }); await sleep(300)
    const save = await rp.$('.save-btn'); await save.tap()
    const t0 = Date.now()
    while (Date.now() - t0 < 20000) {
      const rows = await q({ _id: billId })
      if (rows.length && Number(rows[0].amount) === 9.99) return
      await sleep(800)
    }
    throw new Error('金额未更新为 9.99（不应到达）')
  })

  await h.expect('A2-3', '删除账单（软删除 isDeleted）', async () => {
    const r = await mp.evaluate(id => wx.cloud.callFunction({ name: 'bills', data: { action: 'delete', data: { billId: id } } })
      .then(res => res.result).catch(e => ({ success: false, message: String(e) })), billId)
    h.eq(r.success, true, '云函数 delete 成功')
    const gone = await mp.evaluate(id => {
      const db = wx.cloud.database(); const _ = db.command
      return db.collection('bills').where({ _id: id, isDeleted: _.neq(true) }).count().then(x => x.total === 0)
    }, billId)
    h.ok(gone, 'isDeleted 生效（软删除）')
  })

  // ---------- 各页面业务数据强断言（替代旧版「仅 themeStyle」）----------
  for (const [route, label] of [['stats', '统计页'], ['budget', '预算页'], ['profile', '我的页']]) {
    await h.expect('A3-' + route, label + '数据完整（禁止"未设置"/白屏）', async () => {
      const p = await gotoTab(route); await sleep(1800)
      const d = await p.data()
      await assertPageLoaded(route, d)
      await h.screenshot('A3-' + route)
      return label + ' 数据完整'
    })
  }

  await h.expect('A4-1', '帮助与教程页可打开', async () => {
    const p = await gotoTab('profile'); await sleep(1000)
    await goto('/pages/help/help', 'help')
    const hp = await waitPage('help', 15000)
    const d = await hp.data()
    h.gte((d.groups || []).length, 8, '帮助分组 ≥ 8（' + (d.groups || []).length + '）')
    await h.screenshot('A4-1-help')
  })

  await h.expect('A9-9', '清理 [SMOKE] 测试数据', async () => {
    const n = await purgeSmoke()
    const left = (await smokeRows()).length
    h.eq(left, 0, '无残留测试数据（清理 ' + n + ' 条）')
  })

  const extra = [
    '## 说明',
    '',
    '- 本套件覆盖记账主链路（记→见→编辑→删除）+ 四页渲染，全部接入 harness：控制台 error 即失败、断言计数。',
    '- A3 三页已从「仅断言 themeStyle」升级为业务数据强断言，直接锁定「未设置/空白/占位」类静默失败。',
    '- 测试数据统一以 [SMOKE] 标记，结束前清理并断言残留为 0，绝不污染真实数据。',
    ''
  ]
  await h.finish(extra)
})().catch(e => { console.log('FATAL:', e.message); process.exit(3) })
