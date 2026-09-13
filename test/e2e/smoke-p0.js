/**
 * 橘记 · P0 冒烟（可靠版）
 * 策略：优先 callMethod 直驱（避开原生组件/元素失效），保存用真实点击验证按钮可用
 * 产物：artifacts/<日期>/p0-report.md
 */
const fs = require('fs')
const path = require('path')
const automator = require('miniprogram-automator')

const STAMP = new Date().toISOString().slice(0, 10)
const ART = path.join(__dirname, 'artifacts', STAMP)
fs.mkdirSync(ART, { recursive: true })

const results = []
const sleep = ms => new Promise(r => setTimeout(r, ms))
const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const TODAY = fmt(new Date())

let mp

function log(...a) { console.log(...a) }
async function caseRun(id, name, fn) {
  const t0 = Date.now()
  try { await fn(); results.push({ id, name, ok: true, detail: '', ms: Date.now() - t0 }); log(`PASS ${id} ${name} (${Date.now() - t0}ms)`) }
  catch (e) { const d = String((e && e.message) || e).slice(0, 200); results.push({ id, name, ok: false, detail: d, ms: Date.now() - t0 }); log(`FAIL ${id} ${name} -- ${d}`) }
}

// 云库查询（直接返回原始文档，避免封装导致形状异常）
async function q(cond) {
  return mp.evaluate(c => {
    const db = wx.cloud.database(); const _ = db.command
    return db.collection('bills').where(Object.assign({ isDeleted: _.neq(true) }, c)).limit(20).get()
      .then(r => r.data.map(d => ({ _id: d._id, amount: d.amount, date: d.date, note: d.note, type: d.type, category: d.category })))
      .catch(e => { throw new Error('db err: ' + String(e && e.message || e)) })
  }, cond)
}
async function smokeRows() {
  return mp.evaluate(() => {
    const db = wx.cloud.database()
    return db.collection('bills').where({ note: db.RegExp({ regexp: '\\[SMOKE', options: 'i' }) }).limit(50).get()
      .then(r => r.data.map(d => ({ _id: d._id, amount: d.amount, note: d.note })))
      .catch(() => [])
  })
}
async function purgeSmoke() {
  return mp.evaluate(() => {
    const db = wx.cloud.database()
    return db.collection('bills').where({ note: db.RegExp({ regexp: '\\[SMOKE', options: 'i' }) }).limit(50).get()
      .then(async r => {
        let n = 0
        for (const d of r.data) { await db.collection('bills').doc(d._id).remove(); n++ }
        return n
      })
  })
}
// 读取页面栈（比 automator currentPage 更实时可靠）
async function stack() {
  return mp.evaluate(() => getCurrentPages().map(x => x.route)).catch(() => [])
}
// 等待当前页面路由包含关键字，刷新 page 句柄
async function waitPage(part, timeout = 20000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    const st = await stack()
    const top = st[st.length - 1] || ''
    if (top.includes(part)) return mp.currentPage()
    await sleep(500)
  }
  throw new Error('等待页面 ' + part + ' 超时（栈: ' + JSON.stringify(await stack()) + '）')
}
// 跳 tab：小程序上下文内执行 switchTab；偶发不生效时重试，仍失败则 reLaunch 兜底
async function gotoTab(route) {
  const url = '/pages/' + route + '/' + route
  for (let i = 0; i < 2; i++) {
    await mp.evaluate(u => new Promise(res => {
      wx.switchTab({ url: u, success: () => res(1), fail: () => res(0) })
      setTimeout(() => res(0), 8000)
    }), url)
    try { return await waitPage(route, 8000) } catch (e) { /* 重试 */ }
  }
  await mp.evaluate(u => new Promise(res => {
    wx.reLaunch({ url: u, success: () => res(1), fail: () => res(0) })
    setTimeout(() => res(0), 8000)
  }), url)
  return waitPage(route, 10000)
}
// 重置记账页表单与编辑态：
// 产品行为 —— 进入编辑模式后 editMode 不会自动清除（onHide 注释：编辑模式下不清除状态），
// 因此用例间必须显式重置，否则后续保存会走 update 分支而非 create
async function resetRecord(p, todayStr) {
  await p.setData({
    editMode: false,
    editBillId: '',
    amount: '',
    selectedCategory: '',
    note: '',
    mood: '',
    photoUrl: '',
    dateStr: todayStr
  })
  await sleep(300)
}
// 普通跳转
async function goto(url, part) {
  await mp.evaluate(u => new Promise(res => {
    wx.navigateTo({ url: u, success: () => res(1), fail: () => res(0) })
    setTimeout(() => res(0), 8000)
  }), url)
  return waitPage(part)
}

