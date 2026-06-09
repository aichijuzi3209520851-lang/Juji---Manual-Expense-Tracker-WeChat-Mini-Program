const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const MAX_IMPORT_COUNT = 1000
const MAX_IMPORT_BYTES = 1024 * 1024
const MAX_AMOUNT = 99999999.99
const MAX_CATEGORY_LEN = 20
const MAX_NOTE_LEN = 200
const MAX_MOOD_LEN = 10
const VALID_TYPES = ['expense', 'income']
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MAX_EXPORT_COUNT = 10000
const EXPORT_PAGE_SIZE = 100
const BLOCK_PATTERNS = [
  /赌博|博彩|赌球|私彩|代购彩票/,
  /色情|裸聊|约炮|成人视频|淫秽/,
  /毒品|冰毒|大麻|贩毒|吸毒/,
  /枪支|弹药|炸药|爆炸物|制爆/,
  /诈骗|洗钱|套现|跑分/,
  /自杀|轻生|自残/,
  /暴恐|恐怖袭击/
]

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { action } = event

  if (action === 'export') return handleExport(openid)
  if (action === 'import') return handleImport(openid, event.bills)
  return { success: false, message: '未知操作' }
}

// ====== 导出：查询全部账单，返回 JSON ======
async function handleExport(openid) {
  try {
    const bills = await getAll(db.collection('bills')
      .where({ _openid: openid })
      .orderBy('date', 'desc')
      .orderBy('createdAt', 'desc')
    )

    if (!bills || bills.length === 0) {
      return { success: false, message: '暂无账单数据可导出' }
    }

    // 清除内部字段，只保留记账信息
    const clean = bills.map(b => ({
      type: b.type,
      amount: b.amount,
      category: b.category,
      date: b.date,
      note: b.note || '',
      photoUrl: b.photoUrl || '',
      mood: b.mood || '',
      createdAt: b.createdAt
    }))

    return { success: true, bills: clean, count: clean.length }
  } catch (err) {
    console.error('[export] failed:', err)
    return { success: false, message: '导出失败，请稍后重试' }
  }
}

// ====== 导入：批量写入账单 ======
async function handleImport(openid, bills) {
  if (!Array.isArray(bills) || bills.length === 0) {
    return { success: false, message: '没有可导入的数据' }
  }
  if (bills.length > MAX_IMPORT_COUNT) {
    return { success: false, message: `单次最多导入 ${MAX_IMPORT_COUNT} 条` }
  }
  if (Buffer.byteLength(JSON.stringify(bills), 'utf8') > MAX_IMPORT_BYTES) {
    return { success: false, message: '导入文件过大，请分批导入' }
  }

  // 清洗：仅保留核心字段，强制删除 _id / _openid
  const clean = bills
    .map(sanitizeBill)
    .filter(Boolean)

  if (clean.length === 0) {
    return { success: false, message: '未找到有效账单记录' }
  }

  // 分批写入，每批 20 条
  const BATCH = 20
  let imported = 0
  for (let i = 0; i < clean.length; i += BATCH) {
    const chunk = clean.slice(i, i + BATCH)
    const tasks = chunk.map(b =>
      db.collection('bills').add({ data: { ...b, _openid: openid } })
    )
    await Promise.all(tasks)
    imported += chunk.length
  }

  return { success: true, count: imported }
}

async function getAll(query) {
  const all = []
  for (let offset = 0; offset < MAX_EXPORT_COUNT;) {
    const { data = [] } = await query
      .skip(offset)
      .limit(Math.min(EXPORT_PAGE_SIZE, MAX_EXPORT_COUNT - offset))
      .get()

    if (!data.length) break
    all.push(...data)
    if (data.length < EXPORT_PAGE_SIZE) break
    offset += data.length
  }
  return all
}

function sanitizeBill(b) {
  if (!b || typeof b !== 'object') return null

  const amount = parseFloat(b.amount)
  const date = String(b.date || '').slice(0, 10)
  if (isNaN(amount) || amount <= 0 || amount > MAX_AMOUNT) return null
  if (!isValidDateString(date)) return null

  const category = String(b.category || '其他').trim().slice(0, MAX_CATEGORY_LEN)
  if (!category) return null

  const note = String(b.note || '').slice(0, MAX_NOTE_LEN)
  const mood = String(b.mood || '').slice(0, MAX_MOOD_LEN)
  if (containsUnsafeText([category, note, mood].join('\n'))) return null

  const createdAt = normalizeCreatedAt(b.createdAt)
  return {
    type: VALID_TYPES.includes(b.type) ? b.type : 'expense',
    amount,
    category,
    date,
    note,
    photoUrl: '',
    mood,
    createdAt
  }
}

function containsUnsafeText(text) {
  text = String(text || '')
  if (!text) return false
  return BLOCK_PATTERNS.some(pattern => pattern.test(text))
}

function normalizeCreatedAt(value) {
  if (!value) return new Date()
  const d = new Date(value)
  return isNaN(d.getTime()) ? new Date() : d
}

function isValidDateString(date) {
  if (!DATE_PATTERN.test(date)) return false
  const parts = date.split('-').map(Number)
  const d = new Date(date + 'T00:00:00')
  return !isNaN(d.getTime()) &&
    d.getFullYear() === parts[0] &&
    d.getMonth() + 1 === parts[1] &&
    d.getDate() === parts[2]
}
