// 橘记 — users 云函数（服务端校验 + 写入用户资料）
// 统一收敛昵称/性别/生日/职业/头像/自定义分类等含隐私信息的写操作，
// 避免前端直写数据库，保证服务端校验（长度/枚举/内容安全/归属）。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const MAX_NICKNAME_LEN = 20
const MAX_OCCUPATION_LEN = 20
const MAX_CATEGORY_NAME_LEN = 10
const MAX_CATEGORY_ICON_LEN = 8
const MAX_CATEGORIES = 50
const VALID_GENDERS = ['', 'male', 'female']
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const BLOCK_PATTERNS = [
  /赌博|博彩|赌球|私彩|代购彩票/,
  /色情|裸聊|约炮|成人视频|淫秽/,
  /毒品|冰毒|大麻|贩毒|吸毒/,
  /枪支|弹药|炸药|爆炸物|制爆/,
  /诈骗|洗钱|套现|跑分/,
  /自杀|轻生|自残/,
  /暴恐|恐怖袭击/
]

const ALLOWED_FIELDS = ['nickname', 'gender', 'birthday', 'occupation']

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { action } = event
  const data = event.data || {}

  try {
    switch (action) {
      case 'updateProfile':
        return await updateProfile(openid, data)
      case 'updateAvatar':
        return await updateAvatar(openid, data)
      case 'updateCustomCategories':
        return await updateCustomCategories(openid, data)
      case 'updateTheme':
        return await updateTheme(openid, data)
      default:
        return { success: false, message: '未知操作' }
    }
  } catch (e) {
    console.error('[users] action failed:', {
      action,
      openid,
      message: e && e.message,
      code: e && e.code
    })
    return { success: false, message: '保存失败，请稍后重试' }
  }
}

// ====== 昵称 / 性别 / 生日 / 职业 ======
async function updateProfile(openid, data) {
  const patch = {}
  const keys = Object.keys(data || {})

  for (const key of keys) {
    if (!ALLOWED_FIELDS.includes(key)) {
      return { success: false, message: '含不支持的字段' }
    }
    const value = normalizeStr(data[key])

    if (key === 'nickname') {
      if (value.length > MAX_NICKNAME_LEN) return { success: false, message: '昵称最长 20 字' }
      if (!(await isSafeText([value]))) return { success: false, message: '内容可能不适合展示，请修改后再试' }
    }
    if (key === 'occupation') {
      if (value.length > MAX_OCCUPATION_LEN) return { success: false, message: '职业最长 20 字' }
      if (!(await isSafeText([value]))) return { success: false, message: '内容可能不适合展示，请修改后再试' }
    }
    if (key === 'gender' && !VALID_GENDERS.includes(value)) {
      return { success: false, message: '性别参数错误' }
    }
    if (key === 'birthday' && value && !isValidDate(value)) {
      return { success: false, message: '日期格式错误' }
    }

    patch[key] = value
  }

  if (Object.keys(patch).length === 0) {
    return { success: false, message: '没有可更新的字段' }
  }

  const res = await db.collection('users')
    .where({ _openid: openid })
    .update({ data: { ...patch, updatedAt: new Date() } })

  return { success: true, updated: !!(res.stats && res.stats.updated) }
}

// ====== 头像（cloud:// fileID 落库，且必须属于当前用户） ======
async function updateAvatar(openid, data) {
  const avatarUrl = normalizeStr(data.avatarUrl)
  if (avatarUrl && !avatarUrl.startsWith('cloud://')) {
    return { success: false, message: '头像格式错误' }
  }
  // H4 修复：fileID 归属校验——头像必须位于 avatars/<openid>_ 前缀下，防止引用他人文件
  if (avatarUrl && avatarUrl.indexOf('/avatars/' + openid + '_') === -1) {
    return { success: false, message: '头像文件不合法' }
  }
  const res = await db.collection('users')
    .where({ _openid: openid })
    .update({ data: { avatarUrl, updatedAt: new Date() } })
  return { success: true, updated: !!(res.stats && res.stats.updated) }
}

// ====== 主题（M6 修复：收敛为云函数写入，白名单校验） ======
async function updateTheme(openid, data) {
  const theme = normalizeStr(data.theme)
  // 仅允许 4 套预设主题与 user_<时间戳> 形态的用户主题 ID
  if (!/^(mint|fresh|dark|skyBlue|user_\d{6,})$/.test(theme)) {
    return { success: false, message: '主题参数错误' }
  }
  const res = await db.collection('users')
    .where({ _openid: openid })
    .update({ data: { theme, updatedAt: new Date() } })
  return { success: true, theme, updated: !!(res.stats && res.stats.updated) }
}

// ====== 自定义分类（全量替换 + 清洗去重 + 上限） ======
async function updateCustomCategories(openid, data) {
  const raw = Array.isArray(data.categories) ? data.categories : []
  const seen = new Set()
  const clean = []

  for (const item of raw) {
    if (clean.length >= MAX_CATEGORIES) break
    if (!item || typeof item !== 'object') continue

    const name = normalizeStr(item.name)
    const icon = normalizeStr(item.icon)
    if (!name || name.length > MAX_CATEGORY_NAME_LEN) continue
    if (icon.length > MAX_CATEGORY_ICON_LEN) continue
    if (seen.has(name)) continue

    if (!(await isSafeText([name]))) return { success: false, message: '分类内容可能不适合展示，请修改后再试' }

    seen.add(name)
    clean.push({ name, icon: icon || '📌' })
  }

  const res = await db.collection('users')
    .where({ _openid: openid })
    .update({ data: { customCategories: clean, updatedAt: new Date() } })

  return { success: true, categories: clean, updated: !!(res.stats && res.stats.updated) }
}

// ====== 工具函数 ======
function normalizeStr(value) {
  return String(value == null ? '' : value).trim().slice(0, 60)
}

function isValidDate(dateStr) {
  if (!DATE_PATTERN.test(dateStr)) return false
  const parts = dateStr.split('-').map(Number)
  const d = new Date(dateStr + 'T00:00:00')
  return !isNaN(d.getTime()) &&
    d.getFullYear() === parts[0] &&
    d.getMonth() + 1 === parts[1] &&
    d.getDate() === parts[2]
}

function isUnsafeText(text) {
  text = String(text || '')
  if (!text) return false
  return BLOCK_PATTERNS.some(pattern => pattern.test(text))
}

async function isSafeText(texts) {
  const joined = texts.filter(Boolean).join('\n')
  if (!joined) return true
  if (isUnsafeText(joined)) return false
  try {
    const res = await cloud.openapi.security.msgSecCheck({
      version: 2,
      openid: cloud.getWXContext().OPENID,
      scene: 2,
      content: joined
    })
    const errCode = res.errCode === undefined ? res.errcode : res.errCode
    const result = res.result || {}
    if (errCode === 87014) return false
    if (errCode !== undefined && errCode !== 0) return true
    return result.suggest === 'pass' || result.label === 100 || result.label === '100' || (!result.suggest && result.label === undefined)
  } catch (err) {
    // H1 修复：权限/配置错误 fail-closed；仅瞬时网络异常才降级放行
    const errCode = err && (err.errCode === undefined ? err.errcode : err.errCode)
    const msg = String((err && (err.errMsg || err.message)) || '')
    if (errCode === 87014) return false
    if (/permission|unauthorized|not authorized|权限|未授权/i.test(msg)) {
      console.error('[users] msgSecCheck permission/config error, fail-closed:', msg)
      return false
    }
    console.warn('[users] msgSecCheck skipped:', msg)
    return true
  }
}