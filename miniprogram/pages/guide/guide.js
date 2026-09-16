const { getThemeStyleString } = require('../../utils/theme')

Page({
  data: {
    currentIndex: 0,
    themeStyle: '',
    animKey: Date.now() // 添加 animKey 用于强制触发动画
  },

  onLoad(options) {
    // replay=1：来自「我的 → 新手引导」的主动回看，允许反复查看；
    // 其余情况（含启动）不再自动进入引导页 —— 启动页已改为功能首页，
    // 避免出现「未体验功能先被挡在引导/登录页」的审核问题。
    const replay = options && options.replay === '1'
    if (!replay && wx.getStorageSync('has_seen_guide')) {
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
    // 每次切换时更新 animKey，配合 WXML 中的 class 和 WXSS，强制动画重新播放
    this.setData({ 
      currentIndex: e.detail.current,
      animKey: Date.now() 
    })
  },

  finishGuide() {
    wx.setStorageSync('has_seen_guide', true)
    wx.switchTab({ url: '/pages/home/home' })
  }
})