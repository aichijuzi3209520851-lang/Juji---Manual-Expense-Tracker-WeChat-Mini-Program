const { applyTheme, getThemeStyleString } = require('../../utils/theme')
const {
  PRIVACY_AGREED_KEY,
  PRIVACY_AUTH_BUTTON_ID,
  handlePrivacyAuthorize,
  openPrivacyAgreement,
  openUserAgreement
} = require('../../utils/privacy')

Page({
  data: {
    loading: false,
    themeStyle: '',
    privacyAgreed: false,
    privacyAuthButtonId: PRIVACY_AUTH_BUTTON_ID
  },

  onLoad() {
    this.setData({ privacyAgreed: !!wx.getStorageSync(PRIVACY_AGREED_KEY) })
    this._themeHandler = (id) => { applyTheme(id); this.setData({ themeStyle: getThemeStyleString(id) }) }
    getApp().globalData.eventBus.on('themeChanged', this._themeHandler)
  },

  onUnload() {
    if (this._themeHandler) getApp().globalData.eventBus.off('themeChanged', this._themeHandler)
  },

  onShow() {
    applyTheme()
    this.setData({ themeStyle: getThemeStyleString() })
  },

  togglePrivacyAgreed() {
    this.setData({ privacyAgreed: !this.data.privacyAgreed })
  },

  viewPrivacyAgreement() {
    openPrivacyAgreement()
  },

  viewUserAgreement() {
    openUserAgreement()
  },

  // 主登录入口。按钮带 open-type="agreePrivacyAuthorization"，
  // 用户在「同意」隐私弹窗后才触发此回调，因此无需再调 wx.requirePrivacyAuthorize，
  // 直接完成授权并登录，杜绝二次确认。
  async onPrivacyAuthorize(e) {
    if (!this.data.privacyAgreed) {
      wx.showToast({ title: '请先阅读并同意协议', icon: 'none' })
      return
    }
    // 将微信授权 event 交给隐私工具处理（写入授权记录），然后直接登录
    handlePrivacyAuthorize(e)

    this.setData({ loading: true })
    try {
      wx.setStorageSync(PRIVACY_AGREED_KEY, true)
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
  },

  // 协议未勾选时点击登录的引导提示（按钮 disabled 仍可能触发，作为兜底）
  handleLogin() {
    if (!this.data.privacyAgreed) {
      wx.showToast({ title: '请先阅读并同意协议', icon: 'none' })
    }
  }
})
