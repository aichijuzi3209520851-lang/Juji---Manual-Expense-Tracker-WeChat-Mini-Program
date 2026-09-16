const { getThemeStyleString } = require('../../utils/theme')

Page({
  data: {
    currentIndex: 0,
    themeStyle: '',
    animKey: Date.now(), // 添加 animKey 用于强制触发动画
    // 「跳过」按钮定位（左上角）。空值时沿用 wxss 里的保底 top
    skipStyle: ''
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
    this._applySkipPosition()

    // 订阅主题变更事件
    this._themeHandler = () => {
      this.setData({ themeStyle: getThemeStyleString() })
    }
    getApp().globalData.eventBus.on('themeChanged', this._themeHandler)
  },

  // 「跳过」按钮改放左上角：右上角是微信胶囊菜单的保留区，不能占用；
  // 而左上角必须让开状态栏时间 —— 对齐胶囊按钮的 top 最稳（它天然位于状态栏下方）。
  _applySkipPosition() {
    try {
      if (typeof wx.getMenuButtonBoundingClientRect !== 'function') return
      const rect = wx.getMenuButtonBoundingClientRect()
      if (rect && rect.top) {
        this.setData({ skipStyle: 'top:' + rect.top + 'px;' })
      }
    } catch (err) {
      // 取不到胶囊信息就沿用 wxss 的保底 top，不影响使用
    }
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
    // 引导页现在是「我的 → 新手引导」按需打开的子页（navigateTo）。
    // 这种「tab 页 → navigateTo 子页」的栈结构下 switchTab 实测会静默不生效，
    // 改用 reLaunch（会清空页面栈并落到 tab 页）；失败再退回上一页，避免卡住。
    wx.reLaunch({
      url: '/pages/home/home',
      fail: () => this.leaveGuide()
    })
  },

  // 「跳过」：快速离开引导页，回到进入前的页面
  skipGuide() {
    wx.setStorageSync('has_seen_guide', true)
    this.leaveGuide()
  },

  // 兜底离开：能返回上一页就返回，否则回功能首页。
  // navigateBack 必须带 fail 兜底：它在个别情况下会静默失败（既不 success 也不 fail 的
  // 情况实测过），一旦失败用户就永远卡在引导页 —— 「跳过」点不动 = 死胡同。
  // 这里保证任何路径下都至少能落到功能首页，绝不留死胡同。
  leaveGuide() {
    const pages = getCurrentPages()
    const toHome = () => wx.switchTab({ url: '/pages/home/home' })
    if (pages.length > 1) {
      wx.navigateBack({ fail: toHome })
    } else {
      toHome()
    }
  }
})