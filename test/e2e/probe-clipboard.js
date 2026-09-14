const automator = require('miniprogram-automator')
;(async () => {
  const mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' })

  const setRes = await mp.evaluate(() => new Promise(res =>
    wx.setClipboardData({ data: 'PROBE_123', success: () => res('SUCCESS（写剪贴板可用）'), fail: e => res('FAIL: ' + (e && e.errMsg)) })
  ))
  console.log('wx.setClipboardData  :', setRes)

  const getRes = await mp.evaluate(() => new Promise(res =>
    wx.getClipboardData({ success: r => res('SUCCESS: ' + r.data), fail: e => res('FAIL: ' + (e && e.errMsg)) })
  ))
  console.log('wx.getClipboardData  :', getRes)

  const priv = await mp.evaluate(() => new Promise(res =>
    wx.getPrivacySetting({ success: r => res(JSON.stringify(r)), fail: e => res('FAIL: ' + (e && e.errMsg)) })
  ))
  console.log('wx.getPrivacySetting :', priv)

  await mp.disconnect()
  process.exit(0)
})().catch(e => { console.log('FATAL:', e.message); process.exit(3) })
