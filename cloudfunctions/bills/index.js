// 橘记 — bills 云函数（服务端校验 + 写入）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const MAX_AMOUNT = 99999999.99
const MAX_NOTE_LEN = 200
const MAX_BATCH = 10
const BLOCK_PATTERNS = [
  /赌博|博彩|赌球|私彩|代购彩票/,
  /色情|裸聊|约炮|成人视频|淫秽/,
  /毒品|冰毒|大麻|贩毒|吸毒/,
  /枪支|弹药|炸药|爆炸物|制爆/,
  /诈骗|洗钱|套现|跑分/,
  /自杀|轻生|自残/,
  /暴恐|恐怖袭击/
]

function validate(data) {
  if (!data || !data.type || !['expense', 'income'].includes(data.type)) return '类型错误'
  const amount = parseFloat(data.amount)
  if (isNaN(amount) || amount <= 0 || amount > MAX_AMOUNT) return '金额无效'
  if (!data.category || typeof data.category !== 'string' || !data.category.trim()) return '分类不能为空'
  if (data.category.length > 20) return '分类名过长'
  if (containsUnsafeText([data.category, data.note, data.mood].join('\n'))) return '内容可能不适合展示，请修改后再试'
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

function containsUnsafeText(text) {
  text = String(text || '')
  if (!text) return false
  return BLOCK_PATTERNS.some(pattern => pattern.test(text))
}

function buildBillDoc(data, openid) {
  return {
    _openid: openid,
    type: data.type,
    amount: parseFloat(data.amount),
    category: data.category.trim(),
    date: data.date,
    note: (data.note || '').slice(0, MAX_NOTE_LEN),
    photoUrl: data.photoUrl || '',
    mood: data.mood || '',
    createdAt: new Date()
  }
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
          data: buildBillDoc(data, wxContext.OPENID)
        })
        return { success: true, id: res._id }
      } catch (e) {
        logFunctionError('create', e, wxContext)
        return { success: false, message: e.message }
      }
    }

    case 'batchCreate': {
      const bills = Array.isArray(data && data.bills) ? data.bills : []
      if (!bills.length) return { success: false, message: '没有可记录的账单' }
      if (bills.length > MAX_BATCH) return { success: false, message: '一次最多记录 10 笔' }

      const results = []
      for (let i = 0; i < bills.length; i++) {
        const item = bills[i]
        const err = validate(item)
        if (err) {
          results.push({ index: i, success: false, message: err })
          continue
        }
        try {
          const res = await db.collection('bills').add({
            data: buildBillDoc(item, wxContext.OPENID)
          })
          results.push({ index: i, success: true, id: res._id })
        } catch (e) {
          logFunctionError('batchCreate', e, wxContext)
          results.push({ index: i, success: false, message: e.message })
        }
      }
      const created = results.filter(r => r.success).length
      return { success: created > 0, created, total: bills.length, results }
    }

    case 'delete': {
      if (!data.billId) return { success: false, message: '缺少账单ID' }
      try {
        const bill = await db.collection('bills').doc(data.billId).get()
        if (!bill.data || bill.data._openid !== wxContext.OPENID) {
          return { success: false, message: '无权删除此账单' }
        }
        // 软删除模式：写入 isDeleted: true 与 deletedAt，满足合规与防误删
        await db.collection('bills').doc(data.billId).update({
          data: {
            isDeleted: true,
            deletedAt: new Date()
          }
        })
        return { success: true }
      } catch (e) {
        logFunctionError('delete', e, wxContext)
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
        logFunctionError('update', e, wxContext)
        return { success: false, message: e.message }
      }
    }

    default:
      return { success: false, message: '未知操作' }
  }
}

function logFunctionError(action, err, wxContext) {
  console.error('[bills] action failed:', {
    action,
    openid: wxContext && wxContext.OPENID,
    message: err && err.message,
    code: err && err.code
  })
}
