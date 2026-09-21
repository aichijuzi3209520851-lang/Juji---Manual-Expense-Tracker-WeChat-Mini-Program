const { checkTextSafe, showSensitiveAlert } = require('./sensitiveWords')

const DEFAULT_MESSAGE = '内容可能不适合展示，请修改后再试'
// 入参护栏：仅防止异常超长入参；云端 contentSafety 已按分片送审，不再因长度拒绝内容
const MAX_CONTENT_LENGTH = 10000
// 违禁词库统一收在 utils/sensitiveWords.js（本地第一道防线），此处不再另存一份正则

async function checkText(text, options = {}) {
  const content = normalize(text)
  if (!content) return { ok: true, checked: false }

  const local = localCheckText(content)
  if (!local.ok) return local

  try {
    const res = await wx.cloud.callFunction({
      name: 'contentSafety',
      data: {
        content,
        scene: options.scene || 2
      }
    })
    const result = res.result || {}
    if (result.ok === false) {
      return { ok: false, message: result.message || DEFAULT_MESSAGE, source: result.source || 'cloud' }
    }
    return { ok: true, checked: !!result.checked, source: result.source || 'cloud' }
  } catch (err) {
    console.warn('[contentSafety] check skipped:', err && (err.errMsg || err.message))
    return { ok: true, checked: false, source: 'local-fallback' }
  }
}

async function ensureSafeText(text, options = {}) {
  const res = await checkText(text, options)
  if (res.ok) return true
  // 命中本地违禁词库时用弹窗明确告警（toast 太轻，容易被忽略）
  if (res.hits && res.hits.length) {
    return showSensitiveAlert(res, options)
  }
  wx.showToast({ title: res.message || DEFAULT_MESSAGE, icon: 'none' })
  return false
}

function localCheckText(text) {
  const content = normalize(text)
  const res = checkTextSafe(content)
  if (res.ok) return { ok: true, checked: true, source: 'local' }
  return {
    ok: false,
    checked: true,
    source: 'local',
    message: res.message || DEFAULT_MESSAGE,
    hits: res.hits
  }
}

function normalize(text) {
  return String(text || '').trim().slice(0, MAX_CONTENT_LENGTH)
}

module.exports = {
  checkText,
  ensureSafeText
}
