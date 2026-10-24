// 接管层验收（修正判据版）
//
// 上一版判据的 3 个错误，本版逐一修正：
//   错 1：`none, none` 被当成「有光层」。它实际什么都没画 —— 必须把每个逗号段独立判断，
//         只有含 gradient() 的段才算可见绘制。
//   错 2：把「只取底色+描边、刻意不加光层」的小控件（.range-toggle/.extras-chip/...）
//         也要求有光层。它们是设计上分组 B，断言应是「无光层 + 有底色 + 有描边」。
//   错 3：budget 空状态 / detail 缺参数时容器不渲染，判成 MISSING 失败。
//         这类应记为 N/A（未渲染），并从分母里剔除，同时显式报告 N/A 数量。
//
// 双主题断言：
//   liquidGlass：组A → 半透明 + 有光层 + 有描边 + bf 生效
//                组B → 半透明 + 无光层 + 有描边
//   fresh      ：组A/组B → 不透明 + 无任何可见渐变 + 描边透明 + bf=none（旧主题逐像素不变）
const fs = require('fs')
const path = require('path')
const automator = require('miniprogram-automator')

const sleep = ms => new Promise(r => setTimeout(r, ms))

// 模拟器路由队列卡住时，automator 的 `evaluate()` 会**永不 resolve**（lib/harness.js:215 有同样记录，
// 实测能把套件挂死十几分钟）。这个脚本不经过 harness，没有它的 withTimeout，所以自带一份：
// 超时返回 fallback 并打 WARN，让用例带着诊断失败，而不是让整条验收无限等待。
function withTimeout(promise, ms, fallback) {
  let timer = null
  return Promise.race([
    Promise.resolve(promise).then(v => { clearTimeout(timer); return v }),
    new Promise(res => { timer = setTimeout(() => res(fallback), ms) })
  ])
}

const DIR = path.resolve(__dirname, 'artifacts/lg-takeover')
fs.mkdirSync(DIR, { recursive: true })

const A = 'A' // 有光层（大卡片）
const B = 'B' // 只底色+描边（小控件/药丸）

// ⚠ 每个选择器必须挂在**它真实所在的那一页**上。
// 旧版把 .title-card/.heatmap-card/.footprint-card/.help-entry 挂在 home 页，
// 但它们是 profile 页的类（grep 'class="[^"]*title-card' 只命中 profile.wxml），
// 于是 home 那 4 条永远查不到节点、静默变成 N/A —— 分母缩水，
// 「15/15 通过」其实是「11 条真跑到 + 4 条从没被测」。这是最隐蔽的一种假绿。
const PAGES = [
  // home 的玻璃靠 WXML 手写 lg-panel（home.wxml:25 预算药丸 / :88 账目分组）
  { route: '/pages/home/home',       tab: true, sel: [['.day-group', A], ['.budget-chip', A]] },
  { route: '/pages/stats/stats',     tab: true, sel: [['.trend-card', A], ['.ranking-section', A], ['.ai-card', A], ['.range-toggle', B], ['.seg-toggle', B]] },
  // 预算页四张卡的渲染条件：pace 需本月设了预算、topCategories.length>0、
  // historyData.length>0（需历史预算记录）。真机上要真实账单+预算才出现，
  // 验收不该为了看一眼样式去写库 —— 用 seed 在页面内存里造出「已渲染」形态，
  // 形状严格照抄 budget.js:103-150 / :251-268 的赋值结构（只看样式，不看数值）。
  { route: '/pages/budget/budget',   tab: true,
    seed: {
      budgetAmount: 2000, spent: '860.00', percent: 43, status: 'safe', statusText: '还有余量', ringReady: true,
      pace: { todaySpent: '48.00', dailyBudget: '64.52', daysLeft: 12, remainDaily: '95.00', forecast: '1860', forecastOver: false },
      topCategories: [{ name: '餐饮', icon: '🍜', amount: '420.00', percent: 49 },
                      { name: '交通', icon: '🚇', amount: '260.00', percent: 30 },
                      { name: '购物', icon: '🛍', amount: '180.00', percent: 21 }],
      historyData: [{ month: '2026-09', monthLabel: '9月', percent: 78, barPercent: 78, over: false, isCurrent: false },
                    { month: '2026-10', monthLabel: '10月', percent: 43, barPercent: 43, over: false, isCurrent: true }]
    },
    sel: [['.budget-pace', A], ['.budget-history', A], ['.budget-categories', A], ['.budget-ring-center', B]] },
  // .footprint-card / .juji-pet-bubble 带 wx:if，无数据时是 N/A（下面统一剔除）
  // .title-card 是「今日称号」弹窗（showProfileTitle=false 时从不渲染）；
  // .juji-pet-bubble 是 wx:if="{{petBubble}}" 的提示气泡（profile.wxml:81，无提示时整块不渲染）。
  // 两者都用 seed 打开 —— 只看样式，不依赖真实业务状态。
  { route: '/pages/profile/profile', tab: true,
    seed: { showProfileTitle: true, petBubble: '今天也要好好记账呀' },
    sel: [['.title-card', A], ['.heatmap-card', A], ['.help-entry', A], ['.profile-menu', A],
          ['.footprint-card', A], ['.juji-pet-bubble', A]] },
  { route: '/pages/themes/themes',   tab: false, sel: [['.theme-card', A]] },
  { route: '/pages/categories/categories', tab: false, sel: [['.cat-row', A]] },
  { route: '/pages/help/help',       tab: false, sel: [['.help-topic', A]] },
  { route: '/pages/privacy/privacy', tab: false, sel: [['.privacy-card', A], ['.privacy-platform-btn', A], ['.privacy-tabs', B]] },
  // .category-card 是 record 页的（record.wxml:43/52），不是 categories 页 —— 别放错页。
  // .mood-grid-item 是「一组里混着一个激活态」：激活项按设计保留自己的渐变底，
  // 所以按整组断言（set: true），而不是单点取样。
  // openSheet：该页的这些类藏在底部抽屉里，取样前必须先展开。
  { route: '/pages/record/record',   tab: true, openSheet: true,
    sel: [['.category-card', A], ['.extras-chip', B], ['.type-slider', B],
          ['.note-input', B], ['.mood-grid-item', B, { set: true }]] }
]

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
  await sleep(700)
}

