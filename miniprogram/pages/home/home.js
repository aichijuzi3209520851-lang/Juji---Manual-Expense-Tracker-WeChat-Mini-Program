const { applyTheme } = require('../../utils/theme')

const ICON_MAP = {
  '餐饮': '🍜', '交通': '🚇', '购物': '🛍️', '娱乐': '🎮',
  '学习': '📚', '日用': '🏠', '医疗': '💊', '工资': '💼',
  '兼职': '🧳', '理财': '💹', '红包': '🎁', '退款': '↩️', '其他': '📌'
}

const SEASONS = ['❄️ 冬','❄️ 冬','🌸 春','🌸 春','🌸 春','🌿 夏','🌿 夏','🌿 夏','🍂 秋','🍂 秋','🍂 秋','❄️ 冬']

const pad = n => String(n).padStart(2, '0')
const fmtDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function yesterdayStr() {
  const d = new Date(); d.setDate(d.getDate() - 1)
  return fmtDate(d)
}

function formatDateLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const yest = new Date(today); yest.setDate(today.getDate() - 1)
  const same = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  if (same(dt, today)) return '今天'
  if (same(dt, yest)) return '昨天'
  const wk = ['日', '一', '二', '三', '四', '五', '六'][dt.getDay()]
  return `${m}月${d}日 周${wk}`
}

Page({
  data: {
    todayExpense: '0.00',
    yesterdayExpense: '0.00',
    budget: { status: 'unset' },
    groupedBills: [],
    overviewFailed: false,
    season: SEASONS[new Date().getMonth()]
  },

  onShow() {
    applyTheme()
    this.updateCustomTabBar()
    this.loadOverview()
    this.loadRecentBills()
  },

  updateCustomTabBar() {
    if (typeof this.getTabBar !== 'function') return
    const tabBar = this.getTabBar()
    if (tabBar && typeof tabBar.updateSelected === 'function') {
      tabBar.updateSelected()
    }
  },

  async loadOverview() {
    const db = wx.cloud.database()
    const _ = db.command
    const today = fmtDate(new Date())
    const yesterday = yesterdayStr()
    const month = today.slice(0, 7)
    const monthStart = `${month}-01`
    const queryStart = yesterday < monthStart ? yesterday : monthStart

    try {
      const expRes = await db.collection('bills')
        .where({ type: 'expense', date: _.gte(queryStart).and(_.lte(today)) })
        .get()

      let todayExp = 0, yestExp = 0, monthSpent = 0
      expRes.data.forEach(b => {
        if (b.date === today) todayExp += b.amount
        if (b.date === yesterday) yestExp += b.amount
        if (b.date >= monthStart) monthSpent += b.amount
      })

      const budgetRes = await db.collection('budgets').where({ month }).get()
      const budgetDoc = budgetRes.data[0]

      let budget
      if (!budgetDoc || !budgetDoc.amount) {
        budget = { status: 'unset' }
      } else {
        const amount = budgetDoc.amount
        const remain = amount - monthSpent
        const percent = Math.min(Math.round((monthSpent / amount) * 100), 100)
        budget = remain >= 0
          ? { status: 'normal', amount: amount.toFixed(2), spent: monthSpent.toFixed(2), remain: remain.toFixed(2), percent }
          : { status: 'over', amount: amount.toFixed(2), spent: monthSpent.toFixed(2), over: Math.abs(remain).toFixed(2), percent: 100 }
      }

      this.setData({
        todayExpense: todayExp.toFixed(2),
        yesterdayExpense: yestExp.toFixed(2),
        budget
      })
    } catch (err) {
      console.error('加载概览失败:', err)
      this.setData({ overviewFailed: true })
    }
  },

  async loadRecentBills() {
    const db = wx.cloud.database()
    try {
      const res = await db.collection('bills')
        .orderBy('createdAt', 'desc')
        .limit(30)
        .get()

      const groupMap = {}
      res.data.forEach(b => {
        const k = b.date
        if (!groupMap[k]) groupMap[k] = { date: k, items: [], net: 0 }
        groupMap[k].items.push({ ...b, icon: this.getIcon(b.category) })
        groupMap[k].net += (b.type === 'income' ? b.amount : -b.amount)
      })

      const groupedBills = Object.values(groupMap)
        .sort((a, b) => b.date.localeCompare(a.date))
        .map(g => ({
          date: g.date,
          label: formatDateLabel(g.date),
          items: g.items,
          netStr: g.net === 0 ? '' : (g.net > 0 ? `+¥${g.net.toFixed(2)}` : `-¥${Math.abs(g.net).toFixed(2)}`)
        }))

      this.setData({ groupedBills })
    } catch (err) {
      console.error('加载账单失败:', err)
      this.setData({ overviewFailed: true })
    }
  },

  getIcon(category) {
    if (ICON_MAP[category]) return ICON_MAP[category]
    const app = getApp()
    const custom = app.globalData.userInfo?.customCategories || []
    const found = custom.find(c => c.name === category)
    return found?.icon || '📌'
  },

  goBudget() {
    wx.switchTab({ url: '/pages/budget/budget' })
  },

  openDetail(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: '/pages/detail/detail?id=' + id })
  },

  deleteBill(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除这笔账单？',
      content: '删除后无法恢复',
      confirmColor: '#c44',
      success: async res => {
        if (!res.confirm) return
        try {
          await wx.cloud.database().collection('bills').doc(id).remove()
          wx.showToast({ title: '已删除', icon: 'success' })
          this.loadOverview()
          this.loadRecentBills()
        } catch (err) {
          console.error('删除失败:', err)
          wx.showToast({ title: '删除失败', icon: 'none' })
        }
      }
    })
  }
})
