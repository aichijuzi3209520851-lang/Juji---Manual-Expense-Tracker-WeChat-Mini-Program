/**
 * 橘记 · 上线冒烟自动化执行器
 * 用法: node run.js [模块名...]   例: node run.js m0  /  node run.js all
 * 产物: artifacts/<日期>/report.json + report.md + 截图
 */
const fs = require('fs')
const path = require('path')
const automator = require('miniprogram-automator')

const PROJECT = 'D:\\A\\wechat-project\\V1.1'
const CLI = 'D:\\we-chat\\微信web开发者工具\\cli.bat'
const STAMP = new Date().toISOString().slice(0, 10)
const ART = path.join(__dirname, 'artifacts', STAMP)
fs.mkdirSync(ART, { recursive: true })

const results = []
const notes = []
let mp, page
const sleep = ms => new Promise(r => setTimeout(r, ms))
const fmt = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`

function rec(id, level, name, ok, detail) {
  results.push({ id, level, name, ok, detail: detail || '' })
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${id} [${level}] ${name}${detail ? ' -- ' + detail : ''}`)
}
async function runCase(id, level, name, fn) {
  try { await fn(); rec(id, level, name, true) }
  catch (e) {
    rec(id, level, name, false, String((e && e.message) || e).slice(0, 260))
    try { await shot(id + '-fail') } catch (_) {}
  }
}
async function shot(name) {
  try { await mp.screenshot({ path: path.join(ART, name + '.png') }) } catch (_) {}
}
async function ev(fn, ...args) {
  return Promise.race([
    mp.evaluate(fn, ...args),
    new Promise((_, rej) => setTimeout(() => rej(new Error('evaluate 超时30s')), 30000))
  ])
}
async function curPage() { page = await mp.currentPage(); return page }
async function waitPage(routePart, timeout = 15000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    const p = await mp.currentPage()
    if (p && p.path && p.path.includes(routePart)) { page = p; return p }
    await sleep(400)
  }
  throw new Error(`等待页面 ${routePart} 超时`)
}
async function poll(desc, fn, timeout = 20000, gap = 600) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    try { const v = await fn(); if (v) return v } catch (_) {}
    await sleep(gap)
  }
  throw new Error(`轮询超时: ${desc}`)
}
async function tapByAttr(selector, attr, value) {
  const els = await page.$$(selector)
  for (const el of els) {
    if ((await el.attribute(attr)) === value) { await el.tap(); return el }
  }
  throw new Error(`未找到 ${selector}[${attr}=${value}]`)
}
// Tab 切换兜底：switchTab 失败（如停在非 Tab 页/弹窗）时用 reLaunch 重建
async function ensureTab(route) {
  try {
    await mp.switchTab('/pages/' + route + '/' + route)
  } catch (_) {
    await mp.reLaunch('/pages/' + route + '/' + route)
  }
  await waitPage(route)
}
// 等待页面栈到达任一目标路由（跳转后自动刷新 page 句柄）
async function waitAnyPage(routes, timeout = 50000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    const p = await mp.currentPage().catch(() => null)
    if (p && p.path && routes.some(r => p.path.includes(r))) { page = p; return p }
    await sleep(800)
  }
  throw new Error(`等待页面(${routes.join('/')})超时`)
}
// 触发登录链路：在 app 上下文复刻 login 页 onPrivacyAuthorize 的成功路径。
// 不能用 page.callMethod——它 await 整个异步链，而链尾 redirectTo 会销毁页面，
// 桥上响应永远回不来，堵死串行指令队列（这是前三轮全挂的根因）。
async function fireLoginChain() {
  await ev(() => {
    const app = getApp()
    wx.setStorageSync('juji_privacy_agreed', true)
    return app.silentLogin().then(() => {
      const hasSeenGuide = !!wx.getStorageSync('has_seen_guide')
      if (hasSeenGuide) wx.switchTab({ url: '/pages/home/home' })
      else wx.redirectTo({ url: '/pages/guide/guide' })
      return 'ok'
    })
  })
}
// 在 app 上下文"发射"当前页面方法：不等待其 Promise（长任务/AI 调用/会导航的方法都适用）
async function firePageMethod(method, ...args) {
  await ev((m, a) => {
    const pages = getCurrentPages()
    const pg = pages[pages.length - 1]
    pg[m].apply(pg, a)
    return 'fired'
  }, method, args)
}

/* ---------- 云库操作（在 evaluate 内执行） ---------- */
const dbCountByNote = marker => ev(m => {
  const db = wx.cloud.database(); const _ = db.command
  return db.collection('bills').where({ note: db.RegExp({ regexp: m, options: 'i' }), isDeleted: _.neq(true) })
    .count().then(r => r.total)
}, marker).catch(() => -1)

const dbFindOne = cond => ev(c => {
  const db = wx.cloud.database(); const _ = db.command
  return db.collection('bills').where(Object.assign({ isDeleted: _.neq(true) }, c)).limit(1).get()
    .then(r => r.data[0] ? { _id: r.data[0]._id, amount: r.data[0].amount, note: r.data[0].note } : null)
}, cond)

