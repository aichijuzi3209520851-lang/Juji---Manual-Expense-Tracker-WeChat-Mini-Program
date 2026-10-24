// 液态玻璃主题真机验证：环境光层是否真的画出来 + backdrop-filter 是否生效
// 只读业务数据；只切换本地 theme 存储，跑完恢复原主题。
const fs = require('fs')
const path = require('path')
const automator = require('miniprogram-automator')

const sleep = ms => new Promise(r => setTimeout(r, ms))
const OUT = path.resolve(__dirname, 'artifacts/lg-aura')
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })

async function connect() {
  let mp
  for (let i = 0; i < 30; i++) {
    try { mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' }); break }
    catch (_) { await sleep(2000) }
  }
  if (!mp) throw new Error('30 次重试仍连不上 9420')
  return mp
}

/* 切主题并等待重渲染：写 storage → 同步 globalData → eventBus 广播
   注意：自动化环境里 require 的相对路径受限（会报 "require args is not defined"），
   所以不 require theme.js，直接写 storage 并广播事件，让页面自己的
   _onThemeChanged 去调 applyTheme()。这是页面真实走的那条链路。 */
async function applyThemeId(mp, id) {
  await mp.evaluate((tid) => {
    wx.setStorageSync('theme', tid)
    const app = getApp()
    app.globalData.currentTheme = tid
    const bus = app.globalData.eventBus
    if (bus && typeof bus.emit === 'function') bus.emit('themeChanged', tid)
    return tid
  }, id)
  await sleep(900)
}

/* 读根容器（页面最外层那个带 --lg-aura 的 view）的计算样式
 *
 * ⚠ 不能用 select('view')：它命中的不是页面根节点（实测返回 null / 空样式），
 *   而环境光层是挂在页面根类名上的（.home-page / .stats-page …）。
 *   必须按类名取，否则永远读到空 background-image，误报"光斑没画出来"。
 *   实测正确的读取结果见下方的 ROOT_CLASS 映射。 */
const ROOT_CLASS = {
  'pages/home/home': '.home-page',
  'pages/stats/stats': '.stats-page',
  'pages/record/record': '.record-page',
  'pages/budget/budget': '.budget-page',
  'pages/profile/profile': '.profile-page'
}
async function readRoot(mp) {
  const route = await mp.evaluate(() => {
    const p = getCurrentPages()
    return p[p.length - 1].route
  })
  const sel = ROOT_CLASS[route] || 'view'
  return mp.evaluate((sel) => {
    return new Promise(res => {
      const pages = getCurrentPages()
      const cur = pages[pages.length - 1]
      wx.createSelectorQuery()
        .select(sel)
        .fields({ computedStyle: ['backgroundImage', 'backgroundColor', 'backgroundSize', 'backgroundAttachment'] })
        .exec(r => {
          const s = (r && r[0]) || {}
          let inline = ''
          try { inline = (cur.data.themeStyle || '') } catch (e) {}
          const m = inline.match(/--lg-aura\s*:\s*([^;]*)/)
          res({
            route: cur.route,
            sel,
            computedBgImage: s.backgroundImage || '',
            computedBgColor: s.backgroundColor || '',
            computedBgSize: s.backgroundSize || '',
            computedBgAttach: s.backgroundAttachment || '',
            inlineAura: m ? m[1].trim().slice(0, 80) : null,
            hasInlineStyle: inline.length
          })
        })
    })
  }, sel)
}

/* 读玻璃面板的计算样式：fill / backdrop-filter */
async function readPanel(mp, selector) {
  return mp.evaluate((sel) => {
    return new Promise(res => {
      wx.createSelectorQuery()
        .select(sel)
        .fields({ computedStyle: ['backgroundColor', 'backdropFilter', 'webkitBackdropFilter', 'boxShadow'] })
        .exec(r => {
          const s = (r && r[0]) || null
          res(s ? {
            bg: s.backgroundColor || '',
            bf: s.backdropFilter || s.webkitBackdropFilter || '(浏览器未暴露)',
            shadowLen: (s.boxShadow || '').length,
            hasInset: /inset/.test(s.boxShadow || '')
          } : null)
        })
    })
  }, selector)
}

const shot = async (mp, name) => {
  const p = path.join(OUT, name + '.png')
  await mp.screenshot({ path: p })
  console.log('     📸 ' + name + '.png')
}

let fail = 0
const bad = m => { fail++; console.log('  ✗ ' + m) }
const ok = m => console.log('  ✓ ' + m)

;(async () => {
  const mp = await connect()
  console.log('已连接 9420')

  const orig = await mp.evaluate(() => wx.getStorageSync('theme'))
  console.log('原始主题:', orig || '(未设置)')

  // 确保停在首页
  await mp.switchTab('/pages/home/home')
  await sleep(1200)

  for (const id of ['fresh', 'liquidGlass', 'liquidGlassDark']) {
    console.log('\n=== 主题 ' + id + ' ===')
    await applyThemeId(mp, id)
    const r = await readRoot(mp)
    console.log('  route=' + r.route + '  inlineStyle=' + r.hasInlineStyle + ' 字符')
    console.log('  inline --lg-aura = ' + (r.inlineAura || '(无)'))
    console.log('  computed background-image = ' + (r.computedBgImage ? r.computedBgImage.slice(0, 100) : '(空)'))
    console.log('  computed background-size = ' + r.computedBgSize)

    if (r.computedBgImage && r.computedBgImage !== 'none') {
      if (id === 'fresh') bad('fresh 根容器竟然有 background-image（应为 none）')
      else ok(id + ' 环境光层已绘制到根容器')
    } else {
      if (id === 'fresh') ok('fresh 根容器无 background-image（旧主题零改动）')
      else bad(id + ' 环境光层没画出来！computed background-image 为空')
    }

    // 玻璃面板
    const p = await readPanel(mp, '.lg-panel')
    if (p) {
      console.log('  玻璃面板 bg=' + p.bg + '  inset=' + p.hasInset + '  blur=' + String(p.bf).slice(0, 60))
      if (id !== 'fresh') {
        if (!p.hasInset) bad(id + ' 玻璃面板没有 inset 描边')
        else ok(id + ' 玻璃面板有 inset 描边')

        /* blur 断言 —— 这是液态玻璃的定义性属性，必须实测生效。
           历史事故：@supports 写成 `(a) and (b)`，而本 WebView 里 -webkit- 那条判 false，
           整段 backdrop-filter 被静默跳过，computed 一直是 none，
           玻璃退化成纯半透明色块。只断言「有 inset 描边」是发现不了这个的。 */
        const bf = String(p.bf || '')
        if (bf === 'none' || bf === '' || bf.indexOf('blur') === -1) {
          bad(id + ' 玻璃面板 backdrop-filter 未生效（实测=' + (bf || '空') + '），玻璃会退化成纯色半透明卡片')
        } else {
          ok(id + ' 玻璃面板 backdrop-filter 已生效：' + bf)
        }
      } else {
        /* 旧主题必须**保持** none —— 否则等于给旧主题偷偷加了合成层，属于回归。
           （旧主题 --lg-blur 为 none，规则会解析成 backdrop-filter: none） */
        if (String(p.bf) !== 'none') bad('fresh 玻璃面板竟有 backdrop-filter=' + p.bf + '（旧主题被污染）')
        else ok('fresh 玻璃面板 backdrop-filter=none（旧主题零改动）')
      }
    } else {
      console.log('  本页无 .lg-panel')
    }

    await shot(mp, 'home-' + id)
  }

  // 恢复原主题
  if (orig) await applyThemeId(mp, orig)
  console.log('\n已恢复主题:', orig || '(无)')

  console.log('\n=== 结论 ===')
  if (fail) { console.log('FAIL：' + fail + ' 项'); await mp.disconnect(); process.exit(1) }
  console.log('PASS：环境光层与玻璃面板在真机渲染中均已生效')
  await mp.disconnect()
  process.exit(0)
})().catch(e => { console.error('失败:', e.message); process.exit(1) })