;(async () => {
  mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' })
  const sys = await mp.systemInfo()
  log('CONNECTED | SDK', sys.SDKVersion, '| platform', sys.platform)

  await caseRun('A0-1', '自动化链路连通 + 归位首页', async () => {
    const p = await gotoTab('home')
    if (!p) throw new Error('首页句柄为空')
    if (sys.SDKVersion < '3.0.0') throw new Error('SDK 过低: ' + sys.SDKVersion)
  })

  await caseRun('A0-2', '清理历史 [SMOKE] 残留', async () => {
    const n = await purgeSmoke()
    log('   清理残留:', n, '条')
  })

  // ---------- 记账主链路 ----------
  let page = await gotoTab('record')
  await sleep(1200)

  await caseRun('A1-1', '记账页渲染：分类宫格 + 保存按钮', async () => {
    const cats = await page.$$('.category-item')
    if (cats.length < 8) throw new Error('分类数量不足: ' + cats.length)
    const save = await page.$('.save-btn')
    if (!save) throw new Error('保存按钮缺失')
    const amountInput = await page.$('.amount-input')
    if (!amountInput) throw new Error('金额输入框缺失')
  })

  await caseRun('A1-2', '记支出 6.66 [SMOKE]（真实点击保存）', async () => {
    await resetRecord(page, TODAY)
    await page.callMethod('onAmountInput', { detail: { value: '6.66' } })
    await sleep(300)
    await page.callMethod('selectCategory', { currentTarget: { dataset: { name: '餐饮' } } })
    await sleep(300)
    // 展开备注区
    const chips = await page.$$('.extras-chip')
    if (chips[0]) { await chips[0].tap(); await sleep(600) }
    await page.callMethod('onNoteInput', { detail: { value: '[SMOKE]支出冒烟' } })
    await sleep(300)
    const d = await page.data()
    if (Number(d.amount) !== 6.66) throw new Error('金额未写入: ' + d.amount)
    if (d.selectedCategory !== '餐饮') throw new Error('分类未选中: ' + d.selectedCategory)
    if (!/SMOKE/.test(d.note || '')) throw new Error('备注未写入: ' + d.note)
    // 真实点击保存
    const save = await page.$('.save-btn')
    await save.tap()
    // 等入库
    const t0 = Date.now()
    let rows = []
    while (Date.now() - t0 < 20000) {
      rows = await q({ amount: 6.66, date: TODAY })
      if (rows.some(r => /SMOKE/.test(r.note || ''))) break
      await sleep(800)
    }
    const hit = rows.find(r => /SMOKE/.test(r.note || ''))
    if (!hit) throw new Error('20s 内未查到入库记录（查到 ' + rows.length + ' 条 6.66）')
    log('   入库: amount=' + hit.amount + ' | note=' + hit.note + ' | id=' + String(hit._id).slice(0, 6) + '…')
  })

  await caseRun('A1-3', '保存后自动回首页 + 流水可见', async () => {
    const p = await waitPage('home', 15000)
    // 首页 onShow 重新拉取流水存在时序，轮询等待新账单出现（groupedBills 为流水分组字段）
    const t1 = Date.now()
    let flat = ''
    let cnt = 0
    while (Date.now() - t1 < 10000) {
      const d = await p.data()
      cnt = (d.groupedBills || []).length
      flat = JSON.stringify(d.groupedBills || [])
      if (/SMOKE/.test(flat)) break
      await sleep(600)
    }
    if (!/SMOKE/.test(flat)) throw new Error('首页流水未见 [SMOKE] 账单（等待 10s，groupedBills 条数: ' + cnt + '）')
    page = p
  })

  await caseRun('A1-4', '金额校验拦截（0 / 负数 / 超长）', async () => {
    page = await gotoTab('record'); await sleep(1000)
    await resetRecord(page, TODAY)
    const before = (await smokeRows()).length
    for (const bad of ['0', '-5', '123456789']) {
      await page.callMethod('onAmountInput', { detail: { value: bad } })
      await page.callMethod('selectCategory', { currentTarget: { dataset: { name: '餐饮' } } })
      const save = await page.$('.save-btn')
      await save.tap()
      await sleep(900)
    }
    const after = (await smokeRows()).length
    if (after > before) throw new Error(`拦截失败：新增 ${after - before} 条脏数据`)
  })

  // ---------- 详情页 / 编辑 / 删除 ----------
  let billId
  await caseRun('A2-1', '从首页进入账单详情', async () => {
    const rows = await q({ amount: 6.66, date: TODAY })
    const hit = rows.find(r => /SMOKE/.test(r.note || ''))
    if (!hit) throw new Error('未找到 [SMOKE] 账单')
    billId = hit._id
    const p = await gotoTab('home'); await sleep(800)
    await goto('/pages/detail/detail?id=' + billId, 'detail').catch(async () => {
      await p.callMethod('goDetail', { currentTarget: { dataset: { id: billId } } })
    })
    const dp = await waitPage('detail', 15000)
    const d = await dp.data()
    const shown = Number((d.bill && d.bill.amount) !== undefined ? d.bill.amount : d.amount)
    if (shown !== 6.66) throw new Error('详情金额不一致: ' + shown)
    page = dp
  })

  await caseRun('A2-2', '编辑账单 6.66 -> 9.99', async () => {
    const edit = await page.$('.detail-edit-btn')
    if (edit) { await edit.tap() } else { await page.callMethod('editBill') }
    const rp = await waitPage('record', 15000)
    // record 页在 onShow 才根据 globalData._editBillId 置 editMode，需轮询等待
    const te = Date.now()
    let em = false
    while (Date.now() - te < 8000) {
      em = await rp.data('editMode')
      if (em) break
      await sleep(400)
    }
    if (!em) throw new Error('未进入编辑模式')
    await rp.callMethod('onAmountInput', { detail: { value: '9.99' } })
    await sleep(300)
    const save = await rp.$('.save-btn')
    await save.tap()
    const t0 = Date.now()
    while (Date.now() - t0 < 20000) {
      const rows = await q({ _id: billId })
      if (rows.length && Number(rows[0].amount) === 9.99) return
      await sleep(800)
    }
    throw new Error('金额未更新为 9.99')
  })

  await caseRun('A2-3', '删除账单（软删除 isDeleted）', async () => {
    // 与前端一致：billId 在 data 内层 { action:'delete', data:{ billId } }
    const r = await mp.evaluate(id => wx.cloud.callFunction({ name: 'bills', data: { action: 'delete', data: { billId: id } } })
      .then(res => res.result).catch(e => ({ success: false, message: String(e) })), billId)
    if (!r.success) throw new Error('云函数 delete 失败: ' + JSON.stringify(r).slice(0, 120))
    const gone = await mp.evaluate(id => {
      const db = wx.cloud.database(); const _ = db.command
      return db.collection('bills').where({ _id: id, isDeleted: _.neq(true) }).count().then(x => x.total === 0)
    }, billId)
    if (!gone) throw new Error('isDeleted 未生效')
  })

  // ---------- 各页面渲染 ----------
  for (const [route, label] of [['stats', '统计页'], ['budget', '预算页'], ['profile', '我的页']]) {
    await caseRun('A3-' + route, label + '渲染无异常', async () => {
      const p = await gotoTab(route)
      await sleep(1500)
      const d = await p.data()
      if (!d.themeStyle) throw new Error('主题样式缺失')
      await mp.screenshot({ path: path.join(ART, 'A3-' + route + '.png') }).catch(() => {})
    })
  }

  await caseRun('A4-1', '帮助与教程页可打开（新功能）', async () => {
    const p = await gotoTab('profile'); await sleep(1000)
    await goto('/pages/help/help', 'help')
    const hp = await waitPage('help', 15000)
    const d = await hp.data()
    if (!d.groups || d.groups.length < 8) throw new Error('帮助分组异常: ' + ((d.groups || []).length))
    await mp.screenshot({ path: path.join(ART, 'A4-1-help.png') }).catch(() => {})
    log('   帮助页分组:', d.groups.length)
  })

  // ---------- 清理 ----------
  await caseRun('A9-9', '清理 [SMOKE] 测试数据', async () => {
    const n = await purgeSmoke()
    const left = (await smokeRows()).length
    log('   删除', n, '条，残留', left, '条')
    if (left !== 0) throw new Error('残留 ' + left + ' 条未清理')
  })

  // ---------- 报告 ----------
  const pass = results.filter(r => r.ok).length
  const md = [
    `# 橘记 P0 冒烟报告 ${STAMP}`,
    '',
    `- 用例: ${results.length} · 通过 ${pass} · 失败 ${results.length - pass}`,
    `- 判定: ${pass === results.length ? 'PASS' : 'FAIL'}`,
    `- SDK ${sys.SDKVersion} / ${sys.platform}`,
    '',
    '| 用例 | 名称 | 结果 | 耗时 | 说明 |',
    '|---|---|---|---|---|',
    ...results.map(r => `| ${r.id} | ${r.name} | ${r.ok ? 'PASS' : 'FAIL'} | ${r.ms}ms | ${r.detail.replace(/\|/g, '/')} |`),
    ''
  ].join('\n')
  fs.writeFileSync(path.join(ART, 'p0-report.md'), md)
  log('\n' + md)

  await mp.disconnect()
  process.exit(pass === results.length ? 0 : 1)
})().catch(e => { console.log('FATAL:', e.message); process.exit(3) })