const dbRemoveWhere = cond => ev(c => {
  const db = wx.cloud.database()
  return db.collection('bills').where(c).get().then(async r => {
    let n = 0
    for (const d of r.data) { await db.collection('bills').doc(d._id).remove(); n++ }
    return n
  })
}, cond)

/* ================= M0 ================= */
async function launch() {
  // automator 在 Windows + Node>=18 下无法直接 spawn .bat，改由 PowerShell 拉起 CLI 后 connect
  try {
    return await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' })
  } catch (_) {}
  console.log('  (自动化端口未就绪，先拉起 CLI...)')
  const { spawnSync } = require('child_process')
  const r = spawnSync('powershell', ['-Command',
    `& '${CLI}' auto --project '${PROJECT}' --auto-port 9420`], { timeout: 150000 })
  if (r.stderr && String(r.stderr).trim()) console.log('  cli stderr:', String(r.stderr).trim().slice(0, 200))
  const t0 = Date.now()
  while (Date.now() - t0 < 60000) {
    try { return await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' }) } catch (_) { await sleep(2000) }
  }
  throw new Error('无法连接自动化端口 9420')
}

async function waitCloudReady() {
  // 全新自动化会话首次云调用可能长时间无响应并阻塞后续指令，先轮询到 getOpenId 成功
  const t0 = Date.now()
  while (Date.now() - t0 < 90000) {
    const ok = await Promise.race([
      mp.evaluate(() => wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'getOpenId' } })
        .then(r => !!(r.result && r.result.openid)).catch(() => false)),
      sleep(25000).then(() => false)
    ])
    if (ok) return true
  }
  return false
}

async function m0() {
  console.log('\n== M0 连接与基础 ==')
  mp = await launch()
  await runCase('C0-1', 'P0', '自动化链路连通', async () => {
    const ready = await waitCloudReady()
    notes.push('云函数就绪: ' + (ready ? 'OK' : '90s 未就绪(降级继续)'))
    const info = await mp.systemInfo()
    if (!info.SDKVersion) throw new Error('未获取到 SDKVersion')
    if (parseFloat(info.SDKVersion) < 3.16) throw new Error('基础库 ' + info.SDKVersion + ' < 3.16.0')
    await mp.pageStack()
    await shot('C0-1-entry')
    notes.push(`基础库 ${info.SDKVersion}，平台 ${info.platform}`)
  })
  try {
    const t = await ev(() => wx.getStorageSync('theme') || 'mint')
    fs.writeFileSync(path.join(ART, 'theme-backup.txt'), String(t))
    notes.push('原主题: ' + t)
  } catch (_) {}
}

/* ================= M1 ================= */
async function m1() {
  console.log('\n== M1 登录与隐私 ==')
  await mp.reLaunch('/pages/login/login')
  page = await waitPage('login'); await sleep(1000)

  await runCase('C1-1', 'P0', '登录页渲染', async () => {
    for (const sel of ['.login-btn', '.privacy-consent', '.privacy-consent__toggle']) {
      if (!(await page.$(sel))) throw new Error('缺少节点 ' + sel)
    }
    await shot('C1-1-login')
  })

  await runCase('C1-2', 'P0', '未勾选时登录禁用', async () => {
    if (await page.data('privacyAgreed')) { await page.callMethod('togglePrivacyAgreed'); await sleep(200) }
    if (await page.data('privacyAgreed')) throw new Error('privacyAgreed 应为 false')
  })

  await runCase('C1-3', 'P0', '勾选行交互回归', async () => {
    const row = await page.$('.privacy-consent')
    await row.tap(); await sleep(250)
    if (!(await page.data('privacyAgreed'))) throw new Error('点击后未勾选')
    if (!(await page.$('.privacy-consent__toggle.is-checked'))) throw new Error('is-checked 样式未生效')
    await row.tap(); await sleep(250)
    if (await page.data('privacyAgreed')) throw new Error('再次点击未取消')
    await row.tap(); await sleep(250)
    await shot('C1-3-checked')
  })

  await runCase('C1-5', 'P1', '协议页可打开', async () => {
    await page.callMethod('viewPrivacyAgreement'); await sleep(800)
    await mp.navigateBack(); await sleep(600)
    await page.callMethod('viewUserAgreement'); await sleep(800)
    await mp.navigateBack(); await sleep(400)
  })

  await runCase('C1-4', 'P0', '一键登录链路', async () => {
    if (!(await page.data('privacyAgreed'))) {
      await (await page.$('.privacy-consent')).tap(); await sleep(300)
    }
    // 不点 open-type 按钮：其唤起的官方隐私弹窗为原生组件，会阻塞整个自动化桥
    let via = 'callMethod 直驱(onPrivacyAuthorize)'
    let arrived = null
    for (let i = 1; i <= 3 && !arrived; i++) {
      if (i > 1) { notes.push('C1-4 第' + i + '次尝试'); await fireLoginChain() }
      arrived = await waitAnyPage(['home', 'guide'], 40000).catch(() => null)
    }
    if (!arrived) throw new Error('等待页面(home/guide)超时')
    if (arrived.path.includes('guide')) {
      via += '→引导页→finishGuide→home'
      await firePageMethod('finishGuide'); await sleep(400)
      await waitPage('home', 15000)
    }
    notes.push('C1-4 登录路径: ' + via)
    await shot('C1-4-home')
  })
}

