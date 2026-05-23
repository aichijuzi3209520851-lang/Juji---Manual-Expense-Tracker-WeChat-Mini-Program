// 橘记 — bills 云函数（服务端校验 + 写入）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const MAX_AMOUNT = 99999999.99
const MAX_NOTE_LEN = 200

function validate(data) {
  if (!data || !data.type || !['expense', 'income'].includes(data.type)) return '类型错误'
  const amount = parseFloat(data.amount)
  if (isNaN(amount) || amount <= 0 || amount > MAX_AMOUNT) return '金额无效'
  if (!data.category || typeof data.category !== 'string' || !data.category.trim()) return '分类不能为空'
  if (data.category.length > 20) return '分类名过长'
  const datePattern = /^\d{4}-\d{2}-\d{2}$/
  if (!datePattern.test(data.date)) return '日期格式错误'
  const dateObj = new Date(data.date + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (isNaN(dateObj.getTime())) return '日期格式错误'
  if (data.note && data.note.length > MAX_NOTE_LEN) return '备注过长'
  if (data.photoUrl && !data.photoUrl.startsWith('cloud://')) return '照片格式错误'
  return null
}

exports.main = async (event, context) => {
  const { action, data } = event
  const wxContext = cloud.getWXContext()

  switch (action) {
    case 'create': {
      const err = validate(data)
      if (err) return { success: false, message: err }

      try {
        const res = await db.collection('bills').add({
          data: {
            _openid: wxContext.OPENID,
            type: data.type,
            amount: parseFloat(data.amount),
            category: data.category.trim(),
            date: data.date,
            note: (data.note || '').slice(0, MAX_NOTE_LEN),
            photoUrl: data.photoUrl || '',
            mood: data.mood || '',
            createdAt: new Date()
          }
        })
        return { success: true, id: res._id }
      } catch (e) {
        return { success: false, message: e.message }
      }
    }

    case 'delete': {
      if (!data.billId) return { success: false, message: '缺少账单ID' }
      try {
        const bill = await db.collection('bills').doc(data.billId).get()
        if (!bill.data || bill.data._openid !== wxContext.OPENID) {
          return { success: false, message: '无权删除此账单' }
        }
        await db.collection('bills').doc(data.billId).remove()
        return { success: true }
      } catch (e) {
        return { success: false, message: e.message }
      }
    }

    case 'update': {
      const err = validate(data)
      if (err) return { success: false, message: err }
      if (!data.billId) return { success: false, message: '缺少账单ID' }

      try {
        // 所有权校验
        const bill = await db.collection('bills').doc(data.billId).get()
        if (!bill.data || bill.data._openid !== wxContext.OPENID) {
          return { success: false, message: '无权修改此账单' }
        }
        await db.collection('bills').doc(data.billId).update({
          data: {
            type: data.type,
            amount: parseFloat(data.amount),
            category: data.category.trim(),
            date: data.date,
            note: (data.note || '').slice(0, MAX_NOTE_LEN),
            photoUrl: data.photoUrl || '',
            mood: data.mood || ''
          }
        })
        return { success: true }
      } catch (e) {
        return { success: false, message: e.message }
      }
    }

    default:
      return { success: false, message: '未知操作' }
  }
}
