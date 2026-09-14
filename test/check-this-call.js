/**
 * 静态体检：把 import/require 进来的函数误写成 this.xxx() 的调用
 *
 * 背景（2026-09-14 线上问题）：profile.js 导入 resolveAvatarSrc 后写成 this.resolveAvatarSrc()，
 * 页面上并无该方法 → 抛 TypeError，被 catch 吞掉后弹出「_this12.resolv…」这种乱码提示，
 * 且 loadUserInfo 里该调用之后的 setData 全被跳过（昵称/头像不显示）。
 * 运行：node test/check-this-call.js
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const DIR = path.join(ROOT, 'miniprogram')
let fail = 0

// 收集文件中 require 解构出来的标识符
function importedNames(src) {
  const names = new Set()
  const re = /(?:const|let|var)\s*\{([^}]+)\}\s*=\s*require\(/g
  let m
  while ((m = re.exec(src))) {
    m[1].split(',').forEach(part => {
      const n = part.split(':').pop().trim()
      if (/^[A-Za-z_$][\w$]*$/.test(n)) names.add(n)
    })
  }
  // const xxx = require('...') 直接赋值
  const re2 = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\(/g
  while ((m = re2.exec(src))) names.add(m[1])
  return names
}

// 收集 Page({...}) 里定义的方法名（粗略：顶层 `name(` 或 `name:` 且缩进两格）
function ownMethods(src) {
  const names = new Set()
  const re = /^ {2}(?:async\s+)?([A-Za-z_$][\w$]*)\s*[(:]/gm
  let m
  while ((m = re.exec(src))) names.add(m[1])
  return names
}

const files = []
;(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f)
    const st = fs.statSync(p)
    if (st.isDirectory()) walk(p)
    else if (/\.js$/.test(f)) files.push(p)
  }
})(DIR)

console.log('=== 扫描 miniprogram 下的页面/工具文件 ===')
let hits = 0
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  const imports = importedNames(src)
  if (!imports.size) continue
  const owns = ownMethods(src)
  const bad = []
  imports.forEach(name => {
    if (owns.has(name)) return          // 页面自己也定义了同名方法 → this.xxx() 合法
    const re = new RegExp('this\\.' + name + '\\s*\\(', 'g')
    let m
    while ((m = re.exec(src))) {
      const line = src.slice(0, m.index).split('\n').length
      bad.push({ name, line })
    }
  })
  if (bad.length) {
    hits += bad.length
    console.log('  ✗ ' + path.relative(ROOT, f).replace(/\\/g, '/'))
    bad.forEach(b => console.log('      第 ' + b.line + ' 行: this.' + b.name + '(...) —— ' + b.name + ' 是导入的函数，不能加 this.'))
  }
}

if (!hits) console.log('  ✓ 未发现「导入函数被误加 this.」的调用')
else fail++

console.log('')
console.log(fail === 0 ? '全部通过 ✅' : '存在 ' + hits + ' 处需要修复 ❌')
process.exit(fail === 0 ? 0 : 1)
