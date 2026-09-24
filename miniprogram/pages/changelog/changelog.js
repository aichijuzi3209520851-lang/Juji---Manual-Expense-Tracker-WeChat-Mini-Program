const { applyTheme, getThemeStyleString } = require('../../utils/theme')
const { buildShareAppMessage, buildShareTimeline } = require('../../utils/share')
const { VERSION, getAll, markSeen } = require('../../utils/changelog')

Page({
  data: {
    currentVersion: VERSION,
    list: [],
    themeStyle: getThemeStyleString()
  },

  onLoad() {
    this._themeHandler = (id) => {
      applyTheme(id)
      this.setData({ themeStyle: getThemeStyleString(id) })
    }
    const bus = getApp().globalData.eventBus
    bus.on('themeChanged', this._themeHandler)

    this.setData({ list: getAll() })
  },

  onShow() {
    applyTheme()
    this.setData({ themeStyle: getThemeStyleString() })
    this.updateCustomTabBar()
    // 打开历史公告即视为当前版本已读（避免首页弹窗与这里重复打扰）
    markSeen(VERSION)
  },

  onUnload() {
    const bus = getApp().globalData.eventBus
    if (this._themeHandler) bus.off('themeChanged', this._themeHandler)
  },

  updateCustomTabBar() {
    if (typeof this.getTabBar !== 'function') return
    const tabBar = this.getTabBar()
    if (tabBar && typeof tabBar.updateSelected === 'function') {
      tabBar.updateSelected()
    }
  },

  // 分享：历史公告页仍分享整个小程序（落地首页），不暴露任何用户数据
  onShareAppMessage() {
    return buildShareAppMessage('home')
  },

  onShareTimeline() {
    return buildShareTimeline('home')
  }
})
