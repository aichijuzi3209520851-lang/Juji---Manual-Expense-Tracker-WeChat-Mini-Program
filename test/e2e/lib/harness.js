/**
 * 橘记JUJI自动化测试 · 公共脚手架
 *
 * ── 三条硬规则（2026-09-14 两个线上事故后新增，务必遵守）──
 *  1. **控制台零报错**：任何用例执行期间小程序控制台出现 console.error → 该用例直接判失败。
 *     （事故教训：uploadAvatar 抛 TypeError 时控制台有完整报错，测试没接，导致乱码提示漏网）
 *  2. **禁止「元素存在即通过」**：断言必须落在业务数据上（值、数量、格式、一致性），
 *     不能只断言 `element !== null` 或 `themeStyle` 存在。
 *     （事故教训：A3-profile 只断言 themeStyle，页面昵称全空、头像占位也照样 PASS）
 *  3. **断言计数**：每条用例统计断言数，为 0 的用例在报告里标记 ⚠，防止空用例混成 PASS。
 *
 * 用法：
 *   const { createHarness } = require('./lib/harness')
 *   const h = createHarness({ suite: 'p0', title: '橘记JUJI P0 冒烟' })
 *   await h.connect()
 *   await h.expect('A1-1', '用例名', async () => { h.eq(actual, expected, '说明') })
 *   h.finish()
 */
const fs = require('fs')
const path = require('path')
const automator = require('miniprogram-automator')

const WS = 'ws://127.0.0.1:9420'
const STAMP = new Date().toISOString().slice(0, 10)

// 已知可忽略的控制台错误（正则）。留空表示任何 error 都算失败。
const CONSOLE_ERROR_ALLOWLIST = [
  // 例：/getClipboardData:fail api scope/  —— 隐私作用域未声明时的预期报错
]

