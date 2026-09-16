/**
 * 诊断探针 v7：定位「路由队列被搞坏」的触发步骤
 *
 * 已确证（v4 矩阵 + v6 场景复刻，均在干净会话）：
 *   profile → 真实点击「新手引导」→ 真实点击「跳过」→ 回到 profile，全程 0 控制台错误。
 *   ⇒ 产品代码没问题；verify-no-force-login.js 的 L6 是「会话被污染」造成的假失败。
 *
 * 待定位：套件里 L1→L5 哪一步把路由队列搞坏了（症状：进入引导页的 navigateTo 正常，
 *        但从引导页发起的 navigateBack / switchTab / reLaunch 全部静默不生效）。
 *
 * 本探针按套件顺序逐段加变量，每段跑完做一次「健康检查」（回首页并校验栈），
 * 这样能直接看出是哪一段之后开始坏。所有点击用 page.$().tap() 真实点击，
 * 矩形一律用 createSelectorQuery（automator 的 Element 没有 boundingClientRect）。
 *
 * 用法：node start-auto.js --force && node test/e2e/probe-guide-skiptab.js
 */
const { createHarness } = require('./lib/harness')

const h = createHarness({ suite: 'probe-nav-pollute', title: '探针：路由队列污染定位' })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const stack = () => h.mp.evaluate(() => getCurrentPages().map(p => p.route)).catch(() => [])

function rect(sel) {
  return h.mp.evaluate((s) => new Promise((resolve) => {
    const q = wx.createSelectorQuery()
    q.select(s).boundingClientRect()
    q.exec((res) => resolve(res && res[0] ? res[0] : null))
  }), sel)
}

async function nav(api, arg) {
  return h.mp.evaluate((apiName, u) => new Promise((resolve) => {
    const log = []
    let settled = false
    const done = () => { if (!settled) { settled = true; setTimeout(() => resolve({ log, stack: getCurrentPages().map(p => p.route) }), 450) } }
    const opts = { success: () => { log.push('success'); done() }, fail: e => { log.push('fail:' + JSON.stringify(e)); done() }, complete: () => { log.push('complete'); done() } }
    if (u) opts.url = u
    try { wx[apiName](opts) } catch (e) { log.push('THROW:' + e.message); done(); return }
    log.push('called')
    setTimeout(() => { log.push('NO_CALLBACK_4S'); done() }, 4000)
  }), api, arg || null)
}

async function tapSel(sel) {
  const page = await h.mp.currentPage()
  const el = await page.$(sel)
  if (!el) return { ok: false, why: '找不到 ' + sel }
  await el.tap()
  await sleep(2500)
  return { ok: true, stack: await stack() }
}

async function evSkipGuide() {
  await h.mp.evaluate(() => {
    const p = getCurrentPages()[getCurrentPages().length - 1]
    if (typeof p.skipGuide === 'function') p.skipGuide()
  })
  await sleep(2500)
  return stack()
}

/** 健康检查：能否顺利回到「只有首页」的干净栈？返回 true=健康 */
async function health(tag) {
  const r = await nav('reLaunch', '/pages/home/home')
  let st = r.stack
  if (!(st.length === 1 && st[0] === 'pages/home/home')) {
    console.log('   ⚠ [' + tag + '] reLaunch 后栈异常: ' + st.join(' > ') + '，再试 switchTab…')
    const r2 = await nav('switchTab', '/pages/home/home')
    st = r2.stack
  }
  const ok = st.length === 1 && st[0] === 'pages/home/home'
  console.log('   ' + (ok ? '✓' : '✗✗') + ' [' + tag + '] 健康检查: 栈 ' + st.join(' > ') + (ok ? '' : '  ← 路由队列已坏'))
  return ok
}

// ===== 各步骤（对应套件里 L1→L6 的行为，逐步加变量）=====

async function step_L4_loop() {
  console.log('\n--- 步骤①复刻 L4：连续 switchTab 四个 tab ---')
  for (const t of ['home', 'stats', 'budget', 'profile']) {
    const r = await nav('switchTab', '/pages/' + t + '/' + t)
    console.log('   switchTab ' + t + ' → ' + JSON.stringify(r.log) + ' 栈: ' + r.stack.join(' > '))
    await sleep(2200)
  }
}

async function step_L5_relaunch_login() {
  console.log('\n--- 步骤②复刻 L5：reLaunch 到 login → skipLogin() → 回首页 ---')
  const r = await nav('reLaunch', '/pages/login/login')
  console.log('   reLaunch login → ' + JSON.stringify(r.log) + ' 栈: ' + r.stack.join(' > '))
  await sleep(1800)
  await h.mp.evaluate(() => {
    const p = getCurrentPages()[getCurrentPages().length - 1]
    if (typeof p.skipLogin === 'function') p.skipLogin()
  })
  await sleep(2500)
  console.log('   skipLogin 后栈: ' + (await stack()).join(' > '))
}

async function l6_core(tag) {
  console.log('   [' + tag + '] switchTab profile…')
  await nav('switchTab', '/pages/profile/profile')
  await sleep(1800)
  const e = await rect('.help-entry')
  if (!(e && e.height > 4)) { console.log('   ✗ 入口不可见'); return null }
  const t1 = await tapSel('.help-entry')
  console.log('   点入口后栈: ' + (t1.stack || []).join(' > '))
  if ((t1.stack || []).indexOf('pages/guide/guide') === -1) { console.log('   ✗ 没进引导页'); return null }

  const before = await stack()
  const t2 = await tapSel('.guide-skip')
  const after = t2.stack || []
  const left = after.length < before.length
  console.log('   ' + (left ? '✓' : '✗✗') + ' [' + tag + '] 跳过: ' + before.join(' > ') + '  →  ' + after.join(' > '))
  return left
}

;(async () => {
  await h.connect()

  console.log('\n===== 基线：干净会话下 L6 核心流程 =====')
  const base = await l6_core('基线')
  await health('基线后')

  console.log('\n===== 加变量 A：先跑 L4 的 tab 循环，再跑 L6 核心 =====')
  await step_L4_loop()
  const a = await l6_core('A')
  await health('A 后')

  console.log('\n===== 加变量 B：先跑 L5（reLaunch login + skipLogin），再跑 L6 核心 =====')
  await step_L5_relaunch_login()
  const b = await l6_core('B')
  await health('B 后')

  console.log('\n===== 加变量 C：A + B 都跑一遍，再跑 L6 核心 =====')
  await step_L4_loop()
  await step_L5_relaunch_login()
  const c = await l6_core('C')
  await health('C 后')

  console.log('\n===== 结论 =====')
  console.log('   基线 L6 通过: ' + (base === true))
  console.log('   仅 L4 后 L6:   ' + a)
  console.log('   仅 L5 后 L6:   ' + b)
  console.log('   L4+L5 后 L6:   ' + c)
  console.log('   控制台错误: ' + h.consoleErrors.length + ' 条')
  h.consoleErrors.slice(0, 8).forEach(x => console.log('     · ' + x.text))

  console.log('\n===== 探针结束 =====')
  try { await h.mp.disconnect() } catch (e) {}
  process.exit(0)
})().catch(async (e) => {
  console.error('探针异常：', e && e.message)
  try { await h.mp.disconnect() } catch (_) {}
  process.exit(1)
})
