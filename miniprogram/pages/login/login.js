const { applyTheme } = require('../../utils/theme')

Page({
  data: { loading: false },

  onShow() {
    // 每次显示登录页时同步最新主题（确保重启/切回时状态正确）
    applyTheme()
  },

  async handleLogin() {
    this.setData({ loading: true })
    try {
      const app = getApp()
      await app.silentLogin()
      const hasSeenGuide = !!wx.getStorageSync('has_seen_guide')
      if (hasSeenGuide) {
        wx.switchTab({ url: '/pages/home/home' })
      } else {
        wx.redirectTo({ url: '/pages/guide/guide' })
      }
    } catch (err) {
      wx.showToast({ title: '登录失败，请重试', icon: 'none' })
      console.error(err)
    } finally {
      this.setData({ loading: false })
    }
  }
})
