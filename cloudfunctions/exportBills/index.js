const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  const { format = 'csv', startDate, endDate } = event

  try {
    // 查用户信息（昵称 + 性别）用于 CSV 顶部 meta
    let nickname = '橘记用户'
    let genderText = '未设置'
    try {
      const { data: users } = await db.collection('users').where({ _openid: openid }).limit(1).get()
      if (users && users.length > 0) {
        nickname = users[0].nickname || '橘记用户'
        const g = users[0].gender
        genderText = g === 'male' ? '男' : g === 'female' ? '女' : '未设置'
      }
    } catch (e) {
      // 读取失败不阻塞导出
    }

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

    const csvContent = generateCSV(bills, { nickname, genderText })

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
function generateCSV(bills, meta) {
  // BOM 保证 Excel 打开不乱码
  const BOM = '﻿'
  const metaBlock =
    escapeCSV('橘记账单导出') + '\n' +
    escapeCSV(`用户：${meta.nickname}    性别：${meta.genderText}`) + '\n' +
    escapeCSV(`共 ${bills.length} 条`) + '\n\n'
  const header = '日期,类型,分类,金额,备注,心情\n'

  const rows = bills.map(b => {
    const type = b.type === 'income' ? '收入' : '支出'
    const date = escapeCSV(b.date || '')
    const category = escapeCSV(b.category || '')
    const amount = b.amount || 0
    const note = escapeCSV(b.note || '')
    const mood = escapeCSV(b.mood || '')
    return `${date},${type},${category},${amount},${note},${mood}`
  }).join('\n')

  return BOM + metaBlock + header + rows
}

// CSV 转义：包含逗号或引号的字段加双引号
function escapeCSV(str) {
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}
