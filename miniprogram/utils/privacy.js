const PRIVACY_TOAST = '请先同意隐私协议'
const PRIVACY_AGREED_KEY = 'juji_privacy_agreed'
const PRIVACY_DEBUG_BYPASS = false

const PRIVACY_AUTH_BUTTON_ID = 'privacy-auth-btn'

let pendingResolve = null
let pendingReject = null
let onPrivacyAuthorizeShowCallback = null

function initPrivacyAuthorization() {
  if (PRIVACY_DEBUG_BYPASS) return
  if (initPrivacyAuthorization._inited) return
  initPrivacyAuthorization._inited = true

  if (typeof wx.onNeedPrivacyAuthorization !== 'function') return

  wx.onNeedPrivacyAuthorization(resolve => {
    pendingResolve = resolve

    const pages = getCurrentPages()
    const page = pages[pages.length - 1]

    if (page && typeof page.showPrivacyAuthorizeButton === 'function') {
      page.showPrivacyAuthorizeButton()
    } else if (onPrivacyAuthorizeShowCallback) {
      onPrivacyAuthorizeShowCallback()
    } else {
      wx.showModal({
        title: '隐私授权',
        content: '使用本功能需要先同意隐私保护指引。',
        confirmText: '去同意',
        cancelText: '取消',
        success: res => {
          if (res.confirm) {
            openPrivacyAgreement()
          }
          resolvePrivacyAuthorization(false)
        },
        fail: () => resolvePrivacyAuthorization(false)
      })
    }
  })
}

function setPrivacyAuthorizeShowCallback(cb) {
  onPrivacyAuthorizeShowCallback = cb
}

function handlePrivacyAuthorize(e) {
  const detail = e.detail || {}
  if (detail.event === 'agree') {
    resolvePrivacyAuthorization(true)
  } else {
    resolvePrivacyAuthorization(false)
  }
}

function resolvePrivacyAuthorization(agreed) {
  if (!pendingResolve) return
  try {
    pendingResolve({
      event: agreed ? 'agree' : 'disagree',
      buttonId: PRIVACY_AUTH_BUTTON_ID
    })
  } catch (e) {
    console.error('[privacy] resolve failed', e)
  }
  pendingResolve = null
  pendingReject = null
}

async function requirePrivacyAuthorization(featureName = '') {
  if (PRIVACY_DEBUG_BYPASS) return true

  const needAuthorization = await getNeedAuthorization()
  if (!needAuthorization) return true

  if (typeof wx.requirePrivacyAuthorize !== 'function') {
    wx.showToast({ title: PRIVACY_TOAST, icon: 'none' })
    return false
  }

  return new Promise((resolve, reject) => {
    pendingReject = reject
    wx.requirePrivacyAuthorize({
      success: () => {
        pendingReject = null
        resolve(true)
      },
      fail: (err) => {
        pendingReject = null
        if (err && /cancel|disagree/i.test(err.errMsg || '')) {
          wx.showToast({ title: featureName ? `${featureName}需要隐私授权` : PRIVACY_TOAST, icon: 'none' })
        }
        resolve(false)
      }
    })
  })
}

function openPrivacyAgreement() {
  if (typeof wx.openPrivacyContract === 'function') {
    wx.openPrivacyContract({
      fail: () => showPrivacySummaryFallback()
    })
  } else {
    showPrivacySummaryFallback()
  }
}

function openUserAgreement() {
  wx.showModal({
    title: '用户协议',
    content: '橘记仅用于个人记账管理。请勿上传违法违规内容；请妥善保管导出的备份文件；继续使用即表示你理解并同意按照页面提示使用本小程序。',
    confirmText: '我知道了',
    showCancel: false
  })
}

function showPrivacySummaryFallback() {
  wx.showModal({
    title: '隐私协议',
    content: '橘记会在记账、头像、照片、文件导入导出、AI 对话/信件中使用必要数据。数据主要存储在你的云开发账户隔离空间中，仅用于记账展示、统计、备份和生成反馈。',
    confirmText: '我知道了',
    showCancel: false
  })
}

function getNeedAuthorization() {
  if (PRIVACY_DEBUG_BYPASS) return Promise.resolve(false)
  if (typeof wx.getPrivacySetting !== 'function') return Promise.resolve(false)
  return new Promise(resolve => {
    wx.getPrivacySetting({
      success: res => resolve(!!res.needAuthorization),
      fail: () => resolve(false)
    })
  })
}

function getPrivacyAuthButtonId() {
  return PRIVACY_AUTH_BUTTON_ID
}

module.exports = {
  PRIVACY_AGREED_KEY,
  PRIVACY_AUTH_BUTTON_ID,
  initPrivacyAuthorization,
  setPrivacyAuthorizeShowCallback,
  handlePrivacyAuthorize,
  resolvePrivacyAuthorization,
  requirePrivacyAuthorization,
  openPrivacyAgreement,
  openUserAgreement,
  getNeedAuthorization,
  getPrivacyAuthButtonId
}
