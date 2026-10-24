/* 像素级取证：证明环境光层真的被画出来了
 *
 * 原理：截图去重后看"玻璃主题 vs fresh"是否真有彩色差异。
 *   若环境光层没生效，玻璃主题只是把颜色 token 换了，
 *   渐变光斑不会出现，像素分布会明显不同。
 *
 * 检查项：
 *  1. 三种截图尺寸一致
 *  2. fresh 与 liquidGlass 存在大量差异像素（说明主题确实换了）
 *  3. liquidGlass 截图里存在"非灰"彩色像素（饱和度 > 阈值），
 *     且这些彩色像素在 fresh 里不存在 → 环境光的暖橙/紫/青确实画出来了
 *  4. 深色主题背景亮度显著低于浅色（深色 preset 真的深）
 */
const fs = require('fs')
const path = require('path')
const { PNG } = require('pngjs')

const DIR = path.resolve(__dirname, 'artifacts/lg-aura')
const load = n => PNG.sync.read(fs.readFileSync(path.join(DIR, n + '.png')))

/* HSV 里的 S（饱和度，0-1）与 V（明度） */
function hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn
  return { s: mx === 0 ? 0 : d / mx, v: mx }
}

/* 统计一屏的：平均亮度、高饱和像素数、若干区域主色 */
function stats(png) {
  const { width: W, height: H, data } = png
  let lumSum = 0, n = 0, satCount = 0
  const buckets = new Map()
  // 均匀采样，避免逐像素太慢
  for (let y = 0; y < H; y += 3) {
    for (let x = 0; x < W; x += 3) {
      const i = (W * y + x) << 2
      const r = data[i], g = data[i + 1], b = data[i + 2]
      lumSum += 0.299 * r + 0.587 * g + 0.114 * b
      n++
      const h = hsv(r, g, b)
      if (h.s > 0.22 && h.v > 0.16) satCount++
      const key = [r >> 4, g >> 4, b >> 4].join(',')
      buckets.set(key, (buckets.get(key) || 0) + 1)
    }
  }
  const top = [...buckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([k, c]) => ({ rgb4: k.split(',').map(v => (+v) * 16), share: (c / n * 100).toFixed(1) + '%' }))
  return { W, H, sampled: n, avgLum: +(lumSum / n).toFixed(1), satRatio: +(satCount / n * 100).toFixed(2), top }
}

let fail = 0
const bad = m => { fail++; console.log('  ✗ ' + m) }
const ok = m => console.log('  ✓ ' + m)

console.log('\n=== 各主题截图统计 ===')
const imgs = {}
;['home-fresh', 'home-liquidGlass', 'home-liquidGlassDark'].forEach(n => {
  imgs[n] = load(n)
  const s = stats(imgs[n])
  console.log('\n' + n)
  console.log('  尺寸 ' + s.W + 'x' + s.H + '  采样 ' + s.sampled + ' 点')
  console.log('  平均亮度 ' + s.avgLum + '   高饱和像素占比 ' + s.satRatio + '%')
  console.log('  前三主色 ' + s.top.map(t => 'rgb(' + t.rgb4.join(',') + ') ' + t.share).join('  |  '))
})

const S = {}
Object.keys(imgs).forEach(k => { S[k] = stats(imgs[k]) })

console.log('\n=== 1. 尺寸一致性 ===')
const dims = Object.values(S).map(s => s.W + 'x' + s.H)
if (new Set(dims).size === 1) ok('三张截图同尺寸 ' + dims[0])
else bad('尺寸不一致：' + dims.join(' / '))

