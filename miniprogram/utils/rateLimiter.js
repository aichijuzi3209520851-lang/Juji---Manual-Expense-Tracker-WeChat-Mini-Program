// 橘记 — 前端频率限制工具

/**
 * 简单节流：同一 key 在 intervalMs 毫秒内只能触发一次
 * 内存存储，小程序冷启动后重置
 */
const lastCallMap = {}

/**
 * 检查是否被限流
 * @param {string} key - 标识，如 'save_bill' / 'load_stats'
 * @param {number} intervalMs - 最小间隔（毫秒）
 * @returns {boolean} true=允许通过, false=被限流
 */
function throttle(key, intervalMs = 3000) {
  const now = Date.now()
  const last = lastCallMap[key] || 0
  if (now - last < intervalMs) {
    return false
  }
  lastCallMap[key] = now
  return true
}

/**
 * 记账保存防抖：3 秒内同一用户只能保存一次
 */
function canSaveBill() {
  return throttle('save_bill', 3000)
}

/**
 * 统计查询防抖：1 秒内不重复请求
 */
function canLoadStats() {
  return throttle('load_stats', 1000)
}

/**
 * 云函数调用计数器（前端本地计数，当日有效）
 * @returns {{ count: number, exceeded: boolean }}
 */
function checkDailyLimit(key = 'bills', maxPerDay = 500) {
  const today = new Date().toDateString()
  const storageKey = `daily_limit_${key}_${today}`
  let count = wx.getStorageSync(storageKey) || 0
  return {
    count,
    exceeded: count >= maxPerDay,
    increment() {
      count++
      wx.setStorageSync(storageKey, count)
    }
  }
}

module.exports = { canSaveBill, canLoadStats, checkDailyLimit }
