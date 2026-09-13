const DEFAULT_MESSAGE = '内容可能不适合展示，请修改后再试'
// 入参护栏：仅防止异常超长入参；云端 contentSafety 已按分片送审，不再因长度拒绝内容
const MAX_CONTENT_LENGTH = 10000
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
  return String(text || '').trim().slice(0, MAX_CONTENT_LENGTH)
}

module.exports = {
  checkText,
  ensureSafeText
}
