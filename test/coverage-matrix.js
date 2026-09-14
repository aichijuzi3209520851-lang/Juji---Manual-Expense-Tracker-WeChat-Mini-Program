/**
 * 橘记JUJI · 测试覆盖矩阵生成器（静态分析，不需要打开开发者工具）
 *
 * 目的：读 app.json 的页面清单 + 各云函数的 action 清单，与三个 smoke 套件的源码做交叉比对，
 *       输出「页面/接口 → 是否被自动化覆盖」的矩阵，并把未被覆盖的项标红。
 *
 * 价值：防止再次出现「users 云函数 4 个 action 一个都没测 / A3 三页只断言 themeStyle」这类盲区。
 *       新增页面或云函数 action 后，跑一次本脚本即可发现缺口。
 *
 * 用法：node test/coverage-matrix.js
 * 退出码：0 = 仅存在「已知可接受的缺口」；1 = 存在未知缺口（应补测试）。
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const E2E = path.join(ROOT, 'test', 'e2e')
const STAMP = new Date().toISOString().slice(0, 10)
const OUT = path.join(E2E, 'artifacts', STAMP, 'coverage-matrix.md')
fs.mkdirSync(path.dirname(OUT), { recursive: true })

const read = f => fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : ''

// 1) 页面清单
const app = JSON.parse(read(path.join(ROOT, 'miniprogram', 'app.json')))
const pages = app.pages.map(p => {
  const seg = p.split('/')
  return { full: p, key: seg[seg.length - 2] || seg[seg.length - 1] }
})

// 2) 云函数 action 清单
function extractActions(file) {
  const s = read(file)
  const acts = new Set()
  s.split('\n').forEach(l => {
    let m
    if ((m = /case\s+['"]([\w-]+)['"]/.exec(l))) acts.add(m[1])
    if ((m = /action\s*===\s*['"]([\w-]+)['"]/.exec(l))) acts.add(m[1])
    if ((m = /event\.type\s*===\s*['"]([\w-]+)['"]/.exec(l))) acts.add('type:' + m[1])
    if ((m = /if\s*\(\s*event\.action\s*===\s*['"]([\w-]+)['"]/.exec(l))) acts.add(m[1])
  })
  return [...acts]
}

const cloudfns = fs.readdirSync(path.join(ROOT, 'cloudfunctions'))
  .filter(d => fs.existsSync(path.join(ROOT, 'cloudfunctions', d, 'index.js')))
  .map(d => ({ name: d, actions: extractActions(path.join(ROOT, 'cloudfunctions', d, 'index.js')) }))

// 3) 读取三个套件源码
const suiteSrc = {
  'smoke-p0': read(path.join(E2E, 'smoke-p0.js')),
  'smoke-review': read(path.join(E2E, 'smoke-review.js')),
  'smoke-cloudfn': read(path.join(E2E, 'smoke-cloudfn.js'))
}
const allSrc = Object.values(suiteSrc).join('\n')

// 4) 覆盖判定
function pageCovered(key) {
  const pat = new RegExp("pages/" + key + "/" + key + "|waitPage\\(['\"]" + key + "['\"]|gotoTab\\(['\"]" + key + "['\"]|reLaunch\\([^)]*['\"]" + key)
  return {
    p0: pat.test(suiteSrc['smoke-p0']),
    review: pat.test(suiteSrc['smoke-review']),
    cloudfn: pat.test(suiteSrc['smoke-cloudfn'])
  }
}
const pageRows = pages.map(p => {
  const c = pageCovered(p.key)
  const by = []
  if (c.p0) by.push('p0')
  if (c.review) by.push('review')
  if (c.cloudfn) by.push('cloudfn')
  return { page: p.full, covered: by.length > 0, by: by.join('+') || '—' }
})

// 已知可接受缺口：有意不测（静态守卫 / 跨套件覆盖 / 内容安全依赖）
const ALLOW = {
  'aiChat': { reason: '由 smoke-review D2/D3 跨套件覆盖（违规拦截 + 天气编造）', actions: 'ALL' },
  'clearUserData': { reason: '禁止自动调用（会清空数据），仅 smoke-review A10 静态守卫二次确认', actions: 'ALL' },
  'users': { reason: 'updateCustomCategories 依赖 msgSecCheck 正向路径，刻意不在 cloudfn 断言', actions: ['updateCustomCategories'] },
  'bills': { reason: 'update/batchCreate 仅 cloudfn 未直接覆盖（create/delete 已覆盖，update 逻辑与 create 同源）', actions: ['update', 'batchCreate'] }
}

const fnRows = []
const gaps = []
cloudfns.forEach(fn => {
  fn.actions.forEach(a => {
    // 在 cloudfn 套件里找 action / type 调用
    let tested
    if (a.startsWith('type:')) {
      const t = a.slice(5)
      tested = new RegExp("type:\\s*['\"]" + t + "['\"]").test(suiteSrc['smoke-cloudfn'])
    } else {
      tested = new RegExp("action:\\s*['\"]" + a + "['\"]").test(suiteSrc['smoke-cloudfn'])
    }
    const allowEntry = ALLOW[fn.name]
    const allowed = allowEntry && (allowEntry.actions === 'ALL' || allowEntry.actions.includes(a))
    let status, note
    if (tested) { status = '✅ 已覆盖'; note = 'smoke-cloudfn' }
    else if (allowed) { status = '🟡 已知缺口'; note = allowEntry.reason }
    else { status = '🔴 未覆盖'; note = '需补 smoke-cloudfn 用例'; gaps.push(fn.name + '.' + a) }
    fnRows.push({ fn: fn.name, action: a, status, note })
  })
})

// 5) 输出
const lines = []
lines.push('# 橘记JUJI 测试覆盖矩阵 ' + STAMP)
lines.push('')
lines.push('> 静态分析：页面 / 云函数 action 是否已被自动化套件覆盖。生成命令 `node test/coverage-matrix.js`。')
lines.push('')
lines.push('## 一、页面覆盖（' + pages.length + ' 个页面）')
lines.push('')
lines.push('| 页面 | 状态 | 覆盖套件 |')
lines.push('|---|---|---|')
pageRows.forEach(r => lines.push('| ' + r.page + ' | ' + (r.covered ? '✅' : '🔴') + ' | ' + r.by + ' |'))
const pageGaps = pageRows.filter(r => !r.covered)
if (pageGaps.length) lines.push('\n⚠ 未覆盖页面：' + pageGaps.map(g => g.page).join(', '))
else lines.push('\n✓ 所有页面均被至少一个套件覆盖。')
lines.push('')
lines.push('## 二、云函数 action 覆盖（' + cloudfns.length + ' 个函数）')
lines.push('')
lines.push('| 云函数 | action | 状态 | 说明 |')
lines.push('|---|---|---|---|')
fnRows.forEach(r => lines.push('| ' + r.fn + ' | ' + r.action + ' | ' + r.status + ' | ' + r.note + ' |'))
lines.push('')
if (gaps.length) {
  lines.push('## 三、🔴 未知缺口（建议补测试，会令脚本退出码=1）')
  lines.push('')
  gaps.forEach(g => lines.push('- ' + g))
  lines.push('')
} else {
  lines.push('## 三、覆盖结论')
  lines.push('')
  lines.push('✓ 无未知缺口。所有未覆盖的 action 均已登记为「已知可接受缺口」（见上表 🟡）。')
  lines.push('')
}
lines.push('---')
lines.push('套件：smoke-p0（功能回归）/ smoke-review（审核关切点）/ smoke-cloudfn（云函数契约）。')
fs.writeFileSync(OUT, lines.join('\n'))

console.log(lines.join('\n'))
console.log('\n矩阵报告: ' + OUT)
process.exit(gaps.length ? 1 : 0)
