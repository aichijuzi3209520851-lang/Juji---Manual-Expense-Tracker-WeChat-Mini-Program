// 橘记JUJI — bills 云函数（服务端校验 + 写入）
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
// 违禁词库：与 miniprogram/utils/sensitiveWords.js 保持一致（云函数独立部署，无法 require 前端目录）。
// 前端已在输入/提交两处拦截，这里是防直连云接口写入的最后一道防线；改词库请两边同步。
const BLOCK_WORDS = [
  // 色情低俗
  '黄赌毒', '色情', '情色', '淫秽', '涉黄', '黄片', '黄网', '黄色视频', '黄色网站', '黄色小说',
  '黄色图片', '黄色影片', '黄色漫画', '黄色录像', '毛片', '三级片', '成人影片', '成人视频',
  '成人电影', '色情网站', '色情视频', '色情聊天', '裸聊', '约炮', '招嫖', '嫖娼', '卖淫',
  '性交易', '性服务', '一夜情', '援交', '包养', '换妻', '裸照', '偷拍', '迷奸', '迷药',
  '催情药', '春药', '强奸', '猥亵', '性侵', 'porn', 'pornhub', 'xvideos',
  // 赌博博彩
  '赌博', '赌场', '赌球', '赌马', '赌资', '赌局', '赌债', '赌徒', '聚赌', '网赌', '网络赌博',
  '境外赌博', '地下赌场', '赌博机', '老虎机', '博彩', '六合彩', '私彩', '地下彩票', '代购彩票',
  '时时彩', '北京赛车', '外围球', '投注', '赌注', '押注', '开盘口', '牌九', '麻将赌博',
  '赌狗', 'bet365', '1xbet', 'casino',
  // 毒品
  '毒品', '吸毒', '贩毒', '制毒', '运毒', '藏毒', '毒资', '冰毒', '海洛因', '大麻', '摇头丸',
  'k粉', '可卡因', '吗啡', '鸦片', '罂粟', '甲基苯丙胺', '注射毒品', '买卖毒品', '毒品交易',
  'cocaine', 'heroin', 'marijuana', 'methamphetamine', 'mdma',
  // 暴力武器
  '枪支', '一把枪', '买枪', '卖枪', '枪械', '弹药', '子弹', '手枪', '步枪', '猎枪', '制枪', '炸药',
  '炸弹', '爆炸物', '制爆', '雷管', '导火索', '火药', '管制刀具', '恐怖袭击', '暴恐',
  '雇凶', '买凶',
  // 违法交易
  '诈骗', '电信诈骗', '网络诈骗', '金融诈骗', '骗保', '骗贷', '洗钱', '套现', '跑分', '走私',
  '偷渡', '办假证', '假证', '代开发票', '虚开发票', '假发票', '传销', '非法集资', '高利贷',
  '裸贷', '校园贷', '买卖银行卡', '出售银行卡', '出售个人信息', '盗号', '黑客攻击', '黑灰产',
  '黑产', '刷单返利',
  // 自伤自杀
  '自杀', '自残', '轻生', '割腕', '烧炭', '跳楼', '跳桥', '服毒', '安乐死'
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
  const norm = normalizeForMatch(text)
  if (!norm) return false
  return BLOCK_WORDS.some(word => norm.indexOf(normalizeForMatch(word)) !== -1)
}

// 与前端 utils/sensitiveWords.js 同款归一化：全角转半角 + 小写 + 剔除空白标点，
// 让「冰-毒」「大 麻」这类变体同样拦得住
function normalizeForMatch(text) {
  return String(text || '')
    .replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/\u3000/g, ' ')
    .toLowerCase()
    .replace(/[\s\u0000-\u002F\u003A-\u0040\u005B-\u0060\u007B-\u007E\u2000-\u206F\u3000-\u303F\uFF00-\uFFEF]+/g, '')
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
