// 探针：验证 automation 启动后 globalData._loginPromise 是否卡死
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))
;(async () => {
  let mp
  for (let i = 0; i < 30; i++) {
    try { mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' }); break } catch (_) { await sleep(2000) }
  }
  const state1 = await mp.evaluate(() => {
    const app = getApp()
    return {
      hasPending: !!app.globalData._loginPromise,
      openid: app.globalData.openid || '(空)'
    }
  })
  console.log('启动后状态:', JSON.stringify(state1))

  console.log('--- 再调一次 silentLogin（10s 竞速） ---')
  const r = await Promise.race([
    mp.evaluate(() => getApp().silentLogin().then(() => 'silentLogin 完成').catch(e => 'silentLogin 失败: ' + (e.errMsg || e.message))),
    sleep(10000).then(() => '10s 内未完成 —— Promise 卡死实锤')
  ])
  console.log(r)

  const state2 = await mp.evaluate(() => ({ hasPending: !!getApp().globalData._loginPromise, openid: getApp().globalData.openid || '(空)' }))
  console.log('之后状态:', JSON.stringify(state2))
  process.exit(0)
})().catch(e => { console.error('探针失败:', e.message); process.exit(1) })