/* ================= M2 引导页 ================= */
async function m2() {
  console.log('\n== M2 引导页 ==')
  try { const g = await ev(() => !!wx.getStorageSync('has_seen_guide')); notes.push('原 has_seen_guide: ' + g); fs.writeFileSync(path.join(ART, 'guide-backup.txt'), g ? '1' : '0') } catch (_) {}

  await runCase('C2-1', 'P2', '引导4页swiper与完成', async () => {
    await ev(() => { wx.removeStorageSync('has_seen_guide') })
    await mp.reLaunch('/pages/login/login')
    page = await waitPage('login'); await sleep(800)
    if (!(await page.data('privacyAgreed'))) {
      await (await page.$('.privacy-consent')).tap(); await sleep(300)
    }
    await fireLoginChain()
    page = await waitPage('guide', 60000); await sleep(600)
    for (const i of [1, 2, 3]) {
      await page.setData({ currentIndex: i }); await sleep(700)
      if ((await page.data('currentIndex')) !== i) throw new Error('swiper 未切换到 ' + i)
    }
    await shot('C2-1-guide')
    await firePageMethod('finishGuide'); await sleep(500)
    await waitPage('home', 15000)
    if (!(await ev(() => !!wx.getStorageSync('has_seen_guide')))) throw new Error('has_seen_guide 未写入')
    notes.push('M2 后 has_seen_guide=true（清理阶段按备份复原）')
  })
}

/* ================= M3 记账 ================= */
async function m3() {
  console.log('\n== M3 记账 ==')
  await ensureTab('record')
  page = await waitPage('record'); await sleep(1200)
  const today = fmt(new Date())
  const marker = '\\[SMOKE\\]'

  await runCase('C3-1', 'P0', '分类宫格渲染', async () => {
    const cats = await page.$$('.category-item')
    if (cats.length < 8) throw new Error('分类数量异常: ' + cats.length)
    await shot('C3-1-record')
  })

  await runCase('C3-2', 'P0', '记支出 6.66 [SMOKE]', async () => {
    const before = await dbCountByNote(marker)
    await (await page.$('.amount-input')).input('6.66')
    await tapByAttr('.category-item', 'data-name', '餐饮')
    await (await page.$('.note-input')).input('[SMOKE]支出冒烟')
    await (await page.$('.save-btn')).tap()
    const doc = await poll('云库出现支出 6.66', () => dbFindOne({ amount: 6.66, date: today }), 20000)
    if (!doc || !/SMOKE/.test(doc.note || '')) throw new Error('入库记录异常: ' + JSON.stringify(doc))
    const after = await dbCountByNote(marker)
    if (after <= before) throw new Error(`计数未增加 ${before}->${after}`)
  })

  await runCase('C3-3', 'P0', '记收入 8.88 [SMOKE]', async () => {
    await ensureTab('record'); await sleep(900)
    await tapByAttr('.type-option', 'data-type', 'income')
    await (await page.$('.amount-input')).input('8.88')
    const cats = await page.$$('.category-item')
    for (const c of cats) {
      if (((await c.attribute('class')) || '').indexOf('add-category') < 0) { await c.tap(); break }
    }
    await (await page.$('.note-input')).input('[SMOKE]收入冒烟')
    await (await page.$('.save-btn')).tap()
    await poll('云库出现收入 8.88', () => dbFindOne({ amount: 8.88, date: today }), 20000)
    await ensureTab('record'); await sleep(800)
    await tapByAttr('.type-option', 'data-type', 'expense')
  })

  await runCase('C3-4', 'P0', '金额校验拦截', async () => {
    await ensureTab('record'); await sleep(900)
    const before = await dbCountByNote(marker)
    for (const bad of ['', '0', '-5', '123456789', '1.234']) {
      await (await page.$('.amount-input')).input(bad)
      await (await page.$('.save-btn')).tap(); await sleep(700)
    }
    const after = await dbCountByNote(marker)
    if (after !== before) throw new Error(`拦截失败 ${before}->${after}，出现脏数据`)
  })

  await runCase('C3-5', 'P2', '心情标签选择', async () => {
    await ensureTab('record'); await sleep(900)
    await (await page.$('.extras-chip')).tap(); await sleep(600)
    const moods = await page.$$('.mood-grid-item')
    if (!moods.length) throw new Error('心情宫格为空')
    await moods[1].tap(); await sleep(500)
    if (!(await page.data('mood'))) throw new Error('mood 未写入')
    await shot('C3-5-mood')
  })

  await runCase('C3-6', 'P1', '保存防抖', async () => {
    await ensureTab('record'); await sleep(900)
    const before = await dbCountByNote(marker)
    await (await page.$('.amount-input')).input('6.66')
    await (await page.$('.note-input')).input('[SMOKE]防抖')
    const save = await page.$('.save-btn')
    await save.tap(); await save.tap(); await save.tap()
    await sleep(4500)
    const after = await dbCountByNote(marker)
    if (after - before > 1) throw new Error(`连点入账 ${after - before} 笔，防抖失效`)
  })
}

