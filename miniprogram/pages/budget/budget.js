Page({
  data: {
    budgetAmount: 2000,
    spent: 0,
    budgetInput: '2000',
    percent: 0,
    status: 'safe',
    statusText: ''
  },

  onShow() { this.loadBudget() },

  async loadBudget() {
    const now = new Date()
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const db = wx.cloud.database()
    const _ = db.command

    try {
      // 获取预算
      const budgetRes = await db.collection('budgets')
        .where({ month })
        .orderBy('createdAt', 'desc').limit(1).get()

      let budgetAmount = 2000
      if (budgetRes.data.length > 0) {
        budgetAmount = budgetRes.data[0].amount
      }

      // 获取本月支出
      const billRes = await db.collection('bills')
        .where({ type: 'expense', date: _.gte(`${month}-01`).and(_.lte(`${month}-31`)) }).get()

      let spent = 0
      billRes.data.forEach(b => { spent += b.amount })

      const percent = budgetAmount ? Math.round((spent / budgetAmount) * 100) : 0
      let status = 'safe', statusText = ''
      if (percent >= 100) { status = 'over'; statusText = '超预算了！不过没关系，下个月注意就好 😋' }
      else if (percent >= 90) { status = 'warn'; statusText = `快了快了，只剩 ¥${(budgetAmount - spent).toFixed(0)} 到月底 💡` }
      else { status = 'safe'; statusText = `表现不错！还剩 ¥${(budgetAmount - spent).toFixed(0)} ✨` }

      this.setData({ budgetAmount, spent: spent.toFixed(2), budgetInput: String(budgetAmount), percent, status, statusText })
    } catch (err) {
      console.error('加载预算失败:', err)
    }
  },

  onBudgetInput(e) { this.setData({ budgetInput: e.detail.value }) },

  async saveBudget() {
    const val = parseFloat(this.data.budgetInput)
    if (!val || val <= 0 || val > 999999) {
      wx.showToast({ title: '请输入合理金额', icon: 'none' }); return
    }
    const now = new Date()
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    try {
      const db = wx.cloud.database()
      await db.collection('budgets').add({
        data: { month, amount: val, createdAt: new Date() }
      })
      wx.showToast({ title: '预算已更新', icon: 'success' })
      this.loadBudget()
    } catch (err) {
      wx.showToast({ title: '设置失败', icon: 'none' })
    }
  }
})
