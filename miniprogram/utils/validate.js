// 橘记 — 输入校验工具

const MAX_AMOUNT = 99999999.99
const MAX_NOTE_LEN = 200
const MAX_CATEGORY_LEN = 20

/**
 * 校验一笔账单的完整数据
 * @returns {{ valid: boolean, message: string }}
 */
function validateBill(data) {
  // 类型
  if (!data.type || !['expense', 'income'].includes(data.type)) {
    return { valid: false, message: '类型错误' }
  }

  // 金额
  const amount = parseFloat(data.amount)
  if (isNaN(amount) || amount <= 0) {
    return { valid: false, message: '请输入正确金额' }
  }
  if (amount > MAX_AMOUNT) {
    return { valid: false, message: '金额超出上限' }
  }
  // 小数点最多 2 位
  const decimalPart = String(data.amount).split('.')[1]
  if (decimalPart && decimalPart.length > 2) {
    return { valid: false, message: '金额最多两位小数' }
  }

  // 分类
  if (!data.category || typeof data.category !== 'string' || data.category.trim().length === 0) {
    return { valid: false, message: '请选择分类' }
  }
  if (data.category.length > MAX_CATEGORY_LEN) {
    return { valid: false, message: '分类名不能超过20字' }
  }

  // 日期：YYYY-MM-DD，不能是未来
  const datePattern = /^\d{4}-\d{2}-\d{2}$/
  if (!datePattern.test(data.date)) {
    return { valid: false, message: '日期格式错误' }
  }
  const dateObj = new Date(data.date + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (isNaN(dateObj.getTime()) || dateObj > today) {
    return { valid: false, message: '日期不能是未来' }
  }

  // 备注
  if (data.note && data.note.length > MAX_NOTE_LEN) {
    return { valid: false, message: '备注不能超过200字' }
  }

  // 照片 URL（前端传本地路径或已上传的 cloud:// 均可）
  // 不做前端校验，云函数端做最终检查

  return { valid: true, message: '' }
}

/**
 * 校验预算
 */
function validateBudget(amount) {
  const val = parseFloat(amount)
  if (isNaN(val) || val <= 0) {
    return { valid: false, message: '请输入合理金额' }
  }
  if (val > 999999) {
    return { valid: false, message: '预算金额过大' }
  }
  return { valid: true, message: '' }
}

module.exports = { validateBill, validateBudget }
