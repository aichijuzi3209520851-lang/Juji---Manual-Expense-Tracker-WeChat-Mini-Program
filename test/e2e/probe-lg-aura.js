// 决定性探针：环境光层到底有没有渲染
// 用 .home-page 精确选择器 + 分区域像素取样，避免"全局饱和度"被 hero 渐变稀释
const fs = require('fs')
const path = require('path')
const automator = require('miniprogram-automator')
const { PNG } = require('pngjs')

const sleep = ms => new Promise(r => setTimeout(r, ms))
const DIR = path.resolve(__dirname, 'artifacts/lg-aura')

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
  await sleep(900)
}

const readHome = (mp) => mp.evaluate(() => new Promise(res => {
  wx.createSelectorQuery().select('.home-page').fields({
    computedStyle: ['backgroundColor', 'backgroundImage', 'backgroundSize', 'backgroundAttachment', 'backgroundRepeat']
  }).exec(r => res(r && r[0] ? r[0] : { error: 'selector 无结果' }))
}))

/* 取某个矩形区域的平均 RGB */
function region(png, x0, y0, w, h) {
  const { width: W, data } = png
  let r = 0, g = 0, b = 0, n = 0
  for (let y = y0; y < Math.min(y0 + h, png.height); y++) {
    for (let x = x0; x < Math.min(x0 + w, W); x++) {
      const i = (W * y + x) << 2
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n++
    }
  }
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)]
}
const dist = (a, b) => Math.round(Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0)))

;(async () => {
  const mp = await connect()
  await mp.switchTab('/pages/home/home')
  await sleep(1200)

  console.log('=== 计算样式（.home-page 精确选择）===\n')
  for (const id of ['fresh', 'liquidGlass']) {
    await applyTheme(mp, id)
    const s = await readHome(mp)
    console.log('[' + id + ']')
    Object.entries(s).forEach(([k, v]) => {
      const str = String(v || '')
      console.log('  ' + k + ' = ' + (str.length > 110 ? str.slice(0, 110) + '…' : str || '(空)'))
    })
    await mp.screenshot({ path: path.join(DIR, '_probe-' + id + '.png') })
    console.log('')
  }
  await mp.disconnect()

  // ---- 分区域像素对比 ----
  console.log('=== 分区域像素对比（左上角是暖橙光斑最浓处）===\n')
  const F = PNG.sync.read(fs.readFileSync(path.join(DIR, '_probe-fresh.png')))
  const L = PNG.sync.read(fs.readFileSync(path.join(DIR, '_probe-liquidGlass.png')))
  const W = F.width, H = F.height

  const regions = [
    ['左上 60x60（暖橙径向中心）', 0, 0, 60, 60],
    ['右上 60x60（紫色径向中心）', W - 60, 0, 60, 60],
    ['底部中 120x40（青色径向）', Math.floor(W / 2) - 60, H - 60, 120, 40],
    ['正中 60x60（纯净底色）', Math.floor(W / 2) - 30, Math.floor(H / 2) - 30, 60, 60]
  ]
  for (const [name, x, y, w, h] of regions) {
    const a = region(F, x, y, w, h), b = region(L, x, y, w, h)
    const d = dist(a, b)
    console.log(name)
    console.log('  fresh      rgb(' + a.join(',') + ')')
    console.log('  glass      rgb(' + b.join(',') + ')')
    console.log('  ΔRGB = ' + d + (d > 6 ? '   ← 明显不同' : '   ← 几乎相同'))
    console.log('')
  }
  process.exit(0)
})().catch(e => { console.error('失败:', e.message); process.exit(1) })
