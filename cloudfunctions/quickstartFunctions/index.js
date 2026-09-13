const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 新用户默认资料（服务端模板，客户端不可注入）
function buildDefaultUser() {
  const now = new Date()
  return {
    nickname: '',
    avatarUrl: '',
    gender: '',
    customCategories: [],
    theme: 'mint',
    budgetDefault: 2000,
    createdAt: now,
    lastLoginAt: now
  }
}

// M6 修复：users 文档创建与 lastLoginAt 由客户端直写收敛为服务端操作，
// 服务端时间戳不可伪造，字段为固定模板。
async function syncUser(openid) {
  const { data } = await db.collection('users').where({ _openid: openid }).limit(1).get()

  if (data.length === 0) {
    const doc = buildDefaultUser()
    const addRes = await db.collection('users').add({
      data: { ...doc, _openid: openid }
    })
    return {
      success: true,
      created: true,
      userInfo: { ...doc, _id: addRes._id, _openid: openid }
    }
  }

  const existing = data[0]
  await db.collection('users').doc(existing._id).update({
    data: { lastLoginAt: new Date() }
  })
  return { success: true, created: false, userInfo: existing }
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()

  if (event.type === 'getOpenId') {
    return {
      openid: wxContext.OPENID,
      appid: wxContext.APPID,
      unionid: wxContext.UNIONID
    }
  }

  if (event.type === 'syncUser') {
    try {
      return await syncUser(wxContext.OPENID)
    } catch (err) {
      console.error('[quickstartFunctions] syncUser failed:', {
        openid: wxContext.OPENID,
        message: err && err.message,
        code: err && err.code
      })
      return { success: false, message: '用户资料同步失败' }
    }
  }

  return { success: false, message: '未知操作' }
}