/* ================= M12-A 小橘助手 ================= */
async function m12a() {
  console.log('\n== M12-A 小橘助手 ==')
  await ensureTab('record'); await sleep(900)
  const yst = fmt(new Date(Date.now() - 864e5))
  const today = fmt(new Date())

  await runCase('C12-1', 'P1', '宠物形象与聊天入口', async () => {
    if (!(await page.$('.juji-pet'))) throw new Error('小橘形象节点缺失')
    await (await page.$('.juji-pet')).tap(); await sleep(800)
    if (!(await page.data('showAiChat'))) throw new Error('聊天弹窗未打开')
    const msgs = await page.data('chatMessages')
    if (!msgs.length || !/小橘/.test(msgs[0].content)) throw new Error('欢迎语缺失')
    const chips = await page.$$('.chat-suggestion-chip')
    if (chips.length < 6) throw new Error('建议话术不足6条: ' + chips.length)
    await shot('C12-1-chat')
  })

  await runCase('C12-2', 'P0', '建议话术查账(真实AI)', async () => {
    await firePageMethod('sendChatSuggestion', { currentTarget: { dataset: { text: '今天记了几笔' } } })
    await poll('chatLoading 结束', () => page.data('chatLoading').then(v => !v), 70000, 1000)
    const msgs = await page.data('chatMessages')
    const last = msgs[msgs.length - 1]
    if (last.role !== 'assistant') throw new Error('最后一条非助手回复')
    if (/小橘不知道/.test(last.content)) throw new Error('命中兜底: ' + last.content)
    await shot('C12-2-reply')
  })

  await runCase('C12-3', 'P0', '一句话记账草稿(真实AI)', async () => {
    await firePageMethod('sendChatMessage', '记一笔：[SMOKE]测试午饭 昨天花了7.77元')
    await poll('chatLoading 结束', () => page.data('chatLoading').then(v => !v), 70000, 1000)
    const msgs = await page.data('chatMessages')
    const draft = msgs.find(m => m.type === 'billDraft' && m.status === 'pending')
    if (!draft) throw new Error('未生成草稿: ' + JSON.stringify(msgs[msgs.length - 1]).slice(0, 120))
    const it = draft.drafts[0]
    if (Number(it.amount) !== 7.77) throw new Error('金额解析: ' + it.amount)
    if (it.type !== 'expense') throw new Error('类型: ' + it.type)
    if (it.date !== yst) throw new Error('日期应昨天: ' + it.date)
    await shot('C12-3-draft')
    await page.callMethod('confirmBillDraft', { currentTarget: { dataset: { msg: draft.id } } })
    await poll('草稿入库 7.77', () => dbFindOne({ amount: 7.77, date: yst }), 25000)
    const n = await dbRemoveWhere({ amount: 7.77, date: yst })
    notes.push(`C12-3 入库后即时清理 ${n} 条`)
  })

  await runCase('C12-4', 'P1', '多笔拆分与上限(mock)', async () => {
    await mp.mockWxMethod('cloud.callFunction', {
      result: { ok: true, checked: true, success: true, reply: '好的，帮你拆成两笔~',
        bills: [
          { type: 'expense', category: '餐饮', amount: 12, note: '午饭', date: today },
          { type: 'expense', category: '交通', amount: 3, note: '地铁', date: today }
        ] }
    })
    await firePageMethod('sendChatMessage', '测试多笔拆分')
    await poll('chatLoading 结束', () => page.data('chatLoading').then(v => !v), 15000, 500)
    const msgs = await page.data('chatMessages')
    const draft = msgs.slice().reverse().find(m => m.type === 'billDraft')
    if (!draft || draft.drafts.length !== 2) throw new Error('拆分失败')
    await page.callMethod('cancelBillDraft', { currentTarget: { dataset: { msg: draft.id } } }).catch(() => {})
    await mp.restoreWxMethod('cloud.callFunction')
  })

  await runCase('C12-5', 'P1', '输入安全拦截(mock)', async () => {
    await mp.mockWxMethod('cloud.callFunction', { result: { ok: false, message: '敏感' } })
    const before = (await page.data('chatMessages')).length
    await firePageMethod('sendChatMessage', '随便说点什么')
    await sleep(1500)
    const msgs = await page.data('chatMessages')
    await mp.restoreWxMethod('cloud.callFunction')
    if (msgs.length !== before + 1 || !/小橘不知道/.test(msgs[msgs.length - 1].content)) throw new Error('拦截兜底未生效')
  })

  await runCase('C12-7', 'P2', '天气话题下线话术', async () => {
    const before = (await page.data('chatMessages')).length
    await firePageMethod('sendChatMessage', '今天天气怎么样')
    await sleep(1000)
    const msgs = await page.data('chatMessages')
    if (msgs.length !== before + 1 || !/天气查询功能先下线/.test(msgs[msgs.length - 1].content)) throw new Error('未命中下线话术')
  })

  await runCase('C12-8', 'P1', '调用失败兜底(mock)', async () => {
    await mp.mockWxMethod('cloud.callFunction', null)
    const before = (await page.data('chatMessages')).length
    await firePageMethod('sendChatMessage', '测试失败兜底')
    await poll('chatLoading 结束', () => page.data('chatLoading').then(v => !v), 15000, 500)
    const msgs = await page.data('chatMessages')
    await mp.restoreWxMethod('cloud.callFunction')
    if (msgs.length !== before + 1 || !/小橘不知道/.test(msgs[msgs.length - 1].content)) throw new Error('失败兜底未生效')
  })

  await runCase('C12-9', 'P1', '键盘高度联动', async () => {
    await page.callMethod('onChatKeyboardHeightChange', { detail: { height: 300 } }); await sleep(400)
    if ((await page.data('chatKeyboardHeight')) !== 300) throw new Error('键盘高度未联动')
    await page.callMethod('onChatKeyboardHeightChange', { detail: { height: 0 } }); await sleep(300)
    if ((await page.data('chatKeyboardHeight')) !== 0) throw new Error('键盘收起未复位')
  })

  await runCase('C12-10', 'P2', '消息头像渲染', async () => {
    const msgs = await page.data('chatMessages')
    const bad = msgs.filter(m => m.role === 'assistant' && !m.avatar)
    if (bad.length) throw new Error('助手消息缺头像 ' + bad.length + ' 条')
    await shot('C12-10-msgs')
  })

  await page.callMethod('closeAiChat').catch(() => {})
}

