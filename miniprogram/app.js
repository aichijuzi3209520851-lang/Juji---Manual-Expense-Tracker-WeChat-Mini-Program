const { initAppTheme, applyTheme } = require('./utils/theme')
const EventBus = require('./utils/eventBus')

// 橘记 - app.js
App({
  globalData: {
    openid: '',
    userInfo: null,
    hasSeenGuide: false,
    currentTheme: 'mint',
    eventBus: new EventBus()
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

    // 初始化主题（从 Storage 读取用户选择的主题并注入全局数据）
    initAppTheme(this)

    // 检查是否看过引导页
    const guideFlag = wx.getStorageSync('has_seen_guide')
    this.globalData.hasSeenGuide = !!guideFlag

    // 尝试静默登录
    this.silentLogin()
  },

  // 静默登录：获取 openid
  async silentLogin() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'quickstartFunctions',
        data: { type: 'getOpenId' }
      })
      this.globalData.openid = res.result.openid
      console.log('✅ 登录成功, openid:', this.globalData.openid)

      // 同步用户资料
      await this.syncUserInfo()
    } catch (err) {
      console.warn('⚠️ 静默登录失败, 可能需要部署云函数:', err.errMsg || err)
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
        await db.collection('users').add({
          data: {
            nickname: '',
            avatarUrl: '',
            gender: '',
            customCategories: [],
            theme: 'mint',
            budgetDefault: 2000,
            createdAt: new Date(),
            lastLoginAt: new Date()
          }
        })
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
