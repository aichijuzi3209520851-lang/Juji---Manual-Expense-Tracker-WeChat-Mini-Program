const DEFAULT_MESSAGE = '内容可能不适合展示，请修改后再试'
const MAX_CONTENT_LENGTH = 2500
const BLOCK_PATTERNS = [
  /赌博|博彩|赌球|私彩|代购彩票/,
  /色情|裸聊|约炮|成人视频|淫秽/,
  /毒品|冰毒|大麻|贩毒|吸毒/,
  /枪支|弹药|炸药|爆炸物|制爆/,
  /诈骗|洗钱|套现|跑分/,
  /自杀|轻生|自残/,
  /暴恐|恐怖袭击/
]

async function checkText(text, options = {}) {
  const content = normalize(text)
  if (!content) return { ok: true, checked: false }
  if (content.length > MAX_CONTENT_LENGTH) {
    return { ok: false, message: '内容过长，请精简后再试', source: 'length' }
  }

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
  wx.showToast({ title: res.message || DEFAULT_MESSAGE, icon: 'none' })
  return false
}

function localCheckText(text) {
  const content = normalize(text)
  const blocked = BLOCK_PATTERNS.some(pattern => pattern.test(content))
  if (!blocked) return { ok: true, checked: true, source: 'local' }
  return { ok: false, checked: true, source: 'local', message: DEFAULT_MESSAGE }
}

function normalize(text) {
  return String(text || '').trim().slice(0, MAX_CONTENT_LENGTH + 1)
}

module.exports = {
  checkText,
  ensureSafeText
}
