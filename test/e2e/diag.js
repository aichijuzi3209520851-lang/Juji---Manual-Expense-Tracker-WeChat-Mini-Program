// 诊断：自动化会话下 wx.login / 云函数 / 页面栈状态
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))
;(async () => {
  let mp
  for (let i = 0; i < 30; i++) {
    try { mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' }); break } catch (_) { await sleep(2000) }
  }
  if (!mp) throw new Error('60s 内未能连接 9420')
  const p = await mp.currentPage()
  console.log('当前页面:', p.path)

  console.log('--- wx.login ---')
  console.log(await mp.evaluate(() => new Promise(resolve => {
    const t = setTimeout(() => resolve('wx.login 30s 无响应'), 30000)
    wx.login({ success: r => { clearTimeout(t); resolve('code长度: ' + (r.code || '').length) }, fail: e => { clearTimeout(t); resolve('fail: ' + e.errMsg) } })
  })))

  console.log('--- 云环境 ---')
  console.log(await mp.evaluate(() => {
    try { return 'env=' + JSON.stringify(wx.cloud.DYNAMIC_CURRENT_ENV || 'n/a') } catch (e) { return 'cloud err ' + e.message }
  }))

  console.log('--- getOpenId 云函数 ---')
  console.log(await mp.evaluate(() => new Promise(resolve => {
    const t = setTimeout(() => resolve('60s 无响应(云函数挂起)'), 60000)
    wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'getOpenId' } })
      .then(r => { clearTimeout(t); resolve('成功: ' + JSON.stringify(r.result).slice(0, 150)) })
      .catch(e => { clearTimeout(t); resolve('失败: ' + (e.errMsg || e.message)) })
  })))

  console.log('--- storage 标记 ---')
  console.log(await mp.evaluate(() => JSON.stringify({
    agreed: !!wx.getStorageSync('juji_privacy_agreed'),
    guide: !!wx.getStorageSync('has_seen_guide')
  })))
  await mp.disconnect ? null : null
  process.exit(0)
})().catch(e => { console.error('诊断失败:', e.message); process.exit(1) })
