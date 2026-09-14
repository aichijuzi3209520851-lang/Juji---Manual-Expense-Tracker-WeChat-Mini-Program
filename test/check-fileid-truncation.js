/**
 * 防回归：fileID 被通用字符串截断器腰斩
 *
 * 背景（2026-09-14 线上事故）：cloudfunctions/users 的 updateAvatar 用 normalizeStr()
 * 清洗头像 fileID，而该函数会把字符串截到 60 字符；头像 fileID 约 134 字符，
 * 归属前缀 /avatars/<openid>_ 从第 80 字符才开始 —— 截断后前缀消失，
 * H4 归属校验每次都判「头像文件不合法」，导致「换头像」功能整体不可用。
 *
 * 本脚本断言：users 云函数里所有 fileID 字段都必须走不截断的清洗函数。
 * 运行：node test/check-fileid-truncation.js
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
let fail = 0
const ok = (c, msg, extra) => {
  console.log((c ? '  ✓ ' : '  ✗ ') + msg + (extra && !c ? ' -- ' + extra : ''))
  if (!c) fail++
}

const USERS = path.join(ROOT, 'cloudfunctions/users/index.js')
const src = fs.readFileSync(USERS, 'utf8')

console.log('=== 1. users 云函数：fileID 清洗函数 ===')
const m = /function normalizeFileID\(value\)\s*\{[\s\S]*?\n\}/.exec(src)
ok(!!m, '存在 normalizeFileID()')
if (m) {
  const limit = (/slice\(0,\s*([A-Z_0-9]+)\)/.exec(m[0]) || [])[1]
  const constMatch = new RegExp('const\\s+' + limit + '\\s*=\\s*(\\d+)').exec(src)
  const n = constMatch ? parseInt(constMatch[1], 10) : NaN
  ok(n >= 512, `fileID 上限 ${n} ≥ 512（够放 134 字符的 fileID）`, '解析到: ' + limit)
}

console.log('=== 2. updateAvatar 必须用它，而不是 normalizeStr ===')
const fn = /async function updateAvatar\([\s\S]*?\n\}/.exec(src)
ok(!!fn, '存在 updateAvatar()')
if (fn) {
  ok(/normalizeFileID\(data\.avatarUrl\)/.test(fn[0]), 'avatarUrl 走 normalizeFileID')
  ok(!/normalizeStr\(data\.avatarUrl\)/.test(fn[0]), 'avatarUrl 未误用 normalizeStr（60 字截断）')
  ok(/indexOf\('\/avatars\/' \+ openid \+ '_'\)/.test(fn[0]), '保留 H4 归属校验（不可为修此 bug 而删校验）')
}

console.log('=== 3. 真实 fileID 走修复后的清洗仍能通过校验 ===')
const openid = 'oZrhl3Vzc8yUc4XBJRvDglLyT80A'
const fileID = 'cloud://lajiaoyou-d4g78yts61f1a841d.6c61-lajiaoyou-d4g78yts61f1a841d-1430379499/avatars/' + openid + '_1789365497250.png'
const cut60 = fileID.slice(0, 60)
ok(fileID.length > 60, `fileID 长度 ${fileID.length} > 60（正是被腰斩的原因）`)
ok(cut60.indexOf('/avatars/' + openid + '_') === -1, '旧逻辑（截 60）确实会丢掉归属前缀 ← 这就是线上事故')
const fixed = fileID.trim().slice(0, 512)
ok(fixed.indexOf('/avatars/' + openid + '_') !== -1, '新逻辑（上限 512）归属前缀完好')

console.log('=== 4. 其他函数是否也有同类风险 ===')
for (const rel of ['cloudfunctions/bills/index.js', 'cloudfunctions/clearUserData/index.js']) {
  const s = fs.readFileSync(path.join(ROOT, rel), 'utf8')
  const bad = /normalizeStr\([^)]*(photoUrl|avatarUrl|fileID)/.test(s)
  ok(!bad, path.basename(rel) + ': fileID/照片字段未被截断清洗')
}

console.log(fail === 0 ? '\n全部通过 ✅' : `\n${fail} 项未通过 ❌`)
process.exit(fail === 0 ? 0 : 1)
