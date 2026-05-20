Page({
  data: {
    currentIndex: 0
  },

  onLoad() {
    if (wx.getStorageSync('has_seen_guide')) {
      wx.switchTab({ url: '/pages/home/home' })
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
