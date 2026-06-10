const PRIVACY_TOAST = '请先同意隐私协议'
const PRIVACY_AGREED_KEY = 'juji_privacy_agreed'

function initPrivacyAuthorization() {
  if (initPrivacyAuthorization._inited) return
  initPrivacyAuthorization._inited = true

  if (typeof wx.onNeedPrivacyAuthorization === 'function') {
    wx.onNeedPrivacyAuthorization(resolve => {
      wx.showModal({
        title: '隐私授权',
        content: '使用相机、相册、文件或 AI 能力前，请先阅读并同意隐私协议。',
        confirmText: '去授权',
        success: res => {
          resolvePrivacy(resolve, !!res.confirm)
        },
        fail: () => resolvePrivacy(resolve, false)
      })
    })
  }
}

async function requirePrivacyAuthorization(featureName = '') {
  const needAuthorization = await getNeedAuthorization()
  if (!needAuthorization) return true

  if (typeof wx.requirePrivacyAuthorize !== 'function') {
    wx.showToast({ title: PRIVACY_TOAST, icon: 'none' })
    return false
  }

  return new Promise(resolve => {
    wx.requirePrivacyAuthorize({
      success: () => resolve(true),
      fail: () => {
        wx.showToast({ title: featureName ? `${featureName}需要隐私授权` : PRIVACY_TOAST, icon: 'none' })
        resolve(false)
      }
    })
  })
}

function openPrivacyAgreement() {
  if (typeof wx.openPrivacyContract === 'function') {
    wx.openPrivacyContract({
      fail: () => showPrivacySummary()
    })
    return
  }
  showPrivacySummary()
}

function openUserAgreement() {
  wx.showModal({
    title: '用户协议',
    content: '橘记仅用于个人记账管理。请勿上传违法违规内容；请妥善保管导出的备份文件；继续使用即表示你理解并同意按照页面提示使用本小程序。',
    confirmText: '我知道了',
    showCancel: false
  })
}

function showPrivacySummary() {
  wx.showModal({
    title: '隐私协议',
    content: '橘记会在记账、头像、照片、文件导入导出、AI 对话/信件中使用必要数据。数据主要存储在你的云开发账户隔离空间中，仅用于记账展示、统计、备份和生成反馈。',
    confirmText: '我知道了',
    showCancel: false
  })
}

function getNeedAuthorization() {
  if (typeof wx.getPrivacySetting !== 'function') return Promise.resolve(false)
  return new Promise(resolve => {
    wx.getPrivacySetting({
      success: res => resolve(!!res.needAuthorization),
      fail: () => resolve(false)
    })
  })
}

function resolvePrivacy(resolve, agreed) {
  try {
    resolve({ event: agreed ? 'agree' : 'disagree', buttonId: 'privacy-agree' })
  } catch (e) {
    // ignore privacy callback compatibility failures
  }
}

module.exports = {
  PRIVACY_AGREED_KEY,
  initPrivacyAuthorization,
  requirePrivacyAuthorization,
  openPrivacyAgreement,
  openUserAgreement
}
