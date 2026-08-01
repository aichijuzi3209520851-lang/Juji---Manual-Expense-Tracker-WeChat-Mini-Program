const { applyTheme, getThemeStyleString } = require('../../utils/theme')
const {
  PRIVACY_AGREED_KEY,
  requirePrivacyAuthorization,
  openPrivacyAgreement,
  openUserAgreement
} = require('../../utils/privacy')

Page({
  data: { loading: false, themeStyle: '', privacyAgreed: false },

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

  async handleLogin() {
    // [DEBUG] 隐私协议校验已临时禁用，便于调试时跳过该环节直接进入主功能页面
    // if (!this.data.privacyAgreed) {
    //   wx.showToast({ title: '请先阅读并同意协议', icon: 'none' })
    //   return
    // }

    this.setData({ loading: true })
    try {
      // [DEBUG] 隐私授权检查已临时禁用，未勾选隐私协议时也允许直接登录
      // const privacyOk = await requirePrivacyAuthorization('登录')
      // if (!privacyOk) {
      //   this.setData({ privacyAgreed: false })
      //   wx.removeStorageSync(PRIVACY_AGREED_KEY)
      //   return
      // }
      // wx.setStorageSync(PRIVACY_AGREED_KEY, true)

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
