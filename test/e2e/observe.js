// 实时观察：点登录后页面栈变化 + 小程序 console/exception 输出
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))
;(async () => {
  let mp
  for (let i = 0; i < 30; i++) {
    try { mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' }); break } catch (_) { await sleep(2000) }
  }
  mp.on('console', msg => console.log('[小程序console]', msg.type, (msg.args || []).map(a => String(a && a.toString ? a.toString() : a)).join(' ').slice(0, 160)))
  mp.on('exception', err => console.log('[小程序exception]', (err && err.message || '').slice(0, 160)))

  let page = await mp.currentPage()
  console.log('当前页面:', page.path)
  if (!page.path.includes('login')) { await mp.reLaunch('/pages/login/login'); await sleep(1500); page = await mp.currentPage() }

  const p2 = await mp.currentPage()
  const el = await p2.$('.login-btn')
  console.log('>>> 点击登录按钮')
  await el.tap().catch(e => console.log('tap 失败:', e.message))

  for (let i = 0; i < 20; i++) {
    await sleep(1500)
    const cur = await mp.currentPage().catch(() => null)
    const stack = cur ? cur.path : '(无法获取)'
    const data = cur ? await cur.data().catch(() => ({})) : {}
    console.log(`t+${(i + 1) * 1.5}s 页面: ${stack} loading=${data.loading} privacyAgreed=${data.privacyAgreed}`)
    if (cur && (cur.path.includes('home') || cur.path.includes('guide'))) break
  }
  process.exit(0)
})().catch(e => { console.error('观察失败:', e.message); process.exit(1) })
