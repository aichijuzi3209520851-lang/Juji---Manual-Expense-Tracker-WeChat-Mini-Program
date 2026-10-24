/**
 * 橘记JUJI · 诊断：账单导入后首页免重启刷新（billChanged 广播）
 *
 * 与 smoke-p0 A5-1 的差异：A5-1 的基线断言要求首页流水为空（账号无任何账单），
 * 开发者账号里存在真实账单时该前置不成立，会误报。本诊断改用**相对断言**：
 * 不要求基线为空，只断言「导入的 [SMOKE] 账单在不重启小程序的情况下出现在首页流水里」。
 *
 * 数据安全：[SMOKE] 标记 + 结束前硬删除并断言残留 0（与 smoke-p0 purgeSmoke 同款）。
 * 运行：node test/e2e/diag-import-refresh.js（需 9420 自动化端口）
 */
const automator = require('miniprogram-automator')

const sleep = ms => new Promise(r => setTimeout(r, ms))
const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const TODAY = fmt(new Date())

let mp, failed = 0
const ok = (cond, msg, extra) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + msg + (extra && !cond ? ' -- ' + extra : ''))
  if (!cond) failed++
}

async function gotoTab(route) {
  const url = '/pages/' + route + '/' + route
  await mp.evaluate(u => new Promise(res => {
    wx.switchTab({ url: u, success: () => res(1), fail: () => res(0) })
    setTimeout(() => res(0), 8000)
  }), url)
  for (let i = 0; i < 20; i++) {
    const st = await mp.evaluate(() => getCurrentPages().map(x => x.route)).catch(() => [])
    if ((st[st.length - 1] || '').includes(route)) return mp.currentPage()
    await sleep(400)
  }
  throw new Error('等待页面 ' + route + ' 超时')
}

async function purgeSmoke() {
  return mp.evaluate(() => {
    const db = wx.cloud.database()
    return db.collection('bills').where({ note: db.RegExp({ regexp: '\\[SMOKE', options: 'i' }) }).limit(50).get()
      .then(async r => {
        let n = 0
        for (const d of r.data) { await db.collection('bills').doc(d._id).remove(); n++ }
        return n
      }).catch(() => 0)
  })
}

;(async () => {
  mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' })
  console.log('CONNECTED |', (await mp.systemInfo()).SDKVersion)

  await purgeSmoke()

  // 1) 基线：首页流水条数（不要求为 0，只记录）
  const hp0 = await gotoTab('home'); await sleep(1500)
  const before = ((await hp0.data()).groupedBills || [])
  console.log('基线：首页流水 ' + before.length + ' 组（真实账单不干扰本诊断）')

  // 2) 走真实导入路径：profile.runImport（与 smoke-p0 A5-1 同一入口，跳过选文件）
  const pp = await gotoTab('profile'); await sleep(900)
  const imported = await pp.callMethod('runImport', [{
    type: 'expense', amount: 7.77, category: '餐饮', date: TODAY, note: '[SMOKE]导入刷新诊断'
  }])
  ok(imported === true, 'runImport 返回成功', String(imported))

  // 3) 关键断言：不重启小程序，直接切回首页能看到刚导入的账单
  const hp = await gotoTab('home')
  let flat = '', hit = false
  const t0 = Date.now()
  while (Date.now() - t0 < 12000) {
    flat = JSON.stringify((await hp.data()).groupedBills || [])
    if (flat.indexOf('[SMOKE]导入刷新诊断') !== -1) { hit = true; break }
    await sleep(500)
  }
  ok(hit, '不重启小程序即可在首页看到导入的账单（billChanged 广播生效）',
    hit ? '' : '12s 内未出现，当前流水: ' + flat.slice(0, 160))
  if (hit) console.log('  ✓ 首页流水 ' + before.length + ' 组 → 含新增 [SMOKE] 组')

  // 4) 清理并断言无残留
  const n = await purgeSmoke()
  const left = await mp.evaluate(() => {
    const db = wx.cloud.database()
    return db.collection('bills').where({ note: db.RegExp({ regexp: '\\[SMOKE', options: 'i' }) }).count().then(x => x.total).catch(() => -1)
  })
  ok(left === 0, '清理完成且无残留（删除 ' + n + ' 条）', '残留 ' + left)

  console.log('\n判定: ' + (failed === 0 ? 'PASS' : 'FAIL'))
  await mp.disconnect()
  process.exit(failed === 0 ? 0 : 1)
})().catch(e => { console.log('FATAL:', e.message); process.exit(3) })