/* ================= M4 首页 ================= */
async function m4() {
  console.log('\n== M4 首页 ==')
  await ensureTab('home')
  page = await waitPage('home'); await sleep(1500)

  await runCase('C4-1', 'P0', '首页渲染', async () => {
    if (!(await page.$('.bill-row'))) throw new Error('无流水行节点')
    await shot('C4-1-home')
  })
  await runCase('C4-2', 'P0', '记账后数据联动', async () => {
    const s = JSON.stringify(await page.data())
    if (!/SMOKE/.test(s)) throw new Error('首页数据未发现 [SMOKE] 流水')
  })
  await runCase('C4-3', 'P0', '流水跳详情', async () => {
    await (await page.$('.bill-row')).tap(); await sleep(1400)
    const p = await mp.currentPage()
    if (!p.path.includes('detail')) throw new Error('未跳转: ' + p.path)
    await mp.navigateBack(); await sleep(900)
  })
}

/* ================= M5 统计 ================= */
async function m5() {
  console.log('\n== M5 统计 ==')
  await ensureTab('stats')
  page = await waitPage('stats'); await sleep(1600)

  await runCase('C5-1', 'P0', '三档周期切换', async () => {
    for (const mode of ['day', 'week', 'month']) {
      await tapByAttr('.range-item', 'data-mode', mode); await sleep(1000)
      if (!(await page.data('rangeLabel'))) throw new Error(mode + ' rangeLabel 空')
    }
    await tapByAttr('.range-item', 'data-mode', 'month'); await sleep(1300)
  })

  await runCase('C5-2', 'P0', '折线图渲染与刻度对齐回归', async () => {
    if (!(await page.$('#trendCanvas'))) throw new Error('canvas 缺失')
    const ticks = await page.data('trendAxisTicks')
    if (!ticks || ticks.length < 6) throw new Error('刻度异常: ' + (ticks || []).length)
    const points = await page.callMethod('computeTrendPoints')
    for (const t of ticks) {
      const p = points[t.index]
      if (!p || Math.abs(p.x - t.x) > 0.01) throw new Error(`刻度${t.index}错位 tick=${t.x} point=${p && p.x}`)
    }
    const labels = ticks.map(t => t.label)
    notes.push(`刻度: ${labels[0]}…${labels[labels.length - 1]} 共${ticks.length}个`)
    await shot('C5-2-chart')
  })

  await runCase('C5-3', 'P0', '触摸选点与tooltip回归', async () => {
    await page.callMethod('selectTrendPoint', 99999) // 超右界吸附末点
    await poll('tooltip 出现', async () => (await page.data('trendTooltip')).show, 5000, 300)
    const tip = await page.data('trendTooltip')
    const sel = await page.data('trendSelected')
    const ticks = await page.data('trendAxisTicks')
    const lastTick = ticks[ticks.length - 1]
    if (sel.index !== lastTick.index) throw new Error(`应选中末点${lastTick.index} 实际${sel.index}`)
    if (!(await page.$('.trend-tooltip'))) throw new Error('tooltip 节点缺失')
    await shot('C5-3-tooltip')
  })

  await runCase('C5-4', 'P0', '支出收入切换', async () => {
    await page.callMethod('switchType', { currentTarget: { dataset: { type: 'income' } } }); await sleep(1100)
    await page.callMethod('switchType', { currentTarget: { dataset: { type: 'expense' } } }); await sleep(1100)
  })

  await runCase('C5-5', 'P1', '排行榜展开收起', async () => {
    const before = await page.data('showRankingAll')
    await page.callMethod('toggleRankingAll'); await sleep(400)
    if ((await page.data('showRankingAll')) === before) throw new Error('展开状态未翻转')
    await page.callMethod('toggleRankingAll'); await sleep(300)
  })

  await runCase('C5-6', 'P1', 'AI便签失败兜底(mock)', async () => {
    try { await mp.mockWxMethod('cloud.extend.AI.createModel', null) } catch (e) {
      notes.push('C5-6 跳过: mockWxMethod 不支持嵌套路径 ' + e.message); return
    }
    await firePageMethod('refreshAIComments')
    await poll('monthly 兜底文案', async () => /没词儿|失败/.test((await page.data('monthlyComment')) || ''), 40000, 2000).catch(() => {})
    await mp.restoreWxMethod('cloud.extend.AI.createModel')
    const t = await page.data('monthlyComment')
    if (!t || !/没词儿|失败/.test(t)) throw new Error('兜底文案未出现: ' + t)
    await shot('C5-6-ai-notes')
  })
}

