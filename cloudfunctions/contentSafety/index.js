const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// 入参护栏：仅防止异常超长入参，不再作为「内容过长」的拒绝条件
const MAX_CONTENT_LENGTH = 10000
// 分片送审：msgSecCheck 单次上限 2500 字
const SEC_CHECK_CHUNK = 2000
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

  const local = localCheck(content)
  if (!local.ok) {
    return local
  }

  // 分片送审：msgSecCheck 单次上限 2500 字，长内容（如代码回答）需分片覆盖全文
  try {
    for (let i = 0; i < content.length; i += SEC_CHECK_CHUNK) {
      const res = await cloud.openapi.security.msgSecCheck({
        version: 2,
        openid: wxContext.OPENID,
        scene,
        content: content.slice(i, i + SEC_CHECK_CHUNK)
      })
      const parsed = parseWxResult(res)
      if (!parsed.ok) return parsed
    }
    return { success: true, ok: true, checked: true, source: 'wx' }
  } catch (err) {
    const errCode = err && (err.errCode === undefined ? err.errcode : err.errCode)
    if (errCode === 87014) {
      return { success: true, ok: false, checked: true, source: 'wx', errCode, message: '内容可能不适合展示，请修改后再试' }
    }
    // H1 修复：权限/配置错误（如未声明 openapi 权限）fail-closed，避免审核静默失效
    const msg = String((err && (err.errMsg || err.message)) || '')
    if (/permission|unauthorized|not authorized|权限|未授权/i.test(msg)) {
      console.error('[contentSafety] msgSecCheck permission/config error, fail-closed:', msg)
      return { success: true, ok: false, checked: false, source: 'wx-error', message: '内容安全服务暂不可用，请稍后再试' }
    }
    console.warn('[contentSafety] msgSecCheck unavailable:', msg)
    return { success: true, ok: true, checked: false, source: 'local-fallback' }
  }
}

function normalize(value) {
  return String(value || '').trim().slice(0, MAX_CONTENT_LENGTH)
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
