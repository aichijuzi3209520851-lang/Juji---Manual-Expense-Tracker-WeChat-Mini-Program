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
    _loginPromise: null
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
