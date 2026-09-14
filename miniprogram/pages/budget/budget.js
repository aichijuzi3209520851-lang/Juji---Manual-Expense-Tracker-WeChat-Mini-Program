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
    const openid = getApp().globalData.openid

    try {
      const budgetRes = await db.collection('budgets')
        .where({ _openid: openid, month }).orderBy('createdAt', 'desc').limit(1).get()

      let budgetAmount = 0
      if (budgetRes.data.length > 0) budgetAmount = budgetRes.data[0].amount

      const bills = await getAll(db.collection('bills')
        .where({ _openid: openid, type: 'expense', isDeleted: _.neq(true), date: _.gte(`${month}-01`).and(_.lte(monthEnd(now.getFullYear(), now.getMonth() + 1))) }))

      let spent = 0
      bills.forEach(b => { spent += b.amount })

      const percent = budgetAmount ? Math.min(Math.round((spent / budgetAmount) * 100), 100) : 0
      let status = 'safe', statusText = ''
      // 未设预算：给出引导文案，避免状态区空白（符合「禁止未设置/白屏」基线）
      if (budgetAmount === 0) { status = 'safe'; statusText = '还没有预算，点上方设个小目标吧 🍊' }
      else if (percent >= 100) { status = 'over'; statusText = '超预算了！不过没关系，下个月注意就好 🍊' }
      else if (percent >= 90) { status = 'warn'; statusText = `快了快了，只剩 ¥${(budgetAmount - spent).toFixed(0)} 到月底 💡` }
      else if (spent <= 0) { status = 'safe'; statusText = '本月还没开始花，保持住 🌱' }
      else { status = 'safe'; statusText = `表现不错！还剩 ¥${(budgetAmount - spent).toFixed(0)} ✨` }

      // 消费节奏 + 月底预测（按当前日均推算整月支出）
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
        // 月底预测 = 已花 ÷ 已过天数 × 全月天数
        const forecast = dayOfMonth > 0 ? (spent / dayOfMonth) * daysInMonth : spent
        pace = {
          todaySpent: todaySpent.toFixed(2),
          dailyBudget: dailyBudget.toFixed(2),
          daysLeft,
          remainDaily: remainDaily.toFixed(2),
          forecast: forecast.toFixed(0),
          forecastOver: forecast > budgetAmount
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
    const db = wx.cloud.database()
    const _ = db.command
    const openid = getApp().globalData.openid

    try {
      // 近 3 个自然月（含本月）
      const fromDate = new Date(now.getFullYear(), now.getMonth() - 2, 1)
      const from = `${fromDate.getFullYear()}-${pad(fromDate.getMonth() + 1)}-01`
      const to = monthEnd(now.getFullYear(), now.getMonth() + 1)

      const bills = await getAll(db.collection('bills')
        .where({
          _openid: openid,
          type: 'expense',
          isDeleted: _.neq(true),
          date: _.gte(from).and(_.lte(to))
        }))

      if (bills.length === 0) {
        this.setData({ suggestion: null })
        return
      }

      // 按月汇总 → 月均支出
      const byMonth = {}
      bills.forEach(b => {
        const m = String(b.date || '').slice(0, 7)
        if (!m) return
        byMonth[m] = (byMonth[m] || 0) + b.amount
      })
      const monthCount = Object.keys(byMonth).length || 1
      const avg = Math.round(
        Object.values(byMonth).reduce((s, v) => s + v, 0) / monthCount
      )
      // 建议预算：月均上浮 10% 后取整到百位，下限 100
      const suggest = Math.max(100, Math.round((avg * 1.1) / 100) * 100)

      // 分类洞察文案
      const byCate = {}
      bills.forEach(b => { byCate[b.category] = (byCate[b.category] || 0) + b.amount })
      const sorted = Object.entries(byCate).sort((a, b) => b[1] - a[1])

      let text = ''
      if (sorted.length > 0) {
        const [topCat, topAmt] = sorted[0]
        const total = bills.reduce((s, b) => s + b.amount, 0)
        const ratio = total ? Math.round((topAmt / total) * 100) : 0
        text = `近 3 月在「${topCat}」上支出最多（占 ${ratio}%），可以留意一下 💡`
      }

      this.setData({ suggestion: { avg, suggest, text } })
    } catch (err) {
      console.error('加载建议失败:', err)
    }
  },

  async loadHistory() {
    const db = wx.cloud.database()
    const _ = db.command
    const openid = getApp().globalData.openid
    const now = new Date()
    const curMonth = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`

    try {
      // F1 修复：显式按 _openid 过滤（此前无任何 where 条件，隔离完全依赖集合权限）
      const res = await db.collection('budgets')
        .where({ _openid: openid }).orderBy('month', 'desc').limit(6).get()

      const budgets = (res.data || []).filter(b => b && b.month)
      if (budgets.length === 0) {
        this.setData({ historyData: [] })
        return
      }

      // 一次性拉取覆盖这些月份的账单并分桶，避免逐月查询（有账单上限 20 条，统一走 getAll）
      const months = budgets.map(b => b.month).sort()
      const from = `${months[0]}-01`
      const [cy, cm] = curMonth.split('-')
      const to = monthEnd(Number(cy), Number(cm))

      const bills = await getAll(db.collection('bills').where({
        _openid: openid,
        type: 'expense',
        isDeleted: _.neq(true),
        date: _.gte(from).and(_.lte(to))
      }))

      const spentByMonth = {}
      bills.forEach(b => {
        const m = String(b.date || '').slice(0, 7)
        if (!m) return
        spentByMonth[m] = (spentByMonth[m] || 0) + b.amount
      })

      // 字段与 budget.wxml 对齐：monthLabel / percent / barPercent / over
      const historyData = budgets.map(b => {
        const budget = Number(b.amount) || 0
        const spent = spentByMonth[b.month] || 0
        const percent = budget > 0 ? Math.round((spent / budget) * 100) : 0
        const [, mm] = b.month.split('-')
        return {
          month: b.month,
          monthLabel: `${Number(mm)}月`,
          isCurrent: b.month === curMonth,
          amount: budget.toFixed(0),
          spent: spent.toFixed(0),
          percent,
          barPercent: Math.min(percent, 100),
          over: percent > 100
        }
      })

      this.setData({ historyData })
    } catch (err) {
      console.error('加载预算历史失败:', err)
    }
  },

  onBudgetInput(e) { this.setData({ budgetInput: e.detail.value }) },

  async saveBudget() {
    const raw = (this.data.budgetInput || '').trim()
    const val = raw === '' ? 0 : parseFloat(raw)
    // M3 修复：与云函数口径一致，0 与负数均为非法
    if (isNaN(val) || val <= 0 || val > 999999) {
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
