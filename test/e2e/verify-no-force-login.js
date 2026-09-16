/**
 * 橘记JUJI · 合规专项：禁止「未体验功能先强制授权登录」
 *
 * 背景（2026-09-16 微信审核驳回）：
 *   审核意见原文：「小程序打开一进入【首页】页面，未浏览体验功能服务，即要求授权手机号码、
 *   头像、昵称进行授权登录，请在用户体验浏览功能服务后，再自行选择授权登录。请整改后再提交审核。」
 *
 * 根因：app.json 的 pages[0] 是 pages/login/login —— 登录页就是启动页，
 *       用户一进小程序就被「微信一键登录」+ 隐私勾选框挡住。
 *       （代码里并没有 getPhoneNumber，审核文案是微信模板话术）
 *
 * 整改：
 *   1. 启动页改为 pages/home/home（功能首页），可直接浏览体验；
 *   2. openid 仍由后台静默换取（云函数，不触发任何授权弹窗），登录退化为可选项；
 *   3. 登录页降级为「退出登录后」才可达，并新增「暂不登录，先逛逛」出口，确保不是死胡同；
 *   4. 顺带修复被登录页掩盖的 openid 竞态：启动页「先渲染后取数」必须先 await ensureLogin()。
 *
 * 本脚本锁定上述不变量，防止回归。
 *
 * 用法：node start-auto.js --force && node test/e2e/verify-no-force-login.js
 *   ⚠️ 必须 --force（close + open）才能拿到「冷启动」页面栈，这是唯一能证明启动页的证据。
 */
const fs = require('fs')
const path = require('path')
const { createHarness } = require('./lib/harness')

const ROOT = path.resolve(__dirname, '..', '..')
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8')
const h = createHarness({ suite: 'no-force-login', title: '橘记JUJI · 合规：禁止强制授权登录' })

const sleep = ms => new Promise(r => setTimeout(r, ms))

// 走 harness 的 stack()：它带 6s 超时壳，模拟器卡住时返回 [] 而不是让轮询永远挂住
function routeStack() {
  return h.stack()
}

/** 轮询等待页面栈栈顶变成目标页 —— wx.switchTab 不可靠，不能用固定 sleep 断言 */
async function waitRoute(route, timeout = 12000) {
  const t0 = Date.now()
  let stack = []
  while (Date.now() - t0 < timeout) {
    stack = await routeStack()
    if (stack[stack.length - 1] === route) return stack
    await sleep(400)
  }
  return stack
}

/**
 * 等待「引导页真的看不见了」。
 *
 * ⚠ 判据必须用 automator 的 DOM 查询，不能用 `mp.evaluate(() => getCurrentPages())`。
 * 实测：从 navigateTo 子页面点「跳过」离开后，界面已经切走（再查 `.guide-skip` 查不到），
 * 但 evaluate 读到的页面栈仍是**陈旧快照**，栈里还留着 `pages/guide/guide`。
 * 这正是此前 L6 反复假失败的根因——用陈旧页面栈判定「有没有离开」会永远判成「没走」。
 * 而 DOM 判据同时也是用户视角的真实判据（用户看到的是界面，不是页面栈）。
 */
async function waitGuideGone(timeoutMs = 8000) {
  const t0 = Date.now()
  let why = '超时：引导页仍在'
  while (Date.now() - t0 < timeoutMs) {
    const page = await h.withTimeout(h.mp.currentPage(), 6000, null)
    if (!page) { why = 'currentPage 超时（模拟器无响应）'; break }
    // 先看 automator 给的当前页路径；属性名在不同版本可能是 path 或 route
    const p = page.path || page.route || ''
    if (p && p.indexOf('guide') === -1) return { gone: true, at: p }
    // 再以 DOM 为准：查不到引导页的跳过按钮 = 已经不在引导页上
    const el = await h.withTimeout(page.$('.guide-skip'), 6000, null)
    if (!el) return { gone: true, at: p || '(DOM 上已无引导页)' }
    await sleep(400)
  }
  return { gone: false, at: '', why }
}

