const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

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
    const MAX = 10000
    const { data: bills } = await db.collection('bills')
      .where({ _openid: openid })
      .orderBy('date', 'desc')
      .orderBy('createdAt', 'desc')
      .limit(MAX)
      .get()

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

  // 清洗：仅保留核心字段，强制删除 _id / _openid
  const VALID_TYPES = ['expense', 'income']
  const clean = bills
    .map(b => ({
      type: VALID_TYPES.includes(b.type) ? b.type : 'expense',
      amount: parseFloat(b.amount) || 0,
      category: String(b.category || '其他').slice(0, 10),
      date: String(b.date || '').slice(0, 10),
      note: String(b.note || '').slice(0, 200),
      photoUrl: '',
      mood: String(b.mood || '').slice(0, 10),
      createdAt: b.createdAt || new Date().toISOString()
    }))
    .filter(b => b.amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(b.date))

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
