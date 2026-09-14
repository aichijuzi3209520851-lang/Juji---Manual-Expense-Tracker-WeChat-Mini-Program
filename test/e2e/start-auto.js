const net = require('net')
const fs = require('fs')
const { spawn, execFileSync } = require('child_process')

const PROJECT = 'D:\\A\\wechat-project\\V1.1'
const CLI = 'D:\\we-chat\\微信web开发者工具\\cli.bat'
const PORT = 9420

const isOpen = (port) => new Promise(res => {
  const s = net.connect({ port, host: '127.0.0.1' })
  s.setTimeout(1000)
  s.on('connect', () => { s.destroy(); res(true) })
  s.on('timeout', () => { s.destroy(); res(false) })
  s.on('error', () => res(false))
})
const sleep = ms => new Promise(r => setTimeout(r, ms))

;(async () => {
  console.log('CLI 存在:', fs.existsSync(CLI) ? '✓' : '✗ ' + CLI)
  const FORCE = process.argv.indexOf('--force') !== -1

  // --force：修改了页面/工具代码后必须强制重编译 —— 自动化实例不会热重载磁盘改动，
  // 否则实测会一直跑改动前的旧产物（踩过：改成 2000ms 实测却仍是旧公式的 1600ms）
  if (FORCE) {
    console.log('--- --force：结束占用 ' + PORT + ' 的进程 ---')
    try {
      const out = execFileSync('cmd.exe', ['/c', 'netstat -ano -p tcp'], { encoding: 'utf8' })
      const pids = new Set()
      out.split('\n').forEach(l => {
        if (new RegExp(':' + PORT + '\\b').test(l) && /LISTENING/i.test(l)) {
          const p = l.trim().split(/\s+/).pop()
          if (/^\d+$/.test(p)) pids.add(p)
        }
      })
      pids.forEach(pid => {
        try { execFileSync('cmd.exe', ['/c', 'taskkill /F /PID ' + pid], { stdio: 'pipe' }); console.log('  已结束 pid=' + pid) }
        catch (e) { console.log('  结束 pid=' + pid + ' 失败（可能已退出）') }
      })
    } catch (e) { console.log('  netstat 失败: ' + e.message) }

    console.log('--- --force：关闭项目（为重新编译做准备）---')
    try {
      execFileSync(CLI, ['close', '--project', PROJECT], { encoding: 'utf8', timeout: 60000 })
      console.log('  close ok')
    } catch (e) { console.log('  close 返回: ' + String((e.stdout || '') + (e.stderr || '')).trim().slice(0, 200)) }
    await sleep(2000)
  }

  if (!FORCE && await isOpen(PORT)) {
    console.log(PORT + ' 已在监听 ✓ —— 自动化已就绪，无需重启')
    console.log('（若刚改过代码，请改用：node start-auto.js --force）')
    process.exit(0)
  }
  console.log(PORT + ' 未监听，开始启动开发者工具…')

  console.log('--- cli open --project ---')
  try {
    const out = execFileSync(CLI, ['open', '--project', PROJECT], { encoding: 'utf8', timeout: 120000 })
    console.log((out || '').trim().slice(0, 400) || '(无输出)')
  } catch (e) {
    console.log('open 返回: ' + String((e.stdout || '') + (e.stderr || '')).trim().slice(0, 300))
  }

  await sleep(3000)

  // 实测：--force（close + open）之后第一次 auto 经常起不来，必须重试 —— 所以在这里做重试循环，
  // 否则每次都要手工跑第二遍
  const LOG = 'D:\\A\\wechat-project\\V1.1\\_auto.log'
  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log('--- 第 ' + attempt + ' 次 cli auto --project --auto-port ' + PORT + '（后台常驻）---')
    const wsLog = fs.openSync(LOG, 'w')
    // 注意：Node 18+ 直接 spawn .bat 会报 EINVAL，必须走 shell
    const child = spawn('cmd.exe', ['/c', CLI, 'auto', '--project', PROJECT, '--auto-port', String(PORT)], {
      detached: true, windowsHide: false, stdio: ['ignore', wsLog, wsLog]
    })
    child.unref()
    console.log('  auto 已后台启动 pid=' + child.pid)

    for (let i = 0; i < 30; i++) {
      await sleep(1500)
      if (await isOpen(PORT)) {
        console.log('✓ ' + PORT + ' 开始监听（第 ' + attempt + ' 次尝试，等待 ' + ((i + 1) * 1.5).toFixed(1) + 's）')
        process.exit(0)
      }
    }
    console.log('  第 ' + attempt + ' 次未起来，3s 后重试…')
    await sleep(3000)
  }

  console.log('✗ 3 次尝试均未监听，请查看 _auto.log')
  try { console.log(fs.readFileSync(LOG, 'utf8').slice(-800)) } catch (e) {}
  process.exit(2)
})()