function rect(sel) {
  return h.mp.evaluate((s) => new Promise((resolve) => {
    const q = wx.createSelectorQuery()
    q.select(s).boundingClientRect()
    q.exec((res) => resolve(res && res[0] ? res[0] : null))
  }), sel)
}

function openid() {
  return h.mp.evaluate(() => getApp().globalData.openid || '')
}

;(async () => {
  await h.connect()

  // ---------- 1. 启动页必须是功能首页 ----------
  await h.expect('L1', '启动页是功能首页（不是登录页 / 引导页）', async () => {
    // 静态：pages[0] 就是微信定义的启动页，这是最权威的证据
    const cfg = JSON.parse(R('miniprogram/app.json'))
    h.eq(cfg.pages[0], 'pages/home/home', 'app.json 首页即启动页')
    h.ne(cfg.pages[0], 'pages/login/login', '启动页不再是登录页')
    h.ok(cfg.pages.indexOf('pages/login/login') >= 0, '登录页仍注册（退出登录后需要它）')

    // 静态防回归：启动链路（app.js / home.js）绝不能再往登录页跳
    h.excludes(R('miniprogram/app.js'), '/pages/login/login', 'app.js 启动链路不含登录页跳转')
    h.excludes(R('miniprogram/pages/home/home.js'), '/pages/login/login', 'home.js 不含登录页跳转')

    // 运行时（冷启动证据）：连接上来的页面栈应当只有首页
    let stack = []
    for (let i = 0; i < 12; i++) {
      stack = await routeStack()
      if (stack.length) break
      await sleep(500)
    }
    h.ok(stack.length > 0, '能读到页面栈')
    h.eq(stack[0], 'pages/home/home', '冷启动首个页面是首页（实际栈: ' + stack.join(' > ') + '）')
    h.excludes(stack.join(','), 'pages/login/login', '页面栈中不出现登录页')
    return '栈: ' + stack.join(' > ')
  })

  // ---------- 2. 首屏不得出现任何授权 UI ----------
  await h.expect('L2', '首屏无登录按钮 / 无隐私勾选框（可直接浏览）', async () => {
    const page = await h.waitPage('home')
    h.ok(page, '首页句柄存在')

    const loginBtn = await rect('.login-btn')
    h.eq(loginBtn, null, '首屏不存在登录按钮')
    const consent = await rect('.privacy-consent')
    h.eq(consent, null, '首屏不存在隐私协议勾选框')
    const loginPage = await rect('.login-page')
    h.eq(loginPage, null, '首屏不是登录页')

    // 反向确认：首页的业务 UI 确实渲染了（不是白屏）
    const dayCard = await rect('.day-card')
    h.ok(dayCard && dayCard.height > 20, '首页收支卡片已渲染', dayCard && dayCard.height)
    const root = await rect('.home-page')
    h.ok(root && root.height > 200, '首页主体已铺开', root && root.height)
    return '首页已渲染业务区块'
  })

  // ---------- 3. openid 由后台静默换取（无授权弹窗） ----------
  await h.expect('L3', 'openid 静默就绪（不依赖任何用户授权）', async () => {
    let openId = ''
    for (let i = 0; i < 20; i++) {
      openId = await openid()
      if (openId) break
      await sleep(500)
    }
    h.notDefault(openId, ['', 'undefined', 'null'], 'openid 已静默获取')
    // 云函数换 openid 不涉及 authorize / getUserProfile 等授权接口
    h.excludes(R('miniprogram/app.js'), 'wx.authorize', 'app.js 启动不调用 wx.authorize')
    h.excludes(R('miniprogram/app.js'), 'getUserProfile', 'app.js 启动不调用 getUserProfile')
    h.excludes(R('miniprogram/app.js'), 'getPhoneNumber', 'app.js 启动不调用 getPhoneNumber')
    return 'openid 长度 ' + openId.length
  })

  // ---------- 4. 四个 tab 页都能无登录浏览 ----------
  for (const [route, label] of [['home', '首页'], ['stats', '统计'], ['budget', '预算'], ['profile', '我的']]) {
    await h.expect('L4-' + route, label + '可直接浏览且数据已加载（无需登录）', async () => {
      const p = await h.gotoTab(route)
      await sleep(2200)
      const d = await p.data()

      const openId = await openid()
      h.notDefault(openId, ['', 'undefined', 'null'], label + '：openid 已就绪')

      if (route === 'home') {
        h.eq(d.overviewFailed, false, '首页概览未进入失败态')
        h.ok(d.budget && d.budget.status, '首页预算状态已生成（' + (d.budget && d.budget.status) + '）')
        h.ok(Array.isArray(d.groupedBills), '首页流水为数组')
      } else if (route === 'stats') {
        h.eq(d.statsFailed, false, '统计页未进入失败态')
        h.ok(Array.isArray(d.rangeTabs) && d.rangeTabs.length >= 3, '统计周期 Tab ≥ 3')
        h.ok(d.totalAmount !== undefined && d.totalAmount !== null, '统计总额已计算')
      } else if (route === 'budget') {
        h.ok(d.budgetAmount !== undefined && d.budgetAmount !== null, '预算金额已载入')
        h.ok(d.spent !== undefined && d.spent !== null, '已花金额已计算')
      } else if (route === 'profile') {
        h.notDefault(d.nickname, ['', '点击登录'], '我的页昵称非空（' + d.nickname + '）')
      }
      return label + ' 可浏览'
    })
  }

  // ---------- 5. 登录页降级为可选，且有出口 ----------
  await h.expect('L5', '登录页有「暂不登录，先逛逛」出口（不是死胡同）', async () => {
    h.includes(R('miniprogram/pages/login/login.wxml'), 'login-skip', '登录页含「先逛逛」出口')
    h.includes(R('miniprogram/pages/login/login.js'), 'skipLogin', '登录页含 skipLogin 实现')

    await h.reLaunch('/pages/login/login')
    const lp = await h.waitPage('login')
    h.ok(lp, '登录页可打开（退出登录后的落地页）')

    const skip = await rect('.login-skip')
    h.ok(skip && skip.height > 10, '「先逛逛」出口已渲染', skip && skip.height)

    await h.mp.evaluate(() => {
      const pages = getCurrentPages()
      pages[pages.length - 1].skipLogin()
    })
    const stack = await waitRoute('pages/home/home')
    h.eq(stack[stack.length - 1], 'pages/home/home', '点击出口后进入首页（实际: ' + stack.join(' > ') + '）')

    const openId = await openid()
    h.notDefault(openId, ['', 'undefined', 'null'], '跳过登录后 openid 仍已就绪')
    return '登录页可跳过且功能可用'
  })

  // ---------- 6. 新手引导改为按需入口，不挡启动 ----------
  await h.expect('L6', '新手引导按需可达 + 「跳过」按钮几何正确（不拦截启动）', async () => {
    h.includes(R('miniprogram/pages/profile/profile.wxml'), 'openGuide', '我的页有新手引导入口')
    h.includes(R('miniprogram/pages/guide/guide.js'), 'replay', '引导页支持 replay 回看')
    h.includes(R('miniprogram/pages/guide/guide.wxml'), 'guide-skip', '引导页含跳过按钮')
    // 「跳过」的离开逻辑必须带 fail 兜底：navigateBack 在个别情况下会静默失败，
    // 没有兜底用户就永远卡在引导页（点不动 = 死胡同），这是审核也会质疑的体验问题。
    h.includes(R('miniprogram/pages/guide/guide.js'), 'navigateBack({ fail:', '「跳过」的离开逻辑带 fail 兜底（不留死胡同）')

    // 导航基线：先确认路由队列可用，避免把模拟器环境问题误判成产品问题
    h.ok(await h.resetRoute(), '导航基线可用（能回到干净的首页栈）')

    await h.gotoTab('profile')
    await sleep(1200)
    await h.mp.evaluate(() => {
      const pages = getCurrentPages()
      pages[pages.length - 1].openGuide()
    })
    const p = await waitRoute('pages/guide/guide')
    h.eq(p[p.length - 1], 'pages/guide/guide', '可主动打开引导页（实际: ' + p.join(' > ') + '）')

    const skip = await rect('.guide-skip')
    h.ok(skip && skip.height > 10, '引导页「跳过」按钮已渲染', skip && skip.height)

    // 位置断言（2026-09-16 调整）：跳过按钮从右上角移到左上角。
    // 右上角是微信胶囊菜单的保留区，左上角要让开状态栏时间。
    const geo = await h.mp.evaluate(() => {
      const capsule = wx.getMenuButtonBoundingClientRect()
      const win = (typeof wx.getWindowInfo === 'function') ? wx.getWindowInfo() : wx.getSystemInfoSync()
      return { capsule, winW: win.windowWidth, statusBarHeight: win.statusBarHeight }
    })
    h.ok(skip.right < geo.capsule.left,
      '「跳过」不与微信胶囊菜单重叠', skip.right.toFixed(0) + ' < 胶囊左边界 ' + geo.capsule.left)
    h.ok(skip.left + skip.width / 2 < geo.winW / 2,
      '「跳过」位于页面左侧', '中心 x=' + (skip.left + skip.width / 2).toFixed(0) + ' / 屏宽 ' + geo.winW)
    h.ok(skip.top >= geo.statusBarHeight,
      '「跳过」上边不压状态栏时间', skip.top.toFixed(0) + ' ≥ statusBar ' + geo.statusBarHeight)
    h.ok(Math.abs(skip.top - geo.capsule.top) <= 6,
      '「跳过」与胶囊菜单同一水平行', skip.top.toFixed(0) + ' ≈ 胶囊 top ' + geo.capsule.top)

    // 收尾：把页面栈清回干净首页。本条用例结束时会停在引导页（栈顶是 navigateTo 子页），
    // 直接留给下一条用例会得到一个「从子页发起导航」的坏起点，实测会把 L7 拖死。
    const cleaned = await h.resetRoute()
    return '跳过按钮左上角 x=' + skip.left.toFixed(0) + ' y=' + skip.top.toFixed(0) +
      '（胶囊 top=' + geo.capsule.top + ' / statusBar=' + geo.statusBarHeight + '）' +
      (cleaned ? '；已回到干净首页栈' : '；⚠ 未能回到干净首页栈')
  })

  // ---------- 7. 「跳过」必须真的能离开引导页（真实点击）----------
  await h.expect('L7', '「跳过」能离开引导页并回到进入前的页面（真实点击，不死胡同）', async () => {
    h.ok(await h.resetRoute(), '导航基线可用')

    // 走真实用户路径：我的 → 点「新手引导」→ 点「跳过」（全程真实点击，不调页面方法）
    await h.gotoTab('profile')
    await sleep(1500)
    const before = await routeStack()
    h.eq(before[before.length - 1], 'pages/profile/profile', '起点在「我的」页（实际: ' + before.join(' > ') + '）')

    // tapElement 对 currentPage / $ / tap 每一步都套了超时：模拟器卡住时会返回
    // {ok:false, why}，用例带着原因失败，而不是把整条套件永远挂住。
    const t0 = await h.tapElement('.help-entry')
    h.ok(t0.ok, '能定位并点击「新手引导」入口元素', t0.ok ? undefined : t0.why)
    const inGuide = await waitRoute('pages/guide/guide')
    h.eq(inGuide[inGuide.length - 1], 'pages/guide/guide', '点「新手引导」进入引导页（实际: ' + inGuide.join(' > ') + '）')

    // 模拟器的路由队列偶尔会吞掉 navigateTo 子页发起的导航（既不 success 也不 fail），
    // 所以真实点击重试一次；两次都不动才判失败，并在信息里点明「疑似路由队列异常」。
    let gone = { gone: false, at: '', why: '未点击' }
    let usedAttempts = 0
    for (let attempt = 1; attempt <= 2; attempt++) {
      usedAttempts = attempt
      const t = await h.tapElement('.guide-skip')
      if (!t.ok) {
        // 查不到「跳过」按钮 = 界面上已经不在引导页了（首次点击就已生效），视为已离开；
        // 只有「模拟器无响应」这类才是真失败。
        if (String(t.why).indexOf('找不到') === 0) {
          gone = { gone: true, at: '(第 ' + attempt + ' 次点击前已离开引导页)' }
        } else {
          gone = { gone: false, at: '', why: t.why }
        }
        break
      }
      gone = await waitGuideGone()
      if (gone.gone) break
      await sleep(800)
    }
    h.ok(gone.gone, '点「跳过」离开引导页（不死胡同）',
      gone.gone ? undefined : (gone.why + '；停留于 ' + gone.at))

    // 回到进入前的「我的」页：DOM 上应能重新找到「新手引导」入口
    const backEntry = await rect('.help-entry')
    h.ok(backEntry && backEntry.height > 4, '回到进入前的「我的」页（能重新找到新手引导入口）',
      backEntry ? 'height=' + backEntry.height.toFixed(0) : '.help-entry 查不到')

    // 「开启记账之旅」→ 功能首页
    await h.resetRoute()
    await h.gotoTab('profile')
    await sleep(1200)
    await h.mp.evaluate(() => {
      const pages = getCurrentPages()
      pages[pages.length - 1].openGuide()
    })
    const guide2 = await waitRoute('pages/guide/guide')
    h.eq(guide2[guide2.length - 1], 'pages/guide/guide', '再次打开引导页（实际: ' + guide2.join(' > ') + '）')
    await h.mp.evaluate(() => {
      const pages = getCurrentPages()
      pages[pages.length - 1].setData({ currentIndex: 3 })
    })
    await sleep(900)

    let homeGone = { gone: false, at: '', why: '未点击' }
    for (let attempt = 1; attempt <= 2; attempt++) {
      const t = await h.tapElement('.guide-btn-go')
      if (!t.ok) {
        if (String(t.why).indexOf('找不到') === 0) {
          homeGone = { gone: true, at: '(第 ' + attempt + ' 次点击前已离开引导页)' }
        } else {
          homeGone = { gone: false, at: '', why: t.why }
        }
        break
      }
      homeGone = await waitGuideGone()
      if (homeGone.gone) break
      await sleep(800)
    }
    h.ok(homeGone.gone, '点「开启记账之旅」离开引导页',
      homeGone.gone ? undefined : (homeGone.why + '；停留于 ' + homeGone.at))

    // 落到功能首页：首页的业务区块应重新可见
    const dayCard = await rect('.day-card')
    h.ok(dayCard && dayCard.height > 20, '「开启记账之旅」进入功能首页（首页收支卡片已渲染）',
      dayCard ? 'height=' + dayCard.height.toFixed(0) : '.day-card 查不到')

    // 收尾：把栈清回干净首页，别把「停在引导页」的坏状态留到下一次运行
    // （否则下次连接上来时起始栈就是脏的，L1 的冷启动证据会直接失效）
    const cleaned = await h.resetRoute()

    return '真实路径通畅：入口→引导页→跳过回「我的」/ 开启之旅→首页（跳过点击 ' + usedAttempts + ' 次）' +
      (cleaned ? '；已回到干净首页栈' : '；⚠ 未能回到干净首页栈')
  })

  await h.finish()
})().catch(async (e) => {
  console.error('脚本异常：', e && e.message)
  try { await h.mp.disconnect() } catch (_) {}
  process.exit(1)
})
