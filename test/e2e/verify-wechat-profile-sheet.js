/**
 * 橘记JUJI · 微信资料弹层专项验证
 *
 * 背景（2026-09-15 线上反馈）：
 *   发布的版本里，我的页「使用微信资料」弹层有两个问题：
 *     1. 底部「取消 / 保存」看不到 —— 弹层底内边距只留 44rpx + 安全区，
 *        而自定义毛玻璃 TabBar 占 ~172rpx + 安全区，正好把按钮压住。
 *        （AI 聊天弹窗有 setCustomTabBarHidden(true)，微信资料弹层漏了这一步）
 *     2. 微信头像被渲染成扁椭圆 —— <button> 同时充当「圆形视觉容器」和「点击区」，
 *        受微信 button 默认样式与弹性收缩影响，160×160 的盒子被拉成非正方形。
 *
 * 修复：视觉圆形容器改用固定尺寸 <view>，<button> 退化为铺满的透明点击层；
 *       弹层打开时收起 TabBar（与 AI 弹窗同一约定）。
 *
 * 本脚本对上述两点做像素级回归：
 *   - 头像容器必须是正圆（width === height）
 *   - 透明点击层必须铺满容器
 *   - 「取消 / 保存」必须完整落在视口内
 *   - 弹层打开时 TabBar 收起，关闭后恢复
 *
 * 用法：node start-auto.js --force && node test/e2e/verify-wechat-profile-sheet.js
 */
const fs = require('fs')
const path = require('path')
const { createHarness } = require('./lib/harness')

const h = createHarness({ suite: 'wechat-profile-sheet', title: '橘记JUJI · 微信资料弹层验证' })

// 读页面内若干选择器的盒模型（selector 查询在逻辑层可用）
function rects(sels) {
  return h.mp.evaluate((list) => new Promise((resolve) => {
    const q = wx.createSelectorQuery()
    list.forEach((s) => q.select(s).boundingClientRect())
    q.exec((res) => resolve(res || []))
  }), sels)
}

// 读自定义 TabBar 的 hidden 状态（TabBar 是独立组件，页面选择器查不到，直接读组件 data）
function tabBarHidden() {
  return h.mp.evaluate(() => {
    const pages = getCurrentPages()
    const page = pages[pages.length - 1]
    if (!page || typeof page.getTabBar !== 'function') return null
    const tb = page.getTabBar()
    if (!tb || !tb.data) return null
    return { hidden: !!tb.data.hidden }
  })
}

function openSheet() {
  return h.mp.evaluate(() => {
    const pages = getCurrentPages()
    const page = pages[pages.length - 1]
    page.openWechatProfile()
    return page.data.showWechatProfile
  })
}

function closeSheet() {
  return h.mp.evaluate(() => {
    const pages = getCurrentPages()
    const page = pages[pages.length - 1]
    page.closeWechatProfile()
    return page.data.showWechatProfile
  })
}

function setAvatar(src) {
  return h.mp.evaluate((s) => {
    const pages = getCurrentPages()
    const page = pages[pages.length - 1]
    page.setData({ wxAvatarUrl: s })
    return page.data.wxAvatarUrl
  }, src)
}

const near = (a, b, tol) => Math.abs(Number(a) - Number(b)) <= tol

