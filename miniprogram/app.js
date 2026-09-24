const { ENV_ID } = require('./config/env')
const { initAppTheme, applyTheme, migrateLegacyCustomTheme } = require('./utils/theme')
const EventBus = require('./utils/eventBus')
const { initMonitoring } = require('./utils/monitor')
const { initPrivacyAuthorization } = require('./utils/privacy')

// 橘记JUJI - app.js
App({
  globalData: {
    openid: '',
    userInfo: null,
    hasSeenGuide: false,
    currentTheme: 'mint',
    eventBus: new EventBus(),
    _loginPromise: null,
    // 本次启动是否处于"已检测到新版本、等待用户重启"的状态（首页据此跳过更新公告弹窗）
    pendingRestart: false
  },

  onLaunch() {
    // CloudBase 初始化
    if (!wx.cloud) {
      console.error('基础库版本过低，请使用 2.2.3 及以上')
      return
    }
    wx.cloud.init({
      env: ENV_ID,
      traceUser: true,
    })
    initMonitoring()
    initPrivacyAuthorization()

    // 迁移旧版自定义主题（theme='custom' + custom_theme_color → user_themes）
    migrateLegacyCustomTheme()

    // 初始化主题（从 Storage 读取用户选择的主题并注入全局数据）
    initAppTheme(this)

    // 检查是否看过引导页
    const guideFlag = wx.getStorageSync('has_seen_guide')
    this.globalData.hasSeenGuide = !!guideFlag

    // 执行静默登录与用户同步
    this.silentLogin().catch(() => {})

    // 检查小程序版本更新（见 checkAppUpdate 注释：不加这条，新版本可能迟迟到不了用户端）
    this.checkAppUpdate()
  },

  /**
   * 版本更新检测（wx.getUpdateManager）
   * ────────────────────────────────────────────────────────────
   * 为什么必须有它：小程序发布后，用户端本地仍可能是旧代码包，微信只在**冷启动**时
   * 异步检查更新，且覆盖范围/时机不完全可控。表现出来就是"我明明已经发布新版本了，
   * 为什么那个功能（比如分享按钮）还是灰的"。
   *
   * ⚠️ 官方限制：该能力只在**正式版**生效，开发版 / 体验版不会触发
   *   （所以本地调试看不到这个弹窗是正常的，别当成 bug）。
   */
  checkAppUpdate() {
    if (typeof wx.getUpdateManager !== 'function') return

    const updateManager = wx.getUpdateManager()

    updateManager.onUpdateReady(() => {
      // 标记：本次启动待重启，首页据此跳过更新公告弹窗，避免两个弹窗叠在一起
      this.globalData.pendingRestart = true
      wx.showModal({
        title: '发现新版本',
        content: '橘记已更新，重启后即可使用最新功能',
        confirmText: '立即重启',
        cancelText: '稍后再说',
        success: (r) => {
          if (r.confirm) updateManager.applyUpdate()
        }
      })
    })

    updateManager.onUpdateFailed(() => {
      // 下载失败静默处理：下次启动会自动重试，不弹窗打扰用户
      console.warn('⚠️ 新版本下载失败，将在下次启动时重试')
    })
  },

  // 静默登录：仅通过云函数换取 openid。
  // 注意：这一步不会触发任何用户授权弹窗（不需要头像/昵称/手机号），
  // 因此不构成「未体验功能就要求授权登录」，可以在启动时直接执行。
  // 已拿到 openid 时直接返回；并发调用共享同一个 Promise，避免重复请求。
  async silentLogin() {
    if (this.globalData.openid) return this.globalData.openid
    if (this.globalData._loginPromise) return this.globalData._loginPromise
    this.globalData._loginPromise = this._doSilentLogin()
    try {
      return await this.globalData._loginPromise
    } finally {
      this.globalData._loginPromise = null
    }
  },

  // 供页面在 onShow 里 await 使用：确保 openid 就绪后再查库，且永不抛错。
  // 启动页改为「先渲染、后取数」后，不等它的话首屏会按空 openid 查到空数据。
  async ensureLogin() {
    try {
      return (await this.silentLogin()) || this.globalData.openid || ''
    } catch (err) {
      return this.globalData.openid || ''
    }
  },

  async _doSilentLogin() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'quickstartFunctions',
        data: { type: 'getOpenId' }
      })
      this.globalData.openid = res.result.openid
      console.log('✅ 登录成功')

      // 同步用户资料
      await this.syncUserInfo()
    } catch (err) {
      console.warn('⚠️ 静默登录失败, 可能需要部署云函数:', err.errMsg || err)
      throw err
    }
  },

  // 同步用户资料到 users 集合（M6 修复：由 quickstartFunctions 云函数服务端创建/更新，
  // 服务端时间戳不可伪造，字段为固定模板）
  async syncUserInfo() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'quickstartFunctions',
        data: { type: 'syncUser' }
      })
      const result = res.result || {}
      if (result.success && result.userInfo) {
        this.globalData.userInfo = {
          ...result.userInfo,
          _openid: this.globalData.openid
        }
      }
    } catch (err) {
      console.warn('⚠️ 用户资料同步失败:', err.errMsg || err)
    }
  }
})
