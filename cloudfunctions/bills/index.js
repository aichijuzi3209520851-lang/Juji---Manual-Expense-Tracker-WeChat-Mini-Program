// 橘记 — bills 云函数（服务端校验 + 写入）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const MAX_AMOUNT = 99999999.99
const MAX_NOTE_LEN = 200
const MAX_MOOD_LEN = 10
const MAX_BATCH = 10
const MAX_DAILY_BILLS = 500
const DAILY_LIMIT_FEATURE = 'bills'
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
  // 与客户端 validate.js 对齐：小数点最多 2 位（M2 修复）
  const decimalPart = String(data.amount).split('.')[1]
  if (decimalPart && decimalPart.length > 2) return '金额最多两位小数'
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
  if (data.mood && data.mood.length > MAX_MOOD_LEN) return '心情过长'
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
    mood: String(data.mood || '').slice(0, MAX_MOOD_LEN),
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

      // 服务端日限：客户端 500/天的本地计数可被绕过，这里做最终防线（F2 修复）
      const limit = await checkDailyLimit(wxContext.OPENID, 1)
      if (!limit.ok) {
        return { success: false, message: `今日记账已达上限（${MAX_DAILY_BILLS} 笔），请明天再来`, code: 'DAILY_LIMIT_EXCEEDED' }
      }

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

      const limit = await checkDailyLimit(wxContext.OPENID, bills.length)
      if (!limit.ok) {
        return { success: false, message: `今日记账已达上限（${MAX_DAILY_BILLS} 笔），请明天再来`, code: 'DAILY_LIMIT_EXCEEDED' }
      }

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
            mood: String(data.mood || '').slice(0, MAX_MOOD_LEN)
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

// ====== 服务端日限（原子计数；限流集合异常时放行并告警，保证记账可用性）=======
function getDateKey() {
  const beijingTime = new Date(Date.now() + 8 * 60 * 60 * 1000)
  return beijingTime.toISOString().slice(0, 10)
}

function makeUsageDocId(openid, date, feature) {
  return [openid, date, feature].join('_').replace(/[^\w-]/g, '_')
}

async function checkDailyLimit(openid, amount) {
  const date = getDateKey()
  const docId = makeUsageDocId(openid, date, DAILY_LIMIT_FEATURE)
  const ref = db.collection('ai_usage_limits').doc(docId)

  let current = null
  try {
    const res = await ref.get()
    current = (res && res.data) || null
  } catch (err) {
    const msg = String((err && (err.errMsg || err.message)) || '')
    if (/not exist|not found|document not exists/i.test(msg)) {
      current = null
    } else {
      console.warn('[bills] limit read failed, skip check:', msg)
      return { ok: true, unchecked: true }
    }
  }

  if (current && current.count + amount > MAX_DAILY_BILLS) {
    return { ok: false, count: current.count }
  }

  try {
    if (current) {
      await ref.update({ data: { count: _.inc(amount), updatedAt: new Date() } })
    } else {
      await ref.set({
        data: {
          _openid: openid,
          date,
          feature: DAILY_LIMIT_FEATURE,
          count: amount,
          limit: MAX_DAILY_BILLS,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      })
    }
  } catch (err) {
    const msg = String((err && (err.errMsg || err.message)) || '')
    if (/exist/i.test(msg)) {
      try {
        await ref.update({ data: { count: _.inc(amount), updatedAt: new Date() } })
      } catch (err2) {
        console.warn('[bills] limit inc failed, skip check:', String((err2 && (err2.errMsg || err2.message)) || ''))
      }
    } else {
      console.warn('[bills] limit write failed, skip check:', msg)
    }
  }
  return { ok: true }
}
