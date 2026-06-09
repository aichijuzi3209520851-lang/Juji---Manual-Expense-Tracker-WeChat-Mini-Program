const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const PAGE_SIZE = 100
const MAX_RECORDS = 20000
const FILE_BATCH_SIZE = 50

exports.main = async () => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    const [bills, budgets, users] = await Promise.all([
      getAll(db.collection('bills').where({ _openid: openid })),
      getAll(db.collection('budgets').where({ _openid: openid })),
      getAll(db.collection('users').where({ _openid: openid }))
    ])

    const fileIDs = collectFileIDs(bills, users)

    const deletedBills = await removeDocs('bills', bills)
    const deletedBudgets = await removeDocs('budgets', budgets)
    const deletedFiles = await removeFiles(fileIDs)
    const resetUsers = await resetUserProfiles(users)

    return {
      success: true,
      deletedBills,
      deletedBudgets,
      deletedFiles,
      resetUsers
    }
  } catch (err) {
    console.error('[clearUserData] failed:', {
      openid,
      message: err && err.message,
      code: err && err.code
    })
    return { success: false, message: '清除失败，请稍后重试' }
  }
}

async function getAll(query) {
  const all = []
  for (let offset = 0; offset < MAX_RECORDS;) {
    const { data = [] } = await query.skip(offset).limit(PAGE_SIZE).get()
    if (!data.length) break
    all.push(...data)
    if (data.length < PAGE_SIZE) break
    offset += data.length
  }
  return all
}

async function removeDocs(collection, docs) {
  let count = 0
  for (const doc of docs) {
    if (!doc || !doc._id) continue
    await db.collection(collection).doc(doc._id).remove()
    count++
  }
  return count
}

async function resetUserProfiles(users) {
  let count = 0
  for (const user of users) {
    if (!user || !user._id) continue
    await db.collection('users').doc(user._id).update({
      data: {
        nickname: '',
        avatarUrl: '',
        gender: '',
        birthday: '',
        occupation: '',
        customCategories: [],
        budgetDefault: 2000,
        updatedAt: new Date()
      }
    })
    count++
  }
  return count
}

async function removeFiles(fileIDs) {
  const unique = Array.from(new Set(fileIDs.filter(Boolean)))
  let deleted = 0
  for (let i = 0; i < unique.length; i += FILE_BATCH_SIZE) {
    const fileList = unique.slice(i, i + FILE_BATCH_SIZE)
    const res = await cloud.deleteFile({ fileList })
    const deletedList = (res.fileList || []).filter(item => item.status === 0)
    deleted += deletedList.length
  }
  return deleted
}

function collectFileIDs(bills, users) {
  const fileIDs = []
  bills.forEach(bill => {
    if (isCloudFileID(bill.photoUrl)) fileIDs.push(bill.photoUrl)
  })
  users.forEach(user => {
    if (isCloudFileID(user.avatarUrl)) fileIDs.push(user.avatarUrl)
  })
  return fileIDs
}

function isCloudFileID(value) {
  return typeof value === 'string' && value.startsWith('cloud://')
}
