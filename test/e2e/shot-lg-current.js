// 截图当前液态玻璃主题的真实观感（home 页），存到 artifacts/lg-v2/
const fs = require('fs')
const path = require('path')
const automator = require('miniprogram-automator')

const sleep = ms => new Promise(r => setTimeout(r, ms))
const OUT = path.resolve(__dirname, 'artifacts/lg-v2')

async function connect() {
  let mp
  for (let i = 0; i < 30; i++) {
    try { mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' }); break }
    catch (_) { await sleep(2000) }
  }
  if (!mp) throw new Error('连不上 9420')
  return mp
}

const applyTheme = async (mp, id) => {
  await mp.evaluate((tid) => {
    wx.setStorageSync('theme', tid)
    getApp().globalData.currentTheme = tid
    const bus = getApp().globalData.eventBus
    if (bus && bus.emit) bus.emit('themeChanged', tid)
  }, id)
  await sleep(1000)
}

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const mp = await connect()
  await mp.switchTab('/pages/home/home')
  await sleep(1500)

  for (const id of ['fresh', 'liquidGlass', 'liquidGlassDark']) {
    await applyTheme(mp, id)
    await sleep(600)
    const f = path.join(OUT, 'home-' + id + '.png')
    await mp.screenshot({ path: f })
    console.log('saved', f)
  }
  console.log('done')
  process.exit(0)
})().catch(e => { console.error(e); process.exit(1) })
