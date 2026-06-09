const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  const { format = 'csv', startDate, endDate } = event

  try {
    // 查用户信息用于 CSV 顶部 meta
    let nickname = '橘记用户'
    let genderText = '未设置'
    let birthday = ''
    let zodiac = ''
    let occupation = ''
    try {
      const { data: users } = await db.collection('users').where({ _openid: openid }).limit(1).get()
      if (users && users.length > 0) {
        const u = users[0]
        nickname = u.nickname || '橘记用户'
        const g = u.gender
        genderText = g === 'male' ? '男' : g === 'female' ? '女' : '未设置'
        birthday = u.birthday || ''
        occupation = u.occupation || ''
        if (birthday) zodiac = getZodiac(birthday)
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

    const csvContent = generateCSV(bills, { nickname, genderText, birthday, zodiac, occupation })

    // 上传到云存储
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const random = Math.random().toString(36).slice(2, 10)
    const filename = `exports/${openid}/juji_export_${timestamp}_${random}.csv`
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

// 星座推算
function getZodiac(birthday) {
  if (!birthday) return ''
  const parts = birthday.split('-')
  const m = parseInt(parts[1], 10)
  const d = parseInt(parts[2], 10)
  const signs = [
    { name: '摩羯座', start: [1, 1], end: [1, 19] },
    { name: '水瓶座', start: [1, 20], end: [2, 18] },
    { name: '双鱼座', start: [2, 19], end: [3, 20] },
    { name: '白羊座', start: [3, 21], end: [4, 19] },
    { name: '金牛座', start: [4, 20], end: [5, 20] },
    { name: '双子座', start: [5, 21], end: [6, 21] },
    { name: '巨蟹座', start: [6, 22], end: [7, 22] },
    { name: '狮子座', start: [7, 23], end: [8, 22] },
    { name: '处女座', start: [8, 23], end: [9, 22] },
    { name: '天秤座', start: [9, 23], end: [10, 23] },
    { name: '天蝎座', start: [10, 24], end: [11, 22] },
    { name: '射手座', start: [11, 23], end: [12, 21] },
    { name: '摩羯座', start: [12, 22], end: [12, 31] }
  ]
  for (const z of signs) {
    const afterStart = (m > z.start[0]) || (m === z.start[0] && d >= z.start[1])
    const beforeEnd = (m < z.end[0]) || (m === z.end[0] && d <= z.end[1])
    if (afterStart && beforeEnd) return z.name
  }
  return ''
}

// 生成 CSV
function generateCSV(bills, meta) {
  // BOM 保证 Excel 打开不乱码
  const BOM = '﻿'
  const profileLine = [
    `用户：${meta.nickname}`,
    `性别：${meta.genderText}`,
    meta.birthday ? `出生日期：${meta.birthday}` : '',
    meta.zodiac ? `星座：${meta.zodiac}` : '',
    meta.occupation ? `职业：${meta.occupation}` : ''
  ].filter(Boolean).join('    ')
  const metaBlock =
    escapeCSV('橘记账单导出') + '\n' +
    escapeCSV(profileLine) + '\n' +
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
  str = String(str)
  if (/^[=+\-@]/.test(str)) {
    str = "'" + str
  }
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}