// 当前路由，防「导航失败但读到上一页残留」
const currentRoute = (mp) => mp.evaluate(() => {
  const ps = getCurrentPages()
  return ps.length ? ps[ps.length - 1].route : ''
})

const probe = (mp, sel) => mp.evaluate((s) => new Promise(res => {
  wx.createSelectorQuery().select(s).fields({
    // ⚠ boxShadow 必须一起取：项目里描边有两套实现，只读 outlineColor 会漏掉一半。
    //   ① 接管层（.trend-card / .title-card …）用 outline: 1rpx solid var(--lg-rim-outline)
    //   ② 手写 lg-panel 的容器（home 的 .day-group / .budget-chip）没有 outline，
    //      描边藏在 box-shadow 的 inset 里（theme.js 的 --lg-edge-* 第 536 行拼进去的
    //      `inset 0 0 0 1rpx <rim>`）。
    //   早先只读 outlineColor，于是 ② 这类被算成「无描边」→ 假 FAIL。
    // ⚠ outlineStyle/outlineWidth 也必须取：outline-style:none 时 outlineColor 会回退成
    //   currentColor（实测 rgb(30,27,26)），只看颜色会把「根本没有 outline」误判成「有描边」。
    computedStyle: ['backgroundColor', 'backgroundImage', 'outlineColor', 'outlineStyle', 'outlineWidth', 'boxShadow', 'backdropFilter'],
    size: true
  }).exec(r => res(r && r[0] ? r[0] : { missing: true }))
}), sel)

// 「未渲染」的判定：命中但宽高达不到 1px，或 computedStyle 全空。
// 典型来源：藏在 wx:if=false 的组件里（如 record 页的 <bottom-sheet>，抽屉关着时
// .mood-grid-item 存在但宽高为 0、样式为空串）。空串会让 alphaOf 兜底成 1、
// isTransparentOutline 兜底成 true，从而被误判成「α=1 无描边」的失败。
const notRendered = (s) => {
  if (!s || s.missing) return true
  const w = Number(s.width || 0)
  const h = Number(s.height || 0)
  const allEmpty = !s.backgroundColor && !s.backgroundImage && !s.outlineColor
  return (w < 1 || h < 1) || (allEmpty && w === 0)
}

