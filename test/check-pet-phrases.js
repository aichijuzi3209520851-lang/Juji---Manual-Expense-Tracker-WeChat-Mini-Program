/* 小橘语录 + 动作系统 校验
 *
 * 用途：改完语录（utils/petPhrases.js）或动作（utils/petActions.js、两个 wxss）后跑一次，
 *      防止「文案超长顶出屏幕」「新增动作漏改某一页 CSS」这类只看代码发现不了的坑。
 * 运行：node test/check-pet-phrases.js
 */
const fs = require('fs')
const path = require('path')
const cp = require('child_process')

const ROOT = path.resolve(__dirname, '..')
let fail = 0
const ok = (c, msg) => { console.log((c ? '  ✓ ' : '  ✗ ') + msg); if (!c) fail++ }
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8')
const ruleOf = (css, sel) => {
  const m = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^{]*\\{[^}]*\\}').exec(css)
  return m ? m[0] : ''
}
const hasKeyframes = (css, name) => new RegExp('@keyframes\\s+' + name + '\\b').test(css)

console.log('=== 1. JS 语法 ===')
for (const f of ['miniprogram/utils/petPhrases.js', 'miniprogram/utils/petActions.js',
                 'miniprogram/pages/record/record.js', 'miniprogram/pages/profile/profile.js']) {
  const r = cp.spawnSync(process.execPath, ['--check', path.join(ROOT, f)], { encoding: 'utf8' })
  ok(r.status === 0, f + (r.status === 0 ? '' : ' -> ' + (r.stderr || '').split('\n').slice(0, 3).join(' ')))
}

console.log('=== 2. 语录池 ===')
const P = require(path.join(ROOT, 'miniprogram/utils/petPhrases.js'))
const A = require(path.join(ROOT, 'miniprogram/utils/petActions.js'))
const groups = Object.keys(P.PET_PHRASES)
const over = []
const owner = {}
let total = 0
for (const g of groups) {
  const list = P.PET_PHRASES[g]
  total += list.length
  list.forEach(p => {
    if (p.length > P.MAX_PHRASE_LEN) over.push(`[${g}] ${p} (${p.length}字)`)
    owner[p] = owner[p] ? owner[p] + ',' + g : g
  })
  console.log(`  · ${g}: ${list.length} 条`)
}
console.log('  合计:', total, '条')
ok(over.length === 0, `所有语录 ≤ ${P.MAX_PHRASE_LEN} 字` + (over.length ? ' 超限: ' + over.join(' | ') : ''))
const dups = Object.keys(owner).filter(k => owner[k].includes(','))
ok(dups.length === 0, '无跨组重复文案' + (dups.length ? ': ' + dups.join(' | ') : ''))
ok(groups.length === A.ACTION_NAMES.length, `语录组数(${groups.length}) == 动作数(${A.ACTION_NAMES.length})`)

console.log('=== 3. 宽度预算（750rpx 屏） ===')
const maxLen = Math.max.apply(null, P.ALL_PHRASES.map(p => p.length))
const bubbleW = maxLen * 22 + 2 * 16 + 2 * 3.5
const heroW = 750 - 2 * 24 - 2 * 32
ok(heroW - 22 - bubbleW > 0, `最长语录 ${maxLen} 字 → 气泡约 ${Math.round(bubbleW)}rpx，左边缘余量 ${Math.round(heroW - 22 - bubbleW)}rpx`)

console.log('=== 4. 动作 ↔ 语录 对应 ===')
for (const act of A.ACTION_NAMES) {
  if (act === 'idle') continue
  ok(!!P.PET_PHRASES[act], `${act}: 有同名语录组`)
}
ok(A.ACTION_WEIGHTS.reduce((s, p) => s + p[1], 0) === 100, '动作权重合计 = 100')