;(async () => {
  const sys = await h.connect()
  const winH = sys.windowHeight
  const winW = sys.windowWidth

  await h.gotoTab('profile')
  const page = await h.waitPage('profile')
  h.ok(page, '我的页已就绪')
  h.gt(winH, 400, '视口高度合理')

  // ---------- 1. 打开弹层：TabBar 必须收起，按钮不得被遮挡 ----------
  await h.expect('W1', '打开弹层时自定义 TabBar 收起（按钮不再被压住）', async () => {
    const shown = await openSheet()
    h.eq(shown, true, 'showWechatProfile 已置 true')
    await h.sleep(600)

    const tb = await tabBarHidden()
    h.ok(tb, '能读到 TabBar 组件实例')
    h.eq(tb && tb.hidden, true, 'TabBar 已收起（hidden=true）')
    return 'TabBar hidden=' + (tb && tb.hidden)
  })

  // ---------- 2. 头像容器必须是正圆 ----------
  await h.expect('W2', '头像容器为正圆（不是椭圆）', async () => {
    const [picker, hit] = await rects(['.wechat-profile-avatar-picker', '.wechat-profile-avatar-hit'])
    const expectPx = 168 / 750 * winW
    h.ok(picker && picker.width > 0, '头像容器已渲染并带有宽度')
    h.gt(picker.width, 60, '头像容器宽度合理')
    h.eq(picker.width, picker.height, '头像容器 width === height（正圆，不是椭圆）')
    h.ok(near(picker.width, expectPx, 2), '头像容器宽度 = 168rpx（期望 ' + expectPx.toFixed(1) + 'px）', picker.width)

    h.ok(hit, '透明点击层已渲染')
    // 点击层必须完整覆盖圆形。button 默认样式可能让盒子略大于容器，
    // 超出部分由容器的 overflow:hidden 裁掉，不会外溢误触。
    h.ok(hit.left <= picker.left + 1, '点击层左边界不内缩', hit.left + ' vs ' + picker.left)
    h.ok(hit.top <= picker.top + 1, '点击层上边界不内缩', hit.top + ' vs ' + picker.top)
    h.ok(hit.right >= picker.right - 1, '点击层横向覆盖整个圆形', hit.right + ' vs ' + picker.right)
    h.ok(hit.bottom >= picker.bottom - 1, '点击层纵向覆盖整个圆形', hit.bottom + ' vs ' + picker.bottom)
    h.ok(near(hit.left, picker.left, 1) && near(hit.top, picker.top, 1), '点击层与容器左上角对齐')
    return '容器 ' + picker.width + '×' + picker.height + '，点击层 ' + hit.width + '×' + hit.height
  })

  // ---------- 3. 选中头像后图片本身仍是正方（不被拉扁） ----------
  await h.expect('W3', '头像图片按正方渲染（aspectFill 不变形）', async () => {
    const set = await setAvatar('/images/juji-mascot.png')
    h.eq(set, '/images/juji-mascot.png', 'wxAvatarUrl 已写入')
    await h.sleep(600)

    const [picker, img] = await rects(['.wechat-profile-avatar-picker', '.wechat-profile-avatar-img'])
    h.ok(img, '头像 <image> 已渲染')
    h.eq(img.width, img.height, '图片盒子 width === height')
    h.ok(near(img.width, picker.width, 1), '图片填满圆形容器宽度', img.width + ' vs ' + picker.width)
    h.ok(near(img.height, picker.height, 1), '图片填满圆形容器高度', img.height + ' vs ' + picker.height)
    return '图片 ' + img.width + '×' + img.height
  })

  // ---------- 4. 「取消 / 保存」必须完整在视口内 ----------
  await h.expect('W4', '取消 / 保存按钮完整可见（不再被 TabBar 遮住）', async () => {
    const [cancel, confirm, sheet] = await rects([
      '.wechat-profile-cancel', '.wechat-profile-confirm', '.wechat-profile-sheet'
    ])
    h.ok(cancel && cancel.width > 0, '取消按钮已渲染')
    h.ok(confirm && confirm.width > 0, '保存按钮已渲染')

    h.gt(confirm.height, 30, '保存按钮高度正常（88rpx ≈ 44px）', confirm.height)
    h.eq(cancel.height, confirm.height, '两个按钮等高')
    h.eq(cancel.bottom, confirm.bottom, '两个按钮底边对齐')

    h.ok(confirm.top >= 0, '保存按钮顶部在视口内', confirm.top)
    h.ok(confirm.bottom <= winH, '保存按钮底部未超出视口（' + confirm.bottom + ' ≤ ' + winH + '）')
    h.ok(sheet.bottom <= winH + 1, '弹层底部未超出视口')
    h.gt(sheet.top, 0, '弹层未顶出屏幕', sheet.top)

    // 按钮到屏幕底部的留白应大于安全区内边距（40rpx ≈ 20px）
    const gap = winH - confirm.bottom
    h.gte(gap, 15, '按钮下方留有安全内边距', gap)
    return '保存按钮 y=' + confirm.top.toFixed(0) + '..' + confirm.bottom.toFixed(0) + '，距底 ' + gap.toFixed(0) + 'px'
  })

  // ---------- 5. 昵称输入框必须完整可见、可点击 ----------
  await h.expect('W5', '昵称输入框完整可见（点击可唤起微信昵称填写）', async () => {
    const wxml = fs.readFileSync(path.join(__dirname, '..', '..', 'miniprogram', 'pages', 'profile', 'profile.wxml'), 'utf8')
    h.includes(wxml, 'type="nickname"', 'WXML 声明了 type="nickname"（微信昵称填写能力的前提）')

    const [input] = await rects(['.wechat-profile-nickname-input'])
    h.ok(input && input.width > 0, '昵称输入框已渲染')
    h.gt(input.height, 30, '输入框高度正常（88rpx ≈ 50px）', input.height)
    h.gt(input.width, 200, '输入框宽度铺满弹层')

    // 关键回归：旧版这一行被 TabBar 盖住，点到的其实是 TabBar，表现为「点击无效」
    h.ok(input.top >= 0, '输入框顶部在视口内', input.top)
    h.ok(input.bottom <= winH, '输入框底部未超出视口（' + input.bottom + ' ≤ ' + winH + '）')

    const [confirm] = await rects(['.wechat-profile-confirm'])
    h.gt(confirm.top, input.bottom, '保存按钮位于输入框下方，未被遮挡')
    return '输入框 y=' + input.top.toFixed(0) + '..' + input.bottom.toFixed(0)
  })

  // ---------- 6. 键盘抬起时弹层必须上移 ----------
  await h.expect('W6', '键盘抬起时弹层上移（输入框不被键盘遮挡）', async () => {
    const before = await h.mp.evaluate(() => {
      const pages = getCurrentPages()
      const page = pages[pages.length - 1]
      return { style: page.data.profileSheetStyle, h: page.data.profileKeyboardHeight }
    })
    h.eq(before.h, 0, '初始键盘高度为 0')
    h.eq(before.style, '', '初始无偏移')

    // 基准位置：fixed 定位的视口高度与 systemInfo().windowHeight 未必相等，
    // 所以断言「位移量」而不是绝对坐标，才能跨机型通用
    const [baseMask] = await rects(['.wechat-profile-mask'])
    h.ok(baseMask && baseMask.bottom > 0, '遮罩已渲染，可测基准底边（' + baseMask.bottom.toFixed(0) + '）')

    // 模拟器无法真的弹出系统键盘，直接驱动同一个 handler，
    // 覆盖「事件 → data → 内联样式 → 布局」整条链路；同值重复触发按官方提醒应被忽略
    await h.mp.evaluate(() => {
      const pages = getCurrentPages()
      const page = pages[pages.length - 1]
      page.onProfileNicknameKeyboard({ detail: { height: 320 } })
      page.onProfileNicknameKeyboard({ detail: { height: 320 } })
    })
    await h.sleep(400)

    const after = await h.mp.evaluate(() => {
      const pages = getCurrentPages()
      const page = pages[pages.length - 1]
      return { style: page.data.profileSheetStyle, h: page.data.profileKeyboardHeight }
    })
    h.eq(after.h, 320, '已记录键盘高度')
    h.eq(after.style, 'bottom:320px;', '已生成上移内联样式')

    const [mask, input] = await rects(['.wechat-profile-mask', '.wechat-profile-nickname-input'])
    const lift = baseMask.bottom - mask.bottom
    h.ok(near(lift, 320, 2), '遮罩整体上移了键盘高度（位移 ' + lift.toFixed(0) + 'px ≈ 320px）')
    h.ok(input.bottom <= mask.bottom + 1, '输入框底边不超出遮罩（' + input.bottom.toFixed(0) + ' ≤ ' + mask.bottom.toFixed(0) + '）')
    h.ok(input.bottom <= baseMask.bottom - 320 + 1, '输入框底边位于键盘上方（' + input.bottom.toFixed(0) + '）')

    // 收起键盘 → 复位
    await h.mp.evaluate(() => {
      const pages = getCurrentPages()
      const page = pages[pages.length - 1]
      page.onProfileNicknameKeyboard({ detail: { height: 0 } })
    })
    await h.sleep(400)
    const reset = await h.mp.evaluate(() => {
      const pages = getCurrentPages()
      const page = pages[pages.length - 1]
      return { style: page.data.profileSheetStyle, h: page.data.profileKeyboardHeight }
    })
    h.eq(reset.h, 0, '键盘收起后高度归零')
    h.eq(reset.style, '', '键盘收起后偏移清除')

    const [backMask] = await rects(['.wechat-profile-mask'])
    h.ok(near(backMask.bottom, baseMask.bottom, 2), '遮罩回落到基准位置（' + backMask.bottom.toFixed(0) + ' ≈ ' + baseMask.bottom.toFixed(0) + '）')
    return '键盘 320px 时上移 ' + lift.toFixed(0) + 'px，收起后复位'
  })

  await h.screenshot('wechat-profile-sheet')

  // ---------- 7. 关闭后 TabBar 必须恢复 ----------
  await h.expect('W7', '关闭弹层后 TabBar 恢复显示', async () => {
    const shown = await closeSheet()
    h.eq(shown, false, 'showWechatProfile 已置 false')
    await h.sleep(600)

    const tb = await tabBarHidden()
    h.eq(tb && tb.hidden, false, 'TabBar 已恢复（hidden=false）')

    const confirm = await h.mp.evaluate(() => new Promise((resolve) => {
      const q = wx.createSelectorQuery()
      q.select('.wechat-profile-confirm').boundingClientRect()
      q.exec((res) => resolve(res && res[0] ? res[0] : null))
    }))
    h.eq(confirm, null, '弹层已从渲染树移除')
    return 'TabBar hidden=' + (tb && tb.hidden)
  })

  await h.finish()
})().catch(async (e) => {
  console.error('脚本异常：', e && e.message)
  try { await h.mp.disconnect() } catch (_) {}
  process.exit(1)
})