// 整组取样：用于 .mood-grid-item 这种「一个父组里混着激活态」的情况。
// 选择器查询拿不到 class，所以改用「数量 + 分布」断言：
//   未激活项 → 玻璃；激活项（恰好一颗）→ 保留自己的渐变底（这是设计分层，不是漏接管）
// ⚠ 取样字段必须和 probe() 完全一致。早先这里只取了 outlineColor，
//   而 hasRim() 依赖 outlineStyle/outlineWidth/boxShadow —— 字段缺失时
//   outlineStyle 是 undefined → hasOutline() 直接 false → hasRim() 恒 false，
//   于是 .mood-grid-item 组内的 9 项永远算出「玻璃 0」，看起来像漏接管，
//   实际是**取样器少取字段**造成的假 FAIL。两处字段表要一起改。
const probeAll = (mp, sel) => mp.evaluate((s) => new Promise(res => {
  wx.createSelectorQuery().selectAll(s).fields({
    computedStyle: ['backgroundColor', 'backgroundImage', 'outlineColor', 'outlineStyle', 'outlineWidth', 'boxShadow', 'backdropFilter'],
    size: true
  }).exec(r => res(r && r[0] ? r[0] : []))
}), sel)

// 把 background-image 拆成逗号段，每段独立判断；只有出现 gradient( 才算可见绘制
function visibleLayers(bi) {
  const s = String(bi || '')
  if (!s || s === 'none') return []
  return s.split(/,(?![^(]*\))/).map(x => x.trim())
    .filter(seg => seg && seg !== 'none' && /gradient\(|url\(/i.test(seg))
}

// 半透明：rgba 且 alpha < 0.99
function alphaOf(bg) {
  const m = String(bg || '').match(/rgba?\(([^)]+)\)/)
  if (!m) return 1
  const p = m[1].split(',').map(v => parseFloat(v))
  return p.length === 4 ? p[3] : 1
}

const isTransparentOutline = (oc) => {
  const s = String(oc || '')
  return s === 'transparent' || /rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)/.test(s) || s === ''
}

// 「有描边」的统一判定。项目里有两条描边实现路径，都要认：
//   ① outline: 1rpx solid var(--lg-rim-outline)  → 接管层用
//   ② box-shadow: …, inset 0 0 0 1rpx <rim>        → 手写 lg-panel 的容器用（--lg-edge-* 拼的）
//
// ⚠ 判 outline 存在与否，必须看 style+width，不能看颜色：
//   outline-style 为 none 时，浏览器把 outline-color 计算成 currentColor。
//   实测 .day-group 在 fresh 下是 `outline: 0px none rgb(30,27,26)` ——
//   颜色是个实色（机身字色），但它根本没有描边。
//   早先只看颜色 → 把「没有描边」判成「有描边」，home 两项于是假 FAIL。
const hasOutline = (s) => {
  if (!s) return false
  const style = String(s.outlineStyle || '').toLowerCase()
  const width = parseFloat(String(s.outlineWidth || '0')) || 0
  if (style === 'none' || style === 'hidden' || !style) return false
  if (width <= 0) return false
  return !isTransparentOutline(s.outlineColor)
}

// box-shadow 里的 inset 描边（②）。
// ⚠ 浏览器把 inset 关键字序列化到**末尾**：`rgba(...) 0px 0px 0px 1px inset`，
//   不是源码里写的 `inset 0 0 0 1rpx`。所以判据是「逗号分段后，某段含独立的 inset 词」，
//   头尾两种位置都认（不同 WebView 版本序列化习惯可能不同）。
//   这条在旧主题上依然成立：--lg-edge-* 走 __default 分支时 inset 为空串，
//   实测 fresh 的 box-shadow 只有两条外阴影，没有任何 inset。
function hasRim(s) {
  if (hasOutline(s)) return true
  const bs = String((s && s.boxShadow) || '')
  if (!bs || bs === 'none') return false
  return bs.split(/,(?![^(]*\))/).some(seg => /\binset\b/i.test(seg))
}

