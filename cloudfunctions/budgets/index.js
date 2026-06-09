const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const MAX_BUDGET_AMOUNT = 999999
const MONTH_PATTERN = /^\d{4}-\d{2}$/

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const { action, data = {} } = event

  if (action !== 'upsert') {
    return { success: false, message: '未知操作' }
  }

  const err = validate(data)
  if (err) return { success: false, message: err }

  const amount = parseFloat(data.amount)
  const month = data.month

  try {
    const existing = await db.collection('budgets')
      .where({ _openid: wxContext.OPENID, month })
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get()

    if (existing.data.length > 0) {
      await db.collection('budgets').doc(existing.data[0]._id).update({
        data: { amount, updatedAt: new Date() }
      })
      return { success: true, id: existing.data[0]._id, month, amount }
    }

    const res = await db.collection('budgets').add({
      data: {
        _openid: wxContext.OPENID,
        month,
        amount,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    })
    return { success: true, id: res._id, month, amount }
  } catch (e) {
    console.error('[budgets] upsert failed:', {
      openid: wxContext.OPENID,
      month,
      message: e && e.message,
      code: e && e.code
    })
    return { success: false, message: e.message || '预算保存失败' }
  }
}

function validate(data) {
  const amount = parseFloat(data.amount)
  if (!data.month || typeof data.month !== 'string' || !MONTH_PATTERN.test(data.month)) {
    return '月份格式错误'
  }
  const monthNum = parseInt(data.month.slice(5, 7), 10)
  if (monthNum < 1 || monthNum > 12) return '月份格式错误'
  if (isNaN(amount) || amount < 0 || amount > MAX_BUDGET_AMOUNT) {
    return '请输入合理金额'
  }
  return null
}
