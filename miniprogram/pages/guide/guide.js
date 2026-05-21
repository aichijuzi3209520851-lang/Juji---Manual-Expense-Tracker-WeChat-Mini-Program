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
  },

  onSwiperChange(e) {
    this.setData({ currentIndex: e.detail.current })
  },

  finishGuide() {
    wx.setStorageSync('has_seen_guide', true)
    wx.switchTab({ url: '/pages/home/home' })
  }
})
