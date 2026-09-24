/**
 * 更新公告读写工具
 * ────────────────────────────────────────────────────────────
 * 弹窗判定规则（对齐大厂通用做法）：
 *   1. 首次安装（本地没有任何版本记录）→ 不弹
 *      新用户本来就该看引导，且首次启动微信还会弹隐私协议，再叠一个弹窗体验很差。
 *      首次安装时会静默记下当前版本号，作为「以后判断是否升级」的基线。
 *   2. 版本升级（记录过的版本 ≠ 当前版本）→ 弹一次，弹完立刻记为已读。
 *   3. 同一版本重复进入 → 不再弹。
 */
const { VERSION } = require('../config/env')
const { CHANGELOGS } = require('../config/changelog')

const SEEN_KEY = 'juji_changelog_seen_version'

// 调试开关：置 true 则每次进入首页都弹（方便验收弹窗样式），上线务必改回 false
const DEBUG_FORCE_SHOW = false

// 更新项类型 → 展示文案
const TYPE_LABEL = {
  feature: '新增',
  optimize: '优化',
  fix: '修复'
}

/**
 * 给每条公告的 items 补上 label（新增 / 优化 / 修复），
 * 这样 WXML 里直接 {{it.label}} 即可，不用在模板里做映射。
 */
function decorate(list) {
  return (list || []).map(function (entry) {
    return Object.assign({}, entry, {
      items: (entry.items || []).map(function (it) {
        return Object.assign({}, it, { label: TYPE_LABEL[it.type] || '更新' })
      })
    })
  })
}

function getLatest() {
  const list = decorate(CHANGELOGS)
  return list.length ? list[0] : null
}

function getAll() {
  return decorate(CHANGELOGS)
}

function getTypeLabel(type) {
  return TYPE_LABEL[type] || '更新'
}

function readSeen() {
  try {
    return wx.getStorageSync(SEEN_KEY) || ''
  } catch (err) {
    return ''
  }
}

function markSeen(version) {
  try {
    wx.setStorageSync(SEEN_KEY, version || VERSION)
  } catch (err) {
    // 存储失败不阻断主流程：最多表现为下次还会弹一次
  }
}

/**
 * 是否有「未读」的更新公告（无副作用，仅用于「我的」页显示小红点）
 * @returns {boolean}
 */
function hasUnread() {
  const seen = readSeen()
  if (!seen) return false // 首次安装不算未读
  return seen !== VERSION
}

/**
 * 是否需要弹出更新公告
 * @returns {boolean}
 */
function shouldShowUpdate() {
  if (DEBUG_FORCE_SHOW) return true
  if (!getLatest()) return false

  const seen = readSeen()
  if (!seen) {
    // 首次安装：记下基线，不弹
    markSeen(VERSION)
    return false
  }
  return seen !== VERSION
}

module.exports = {
  VERSION,
  SEEN_KEY,
  getLatest,
  getAll,
  getTypeLabel,
  hasUnread,
  shouldShowUpdate,
  markSeen
}
