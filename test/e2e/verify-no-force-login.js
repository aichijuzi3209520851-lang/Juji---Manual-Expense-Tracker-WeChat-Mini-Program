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

function routeStack() {
  return h.mp.evaluate(() => getCurrentPages().map(p => p.route)).catch(() => [])
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
    await sleep(1500)
    const stack = await routeStack()
    h.eq(stack[stack.length - 1], 'pages/home/home', '点击出口后进入首页（实际: ' + stack.join(' > ') + '）')

    const openId = await openid()
    h.notDefault(openId, ['', 'undefined', 'null'], '跳过登录后 openid 仍已就绪')
    return '登录页可跳过且功能可用'
  })

  // ---------- 6. 新手引导改为按需入口，不挡启动 ----------
  await h.expect('L6', '新手引导按需可达（不拦截启动）', async () => {
    h.includes(R('miniprogram/pages/profile/profile.wxml'), 'openGuide', '我的页有新手引导入口')
    h.includes(R('miniprogram/pages/guide/guide.js'), 'replay', '引导页支持 replay 回看')
    h.includes(R('miniprogram/pages/guide/guide.wxml'), 'guide-skip', '引导页含跳过按钮')

    await h.gotoTab('profile')
    await sleep(1200)
    const p = await h.mp.evaluate(() => new Promise((resolve) => {
      const pages = getCurrentPages()
      const page = pages[pages.length - 1]
      page.openGuide()
      setTimeout(() => resolve(getCurrentPages().map(x => x.route)), 1800)
    }))
    h.eq(p[p.length - 1], 'pages/guide/guide', '可主动打开引导页（实际: ' + p.join(' > ') + '）')

    const skip = await rect('.guide-skip')
    h.ok(skip && skip.height > 10, '引导页「跳过」按钮已渲染', skip && skip.height)

    await h.mp.evaluate(() => {
      const pages = getCurrentPages()
      pages[pages.length - 1].finishGuide()
    })
    await sleep(1800)
    const stack = await routeStack()
    h.eq(stack[stack.length - 1], 'pages/home/home', '跳过引导后回到首页（实际: ' + stack.join(' > ') + '）')
    return '引导页按需可达且可跳过'
  })

  await h.finish()
})().catch(async (e) => {
  console.error('脚本异常：', e && e.message)
  try { await h.mp.disconnect() } catch (_) {}
  process.exit(1)
})
