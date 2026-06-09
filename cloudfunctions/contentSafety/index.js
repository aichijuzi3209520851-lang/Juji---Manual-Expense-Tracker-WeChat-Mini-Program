const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const MAX_CONTENT_LENGTH = 2500
const VALID_SCENES = [1, 2, 3, 4]
const BLOCK_PATTERNS = [
  /赌博|博彩|赌球|私彩|代购彩票/,
  /色情|裸聊|约炮|成人视频|淫秽/,
  /毒品|冰毒|大麻|贩毒|吸毒/,
  /枪支|弹药|炸药|爆炸物|制爆/,
  /诈骗|洗钱|套现|跑分/,
  /自杀|轻生|自残/,
  /暴恐|恐怖袭击/
]

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const content = normalize(event.content)
  const scene = normalizeScene(event.scene)

  if (!content) {
    return { success: true, ok: true, checked: false }
  }
  if (content.length > MAX_CONTENT_LENGTH) {
    return { success: true, ok: false, message: '内容过长，请精简后再试', source: 'length' }
  }

  const local = localCheck(content)
  if (!local.ok) {
    return local
  }

  try {
    const res = await cloud.openapi.security.msgSecCheck({
      version: 2,
      openid: wxContext.OPENID,
      scene,
      content
    })
    return parseWxResult(res)
  } catch (err) {
    const errCode = err && (err.errCode === undefined ? err.errcode : err.errCode)
    if (errCode === 87014) {
      return { success: true, ok: false, checked: true, source: 'wx', errCode, message: '内容可能不适合展示，请修改后再试' }
    }
    console.warn('[contentSafety] msgSecCheck unavailable:', err && (err.errMsg || err.message))
    return { success: true, ok: true, checked: false, source: 'local-fallback' }
  }
}

function normalize(value) {
  return String(value || '').trim().slice(0, MAX_CONTENT_LENGTH + 1)
}

function normalizeScene(scene) {
  const n = parseInt(scene, 10)
  return VALID_SCENES.includes(n) ? n : 2
}

function localCheck(content) {
  const blocked = BLOCK_PATTERNS.some(pattern => pattern.test(content))
  if (!blocked) return { success: true, ok: true, checked: true, source: 'local' }
  return {
    success: true,
    ok: false,
    checked: true,
    source: 'local',
    message: '内容可能不适合展示，请修改后再试'
  }
}

function parseWxResult(res = {}) {
  const errCode = res.errCode === undefined ? res.errcode : res.errCode
  const result = res.result || {}
  const suggest = result.suggest
  const label = result.label

  if (errCode === 87014) {
    return { success: true, ok: false, checked: true, source: 'wx', errCode, message: '内容可能不适合展示，请修改后再试' }
  }
  if (errCode !== undefined && errCode !== 0) {
    return { success: true, ok: true, checked: false, source: 'wx-error', errCode }
  }

  const pass = suggest === 'pass' || label === 100 || label === '100' || (!suggest && label === undefined)
  return {
    success: true,
    ok: pass,
    checked: true,
    source: 'wx',
    label,
    suggest,
    message: pass ? '' : '内容可能不适合展示，请修改后再试'
  }
}
