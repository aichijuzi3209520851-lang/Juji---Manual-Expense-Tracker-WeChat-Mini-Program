const { getThemeStyleString } = require('../../utils/theme')

Page({
  data: {
    currentIndex: 0,
    themeStyle: ''
  },

  onLoad() {
    if (wx.getStorageSync('has_seen_guide')) {
      wx.switchTab({ url: '/pages/home/home' })
      return
    }
    this.setData({ themeStyle: getThemeStyleString() })

    // 订阅主题变更事件
    this._themeHandler = () => {
      this.setData({ themeStyle: getThemeStyleString() })
    }
    getApp().globalData.eventBus.on('themeChanged', this._themeHandler)
  },

  onUnload() {
    if (this._themeHandler) {
      getApp().globalData.eventBus.off('themeChanged', this._themeHandler)
    }
  },

  onSwiperChange(e) {
    this.setData({ currentIndex: e.detail.current })
  },

  finishGuide() {
    wx.setStorageSync('has_seen_guide', true)
    wx.switchTab({ url: '/pages/home/home' })
  }
})
