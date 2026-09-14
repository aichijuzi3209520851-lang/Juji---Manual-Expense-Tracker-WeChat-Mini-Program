/**
 * 实测小橘气泡的实际停留时长
 * 用法：先 node start-auto.js，再 node verify-bubble-ms.js
 *
 * 注意（踩过的坑）：不能在 automator 侧用 Date.now() 掐表 —— playPetAction 的
 * callMethod 往返有 300-400ms 延迟，而气泡的 setTimeout 在往返「中途」就已启动，
 * 这样测出来的值会系统性偏短（实测 1629ms 而真实是 2000ms）。
 * 正确做法：把计时放进小程序内部（mp.evaluate 里 setInterval 轮询 data 变化）。
 */
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

const CASES = ['wave', 'heart', 'jelly', 'dance', 'sleep']
const MIN = 1900, MAX = 2200
let fail = 0

// 在小程序内部测一次动作：返回 { phrase, ms, expected }
async function measure(mp, action) {
  return mp.evaluate(act => new Promise(resolve => {
    const page = getCurrentPages()[getCurrentPages().length - 1]
    // 每次都清一次后台循环：stopPetLoop 只清当前定时器，
    // 若清理时回调正在执行，回调用内部会再 schedulePetAction() 重新挂上一个
    if (typeof page.stopPetLoop === 'function') page.stopPetLoop()
    let appearedAt = 0
    let phrase = ''
    let tries = 0
    let expected = 0
    const timer = setInterval(() => {
      const d = page.data
      if (!appearedAt && d.petBubble) {
        appearedAt = Date.now()
        phrase = d.petBubble
      } else if (appearedAt && !d.petBubble) {
        clearInterval(timer)
        resolve({ phrase, ms: Date.now() - appearedAt, expected })
      }
    }, 20)
    const kick = () => {
      tries++
      page.setData({ petAction: 'idle', petBubble: '', petParticles: [] })
      setTimeout(() => {
        try { page.playPetAction(act) } catch (e) { console.log('playPetAction 抛错: ' + (e && e.message)) }
        setTimeout(() => {
          if (!appearedAt && tries < 3) kick()
        }, 1200)
      }, 60)
    }
    kick()
    setTimeout(() => { clearInterval(timer); resolve({ phrase, ms: -1, expected }) }, 9000)
  }), action)
}

;(async () => {
  const mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' })
  // 抓小程序控制台：若 playPetAction 内部抛错，会在这里露出来
  mp.on('console', msg => {
    const args = (msg.args || []).map(a => (a && a.value !== undefined ? String(a.value) : JSON.stringify(a))).join(' ')
    if (/error|warn/i.test(msg.type || '') || /Error|undefined|throw/i.test(args)) {
      console.log('    [小程序控制台] ' + msg.type + ': ' + args.slice(0, 200))
    }
  })
  console.log('CONNECTED')

  await mp.evaluate(() => new Promise(res => {
    wx.switchTab({ url: '/pages/record/record', success: () => res(1), fail: () => res(0) })
    setTimeout(() => res(0), 8000)
  }))
  let ok = false
  const t0 = Date.now()
  while (Date.now() - t0 < 15000) {
    const st = await mp.evaluate(() => getCurrentPages().map(x => x.route))
    if ((st[st.length - 1] || '').includes('record')) { ok = true; break }
    await sleep(400)
  }
  if (!ok) throw new Error('未进入记账页')
  await sleep(1000)

  // 必须先停掉后台随机动作循环（每 4.2-9.4s 触发一次）：
  // 否则它会在计时中途插入一个新气泡，把「非空」状态续上，实测值会变成 2 倍
  // （踩过：sleep 真实 2000ms 却测出 4180ms，heart 测出 2419ms）
  await mp.evaluate(() => {
    const page = getCurrentPages()[getCurrentPages().length - 1]
    if (typeof page.stopPetLoop === 'function') page.stopPetLoop()
    return true
  })

  console.log('')
  console.log('动作      文案                        停留实测')
  console.log('--------------------------------------------------')
  for (const act of CASES) {
    const r = await measure(mp, act)
    const pass = r.ms >= 1900 && r.ms <= 2150
    if (!pass) fail++
    console.log(
      act.padEnd(9) +
      (r.phrase || '(无气泡)').padEnd(27) +
      (r.ms < 0 ? '超时未结束' : r.ms + 'ms') + ' ' + (pass ? '✓' : '✗ 期望 1900-2150ms')
    )
    await sleep(600)
  }

  // 恢复后台循环，避免影响后续用例 / 手工查看
  await mp.evaluate(() => {
    const page = getCurrentPages()[getCurrentPages().length - 1]
    if (typeof page.startPetLoop === 'function') page.startPetLoop()
    return true
  })

  await mp.disconnect()
  console.log('')
  console.log(fail === 0 ? '实测通过 ✅ 气泡停留已按 2s 生效' : fail + ' 个用例未达预期 ❌')
  process.exit(fail === 0 ? 0 : 1)
})().catch(e => { console.log('FATAL:', e.message); process.exit(3) })
