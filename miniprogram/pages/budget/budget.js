const pad = n => String(n).padStart(2, '0')
const { applyTheme } = require('../../utils/theme')

const CATEGORY_EMOJI = {
  '餐饮':'🍜','交通':'🚇','购物':'🛍️','娱乐':'🎮','学习':'📚','日用':'🏠','医疗':'💊',
  '工资':'💼','兼职':'🧳','理财':'💹','红包':'🎁','退款':'↩️','其他':'📌'
}

Page({
  data: {
    budgetAmount: 0,
    spent: '0.00',
    budgetInput: '2000',
    percent: 0,
    status: 'safe',
    statusText: '',
    ringReady: false,
    showEditor: false,
    historyData: [],
    pace: null,
    topCategories: [],
    suggestion: null
  },

  async onShow() {
    applyTheme()
    this.updateCustomTabBar()
    await this.loadBudget()
    this.loadHistory()
    this.loadSuggestion()
  },

  updateCustomTabBar() {
    if (typeof this.getTabBar !== 'function') return
    const tabBar = this.getTabBar()
    if (tabBar && typeof tabBar.updateSelected === 'function') {
      tabBar.updateSelected()
    }
  },

  async loadBudget() {
    const now = new Date()
    const month = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`
    const db = wx.cloud.database()
    const _ = db.command

    try {
      const budgetRes = await db.collection('budgets')
        .where({ month }).orderBy('createdAt', 'desc').limit(1).get()

      let budgetAmount = 0
      if (budgetRes.data.length > 0) budgetAmount = budgetRes.data[0].amount

      const billRes = await db.collection('bills')
        .where({ type: 'expense', date: _.gte(`${month}-01`).and(_.lte(`${month}-31`)) }).get()

      let spent = 0
      billRes.data.forEach(b => { spent += b.amount })

      const percent = budgetAmount ? Math.min(Math.round((spent / budgetAmount) * 100), 100) : 0
      let status = 'safe', statusText = ''
      if (budgetAmount === 0) { status = 'safe'; statusText = '' }
      else if (percent >= 100) { status = 'over'; statusText = '超预算了！不过没关系，下个月注意就好 😋' }
      else if (percent >= 90) { status = 'warn'; statusText = `快了快了，只剩 ¥${(budgetAmount - spent).toFixed(0)} 到月底 💡` }
      else { status = 'safe'; statusText = `表现不错！还剩 ¥${(budgetAmount - spent).toFixed(0)} ✨` }

      // 消费节奏
      let pace = null
      if (budgetAmount > 0) {
        const dayOfMonth = now.getDate()
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
        const dailyBudget = budgetAmount / daysInMonth
        const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(dayOfMonth)}`
        const todaySpent = billRes.data.filter(b => b.date === todayStr).reduce((s, b) => s + b.amount, 0)
        const daysLeft = daysInMonth - dayOfMonth + 1
        const remaining = budgetAmount - spent
        const remainDaily = daysLeft > 0 ? remaining / daysLeft : 0
        pace = {
          todaySpent: todaySpent.toFixed(2),
          dailyBudget: dailyBudget.toFixed(2),
          daysLeft,
          remainDaily: remainDaily.toFixed(2)
        }
      }

      // 类目排行 Top 3
      const byCate = {}
      billRes.data.forEach(b => { byCate[b.category] = (byCate[b.category] || 0) + b.amount })
      const topCategories = Object.entries(byCate)
        .sort((a, b) => b[1] - a[1]).slice(0, 3)
        .map(([name, amt]) => ({
          name, emoji: CATEGORY_EMOJI[name] || '📌',
          amount: amt.toFixed(2),
          pct: spent ? Math.round(amt / spent * 100) : 0
        }))

      this.setData({
        budgetAmount, spent: spent.toFixed(2),
        budgetInput: budgetAmount ? String(budgetAmount) : '2000',
        percent, status, statusText, ringReady: true,
        pace, topCategories
      })
    } catch (err) {
      console.error('加载预算失败:', err)
    }
  },

  async loadHistory() {
    const db = wx.cloud.database()
    const _ = db.command
    const now = new Date()

    const months = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push({
        key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`,
        label: `${d.getMonth() + 1}月`
      })
    }

    try {
      const { data: budgets } = await db.collection('budgets')
        .where({ month: _.in(months.map(m => m.key)) }).get()

      const { data: bills } = await db.collection('bills')
        .where({ type: 'expense', date: _.gte(`${months[0].key}-01`).and(_.lte(`${months[5].key}-31`)) }).get()

      const byMonth = {}
      bills.forEach(b => { const k = b.date.slice(0,7); byMonth[k] = (byMonth[k] || 0) + b.amount })

      const historyData = months.map(m => {
        const bgt = budgets.find(b => b.month === m.key)
        const amount = bgt ? bgt.amount : 0
        const spent = byMonth[m.key] || 0
        const percent = amount ? Math.round((spent / amount) * 100) : 0
        return {
          month: m.key,
          monthLabel: m.label,
          percent,
          barPercent: Math.min(percent, 100),
          over: percent >= 100 && amount > 0,
          hasData: amount > 0
        }
      }).filter(h => h.hasData)

      this.setData({ historyData })
    } catch (err) {
      console.error('加载预算历史失败:', err)
    }
  },

  onBudgetInput(e) { this.setData({ budgetInput: e.detail.value }) },

  async saveBudget() {
    const val = parseFloat(this.data.budgetInput)
    if (!val || val <= 0 || val > 999999) {
      wx.showToast({ title: '请输入合理金额', icon: 'none' }); return
    }
    const now = new Date()
    const month = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`

    try {
      const db = wx.cloud.database()
      await db.collection('budgets').add({
        data: { month, amount: val, createdAt: new Date() }
      })
      wx.showToast({ title: '预算已更新', icon: 'success' })
      this.setData({ showEditor: false, ringReady: false })
      this.loadBudget()
      this.loadHistory()
    } catch (err) {
      wx.showToast({ title: '设置失败', icon: 'none' })
    }
  },

  openBudgetEditor() {
    this.setData({ showEditor: true })
  },

  closeBudgetEditor() {
    this.setData({ showEditor: false })
  },

  async loadSuggestion() {
    if (this.data.status === 'over') return
    const db = wx.cloud.database()
    const _ = db.command
    const now = new Date()
    let total = 0, months = 0
    for (let i = 1; i <= 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
      try {
        const { data } = await db.collection('bills')
          .where({ type: 'expense', date: _.gte(`${key}-01`).and(_.lte(`${key}-31`)) }).get()
        if (data.length > 0) { total += data.reduce((s, b) => s + b.amount, 0); months++ }
      } catch (err) { /* skip */ }
    }
    if (months < 1) return
    const avg = Math.round(total / months * 0.9)
    this.setData({ suggestion: { avg: (total / months).toFixed(0), suggest: avg } })
  }
})