console.log('=== 4b. 气泡停留时长 ===')
// 气泡 CSS 入场动画 1.1s，低于它会「闪一下」；用户要求短句也至少停 2s
ok(A.BUBBLE_MIN_MS >= 2000, `气泡最短停留 ${A.BUBBLE_MIN_MS}ms ≥ 2000ms（用户要求）`)
ok(A.BUBBLE_MIN_MS >= 1200, `气泡最短停留 ${A.BUBBLE_MIN_MS}ms ≥ 入场动画 1100ms`)
console.log('  抽样:')
;['Hi', '耍起！耍起！', '小橘打个盹先~', '来和小橘说话，小橘说话蛮有味~'].forEach(p => {
  console.log(`    ${p} (${p.length}字) → ${A.petActionHoldMs('wave', p)}ms`)
})
ok(A.petActionHoldMs('wave', '耍起！耍起！') >= 2000, '短句气泡也停留 ≥ 2s')
ok(A.petActionHoldMs('idle', '') === A.ACTION_BASE_MS.idle, '无气泡时回落动作基础时长（不额外拖长）')
ok(A.petActionHoldMs('sleep', '小橘打个盹先~') >= A.ACTION_BASE_MS.sleep, '气泡时长不会短于动作动画时长')

console.log('=== 5. 动作 ↔ 两页 CSS 对应 ===')
const css = { record: read('miniprogram/pages/record/record.wxss'), profile: read('miniprogram/pages/profile/profile.wxss') }
for (const act of A.ACTION_NAMES) {
  if (act === 'idle') continue
  const sel = act === 'jump' ? '.juji-pet--jump' : `.juji-pet--${act} .juji-pet-img`
  for (const page of Object.keys(css)) {
    const rule = ruleOf(css[page], sel)
    if (!rule) { ok(false, `${page}: 缺少 ${sel} 规则`); continue }
    const m = /animation:\s*([\w-]+)\s+([\d.]+)s([^;]*);/.exec(rule)
    if (!m) { ok(false, `${page}: ${act} 的 animation 简写无法解析`); continue }
    const kf = m[1]
    const dur = parseFloat(m[2])
    const cntMatch = /\s(\d+)\s*$/.exec(m[3].trim())
    const cnt = cntMatch ? parseInt(cntMatch[1], 10) : 1
    const totalMs = Math.round(dur * cnt * 1000)
    const base = A.ACTION_BASE_MS[act]
    ok(hasKeyframes(css[page], kf), `${page}: ${act} → @keyframes ${kf} 存在`)
    ok(base >= totalMs, `${page}: ${act} 停留 ${base}ms ≥ 动画总时长 ${totalMs}ms`)
  }
}

console.log('=== 6. 粒子系统 ===')
for (const page of Object.keys(css)) {
  ok(!!ruleOf(css[page], '.juji-pet-particle'), `${page}: 存在 .juji-pet-particle`)
  ok(hasKeyframes(css[page], 'juji-particle-fly'), `${page}: @keyframes juji-particle-fly 存在`)
  ok(!/juji-pet-heart\b/.test(css[page]), `${page}: 旧的 .juji-pet-heart 已移除`)
  ok(!hasKeyframes(css[page], 'juji-heart-fly'), `${page}: 旧的 juji-heart-fly 已移除`)
}
const sparkle = A.buildPetParticles('sparkle')
ok(sparkle.length === A.PARTICLE_SPECS.sparkle.length, `buildPetParticles 产出 ${sparkle.length} 个粒子`)
ok(sparkle.every(p => /left:\d+rpx/.test(p.style) && /animation-delay:\d+ms/.test(p.style) && p.emoji), '粒子内联样式字段完整')
ok(A.buildPetParticles('jelly').length === 0, '无粒子动作返回空数组（不报错）')
const usedEmoji = new Set()
Object.keys(A.PARTICLE_SPECS).forEach(k => A.PARTICLE_SPECS[k].forEach(s => usedEmoji.add(s.emoji)))
console.log('  粒子 emoji:', Array.from(usedEmoji).join(' '))

