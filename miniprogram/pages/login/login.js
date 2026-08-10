const { applyTheme, getThemeStyleString } = require('../../utils/theme')
const {
  PRIVACY_AGREED_KEY,
  PRIVACY_AUTH_BUTTON_ID,
  requirePrivacyAuthorization,
  handlePrivacyAuthorize,
  openPrivacyAgreement,
  openUserAgreement
} = require('../../utils/privacy')

Page({
  data: {
    loading: false,
    themeStyle: '',
    privacyAgreed: false,
    showPrivacyAuthButton: false,
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

  onPrivacyChange(e) {
    const checked = (e.detail.value || []).includes('agree')
    this.setData({ privacyAgreed: checked })
  },

  viewPrivacyAgreement() {
    openPrivacyAgreement()
  },

  viewUserAgreement() {
    openUserAgreement()
  },

  // 隐私链路回调：当 wx.onNeedPrivacyAuthorization 全局触发时，由 utils/privacy 调用，
  // 显示登录页专属的「同意隐私协议并登录」真实授权按钮（open-type="agreePrivacyAuthorization"）。
  showPrivacyAuthorizeButton() {
    this.setData({ showPrivacyAuthButton: true })
  },

  // 用户点击授权按钮后，bindagreeprivacyauthorization 回调携带 e.detail.event，
  // 交由 handlePrivacyAuthorize 解析并无缝 resolve 给 wx.requirePrivacyAuthorize，避免死循环。
  onPrivacyAuthorize(e) {
    this.setData({ showPrivacyAuthButton: false })
    handlePrivacyAuthorize(e)
  },

  async handleLogin() {
    if (!this.data.privacyAgreed) {
      wx.showToast({ title: '请先阅读并同意协议', icon: 'none' })
      return
    }

    this.setData({ loading: true })
    try {
      const privacyOk = await requirePrivacyAuthorization('登录')
      if (!privacyOk) {
        this.setData({ privacyAgreed: false, loading: false })
        wx.removeStorageSync(PRIVACY_AGREED_KEY)
        return
      }
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
  }
})