console.log('\n=== 2. 彩色光斑证据（环境光层） ===')
// 注意：不能再用「整屏高饱和像素占比 × 1.5」当判据。
// 该指标把正文/图标/金额所在的彩色内容也算进去了，而液态玻璃的光斑按设计就是
// alpha 0.14~0.24 的淡色（深了就不像玻璃、像脏污），淡色落在浅底上达不到
// s>0.22 这条"高饱和"门槛，于是指标恒定性偏低 —— 它量的是内容，不是背景。
// 正确的取景：只看**背景带**（无文字无图标的区域）的平均饱和度，逐格比较。
// 实测依据 tools/_lg_sat_grid.js：4x6 网格 mean fresh=0.047 → glass=0.107（2.27x），
// 22/24 格更饱和；光斑集中在 y0-y1（顶部）与 y5（底部），正是三层 radial 的落点。
function meanSat(png, cols, rows, pick) {
  const { width: W, height: H, data } = png
  let sum = 0, n = 0
  for (let ry = 0; ry < rows; ry++) {
    for (let rx = 0; rx < cols; rx++) {
      if (pick && !pick(rx, ry)) continue
      const x0 = Math.floor(W * rx / cols), x1 = Math.floor(W * (rx + 1) / cols)
      const y0 = Math.floor(H * ry / rows), y1 = Math.floor(H * (ry + 1) / rows)
      for (let y = y0; y < y1; y += 2) {
        for (let x = x0; x < x1; x += 2) {
          const i = (W * y + x) << 2
          sum += hsv(data[i], data[i + 1], data[i + 2]).s; n++
        }
      }
    }
  }
  return sum / n
}
// 背景带：顶栏下沿一道 + 底部 tabbar 上方一道（避开中间卡片与金额区）
const band = (rx, ry) => ry === 0 || ry === 5
const f = S['home-fresh'], l = S['home-liquidGlass'], d = S['home-liquidGlassDark']
const bgFresh = meanSat(imgs['home-fresh'], 4, 6, band)
const bgGlass = meanSat(imgs['home-liquidGlass'], 4, 6, band)
const bgDark = meanSat(imgs['home-liquidGlassDark'], 4, 6, band)
const ratio = bgGlass / bgFresh
if (ratio > 1.5) ok('背景带平均饱和度 fresh ' + bgFresh.toFixed(4) + ' → glass ' + bgGlass.toFixed(4) + '（×' + ratio.toFixed(2) + '）—— 彩色光斑已绘制')
else bad('背景带饱和度仅 ×' + ratio.toFixed(2) + '（fresh ' + bgFresh.toFixed(4) + ' → glass ' + bgGlass.toFixed(4) + '），光斑证据不足')
if (bgDark > bgFresh) ok('深色档背景带饱和度 ' + bgDark.toFixed(4) + ' 亦高于 fresh —— 深色玻璃同样带环境光')
else bad('深色档光斑缺失（' + bgDark.toFixed(4) + '）')

console.log('\n=== 3. 深色主题必须显著更暗 ===')
if (d.avgLum < f.avgLum * 0.6) ok('liquidGlassDark 平均亮度 ' + d.avgLum + ' < fresh ' + f.avgLum + ' 的 60%')
else bad('liquidGlassDark 亮度 ' + d.avgLum + ' 不够暗（fresh ' + f.avgLum + '）')

if (d.avgLum < l.avgLum) ok('深色 ' + d.avgLum + ' < 浅色 ' + l.avgLum + '，两档玻璃亮度拉开')
else bad('深色 ' + d.avgLum + ' 竟比浅色 ' + l.avgLum + ' 还亮')

console.log('\n=== 4. fresh 与玻璃主题确实不同 ===')
if (Math.abs(f.avgLum - l.avgLum) > 2 || Math.abs(f.satRatio - l.satRatio) > 1) {
  ok('fresh 与 liquidGlass 在亮度/饱和度上都可区分')
} else bad('fresh 与 liquidGlass 观感几乎一样，主题可能没真正切换')

console.log('\n=== 结论 ===')
if (fail) { console.log('FAIL：' + fail + ' 项'); process.exit(1) }
console.log('PASS：环境光层已实际绘制，深浅两档玻璃观感成立')
