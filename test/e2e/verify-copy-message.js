/**
 * 验证「长按小橘的回复可选中复制」
 * 用法：先 node start-auto.js --force（改过页面代码必须 force），再 node verify-copy-message.js
 *
 * 背景（重要）：本项目**不能用 wx.setClipboardData** —— 隐私指引未声明「剪切板」作用域，
 * 该 API 会直接 fail（api scope is not declared in the privacy agreement）。
 * 因此改为 <text user-select> + 系统选择菜单，无需任何额外隐私声明。
 * 诊断当前作用域状态：node probe-clipboard.js
 */
const fs = require('fs')
const path = require('path')
const automator = require('miniprogram-automator')

const sleep = ms => new Promise(r => setTimeout(r, ms))
let fail = 0
const check = (cond, msg, extra) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + msg + (extra && !cond ? ' -- ' + extra : ''))
  if (!cond) fail++
}

;(async () => {
  const mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' })
  console.log('CONNECTED')

  await mp.evaluate(() => new Promise(res => {
    wx.switchTab({ url: '/pages/record/record', success: () => res(1), fail: () => res(0) })
    setTimeout(() => res(0), 8000)
  }))
  let page = null
  const t0 = Date.now()
  while (Date.now() - t0 < 15000) {
    const st = await mp.evaluate(() => getCurrentPages().map(x => x.route))
    if ((st[st.length - 1] || '').includes('record')) { page = await mp.currentPage(); break }
    await sleep(400)
  }
  if (!page) throw new Error('未进入记账页')
  await sleep(800)
  await page.callMethod('openAiChat')
  await sleep(1200)

  console.log('')
  console.log('--- C1 气泡内改用了 text 元素（可选中）---')
  const textEls = await page.$$('.chat-bubble-text')
  check(textEls.length > 0, '存在 .chat-bubble-text 元素（' + textEls.length + ' 个）')
  if (!textEls.length) throw new Error('气泡内没有 text 元素，说明 wxml 没改对')
  // 注意：不要用 element.attribute('user-select') 断言 —— automator 读内置 text 组件的该属性
  // 会返回空串甚至挂起（实测卡死超时）。属性是否存在改由 C3 的源码检查兜底。
  const welcome = (await page.data('chatMessages')).find(m => m.role === 'assistant') || {}
  const rendered = await textEls[0].text()
  check(rendered === welcome.content, '渲染内容与消息内容一致',
    '期望: ' + String(welcome.content).slice(0, 30) + ' | 实际: ' + String(rendered).slice(0, 30))

  console.log('')
  console.log('--- C2 代码类长回答：换行/缩进是否保留（复制代码的前提）---')
  const beforeCount = (await page.data('chatMessages')).filter(m => m.role === 'assistant').length
  await page.callMethod('sendChatMessage', '用 Python 写一个冒泡排序，给完整代码')
  let reply = null
  const t1 = Date.now()
  while (Date.now() - t1 < 60000) {
    const msgs = await page.data('chatMessages')
    const assistants = msgs.filter(m => m.role === 'assistant')
    const loading = await page.data('chatLoading')
    if (assistants.length > beforeCount && !loading) { reply = assistants[assistants.length - 1]; break }
    await sleep(800)
  }
  if (!reply) throw new Error('60s 内未拿到回复')
  const content = String(reply.content || '')
  check(content.length > 100, '拿到长回答（' + content.length + ' 字）')
  check(/\n/.test(content), '回答含换行（真实多行内容）')

  const els2 = await page.$$('.chat-bubble-text')
  const lastEl = els2[els2.length - 1]
  const lastText = await lastEl.text()
  check(lastText === content, 'DOM 里的文字与消息内容逐字一致（复制出来不会缺字/串行）',
    '长度 期望 ' + content.length + ' / 实际 ' + String(lastText).length)
  await mp.screenshot({ path: path.join(__dirname, 'artifacts', new Date().toISOString().slice(0, 10), 'copy-selectable.png') }).catch(() => {})

  console.log('')
  console.log('--- C3 静态检查：没有误用需要隐私作用域的剪贴板 API ---')
  for (const f of ['miniprogram/pages/record/record.js', 'miniprogram/pages/profile/profile.js']) {
    const s = fs.readFileSync(path.join(__dirname, '..', '..', f), 'utf8')
    check(!/setClipboardData/.test(s), path.basename(f) + ': 未使用 setClipboardData（避免隐私作用域报错）')
  }
  for (const f of ['miniprogram/pages/record/record.wxml', 'miniprogram/pages/profile/profile.wxml']) {
    const s = fs.readFileSync(path.join(__dirname, '..', '..', f), 'utf8')
    check(/<text class="chat-bubble-text" user-select="\{\{true\}\}"/.test(s), path.basename(f) + ': text 带 user-select')
    check(/长按小橘的回复可选中复制/.test(s), path.basename(f) + ': 页脚提示已更新')
    const selfClosing = (s.match(/<view[^>]*\/>/g) || []).length
    const open = (s.match(/<view\b/g) || []).length - selfClosing
    const close = (s.match(/<\/view>/g) || []).length
    check(open === close, path.basename(f) + ': view 标签配平（' + open + '/' + close + '）')
  }
  const helpSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'miniprogram/pages/help/help.js'), 'utf8')
  check(/选中后点「复制」/.test(helpSrc), 'help.js: 帮助页已说明复制方式')

  await page.callMethod('closeAiChat').catch(() => {})
  await mp.disconnect()
  console.log('')
  console.log(fail === 0 ? '全部通过 ✅ 小橘的回复已可长按选中复制' : fail + ' 项未通过 ❌')
  process.exit(fail === 0 ? 0 : 1)
})().catch(e => { console.log('FATAL:', e.message); process.exit(3) })
