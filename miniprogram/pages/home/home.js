const ICON_MAP = {
  '餐饮': '🍜', '交通': '🚇', '购物': '🛍️', '娱乐': '🎮',
  '学习': '📚', '日用': '🏠', '医疗': '💊', '工资': '💼',
  '兼职': '🧳', '理财': '💹', '红包': '🎁', '退款': '↩️', '其他': '📌'
}

Page({
  data: {
    monthExpense: '0.00',
    monthIncome: '0.00',
    dayProgress: 0,
    bills: []
  },

  onShow() {
    this.updateCustomTabBar()
    this.loadSummary()
    this.loadRecentBills()
  },

  updateCustomTabBar() {
    if (typeof this.getTabBar !== 'function') return
    const tabBar = this.getTabBar()
    if (tabBar && typeof tabBar.updateSelected === 'function') {
      tabBar.updateSelected()
    }
  },

  async loadSummary() {
    const now = new Date()
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const db = wx.cloud.database()
    const _ = db.command

    try {
      const res = await db.collection('bills')
        .where({ date: _.gte(`${month}-01`).and(_.lte(`${month}-31`)) })
        .get()

      let expense = 0, income = 0
      res.data.forEach(b => {
        if (b.type === 'income') income += b.amount
        else expense += b.amount
      })

      const dayOfMonth = now.getDate()
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()

      this.setData({
        monthExpense: expense.toFixed(2),
        monthIncome: income.toFixed(2),
        dayProgress: Math.round((dayOfMonth / daysInMonth) * 100)
      })
    } catch (err) {
      console.error('加载概览失败:', err)
    }
  },

  async loadRecentBills() {
    const db = wx.cloud.database()
    try {
      const res = await db.collection('bills')
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get()

      const bills = res.data.map(b => ({
        ...b,
        icon: this.getIcon(b.category)
      }))

      this.setData({ bills })
    } catch (err) {
      console.error('加载账单失败:', err)
    }
  },

  getIcon(category) {
    if (ICON_MAP[category]) return ICON_MAP[category]
    const app = getApp()
    const custom = app.globalData.userInfo?.customCategories || []
    const found = custom.find(c => c.name === category)
    return found?.icon || '📌'
  }
})