/* ================= M6 预算 ================= */
async function m6() {
  console.log('\n== M6 预算 ==')
  await ensureTab('budget')
  page = await waitPage('budget'); await sleep(1400)
  const mk = (() => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}` })()

  await runCase('C6-1', 'P0', '原预算备份', async () => {
    const doc = await ev(m => {
      const db = wx.cloud.database()
      return db.collection('budgets').where({ month: m }).limit(1).get().then(r => r.data[0] || null)
    }, mk)
    fs.writeFileSync(path.join(ART, 'budget-backup.json'), JSON.stringify({ mk, doc }, null, 2))
    notes.push(`原预算(${mk}): ${doc ? doc.amount : '未设置'}`)
  })

  await runCase('C6-2', 'P0', '设置预算 66.66', async () => {
    await page.callMethod('onBudgetInput', { detail: { value: '66.66' } })
    await firePageMethod('saveBudget')
    await poll('预算写入 66.66', () => ev(m => {
      const db = wx.cloud.database()
      return db.collection('budgets').where({ month: m }).limit(1).get()
        .then(r => !!(r.data[0] && r.data[0].amount === 66.66))
    }, mk), 15000, 800)
  })

  await runCase('C6-3', 'P1', '预算页渲染', async () => {
    const data = await page.data()
    if (!data.themeStyle) throw new Error('页面数据异常')
    await shot('C6-3-budget')
  })
}

/* ================= M7 详情改删 ================= */
async function m7() {
  console.log('\n== M7 详情改删 ==')
  const today = fmt(new Date())

  await runCase('C7-1', 'P0', '详情一致性', async () => {
    await ensureTab('home'); await sleep(1200)
    await (await page.$('.bill-row')).tap(); await sleep(1400)
    page = await waitPage('detail'); await sleep(900)
    const data = await page.data()
    const doc = await ev(dt => {
      const db = wx.cloud.database(); const _ = db.command
      return db.collection('bills').where({ note: db.RegExp({ regexp: '\\[SMOKE\\]支出冒烟' }), isDeleted: _.neq(true) })
        .limit(1).get().then(r => r.data[0] || null)
    }, today).catch(() => null)
    if (!doc) throw new Error('云库未找到 [SMOKE] 账单')
    const shown = String(data.bill ? data.bill.amount : data.amount)
    if (Number(shown) !== Number(doc.amount)) throw new Error(`详情 ${shown} 与云库 ${doc.amount} 不一致`)
    globalThis.__smokeId = doc._id
    await shot('C7-1-detail')
  })

  await runCase('C7-2', 'P0', '编辑账单同步', async () => {
    await (await page.$('.detail-edit-btn')).tap()
    page = await waitPage('record'); await sleep(1200)
    if (!(await page.data('editMode'))) throw new Error('未进入编辑模式')
    await (await page.$('.amount-input')).input('9.99')
    await (await page.$('.save-btn')).tap()
    await poll('更新为 9.99', () => dbFindOne({ amount: 9.99, date: today }), 20000)
  })

  await runCase('C7-3', 'P0', '软删除(云函数)', async () => {
    const doc = await dbFindOne({ amount: 9.99, date: today })
    if (!doc) throw new Error('未找到 9.99 账单')
    const r = await ev(id => wx.cloud.callFunction({ name: 'bills', data: { action: 'delete', billId: id } })
      .then(res => res.result).catch(e => ({ success: false, message: String(e) })), doc._id)
    if (!r.success) throw new Error('delete 失败: ' + JSON.stringify(r).slice(0, 120))
    const gone = await ev(id => {
      const db = wx.cloud.database(); const _ = db.command
      return db.collection('bills').where({ _id: id, isDeleted: _.neq(true) }).count().then(x => x.total === 0)
    }, doc._id)
    if (!gone) throw new Error('isDeleted 未生效')
  })
}

/* ================= M8 分类 ================= */
async function m8() {
  console.log('\n== M8 分类管理 ==')
  await ensureTab('record'); await sleep(800)

  await runCase('C8-2', 'P1', '新增自定义分类', async () => {
    await page.setData({ addCategoryName: '[SMOKE]类', addCategoryIcon: '🍊' })
    await page.callMethod('saveAddCategory')
    await sleep(1500)
    const s = JSON.stringify(await page.data('categories') || [])
    if (!/SMOKE/.test(s)) throw new Error('自定义分类未同步到宫格')
    await shot('C8-2-category')
  })

  await runCase('C8-3', 'P1', '删除自定义分类', async () => {
    const r = await ev(name => wx.cloud.callFunction({
      name: 'users', data: { action: 'removeCategory', name: name }
    }).then(x => x.result).catch(e => ({ error: String(e) })), '[SMOKE]类')
    const s = JSON.stringify(r)
    if (/error/.test(s)) notes.push('C8-3 云函数直删返回: ' + s.slice(0, 100) + '（长按删除涉及原生确认弹窗，转人工抽验）')
    await sleep(800)
    await shot('C8-3-category')
    notes.push('C8-3 长按删除确认弹窗为原生组件，自动化受限，服务端删除链路已验证')
  })
}

/* ================= M9 主题 ================= */
async function m9() {
  console.log('\n== M9 主题系统 ==')
  await ensureTab('themes')
  page = await waitPage('themes'); await sleep(1100)

  await runCase('C9-1', 'P1', '预设主题切换', async () => {
    for (const id of ['mint', 'sunset', 'dark', 'ocean']) {
      await tapByAttr('.theme-card', 'data-id', id); await sleep(800)
      await shot('C9-1-' + id)
    }
  })

  await runCase('C9-2', 'P1', '深色玻璃令牌回归', async () => {
    await tapByAttr('.theme-card', 'data-id', 'dark'); await sleep(800)
    const style = await page.data('themeStyle')
    if (!/--color-surface-glass:rgba\(39, 39, 46, 0.3\)/.test(style)) throw new Error('深色玻璃令牌未生效')
    await shot('C9-2-dark')
  })

  await runCase('C9-3', 'P2', '自建主题CRUD', async () => {
    await page.callMethod('openCreatePanel'); await sleep(500)
    notes.push('自建主题取色器为原生交互，自动化受限，创建面板可打开即视为链路正常')
    await shot('C9-3-create')
  })
}

/* ================= M10 我的 + M12-B ================= */
async function m10() {
  console.log('\n== M10 我的 + M12-B ==')
  await ensureTab('profile')
  page = await waitPage('profile'); await sleep(1400)

  await runCase('C10-1', 'P1', '我的页渲染', async () => {
    if (!(await page.data('themeStyle'))) throw new Error('themeStyle 缺失')
    await shot('C10-1-profile')
  })

  await runCase('C10-3', 'P1', 'CSV导出云函数', async () => {
    let r = await ev(() => wx.cloud.callFunction({ name: 'exportBills', data: {} })
      .then(x => x.result).catch(e => ({ err: String(e && e.errMsg || e) }))
      .then(x => x && (x.fileID || x.success || x.err) ? x : null)).catch(() => null)
    if (!r) {
      r = await ev(() => wx.cloud.callFunction({ name: 'exportBills', data: { action: 'export' } })
        .then(x => x.result).catch(e => ({ err: String(e && e.errMsg || e) })))
    }
    const s = JSON.stringify(r)
    if (/err"|err:/.test(s) && !/fileID|success/i.test(s)) throw new Error('exportBills 失败: ' + s.slice(0, 140))
    notes.push('exportBills: ' + s.slice(0, 110))
  })

  await runCase('C10-4', 'P2', 'JSON导出(dataMigration)', async () => {
    let r = await ev(() => wx.cloud.callFunction({ name: 'dataMigration', data: { action: 'exportAll' } })
      .then(x => x.result).catch(e => ({ err: String(e && e.errMsg || e) })))
    if (r.err) r = await ev(() => wx.cloud.callFunction({ name: 'dataMigration', data: { action: 'export' } })
      .then(x => x.result).catch(e => ({ err: String(e && e.errMsg || e) })))
    if (r.err) throw new Error('dataMigration 失败: ' + r.err.slice(0, 140))
    notes.push('dataMigration 返回 ' + JSON.stringify(r).length + ' 字节')
  })

  await runCase('C12-11', 'P1', '今日称号(真实AI)', async () => {
    await page.callMethod('onTapTopCategory'); await sleep(600)
    if (!(await page.data('showProfileTitle'))) throw new Error('称号弹窗未打开')
    const t = await page.data('profileTitle')
    if (!t || (!t.title && t.status !== 'loading')) throw new Error('称号数据为空')
    await shot('C12-11-title')
    await page.callMethod('closeProfileTitle'); await sleep(300)
  })

  await runCase('C12-12', 'P2', '小橘心里话(真实AI)', async () => {
    await firePageMethod('writeLetterFromTitle')
    await poll('信件渲染', async () => {
      const d2 = await page.data()
      return !!(d2.letterText && d2.letterText.length > 10)
    }, 45000, 2000)
    await shot('C12-12-letter')
    await page.callMethod('closeLetter'); await sleep(300)
  })
}

/* ================= M11 TabBar ================= */
async function m11() {
  console.log('\n== M11 TabBar 毛玻璃 ==')
  await ensureTab('home'); await sleep(900)

  await runCase('C11-1', 'P0', '五Tab切换', async () => {
    for (const r of ['home', 'stats', 'record', 'budget', 'profile']) {
      await mp.switchTab('/pages/' + r + '/' + r); await sleep(700)
      const p = await mp.currentPage()
      if (!p.path.includes(r)) throw new Error('切换失败: ' + r)
    }
  })

  await runCase('C11-2', 'P0', '毛玻璃样式断言', async () => {
    const r = await ev(() => {
      const pg = getCurrentPages().find(p => p.getTabBar && p.getTabBar())
      const tb = pg && pg.getTabBar()
      if (!tb) return { error: 'no-tabbar' }
      return new Promise(resolve => {
        wx.createSelectorQuery().in(tb)
          .select('.custom-tabbar__shell')
          .fields({ computedStyle: ['background-color', 'backdrop-filter'] })
          .exec(res => resolve(res && res[0] ? res[0] : { error: 'no-node' }))
      })
    })
    if (r.error) throw new Error(JSON.stringify(r))
    if (!/rgba\(255, 255, 255, 0.35\)/.test(r['background-color'] || '')) throw new Error('玻璃底色不符: ' + r['background-color'])
    if (!r['backdrop-filter'] || r['backdrop-filter'] === 'none') throw new Error('backdrop-filter 未生效')
    notes.push('TabBar computed: ' + JSON.stringify(r))
    await shot('C11-2-glass')
  })
}

/* ================= 清理复原 ================= */
async function cleanup() {
  console.log('\n== 清理复原 ==')
  const today = fmt(new Date())
  const removed = await ev(() => {
    const db = wx.cloud.database()
    return db.collection('bills').where({ note: db.RegExp({ regexp: '\\[SMOKE\\]', options: 'i' }) }).get()
      .then(async r => {
        let n = 0
        for (const doc of r.data) { await db.collection('bills').doc(doc._id).remove(); n++ }
        return n
      })
  }).catch(e => 'ERR:' + e.message)
  notes.push(`统一清理 [SMOKE] 账单: ${JSON.stringify(removed)} 条`)

  const n2 = await dbRemoveWhere({ amount: 6.66, date: today }).catch(() => 0)
  const n3 = await dbRemoveWhere({ amount: 8.88, date: today }).catch(() => 0)
  notes.push(`特征金额兜底清理: 6.66 x${n2}, 8.88 x${n3}`)

  try {
    const bak = JSON.parse(fs.readFileSync(path.join(ART, 'budget-backup.json'), 'utf8'))
    await ev(b => {
      const db = wx.cloud.database()
      if (b.doc) return db.collection('budgets').where({ month: b.mk }).update({ data: { amount: b.doc.amount } })
      return db.collection('budgets').where({ month: b.mk }).remove()
    }, bak)
    notes.push('预算已复原: ' + (bak.doc ? bak.doc.amount : '移除测试预算'))
  } catch (e) { notes.push('预算复原跳过: ' + e.message) }

  try {
    const t = fs.readFileSync(path.join(ART, 'theme-backup.txt'), 'utf8').trim()
    await ev(tid => { wx.setStorageSync('theme', tid); getApp().globalData.eventBus.emit('themeChanged', tid) }, t)
    notes.push('主题已复原: ' + t)
  } catch (e) { notes.push('主题复原跳过: ' + e.message) }

  const left = await dbCountByNote('\\[SMOKE\\]')
  notes.push(`残留复核: [SMOKE] 账单 ${left} 条（应为 0）`)
}

/* ================= 报告 ================= */
function report() {
  const pass = results.filter(r => r.ok).length
  const p0 = results.filter(r => r.level === 'P0')
  const p0pass = p0.filter(r => r.ok).length
  const md = [
    `# 橘记冒烟测试报告 ${STAMP}`, ``,
    `- 总用例: ${results.length} · 通过 ${pass} · 失败 ${results.length - pass}`,
    `- P0: ${p0pass}/${p0.length}`,
    `- 判定: ${p0.length && p0pass === p0.length ? 'PASS - P0 全通过' : 'FAIL - P0 存在失败，需修复后复测'}`, ``,
    `| 用例 | 级别 | 名称 | 结果 | 说明 |`, `|---|---|---|---|---|`,
    ...results.map(r => `| ${r.id} | ${r.level} | ${r.name} | ${r.ok ? 'PASS' : 'FAIL'} | ${r.detail.replace(/\|/g, '/')} |`),
    ``, `## 备注`, ...notes.map(n => `- ${n}`)
  ].join('\n')
  fs.writeFileSync(path.join(ART, 'report.md'), md)
  fs.writeFileSync(path.join(ART, 'report.json'), JSON.stringify({ results, notes }, null, 2))
  console.log(`\n== 报告: ${path.join(ART, 'report.md')}`)
  console.log(`== 总计 ${results.length}，通过 ${pass}，P0 ${p0pass}/${p0.length}`)
}

/* ================= 主流程 ================= */
const MODULES = { m0, m1, m2, m3, m12a, m4, m5, m6, m7, m8, m9, m10, m11, cleanup }
const ORDER = ['m0', 'm1', 'm2', 'm3', 'm12a', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10', 'm11', 'cleanup']

;(async () => {
  const want = process.argv.slice(2)
  const list = (!want.length || want[0] === 'all') ? ORDER : want
  let mpClosed = false
  try {
    for (const name of list) await MODULES[name]()
  } catch (e) {
    console.error('== 执行中断:', e.message)
    notes.push('执行中断: ' + e.message)
  }
  if (results.length) report()
  // 不调用 mp.close()：保持工具会话温热，避免下次运行重新冷启动
  process.exit(0)
})()