;(async () => {
  const mp = await connect()
  const rows = []
  let naCount = 0
  // 记录每一个「存在但没渲染」的取样，收尾时要单独列出来 ——
  // 它们这次压根没被验证过，不能混进「通过」里冒充覆盖率。
  const notRenderedList = []

  for (const themeId of ['liquidGlass', 'liquidGlassDark', 'fresh']) {
    await applyTheme(mp, themeId)
    const glass = themeId.indexOf('liquidGlass') === 0
    console.log('\n############ THEME = ' + themeId + ' ############')

    for (const pg of PAGES) {
      // 导航并校验真的到了目标页
      let ok = false
      try {
        if (pg.tab) { await mp.switchTab(pg.route); ok = true }
        else { await mp.navigateTo(pg.route); ok = true }
      } catch (e) {
        console.log('  SKIP  ' + pg.route + ' :: ' + e.message)
      }
      await sleep(800)
      const route = await currentRoute(mp)
      if (!ok || ('/' + route) !== pg.route) {
        console.log('  SKIP  ' + pg.route + '（实际停在 /' + route + '）')
        if (!pg.tab) { try { await mp.navigateBack() } catch (_) {} ; await sleep(400) }
        continue
      }

      // 有些目标藏在底部抽屉里（record 页 .mood-grid-item 在 <bottom-sheet> 内）。
      // 抽屉不展开时节点宽高为 0、computedStyle 全空串，会被误判成「α=1 无描边」的失败。
      // 这里先展开再取样，取完复位，不用 N/A 把该被测的类跳过。
      if (pg.openSheet) {
        try {
          const r = await withTimeout(mp.evaluate(() => {
            const ps = getCurrentPages()
            const cur = ps[ps.length - 1]
            if (cur && cur.setData) cur.setData({ showMoodSheet: true })
            return 1
          }), 8000, null)
          if (r === null) console.log('  WARN  抽屉展开超时（模拟器无响应）')
          await sleep(900)
        } catch (e) {
          console.log('  WARN  抽屉展开失败 :: ' + e.message)
        }
      }

      // 数据驱动区块的 seed：只改页面实例内存里的 data，让 wx:if 成立、卡片真正渲染出来。
      // ⚠ 绝不写数据库 / storage —— 采完样立刻把页面 reLaunch 掉，内存痕迹随之消失。
      // 这不是「伪造通过」：断言看的仍是真实 computedStyle，只是把「空状态」变成「有数据态」。
      if (pg.seed) {
        try {
          const r = await withTimeout(mp.evaluate((sd) => {
            const ps = getCurrentPages()
            const cur = ps[ps.length - 1]
            if (cur && cur.setData) cur.setData(sd)
            return 1
          }, pg.seed), 8000, null)
          if (r === null) console.log('  WARN  seed 注入超时（模拟器无响应）')
          await sleep(900)
        } catch (e) {
          console.log('  WARN  seed 注入失败 :: ' + e.message)
        }
      }

      for (const [sel, group, opt] of pg.sel) {
        if (opt && opt.set) {
          // 整组断言：组里允许存在「激活态」，它保留自己的渐变底。
          // 验收标准：玻璃主题下，未激活的绝大多数必须是半透明+描边；且至少有一颗是激活态（证明组真的渲染了）。
          let list = []
          try { list = await probeAll(mp, sel) || [] } catch (e) { list = [] }
          // 先剔除「存在但没渲染」的占位节点（宽高 < 1px / 样式全空）
          list = list.filter(it => it && !(Number(it.width || 0) < 1 || Number(it.height || 0) < 1))
          if (!list.length) {
            naCount++
            notRenderedList.push({ themeId, page: pg.route, sel, group })
            console.log('  N/A       ' + sel.padEnd(24) + '（未渲染：空状态或无数据）')
            continue
          }
          let glassy = 0, active = 0, bad = ''
          for (const it of list) {
            const a = alphaOf(String(it.backgroundColor || ''))
            const rim = hasRim(it)
            if (a < 0.99 && rim) glassy++
            else if (visibleLayers(it.backgroundImage).length > 0) active++
            else bad = bad || ('α=' + a)
          }
          let verdict
          // 注意：不能要求「至少一颗激活态」。记录页默认 mood 为空，
          // 组内 9 颗在默认态下本来就该全部是玻璃；激活态只在用户点选后才出现。
          // 因此判据是：玻璃主题下全部项都半透明+描边；旧主题下全部不透明无描边。
          if (glass) verdict = (glassy === list.length) ? 'PASS' : 'FAIL'
          else verdict = (glassy === 0) ? 'PASS' : 'FAIL'
          rows.push({
            themeId, page: pg.route, sel, group, verdict,
            alpha: 'n=' + list.length + ' glass=' + glassy + ' active=' + active,
            layers: active, rimOn: glassy > 0, bfOn: false
          })
          console.log('  ' + (verdict === 'PASS' ? '✔ ' : '✘ ') + ' [' + group + '] ' + sel.padEnd(24) +
            ' 组内 ' + list.length + ' 项：玻璃 ' + glassy + ' / 激活 ' + active + (bad ? '  ← ' + bad : ''))
          continue
        }

        let s
        try { s = await probe(mp, sel) } catch (e) { s = { missing: true } }
        if (notRendered(s)) {
          naCount++
          notRenderedList.push({ themeId, page: pg.route, sel, group })
          console.log('  N/A       ' + sel.padEnd(24) + '（未渲染：空状态/抽屉未展开/无数据）')
          continue
        }

        const bg = String(s.backgroundColor || '')
        const layers = visibleLayers(s.backgroundImage)
        const alpha = alphaOf(bg)
        const rimOn = hasRim(s)
        const bf = String(s.backdropFilter || 'none')
        const bfOn = bf !== 'none' && bf !== ''

        let verdict, why = ''
        if (glass) {
          const semi = alpha < 0.99
          const lightOK = group === A ? layers.length > 0 : layers.length === 0
          if (semi && lightOK && rimOn) verdict = 'PASS'
          else {
            verdict = 'FAIL'
            why = [!semi ? 'α=' + alpha : '', !lightOK ? '光层=' + layers.length : '', !rimOn ? '无描边' : ''].filter(Boolean).join(' ')
          }
        } else {
          const opaque = alpha > 0.99
          const noLight = layers.length === 0
          if (opaque && noLight && !rimOn && !bfOn) verdict = 'PASS'
          else {
            verdict = 'FAIL'
            why = [!opaque ? 'α=' + alpha : '', !noLight ? '有光层' : '', rimOn ? '有描边' : '', bfOn ? 'bf=' + bf : ''].filter(Boolean).join(' ')
          }
        }

        rows.push({ themeId, page: pg.route, sel, group, verdict, alpha, layers: layers.length, rimOn, bfOn })
        console.log('  ' + (verdict === 'PASS' ? '✔' : '✘').padEnd(3) + '[' + group + '] ' +
          sel.padEnd(24) + ' α=' + String(alpha).padEnd(5) +
          ' 光层=' + layers.length + ' 描边=' + (rimOn ? 'Y' : 'N') + ' bf=' + (bfOn ? 'Y' : 'N') +
          (why ? '   ← ' + why : ''))
      }

      if (!pg.tab) { try { await mp.navigateBack() } catch (_) {} ; await sleep(450) }
    }
  }

  console.log('\n================ 汇总 ================')
  const by = (t) => rows.filter(r => r.themeId === t)
  // ⚠ 三套主题都要进汇总。早先只统计 liquidGlass / fresh，
  //   liquidGlassDark 的逐条结果虽然一直在跑、也一直在打印，
  //   但从没进汇总 —— 深色档全错也会显示「全绿」，属假绿，必须一起算。
  for (const t of ['liquidGlass', 'liquidGlassDark', 'fresh']) {
    const rs = by(t)
    const p = rs.filter(r => r.verdict === 'PASS').length
    console.log(t.padEnd(15) + '：' + p + '/' + rs.length + ' 通过')
  }
  console.log('N/A（未渲染，已剔除）：' + naCount)

  const fails = rows.filter(r => r.verdict !== 'PASS')
  if (fails.length) {
    console.log('\n失败明细：')
    fails.forEach(r => console.log('  [' + r.themeId + '] ' + r.page + ' ' + r.sel))
  }
  // N/A 的类名单独列出来：它们这次没被真正验证过，不能算通过。
  const notRun = [...new Set(notRenderedList.map(x => x.sel))]
  if (notRun.length) {
    console.log('\n本轮未实测（N/A）的类：' + notRun.join('、'))
  }

  await mp.screenshot({ path: path.join(DIR, '_verify.png') })
  await mp.disconnect()
  process.exit(fails.length === 0 ? 0 : 1)
})().catch(e => { console.error('失败:', e.message, e.stack); process.exit(2) })
