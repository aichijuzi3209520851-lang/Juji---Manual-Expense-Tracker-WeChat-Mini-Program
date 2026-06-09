const { initAppTheme, applyTheme, migrateLegacyCustomTheme } = require('./utils/theme')
const EventBus = require('./utils/eventBus')
const { initMonitoring } = require('./utils/monitor')
const { initPrivacyAuthorization, PRIVACY_AGREED_KEY } = require('./utils/privacy')

// 橘记 - app.js
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
      env: 'lajiaoyou-d4g78yts61f1a841d',
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

    // 用户同意隐私协议后才静默登录
    if (wx.getStorageSync(PRIVACY_AGREED_KEY)) {
      this.silentLogin().catch(() => {})
    }
  },

  // 静默登录：获取 openid
  async silentLogin() {
    if (this.globalData._loginPromise) return this.globalData._loginPromise
    this.globalData._loginPromise = this._doSilentLogin()
    try {
      return await this.globalData._loginPromise
    } finally {
      this.globalData._loginPromise = null
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

  // 同步用户资料到 users 集合
  async syncUserInfo() {
    try {
      const db = wx.cloud.database()
      const { data } = await db.collection('users')
        .where({ _openid: this.globalData.openid })
        .get()

      if (data.length === 0) {
        // 新用户，创建记录
        const now = new Date()
        const userInfo = {
          nickname: '',
          avatarUrl: '',
          gender: '',
          customCategories: [],
          theme: 'mint',
          budgetDefault: 2000,
          createdAt: now,
          lastLoginAt: now
        }
        const addRes = await db.collection('users').add({
          data: userInfo
        })
        this.globalData.userInfo = {
          ...userInfo,
          _id: addRes._id,
          _openid: this.globalData.openid
        }
      } else {
        // 老用户，更新登录时间
        this.globalData.userInfo = data[0]
        await db.collection('users')
          .where({ _openid: this.globalData.openid })
          .update({
            data: { lastLoginAt: new Date() }
          })
      }
    } catch (err) {
      console.warn('⚠️ 用户资料同步失败:', err.errMsg || err)
    }
  }
})
