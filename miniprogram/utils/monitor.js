const MAX_TEXT_LEN = 500

function initMonitoring() {
  if (initMonitoring._inited) return
  initMonitoring._inited = true

  if (typeof wx.onError === 'function') {
    wx.onError(message => {
      reportClientError('runtime_error', { message })
    })
  }

  if (typeof wx.onUnhandledRejection === 'function') {
    wx.onUnhandledRejection(res => {
      const reason = res && res.reason
      reportClientError('unhandled_rejection', {
        message: getErrorMessage(reason),
        stack: reason && reason.stack
      })
    })
  }
}

function reportClientError(type, err = {}) {
  try {
    const db = wx.cloud.database()
    db.collection('client_logs').add({
      data: {
        type,
        message: trim(err.message || ''),
        stack: trim(err.stack || ''),
        route: getCurrentRoute(),
        createdAt: new Date()
      }
    }).catch(e => {
      console.warn('[monitor] report skipped:', e && (e.errMsg || e.message))
    })
  } catch (e) {
    console.warn('[monitor] report unavailable:', e && (e.errMsg || e.message))
  }
}

function getErrorMessage(reason) {
  if (!reason) return ''
  if (typeof reason === 'string') return reason
  return reason.errMsg || reason.message || String(reason)
}

function getCurrentRoute() {
  try {
    const pages = getCurrentPages()
    const current = pages && pages[pages.length - 1]
    return current && current.route ? current.route : ''
  } catch (e) {
    return ''
  }
}

function trim(text) {
  return String(text || '').slice(0, MAX_TEXT_LEN)
}

module.exports = {
  initMonitoring,
  reportClientError
}