function createHarness(opts = {}) {
  const suite = opts.suite || 'smoke'
  const title = opts.title || ('橘记JUJI自动化 · ' + suite)
  const ART = path.join(__dirname, '..', 'artifacts', STAMP)
  fs.mkdirSync(ART, { recursive: true })

  const results = []
  const consoleErrors = []
  let mp = null
  let cur = null          // 当前用例的断言计数与失败信息
  let assertionCount = 0

  const sleep = ms => new Promise(r => setTimeout(r, ms))

  // ---------- 断言助手：失败即抛，带出实际值 ----------
  const A = {
    ok(cond, msg, actual) {
      assertionCount++
      if (!cond) throw new Error(msg + (actual !== undefined ? ' -- 实际: ' + brief(actual) : ''))
    },
    eq(actual, expected, msg) {
      assertionCount++
      if (String(actual) !== String(expected)) {
        throw new Error(msg + ' -- 期望: ' + brief(expected) + ' | 实际: ' + brief(actual))
      }
    },
    ne(actual, notExpected, msg) {
      assertionCount++
      if (String(actual) === String(notExpected)) {
        throw new Error(msg + ' -- 不应等于: ' + brief(notExpected))
      }
    },
    includes(hay, needle, msg) {
      assertionCount++
      if (String(hay).indexOf(needle) === -1) {
        throw new Error(msg + ' -- 应包含: ' + brief(needle) + ' | 实际: ' + brief(String(hay).slice(0, 120)))
      }
    },
    excludes(hay, needle, msg) {
      assertionCount++
      if (String(hay).indexOf(needle) !== -1) {
        throw new Error(msg + ' -- 不应包含: ' + brief(needle) + ' | 实际: ' + brief(String(hay).slice(0, 120)))
      }
    },
    match(str, re, msg) {
      assertionCount++
      if (!re.test(String(str))) {
        throw new Error(msg + ' -- 应匹配 ' + re + ' | 实际: ' + brief(String(str).slice(0, 120)))
      }
    },
    gt(n, min, msg) {
      assertionCount++
      if (!(Number(n) > min)) throw new Error(msg + ' -- 应 > ' + min + ' | 实际: ' + brief(n))
    },
    gte(n, min, msg) {
      assertionCount++
      if (!(Number(n) >= min)) throw new Error(msg + ' -- 应 ≥ ' + min + ' | 实际: ' + brief(n))
    },
    /** 业务数据断言：值不能是默认/占位值（专治"未设置"这类静默失败） */
    notDefault(actual, defaults, msg) {
      assertionCount++
      const list = Array.isArray(defaults) ? defaults : [defaults]
      const v = String(actual == null ? '' : actual).trim()
      if (!v || list.indexOf(v) !== -1) {
        throw new Error(msg + ' -- 不应为默认/空值，实际: ' + brief(actual))
      }
    }
  }

  function brief(v) {
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
    return s.length > 140 ? s.slice(0, 140) + '…' : s
  }

  // ---------- 连接与页面工具 ----------
  async function connect() {
    mp = await automator.connect({ wsEndpoint: WS })
    mp.on('console', msg => {
      const type = String((msg && msg.type) || '')
      if (!/error/i.test(type)) return
      const text = (msg.args || [])
        .map(a => (a && a.value !== undefined ? String(a.value) : (a && a.description) || JSON.stringify(a)))
        .join(' ')
      if (CONSOLE_ERROR_ALLOWLIST.some(re => re.test(text))) return
      consoleErrors.push({ at: Date.now(), caseId: cur ? cur.id : '(用例外)', text: text.slice(0, 300) })
    })
    const sys = await mp.systemInfo()
    console.log('CONNECTED | SDK', sys.SDKVersion, '| platform', sys.platform)
    console.log('产物目录:', ART)
    console.log('')
    return sys
  }

  // 注意：这里必须套超时。模拟器卡住时 evaluate 永不 resolve，
  // 而 waitPage/waitLeave/resetRoute 都在循环里调 stack()，不套壳就会变成死循环外再挂死。
  async function stack() {
    return withTimeout(
      mp.evaluate(() => getCurrentPages().map(x => x.route)).catch(() => []),
      6000, []
    ).catch(() => [])
  }

  async function waitPage(part, timeout = 20000) {
    const t0 = Date.now()
    while (Date.now() - t0 < timeout) {
      const st = await stack()
      if ((st[st.length - 1] || '').indexOf(part) !== -1) return mp.currentPage()
      await sleep(400)
    }
    throw new Error('等待页面 ' + part + ' 超时（当前栈: ' + JSON.stringify(await stack()) + '）')
  }

  /** 切 tab：小程序内 switchTab（automator 的 switchTab 不稳），失败重试 + reLaunch 兜底 */
  async function gotoTab(route) {
    const url = '/pages/' + route + '/' + route
    for (let i = 0; i < 2; i++) {
      await mp.evaluate(u => new Promise(res => {
        wx.switchTab({ url: u, success: () => res(1), fail: () => res(0) })
        setTimeout(() => res(0), 8000)
      }), url)
      try { return await waitPage(route, 8000) } catch (e) { /* retry */ }
    }
    await reLaunch(url)
    return waitPage(route, 10000)
  }

  async function reLaunch(url) {
    await mp.evaluate(u => new Promise(res => {
      wx.reLaunch({ url: u, success: () => res(1), fail: () => res(0) })
      setTimeout(() => res(0), 8000)
    }), url)
  }

  async function goto(url, part) {
    await mp.evaluate(u => new Promise(res => {
      wx.navigateTo({ url: u, success: () => res(1), fail: () => res(0) })
      setTimeout(() => res(0), 8000)
    }), url)
    return waitPage(part)
  }

  async function back() {
    await mp.evaluate(() => new Promise(res => {
      wx.navigateBack({ success: () => res(1), fail: () => res(0) })
      setTimeout(() => res(0), 3000)
    }))
    await sleep(600)
  }

  /**
   * 把页面栈恢复到「只有首页」的干净状态，失败自动重试。
   *
   * 为什么需要：navigateTo 子页（引导页等）发起的导航对模拟器路由队列很敏感 ——
   * 实测队列被扰动后会「既不 success 也不 fail」地静默不生效（switchTab/reLaunch/
   * navigateBack 全都不动），从而把「环境问题」伪装成「产品问题」。
   * 所以在断言导航行为之前先确认路由可用，把两者区分开。
   */
  async function resetRoute(tries = 3) {
    for (let i = 0; i < tries; i++) {
      await withTimeout(reLaunch('/pages/home/home'), 15000, null)
      await sleep(700)
      const st = await stack()
      if (st.length === 1 && st[0] === 'pages/home/home') return true
      await sleep(900)
    }
    return false
  }

  /** 轮询页面栈，直到目标页出栈（用于「点了一下到底走没走」的断言） */
  async function waitLeave(route, timeout = 8000) {
    const t0 = Date.now()
    let st = await stack()
    while (Date.now() - t0 < timeout) {
      if (st.indexOf(route) === -1) return st
      await sleep(400)
      st = await stack()
    }
    return st
  }

  /**
   * 给任意 promise 套超时壳：超时就返回 fallback，而不是让整条套件永久挂起。
   *
   * 为什么必须加：模拟器路由队列卡住时，automator 的 `tap()` / `currentPage()` /
   * `evaluate()` 会**永不 resolve**（实测把合规套件挂死 15 分钟以上，既不报错也不结束）。
   * 套壳后用例能带着诊断信息失败，而不是让 CI 无限等待。
   */
  function withTimeout(promise, ms, fallback) {
    let timer = null
    return Promise.race([
      Promise.resolve(promise).then(v => { clearTimeout(timer); return v }),
      new Promise(res => { timer = setTimeout(() => res(fallback), ms) })
    ])
  }

  /** 真实点击：对 currentPage / $ / tap 每一步都套超时，避免被卡住的模拟器拖死 */
  async function tapElement(sel, timeoutMs = 10000) {
    const page = await withTimeout(mp.currentPage(), timeoutMs, null)
    if (!page) return { ok: false, why: 'currentPage 超时（模拟器无响应）' }
    const el = await withTimeout(page.$(sel), timeoutMs, null)
    if (!el) return { ok: false, why: '找不到元素 ' + sel }
    const r = await withTimeout(el.tap(), timeoutMs, null)
    if (r === null) return { ok: false, why: 'tap 超时（模拟器无响应）' }
    return { ok: true }
  }

  // ---------- 用例执行 ----------
  async function expect(id, name, fn) {
    cur = { id, name, ok: true, detail: '', ms: 0, asserts: 0 }
    const t0 = Date.now()
    const errBefore = consoleErrors.length
    assertionCount = 0
    try {
      const out = await fn()
      if (out) cur.detail = String(out)
      // 规则 1：期间出现 console.error 即失败
      const fresh = consoleErrors.slice(errBefore)
      if (fresh.length) {
        throw new Error('控制台出现 ' + fresh.length + ' 条 error：' + fresh[0].text)
      }
      if (assertionCount === 0) {
        cur.detail = (cur.detail ? cur.detail + ' | ' : '') + '⚠ 无断言'
        cur.noAssert = true
      }
    } catch (e) {
      cur.ok = false
      cur.detail = String((e && e.message) || e).slice(0, 300)
    }
    cur.ms = Date.now() - t0
    cur.asserts = assertionCount
    results.push(cur)
    console.log((cur.ok ? 'PASS ' : 'FAIL ') + id + ' ' + name + ' (' + cur.ms + 'ms, ' + cur.asserts + ' 断言)' +
      (cur.ok ? (cur.detail ? ' -- ' + cur.detail : '') : '\n     └─ ' + cur.detail))
    cur = null
    return results[results.length - 1]
  }

  async function screenshot(name) {
    return mp.screenshot({ path: path.join(ART, name + '.png') }).catch(() => {})
  }

  /** 读页面 data（统一入口，便于以后加超时/重试） */
  async function data(page, key) {
    return page.data(key)
  }

  function report(extraLines) {
    const pass = results.filter(r => r.ok).length
    const noAssert = results.filter(r => r.noAssert).length
    const md = [
      '# ' + title + ' ' + STAMP,
      '',
      '- 用例: ' + results.length + ' · 通过 ' + pass + ' · 失败 ' + (results.length - pass),
      '- 判定: ' + (pass === results.length ? 'PASS' : 'FAIL'),
      '- 断言总数: ' + results.reduce((s, r) => s + (r.asserts || 0), 0) + (noAssert ? '（⚠ ' + noAssert + ' 条用例无断言）' : ''),
      '- 控制台 error: ' + consoleErrors.length + ' 条',
      '',
      '| 用例 | 名称 | 结果 | 断言 | 耗时 | 说明 |',
      '|---|---|---|---|---|---|',
      ...results.map(r => '| ' + r.id + ' | ' + r.name + ' | ' + (r.ok ? 'PASS' : 'FAIL') + ' | ' + (r.asserts || 0) +
        ' | ' + r.ms + 'ms | ' + String(r.detail || '').replace(/\|/g, '/') + ' |'),
      ''
    ]
    if (consoleErrors.length) {
      md.push('## 控制台错误明细', '')
      consoleErrors.slice(0, 20).forEach(e => md.push('- `' + e.caseId + '` ' + e.text))
      md.push('')
    }
    if (extraLines && extraLines.length) md.push.apply(md, extraLines)
    const file = path.join(ART, suite + '-report.md')
    fs.writeFileSync(file, md.join('\n'))
    console.log('')
    console.log(md.join('\n'))
    console.log('')
    console.log('报告: ' + file)
    return { file, pass, total: results.length }
  }

  async function finish(extraLines) {
    const r = report(extraLines)
    try { await mp.disconnect() } catch (e) { /* automator 的 disconnect 可能返回 undefined，忽略 */ }
    process.exit(r.pass === r.total ? 0 : 1)
  }

  return {
    // 生命周期
    connect, expect, finish, report, screenshot,
    // 断言
    ...A,
    // 页面工具
    stack, waitPage, gotoTab, goto, back, reLaunch, data, sleep, resetRoute, waitLeave,
    withTimeout, tapElement,
    // 原始对象
    get mp() { return mp },
    get ART() { return ART },
    get results() { return results },
    get consoleErrors() { return consoleErrors },
    STAMP
  }
}

module.exports = { createHarness, CONSOLE_ERROR_ALLOWLIST }
