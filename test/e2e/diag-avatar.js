/**
 * 头像上传链路诊断（一键定位「头像文件不合法」）
 *
 * 用法：先 node start-auto.js（改过代码则 --force），再 node diag-avatar.js
 *
 * 依次检查：
 *   ① 客户端 openid / 云函数侧 openid / users 记录是否三方一致
 *   ② 真跑一遍 page.uploadAvatar()，抓出实际 cloudPath、fileID、toast 与云函数返回
 *   ③ 判定 fileID 是否满足服务端 /avatars/<openid>_ 归属规则
 *
 * 已知事故（2026-09-14）：users 的 updateAvatar 曾用 normalizeStr() 清洗 fileID，
 * 而该函数截断到 60 字符，头像 fileID 约 134 字符、归属前缀从第 80 字符才开始 ——
 * 截断后前缀消失，校验必然失败。修复见 test/check-fileid-truncation.js。
 * 注意：诊断是只读的，不会写入你的头像。
 */
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

;(async () => {
  const mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' })
  console.log('CONNECTED')

  await mp.evaluate(() => new Promise(res => {
    wx.switchTab({ url: '/pages/profile/profile', success: () => res(1), fail: () => res(0) })
    setTimeout(() => res(0), 8000)
  }))
  let page = null
  const t0 = Date.now()
  while (Date.now() - t0 < 15000) {
    const st = await mp.evaluate(() => getCurrentPages().map(x => x.route))
    if ((st[st.length - 1] || '').includes('profile')) { page = await mp.currentPage(); break }
    await sleep(400)
  }
  if (!page) throw new Error('未进入「我的」页')

  console.log('')
  console.log('=== ① 身份三方核对 ===')
  const me = await mp.evaluate(() => new Promise(resolve => {
    const app = getApp()
    const db = wx.cloud.database()
    const out = { pageOpenid: app.globalData.openid || '' }
    wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'getOpenId' } })
      .then(r => {
        out.fnOpenid = (r.result && r.result.openid) || ''
        out.appid = (r.result && r.result.appid) || ''
        return db.collection('users').where({ _openid: app.globalData.openid }).limit(1).get()
      })
      .then(r => {
        const rec = r.data[0] || {}
        out.recOpenid = rec._openid || ''
        out.avatarUrl = rec.avatarUrl || ''
        resolve(out)
      })
      .catch(e => { out.err = String((e && e.errMsg) || e); resolve(out) })
  }))
  if (me.err) { console.log('  查询失败:', me.err); await mp.disconnect(); process.exit(1) }
  console.log('  页面 openid      :', me.pageOpenid)
  console.log('  云函数 openid    :', me.fnOpenid, me.pageOpenid === me.fnOpenid ? '✓ 一致' : '✗ 不一致')
  console.log('  记录 _openid     :', me.recOpenid, me.pageOpenid === me.recOpenid ? '✓ 一致' : '✗ 不一致')
  console.log('  appid            :', me.appid)
  console.log('  当前头像         :', String(me.avatarUrl).slice(0, 80) + (me.avatarUrl ? '…' : '(空)'))

  console.log('')
  console.log('=== ② 真跑 uploadAvatar，抓取实际参数与返回 ===')
  await mp.evaluate(() => {
    const app = getApp()
    // 防重复挂钩子：小程序实例跨脚本运行是同一个，重复安装会让每次上传被记录多遍
    app.__diag = { toasts: [], uploads: [], calls: [] }
    if (app.__diagHooked) return true
    app.__diagHooked = true
    const ot = wx.showToast
    wx.showToast = function (o) { try { app.__diag.toasts.push((o && o.title) || '') } catch (e) {}; return ot.apply(wx, arguments) }
    const oc = wx.cloud.callFunction
    wx.cloud.callFunction = function (o) {
      const name = o && o.name
      const p = oc.apply(wx.cloud, arguments)
      return p && p.then ? p.then(r => { try { app.__diag.calls.push(name + ' -> ' + JSON.stringify(r && r.result).slice(0, 160)) } catch (e) {}; return r }) : p
    }
    const ou = wx.cloud.uploadFile
    wx.cloud.uploadFile = function (o) {
      const rec = { cloudPath: (o && o.cloudPath) || '' }
      const p = ou.apply(wx.cloud, arguments)
      return p && p.then ? p.then(r => { rec.fileID = (r && r.fileID) || ''; app.__diag.uploads.push(rec); return r },
        e => { rec.err = String((e && e.errMsg) || e); app.__diag.uploads.push(rec); throw e }) : p
    }
    // 关键：上传链路抛错时 uploadAvatar 会 console.error，并把它当 toast 弹给用户
    // （就是「_this12.resolv…」那种乱码提示的来源）
    const oe = console.error
    console.error = function () {
      try {
        const txt = Array.prototype.map.call(arguments, a => (a && (a.errMsg || a.message)) || String(a)).join(' ')
        if (/avatar|头像/i.test(txt)) app.__diag.errs = (app.__diag.errs || []).concat([txt.slice(0, 200)])
      } catch (e) {}
      return oe.apply(console, arguments)
    }
    return true
  })

  // 取本地待传文件：优先「下载当前头像再原样重传」，这样验证通过也不会改变头像外观。
  // 绝不能直接用 1x1 探针图 —— 修复生效后它真的会写进去，头像会变成透明小点。
  const src = await mp.evaluate(fileID => new Promise(resolve => {
    const fs = wx.getFileSystemManager()
    const probe = () => {
      const p = wx.env.USER_DATA_PATH + '/probe.png'
      try {
        fs.writeFileSync(p, 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64')
        resolve({ path: p, from: 'probe-1x1(警告：会改变头像外观)' })
      } catch (e) { resolve({ err: String(e) }) }
    }
    if (fileID && fileID.indexOf('cloud://') === 0) {
      wx.cloud.downloadFile({ fileID })
        .then(r => resolve({ path: r.tempFilePath, from: '复用当前头像内容（外观不变）' }))
        .catch(() => probe())
    } else probe()
  }), me.avatarUrl)
  if (src.err) { console.log('  准备待传文件失败:', src.err); await mp.disconnect(); process.exit(1) }
  console.log('  待传文件来源 :', src.from)
  await page.callMethod('uploadAvatar', src.path)
  await sleep(7000)

  // 注意：不要在 mp.evaluate 的箭头函数里写 `return x || { 对象字面量 }` ——
  // automator 序列化后会变成块语句并抛 `Unexpected token ':'`（踩过）。用语句体赋值再返回。
  const diag = await mp.evaluate(() => {
    const d = getApp().__diag
    if (d) return d
    const empty = { toasts: [], uploads: [], calls: [] }
    return empty
  })
  diag.uploads.forEach((u, i) => {
    console.log('  上传 ' + (i + 1) + ' cloudPath :', u.cloudPath)
    console.log('  上传 ' + (i + 1) + ' fileID    :', u.fileID || '(无)')
    if (u.err) console.log('  上传 ' + (i + 1) + ' 错误      :', u.err)
  })
  diag.calls.forEach(c => console.log('  云函数返回 :', c))
  diag.toasts.forEach(t => console.log('  界面提示   :', t))
  ;(diag.errs || []).forEach(e => console.log('  ⚠ 链路内部报错 :', e))

  // 铁证：上传成功后页面 avatarUrl 应被换成 https 临时链接
  // 若仍是 cloud:// 或报 resolveAvatarSrc 相关 TypeError，说明 this.resolveAvatarSrc 那个 bug 还在
  const pageAvatar = await page.data('avatarUrl')
  console.log('  页面 avatarUrl :', String(pageAvatar).slice(0, 60) + (String(pageAvatar).length > 60 ? '…' : ''))
  console.log('  是否已换成 https 临时链接 :', /^https?:\/\//.test(String(pageAvatar)) ? '✓ 是（resolveAvatarSrc 执行成功）' : '✗ 否')

  console.log('')
  console.log('=== ③ 判定 ===')
  const u = diag.uploads[0]
  if (u && u.fileID) {
    const expect = '/avatars/' + me.pageOpenid + '_'
    const contain = u.fileID.indexOf(expect) !== -1
    console.log('  要求前缀 :', expect)
    console.log('  fileID 是否包含 :', contain ? '✓ 包含' : '✗ 不包含（服务端必然拒绝）')
    console.log('  fileID 长度     :', u.fileID.length, u.fileID.length > 60 ? '（>60，若服务端用 60 字截断清洗就会丢前缀）' : '')
  }
  const rejected = diag.calls.some(c => /头像文件不合法/.test(c))
  const uploadOk = u && u.fileID && u.fileID.indexOf('/avatars/' + me.pageOpenid + '_') !== -1

  // 复查数据库，确认真的落库成功（最终判定标准）
  const after = await mp.evaluate(() => new Promise(resolve => {
    const app = getApp()
    wx.cloud.database().collection('users').where({ _openid: app.globalData.openid }).limit(1).get()
      .then(r => resolve({ avatarUrl: (r.data[0] || {}).avatarUrl || '' }))
      .catch(e => resolve({ err: String((e && e.errMsg) || e) }))
  }))
  console.log('')
  console.log('  调用前头像 :', String(me.avatarUrl).slice(0, 70) + '…')
  console.log('  调用后头像 :', String(after.avatarUrl).slice(0, 70) + '…')
  const changed = !!after.avatarUrl && after.avatarUrl !== me.avatarUrl
  console.log('  是否已更新 :', changed ? '✓ 已更新，落库成功' : '✗ 未变化，落库失败')

  console.log('')
  if (rejected) {
    console.log('  ✗ 仍被拒绝 → 服务端修复可能未生效：')
    console.log('    确认 users 云函数已「上传并部署」（本地改代码不影响线上），再重跑本脚本')
  } else if (changed) {
    console.log('  ✅ 修复已生效：上传 → 归属校验通过 → 落库成功')
    console.log('     新 fileID 含正确前缀:', after.avatarUrl.indexOf('/avatars/' + me.pageOpenid + '_') !== -1 ? '✓' : '✗')
    // 存一张界面截图作为视觉证据
    const fs = require('fs')
    const path = require('path')
    const art = path.join(__dirname, 'artifacts', new Date().toISOString().slice(0, 10))
    fs.mkdirSync(art, { recursive: true })
    await sleep(1200)
    await mp.screenshot({ path: path.join(art, 'avatar-after-fix.png') }).catch(() => {})
    console.log('     截图:', path.join('test/e2e/artifacts', new Date().toISOString().slice(0, 10), 'avatar-after-fix.png'))
  } else {
    console.log('  ? 未被拒绝但也未更新 —— 检查是否 update 未命中记录（updated:false）')
  }

  console.log('')
  console.log('=== ④ loadUserInfo 是否完整执行（同一 bug 会让昵称/资料整段不渲染）===')
  await mp.evaluate(() => new Promise(res => {
    wx.reLaunch({ url: '/pages/profile/profile', success: () => res(1), fail: () => res(0) })
    setTimeout(() => res(0), 8000)
  }))
  let p2 = null
  const t2 = Date.now()
  while (Date.now() - t2 < 15000) {
    const st = await mp.evaluate(() => getCurrentPages().map(x => x.route))
    if ((st[st.length - 1] || '').includes('profile')) { p2 = await mp.currentPage(); break }
    await sleep(400)
  }
  if (p2) {
    await sleep(2500)
    const d = await p2.data()
    console.log('  nickname    :', d.nickname || '(空)')
    console.log('  genderText  :', d.genderText || '(空)')
    console.log('  avatarUrl   :', String(d.avatarUrl).slice(0, 50) + (String(d.avatarUrl).length > 50 ? '…' : ''))
    const loaded = !!d.nickname && d.nickname !== '橘记JUJI用户' && /^https?:\/\//.test(String(d.avatarUrl))
    console.log('  资料是否加载完整 :', loaded ? '✓ 是（loadUserInfo 跑通）' : '✗ 否（昵称/头像未填充）')
  } else {
    console.log('  未能重新进入我的页，跳过')
  }

  await mp.disconnect()
  process.exit(0)
})().catch(e => { console.log('FATAL:', e.message); process.exit(3) })
