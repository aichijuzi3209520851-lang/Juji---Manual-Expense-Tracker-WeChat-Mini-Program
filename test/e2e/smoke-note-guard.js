/**
 * 橘记JUJI · 备注违禁词拦截 UI 冒烟
 *
 * 前置：微信开发者工具已打开本项目，且「设置 → 安全 → 服务端口」已开启。
 * 运行：cd test/e2e && node smoke-note-guard.js
 *
 * 验证目标（对应需求：弹窗提醒 + 阻止提交）：
 *   N1 输入违禁备注 → 立即弹出警示窗口，页面标记不可保存
 *   N2 点保存 → 再次弹窗，账单未落库，页面不跳转
 *   N3 变体（赌 博 / 全角 / 空格）同样拦得住
 *   N4 正常备注不误杀：能正常保存（用例结束自动清理测试数据）
 *
 * 说明：wx.showModal 在用例内被钩子接管（不真正弹原生框），
 *      以便断言弹窗标题/文案，同时避免自动化点击被弹窗挡住。
 */
const { createHarness } = require('./lib/harness')

const BAD_NOTE = '买毒品花了钱'          // 毒品类
const BAD_NOTE_EVASION = '昨晚赌 博输了'  // 赌博类 + 空格变体
const GOOD_NOTE = '自动化测试备注-可删除'
const AMOUNT = '25'

const h = createHarness({ suite: 'note-guard', title: '橘记JUJI · 备注违禁词拦截冒烟' })
const sleep = ms => new Promise(r => setTimeout(r, ms))

const installSpy = () => h.mp.evaluate(() => {
  globalThis.__spy = { modals: [], toasts: [] }
  wx.showModal = function (o) {
    globalThis.__spy.modals.push({ title: o && o.title, content: o && o.content })
    return 'hooked'
  }
  wx.showToast = function (o) {
    globalThis.__spy.toasts.push({ title: o && o.title })
    return 'hooked'
  }
  return 'spy-installed'
})

const readSpy = () => h.mp.evaluate(() => ({
  modals: globalThis.__spy ? globalThis.__spy.modals : [],
  toasts: globalThis.__spy ? globalThis.__spy.toasts : []
}))

const resetSpy = () => h.mp.evaluate(() => {
  globalThis.__spy = { modals: [], toasts: [] }
  return 'reset'
})

async function setNote(note) {
  const page = await h.waitPage('record')
  await page.setData({ note, amount: AMOUNT, noteExpanded: true })
  const el = await page.$('.note-input')
  if (el) await el.input(note)
  await sleep(600) // 覆盖 onNoteInput 的 300ms 防抖
  return page
}

function countNote(pattern) {
  return h.mp.evaluate(p => {
    const db = wx.cloud.database()
    const openid = getApp().globalData.openid
    return db.collection('bills')
      .where({ _openid: openid, note: db.RegExp({ regexp: p }) })
      .count()
      .then(r => r.total)
  }, pattern)
}

;(async () => {
  await h.connect()
  await h.resetRoute()
  await h.gotoTab('record')
  await h.waitPage('record')
  await installSpy()

  // ---------- N1 输入即弹窗 ----------
  await h.expect('N1', '输入违禁备注立即弹窗告警并标记不可保存', async () => {
    await resetSpy()
    const page = await setNote(BAD_NOTE)
    const d = await page.data()
    h.eq(d.note, BAD_NOTE, '备注已上屏')
    h.eq(d.noteBlocked, true, '页面标记 noteBlocked')
    h.includes(d.noteBlockTip || '', '违禁词', '行内提示含违禁词说明')
    const spy = await readSpy()
    h.eq(spy.modals.length, 1, '弹出 1 次警示窗口（输入时不重复刷屏）')
    h.includes(spy.modals[0].title, '违禁', '弹窗标题明确')
    h.includes(spy.modals[0].content, '毒品', '弹窗文案点出违规类别')
    return '弹窗: ' + spy.modals[0].title + ' / ' + spy.modals[0].content
  })

  // ---------- N2 阻止提交 ----------
  await h.expect('N2', '点保存被拦截：再次弹窗 + 不落库 + 不跳转', async () => {
    await resetSpy()
    const before = await countNote('毒品')
    const r = await h.tapElement('.save-btn')
    if (!r.ok) throw new Error('保存按钮点击失败: ' + r.why)
    await sleep(1500)
    const spy = await readSpy()
    h.gte(spy.modals.length, 1, '提交时再次弹出警示窗口')
    h.includes(spy.modals[0].content, '毒品', '提交拦截文案点出违规类别')
    const after = await countNote('毒品')
    h.eq(after, before, '含违禁词的备注未写入数据库')
    const st = await h.stack()
    h.includes(st[st.length - 1], 'record', '仍停留在记账页（未保存跳转）')
    return '弹窗 ' + spy.modals.length + ' 次，库内违禁备注 ' + after + ' 条（与拦截前一致）'
  })

  // ---------- N3 变体不绕过 ----------
  await h.expect('N3', '空格变体同样被拦截且不落库', async () => {
    await resetSpy()
    const before = await countNote('赌博')
    const page = await setNote(BAD_NOTE_EVASION)
    const d = await page.data()
    h.eq(d.noteBlocked, true, '变体备注被标记不可保存')
    const r = await h.tapElement('.save-btn')
    if (!r.ok) throw new Error('保存按钮点击失败: ' + r.why)
    await sleep(1500)
    const spy = await readSpy()
    h.gte(spy.modals.length, 1, '变体提交被弹窗拦截')
    h.includes(spy.modals[0].content, '赌博', '弹窗文案点出赌博类别')
    const after = await countNote('赌博')
    h.eq(after, before, '变体备注未写入数据库')
    return '拦截「' + BAD_NOTE_EVASION + '」，库内赌博类备注 ' + after + ' 条'
  })

  // ---------- N4 正常备注不误杀 ----------
  await h.expect('N4', '正常备注不拦截，可正常保存（用例内自清理）', async () => {
    await resetSpy()
    await setNote(GOOD_NOTE)
    const page = await h.waitPage('record')
    const d0 = await page.data()
    h.eq(d0.noteBlocked, false, '正常备注未被标记')
    const spy0 = await readSpy()
    h.eq(spy0.modals.length, 0, '正常备注未弹警示窗口')

    const r = await h.tapElement('.save-btn')
    if (!r.ok) throw new Error('保存按钮点击失败: ' + r.why)
    await sleep(2500)
    const saved = await countNote(GOOD_NOTE)
    h.eq(saved, 1, '正常备注成功落库（证明没有过度拦截）')

    // 清理：软删除本次写入的测试账单
    const ids = await h.mp.evaluate(n => {
      const db = wx.cloud.database()
      const openid = getApp().globalData.openid
      return db.collection('bills')
        .where({ _openid: openid, note: n })
        .get()
        .then(res => res.data.map(x => x._id))
    }, GOOD_NOTE)
    for (const id of ids) {
      await h.mp.evaluate(i => wx.cloud.callFunction({
        name: 'bills',
        data: { action: 'delete', data: { billId: i } }
      }).then(res => res.result), id)
    }
    h.eq(ids.length, 1, '测试账单已定位并清理')
    return '保存成功并清理 ' + ids.length + ' 条测试数据'
  })

  await h.finish()
})().catch(e => { console.log('FATAL:', e && e.stack ? e.stack : e); process.exit(3) })