console.log('=== 7. 两页接入 ===')
for (const f of ['miniprogram/pages/record/record.js', 'miniprogram/pages/profile/profile.js']) {
  const s = read(f)
  const wxml = read(f.replace('.js', '.wxml'))
  const tag = path.basename(f)
  ok(s.includes("require('../../utils/petActions')"), tag + ': 引入 petActions')
  ok(s.includes('pickPetAction()'), tag + ': 使用 pickPetAction')
  ok(s.includes('buildPetParticles(action)'), tag + ': 使用 buildPetParticles')
  ok(s.includes('petActionHoldMs(action, bubble)'), tag + ': 使用 petActionHoldMs')
  ok(s.includes('petParticles: []'), tag + ': data 声明 petParticles')
  ok(!/petHearts/.test(s), tag + ': 无 petHearts 残留')
  ok(/wx:for="\{\{petParticles\}\}"/.test(wxml), tag + ': wxml 渲染 petParticles')
  ok(/wx:key="id"/.test(wxml), tag + ': 粒子用 wx:key="id"（项目约定，禁用 index）')
}

console.log('=== 8. 随机抽样 ===')
const seen = {}
let empty = 0
for (let i = 0; i < 400; i++) {
  const act = A.pickPetAction()
  seen[act] = (seen[act] || 0) + 1
  if (act === 'idle' && !P.pickPetPhrase('idle')) empty++
}
const missing = A.ACTION_NAMES.filter(a => !seen[a])
ok(missing.length === 0, `400 次抽样覆盖全部 ${A.ACTION_NAMES.length} 个动作` + (missing.length ? '，缺: ' + missing.join(',') : ''))
console.log('  分布:', A.ACTION_NAMES.map(a => a + ':' + (seen[a] || 0)).join('  '))
for (const a of A.ACTION_NAMES) {
  if (a === 'idle') continue
  const set = new Set()
  for (let i = 0; i < 80; i++) set.add(P.pickPetPhrase(a))
  ok(set.size === P.PET_PHRASES[a].length, `${a}: 80 次抽样覆盖全部 ${P.PET_PHRASES[a].length} 条语录`)
}
ok(empty > 0, `idle 有留白（${empty} 次无气泡），节奏不呆板`)

console.log('=== 9. 结构自检（花括号 / 孤儿动画 / 标签配平） ===')
for (const rel of ['miniprogram/pages/record/record.wxss', 'miniprogram/pages/profile/profile.wxss']) {
  const s = read(rel)
  const tag = path.basename(rel)
  const open = (s.match(/\{/g) || []).length
  const close = (s.match(/\}/g) || []).length
  ok(open === close, `${tag}: 花括号配平（${open} / ${close}）`)
  const defs = (s.match(/@keyframes\s+[\w-]+/g) || []).map(x => x.replace(/@keyframes\s+/, ''))
  const used = (s.match(/animation:\s*[\w-]+/g) || []).map(x => x.replace(/animation:\s*/, ''))
  ok(defs.every(d => used.includes(d)), `${tag}: 无孤儿 @keyframes` + (defs.filter(d => !used.includes(d)).join(',') || ''))
  ok(used.every(u => defs.includes(u)), `${tag}: 无未定义的动画名` + (used.filter(u => !defs.includes(u)).join(',') || ''))
}
for (const rel of ['miniprogram/pages/record/record.wxml', 'miniprogram/pages/profile/profile.wxml']) {
  const s = read(rel)
  const selfClosing = (s.match(/<view[^>]*\/>/g) || []).length
  const open = (s.match(/<view\b/g) || []).length - selfClosing
  const close = (s.match(/<\/view>/g) || []).length
  ok(open === close, `${path.basename(rel)}: view 标签配平（开 ${open} / 闭 ${close}）`)
}

console.log(fail === 0 ? '\n全部通过 ✅' : `\n${fail} 项未通过 ❌`)
process.exit(fail === 0 ? 0 : 1)
