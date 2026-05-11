const COLORS = ['#e8bcba', '#f5dddc', '#ffdad8', '#cee9da', '#d8c1c0', '#f7cac8', '#b2cdbe', '#e9e1df']
const COMMENTS = [
  '这个月花得明明白白，钱都去了该去的地方～',
  '餐饮类占比不小啊，鉴定为生活家 👍',
  '收入稳中有进，继续保持！',
  '这月有点节俭，对自己好一点也可以的 😊'
]

Page({
  data: {
    displayMonth: '',
    currentMonth: '',
    totalExpense: '0.00',
    legendData: [],
    comment: '',
    commentEmoji: '🍜'
  },

  onShow() {
    this.updateCustomTabBar()
    const now = new Date()
    this.setData({
      currentMonth: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      displayMonth: `${now.getFullYear()}年${now.getMonth() + 1}月`
    })
    this.loadStats()
  },

  updateCustomTabBar() {
    if (typeof this.getTabBar !== 'function') return
    const tabBar = this.getTabBar()
    if (tabBar && typeof tabBar.updateSelected === 'function') {
      tabBar.updateSelected()
    }
  },

  prevMonth() {
    const [y, m] = this.data.currentMonth.split('-').map(Number)
    const d = new Date(y, m - 2, 1)
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    this.setData({
      currentMonth: month,
      displayMonth: `${d.getFullYear()}年${d.getMonth() + 1}月`
    })
    this.loadStats()
  },

  nextMonth() {
    const [y, m] = this.data.currentMonth.split('-').map(Number)
    const d = new Date(y, m, 1)
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    this.setData({
      currentMonth: month,
      displayMonth: `${d.getFullYear()}年${d.getMonth() + 1}月`
    })
    this.loadStats()
  },

  async loadStats() {
    const db = wx.cloud.database()
    const _ = db.command
    const m = this.data.currentMonth

    try {
      const res = await db.collection('bills')
        .where({ type: 'expense', date: _.gte(`${m}-01`).and(_.lte(`${m}-31`)) })
        .get()

      const byCategory = {}
      let total = 0
      res.data.forEach(b => {
        byCategory[b.category] = (byCategory[b.category] || 0) + b.amount
        total += b.amount
      })

      const legendData = Object.entries(byCategory)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, amount], i) => ({
          name,
          amount: amount.toFixed(2),
          percent: total ? Math.round((amount / total) * 100) : 0,
          color: COLORS[i]
        }))

      const comment = COMMENTS[Math.floor(Math.random() * COMMENTS.length)]
      const topCategory = legendData[0]
      const commentEmoji = topCategory ? '🍜' : '📊'

      this.setData({
        totalExpense: total.toFixed(2),
        legendData,
        comment: res.data.length > 0 ? comment : '',
        commentEmoji
      })
    } catch (err) {
      console.error('加载统计失败:', err)
    }
  }
})
