const pad = n => String(n).padStart(2, '0')
const monthEnd = (y, m) => `${y}-${pad(m)}-${new Date(y, m, 0).getDate()}`
const { applyTheme, getThemeStyleString } = require('../../utils/theme')
const { getAll } = require('../../utils/dbPager')

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
    suggestion: null,
    themeStyle: getThemeStyleString()
  },

  async onShow() {
    applyTheme()
    this.setData({ themeStyle: getThemeStyleString() })
    this.updateCustomTabBar()
    if (!this._hasLoaded || this._isDirty) {
      this._isDirty = false
      this._hasLoaded = true
      await this.loadBudget()
      this.loadHistory()
      this.loadSuggestion()
    }
  },

  onLoad() {
    this._isDirty = true
    this._hasLoaded = false
    this._themeHandler = (id) => { applyTheme(id); this.setData({ themeStyle: getThemeStyleString(id) }) }
    this._dataChangeHandler = () => { this._isDirty = true }

    const bus = getApp().globalData.eventBus
    bus.on('themeChanged', this._themeHandler)
    bus.on('billChanged', this._dataChangeHandler)
    bus.on('categoryChanged', this._dataChangeHandler)
  },

  onUnload() {
    const bus = getApp().globalData.eventBus
    if (this._themeHandler) bus.off('themeChanged', this._themeHandler)
    if (this._dataChangeHandler) {
      bus.off('billChanged', this._dataChangeHandler)
      bus.off('categoryChanged', this._dataChangeHandler)
    }
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

      const bills = await getAll(db.collection('bills')
        .where({ type: 'expense', date: _.gte(`${month}-01`).and(_.lte(monthEnd(now.getFullYear(), now.getMonth() + 1))) }))

      let spent = 0
      bills.forEach(b => { spent += b.amount })

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
        const todaySpent = bills.filter(b => b.date === todayStr).reduce((s, b) => s + b.amount, 0)
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
      bills.forEach(b => { byCate[b.category] = (byCate[b.category] || 0) + b.amount })
      const topCategories = Object.entries(byCate)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, amount]) => ({
          name,
          icon: CATEGORY_EMOJI[name] || '📌',
          amount: amount.toFixed(2),
          percent: spent ? Math.round((amount / spent) * 100) : 0
        }))

      this.setData({
        budgetAmount,
        spent: spent.toFixed(2),
        budgetInput: String(budgetAmount || 2000),
        percent,
        status,
        statusText,
        ringReady: true,
        pace,
        topCategories
      })
    } catch (err) {
      console.error('加载预算失败:', err)
    }
  },

  async loadSuggestion() {
    const now = new Date()
    const month = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`
    const db = wx.cloud.database()
    const _ = db.command

    try {
      const bills = await getAll(db.collection('bills')
        .where({ type: 'expense', date: _.gte(`${month}-01`).and(_.lte(monthEnd(now.getFullYear(), now.getMonth() + 1))) }))

      const byCate = {}
      bills.forEach(b => { byCate[b.category] = (byCate[b.category] || 0) + b.amount })
      const sorted = Object.entries(byCate).sort((a, b) => b[1] - a[1])

      if (sorted.length === 0) {
        this.setData({ suggestion: null })
        return
      }

      const [topCat, topAmt] = sorted[0]
      const total = bills.reduce((s, b) => s + b.amount, 0)
      const ratio = total ? Math.round((topAmt / total) * 100) : 0

      this.setData({
        suggestion: {
          category: topCat,
          amount: topAmt.toFixed(2),
          ratio,
          text: `本月在「${topCat}」上已支出 ¥${topAmt.toFixed(2)}（占 ${ratio}%），建议适当关注哦 💡`
        }
      })
    } catch (err) {
      console.error('加载建议失败:', err)
    }
  },

  async loadHistory() {
    const db = wx.cloud.database()
    try {
      const res = await db.collection('budgets').orderBy('month', 'desc').limit(6).get()
      const historyData = res.data.map(b => ({
        month: b.month,
        amount: b.amount.toFixed(2)
      }))
      this.setData({ historyData })
    } catch (err) {
      console.error('加载预算历史失败:', err)
    }
  },

  onBudgetInput(e) { this.setData({ budgetInput: e.detail.value }) },

  async saveBudget() {
    const raw = (this.data.budgetInput || '').trim()
    const val = raw === '' ? 0 : parseFloat(raw)
    if (isNaN(val) || val < 0 || val > 999999) {
      wx.showToast({ title: '请输入合理金额', icon: 'none' }); return
    }
    const now = new Date()
    const month = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`

    try {
      const res = await wx.cloud.callFunction({
        name: 'budgets',
        data: { action: 'upsert', data: { month, amount: val } }
      })
      if (!res.result || !res.result.success) {
        throw new Error((res.result && res.result.message) || '设置失败')
      }
      wx.showToast({ title: '预算已更新', icon: 'success' })
      getApp().globalData.eventBus.emit('billChanged')
      this.setData({ showEditor: false, ringReady: false })
      this.loadBudget()
      this.loadHistory()
    } catch (err) {
      wx.showToast({ title: err.message || '设置失败', icon: 'none' })
    }
  },

  openBudgetEditor() {
    this.setData({ showEditor: true })
  },

  closeBudgetEditor() {
    this.setData({ showEditor: false })
  }
})
