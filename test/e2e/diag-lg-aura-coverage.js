/* 环境光可见性诊断：整屏粗网格扫描
 *
 * 目的：搞清楚两点
 *   1) 环境光层到底有没有在"裸背景"上生效（不是被卡片盖住）
 *   2) 页面上还有多少面积是裸背景 —— 如果几乎为 0，那环境光层就是白做
 *
 * 做法：对 fresh / liquidGlass 两套主题各截一张图，按 30px 网格逐点采样，
 * 计算每个点的 (R−B) 与 (G−R) 偏移，输出：
 *   - 偏移最大的 12 个点（说明光斑可见位置）
 *   - 偏移 < 3 的比例（说明被卡片盖住的比例）
 */
const path = require('path')
const fs = require('fs')
const automator = require('miniprogram-automator')
const PNG = require('pngjs').PNG

const DIR = __dirname
const PORT = 9420

const sleep = ms => new Promise(r => setTimeout(r, ms))

// 与 probe-lg-aura.js 保持一致：写 storage + 推 currentTheme + 发 themeChanged 事件
// 注意：小程序环境里不能 require('/utils/theme.js')，会报 "require args is ... is not defined"
async function applyTheme(mp, id) {
  await mp.evaluate((tid) => {
    wx.setStorageSync('theme', tid)
    getApp().globalData.currentTheme = tid
    const bus = getApp().globalData.eventBus
    if (bus && bus.emit) bus.emit('themeChanged', tid)
  }, id)
  await sleep(1000)
}

async function shot(mp, name) {
  const p = path.join(DIR, '_diag-' + name + '.png')
  await mp.screenshot({ path: p })
  return PNG.sync.read(fs.readFileSync(p))
}

;(async () => {
  const mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:' + PORT })
  await mp.reLaunch('/pages/home/home')
  await new Promise(r => setTimeout(r, 2500))

  const imgs = {}
  for (const id of ['fresh', 'liquidGlass']) {
    await applyTheme(mp, id)
    imgs[id] = await shot(mp, id)
  }
  await mp.disconnect()

  const F = imgs.fresh, L = imgs.liquidGlass
  const W = F.width, H = F.height
  console.log('截图尺寸 ' + W + 'x' + H)

  const px = (img, x, y) => {
    const i = (y * img.width + x) << 2
    return [img.data[i], img.data[i + 1], img.data[i + 2]]
  }

  const STEP = 30
  const rows = []
  let covered = 0, total = 0
  for (let y = STEP; y < H - STEP; y += STEP) {
    for (let x = STEP; x < W - STEP; x += STEP) {
      const a = px(F, x, y), b = px(L, x, y)
      // 两主题之间的差：既能反映环境光，也能反映主题本身配色差
      const dRB = (b[0] - b[2]) - (a[0] - a[2])
      const dGR = (b[1] - b[0]) - (a[1] - a[0])
      const mag = Math.abs(dRB) + Math.abs(dGR)
      total++
      if (mag < 3) covered++
      rows.push({ x, y, dRB, dGR, mag, a, b })
    }
  }
  rows.sort((p, q) => q.mag - p.mag)

  console.log('\n=== 色偏最大的 12 个采样点（相对 fresh 的额外色偏）===')
  console.log('  坐标           Δ(R−B)  Δ(G−R)    glass 颜色')
  for (const r of rows.slice(0, 12)) {
    console.log('  (' + String(r.x).padStart(3) + ',' + String(r.y).padStart(3) + ')   ' +
      String(r.dRB).padStart(5) + '   ' + String(r.dGR).padStart(5) + '     rgb(' + r.b.join(',') + ')')
  }

  console.log('\n=== 覆盖统计 ===')
  console.log('  采样点总数 ' + total)
  console.log('  色偏 <3（视为被内容覆盖/无光斑）' + covered + ' 个 = ' + (covered / total * 100).toFixed(1) + '%')
  console.log('  色偏 ≥3（有可见环境光）' + (total - covered) + ' 个 = ' + ((total - covered) / total * 100).toFixed(1) + '%')

  // 沿左侧竖直细扫，找裸背景区间
  console.log('\n=== 左边缘 x=8 竖直扫描（每 40px）===')
  console.log('   y     fresh            glass            色偏')
  for (let y = 20; y < H - 20; y += 40) {
    const a = px(F, 8, y), b = px(L, 8, y)
    const dev = Math.abs((b[0] - b[2]) - (a[0] - a[2])) + Math.abs((b[1] - b[0]) - (a[1] - a[0]))
    console.log('  ' + String(y).padStart(4) + '  rgb(' + a.join(',').padEnd(13) + ') rgb(' + b.join(',').padEnd(13) + ') ' + dev)
  }
  process.exit(0)
})().catch(e => { console.error('失败:', e.message); process.exit(1) })
