const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  const { format = 'csv', startDate, endDate } = event

  try {
    // 查询当前用户的所有账单
    const query = { _openid: openid }
    if (startDate) {
      query.date = _.gte(startDate)
    }
    if (endDate) {
      query.date = query.date ? _.and(query.date, _.lte(endDate)) : _.lte(endDate)
    }

    const MAX_EXPORT = 10000
    const { data: bills } = await db.collection('bills')
      .where(query)
      .orderBy('date', 'desc')
      .orderBy('createdAt', 'desc')
      .limit(MAX_EXPORT)
      .get()

    if (!bills || bills.length === 0) {
      return { success: false, message: '暂无账单数据可导出' }
    }

    const csvContent = generateCSV(bills)

    // 上传到云存储
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const filename = `exports/juji_export_${timestamp}.csv`
    const uploadRes = await cloud.uploadFile({
      cloudPath: filename,
      fileContent: Buffer.from(csvContent, 'utf-8')
    })

    return {
      success: true,
      fileID: uploadRes.fileID,
      filename: `橘记账单_${timestamp}.csv`,
      count: bills.length
    }
  } catch (err) {
    console.error('导出失败:', err)
    return { success: false, message: '导出失败，请稍后重试' }
  }
}

// 生成 CSV
function generateCSV(bills) {
  // BOM 保证 Excel 打开不乱码
  const BOM = '﻿'
  const header = '日期,类型,分类,金额,备注\n'

  const rows = bills.map(b => {
    const type = b.type === 'income' ? '收入' : '支出'
    const date = escapeCSV(b.date || '')
    const category = escapeCSV(b.category || '')
    const amount = b.amount || 0
    const note = escapeCSV(b.note || '')
    return `${date},${type},${category},${amount},${note}`
  }).join('\n')

  return BOM + header + rows
}

// CSV 转义：包含逗号或引号的字段加双引号
function escapeCSV(str) {
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}
