Page({
  onLoad() {
    if (wx.getStorageSync('has_seen_guide')) {
      wx.switchTab({ url: '/pages/home/home' })
    }
  },
  finishGuide() {
    wx.setStorageSync('has_seen_guide', true)
    wx.switchTab({ url: '/pages/home/home' })
  }
})
