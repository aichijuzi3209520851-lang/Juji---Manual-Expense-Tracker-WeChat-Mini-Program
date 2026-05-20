const COLORS = ['#e8bcba', '#f5dddc', '#ffdad8', '#cee9da', '#d8c1c0', '#f7cac8', '#b2cdbe', '#e9e1df']
const { applyTheme } = require('../../utils/theme')

const pad = n => String(n).padStart(2, '0')
const fmtDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function yesterdayStr() {
  const d = new Date(); d.setDate(d.getDate() - 1)
  return fmtDate(d)
}

function lastWeekRange() {
  const today = new Date()
  const day = today.getDay() || 7
  const thisMon = new Date(today)
  thisMon.setDate(today.getDate() - (day - 1))
  thisMon.setHours(0, 0, 0, 0)
  const lastMon = new Date(thisMon); lastMon.setDate(thisMon.getDate() - 7)
  const lastSun = new Date(thisMon); lastSun.setDate(thisMon.getDate() - 1)
  return { start: fmtDate(lastMon), end: fmtDate(lastSun) }
}

function lastMonthRange() {
  const t = new Date()
  const firstOfThisMonth = new Date(t.getFullYear(), t.getMonth(), 1)
  const lastDay = new Date(firstOfThisMonth); lastDay.setDate(0)
  const firstDay = new Date(lastDay.getFullYear(), lastDay.getMonth(), 1)
  return {
    start: fmtDate(firstDay),
    end: fmtDate(lastDay),
    monthKey: `${lastDay.getFullYear()}-${pad(lastDay.getMonth() + 1)}`
  }
}

function summarize(bills) {
  if (!bills || !bills.length) return { empty: true }
  const byCategory = {}
  let total = 0
  bills.forEach(b => {
    byCategory[b.category] = (byCategory[b.category] || 0) + b.amount
    total += b.amount
  })
  const top = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, amount]) => ({
      name,
      amount: amount.toFixed(2),
      percent: total ? Math.round(amount / total * 100) : 0
    }))
  return { empty: false, total: total.toFixed(2), count: bills.length, top }
}

const SYSTEM_PROMPT = `你是"橘记"记账小程序的俏皮评论助手。根据用户的消费数据，写一句生动幽默的评论。
【风格要求】
- 调侃消费行为本身，像朋友间的随意吐槽，亲切但有分寸
- 1-2 句话，控制在 50 字内
【严格限制】
- 不要给建议，不要说“应该/注意/少花点”
- 不评价用户人格或生活方式
直接输出评论文本，不要加前后缀。`

function buildUserPrompt(scope, summary, periodLabel) {
  if (summary.empty) {
    if (scope === 'daily') return `用户在 ${periodLabel} 没有消费记录。请生成 1-2 句温暖俏皮的评论，不给建议。`
    if (scope === 'weekly') return `用户在 ${periodLabel} 没有消费记录。请生成 1-2 句俏皮评论，不给建议。`
    return `用户在 ${periodLabel} 没有消费记录。请生成 1-2 句俏皮评论，不给建议。`
  }
  const topStr = summary.top.map(t => `${t.name} ${t.percent}%（${t.amount}元）`).join('、')
  const periodHead = scope === 'daily' ? '昨日' : scope === 'weekly' ? '上周' : '上月'
  return `针对用户【${periodHead}】（${periodLabel}）消费写一句俏皮评论。
数据：总支出 ${summary.total} 元，共 ${summary.count} 笔；类目占比：${topStr}。
直接输出评论。`
}

const STORAGE_KEYS = {
  daily: 'juji_ai_daily',
  weekly: 'juji_ai_weekly',
  monthly: 'juji_ai_monthly'
}
const PLACEHOLDER = '小橘正在琢磨...'
const FAIL_FALLBACK = '小橘暂时没词儿了，刷新试试'
const AI_MODEL = 'hy3-preview'

Page({
  data: {
    displayMonth: '',
    currentMonth: '',
    statsType: 'expense',
    totalAmount: '0.00',
    legendData: [],
    trendData: [],
    dailyComment: '',
    weeklyComment: '',
    monthlyComment: '',
    dailyLoading: true,
    weeklyLoading: true,
    monthlyLoading: true,
    aiDebugText: '',
    statsFailed: false
  },

  onShow() {
    applyTheme()
    this.updateCustomTabBar()
    const now = new Date()
    this.setData({
      currentMonth: `${now.getFullYear()}-${pad(now.getMonth() + 1)}`,
      displayMonth: `${now.getFullYear()}年${now.getMonth() + 1}月`
    })
    this.loadStats()
    this.loadTrend()
    this.loadAIComments({ force: false })
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
    this.setData({
      currentMonth: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`,
      displayMonth: `${d.getFullYear()}年${d.getMonth() + 1}月`
    })
    this.loadStats()
    this.loadTrend()
  },

  nextMonth() {
    const [y, m] = this.data.currentMonth.split('-').map(Number)
    const d = new Date(y, m, 1)
    this.setData({
      currentMonth: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`,
      displayMonth: `${d.getFullYear()}年${d.getMonth() + 1}月`
    })
    this.loadStats()
    this.loadTrend()
  },

  async loadStats() {
    const db = wx.cloud.database()
    const _ = db.command
    const m = this.data.currentMonth

    try {
      const res = await db.collection('bills')
        .where({ type: this.data.statsType, date: _.gte(`${m}-01`).and(_.lte(`${m}-31`)) })
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
          color: COLORS[i % COLORS.length]
        }))

      this.setData({ totalAmount: total.toFixed(2), legendData })
    } catch (err) {
      console.error('加载统计失败:', err)
      this.setData({ statsFailed: true })
    }
  },

  switchType(e) {
    const type = e.currentTarget.dataset.type
    if (type === this.data.statsType) return
    this.setData({ statsType: type })
    this.loadStats()
    this.loadTrend()
  },

  async loadTrend() {
    const db = wx.cloud.database()
    const _ = db.command
    const [y, m] = this.data.currentMonth.split('-').map(Number)

    const months = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(y, m - 1 - i, 1)
      months.push({
        key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`,
        label: `${d.getMonth() + 1}月`
      })
    }

    try {
      const { data } = await db.collection('bills')
        .where({
          type: this.data.statsType,
          date: _.gte(`${months[0].key}-01`).and(_.lte(`${months[5].key}-31`))
        })
        .get()

      const byMonth = {}
      data.forEach(b => {
        const k = b.date.slice(0, 7)
        byMonth[k] = (byMonth[k] || 0) + b.amount
      })

      const amounts = months.map(mo => byMonth[mo.key] || 0)
      const max = Math.max(...amounts, 1)

      const trendData = months.map((mo, i) => ({
        monthKey: mo.key,
        monthLabel: mo.label,
        amount: amounts[i].toFixed(2),
        percent: Math.round((amounts[i] / max) * 100),
        isSelected: mo.key === this.data.currentMonth,
        hasData: amounts[i] > 0
      }))

      this.setData({ trendData })
    } catch (err) {
      console.error('加载趋势失败:', err)
      this.setData({ statsFailed: true })
    }
  },

  async loadAIComments({ force = false } = {}) {
    // 串行调用，避免并发触发 429 限流
    const scopes = ['daily', 'weekly', 'monthly']
    for (const scope of scopes) {
      await this.loadOneAIComment(scope, { force })
      // 每次请求间隔 1 秒，给限流窗口留余量
      if (scope !== scopes[scopes.length - 1]) {
        await new Promise(r => setTimeout(r, 1000))
      }
    }
  },

  async loadOneAIComment(scope, { force = false } = {}) {
    const info = this.getPeriodInfo(scope)

    const cached = wx.getStorageSync(STORAGE_KEYS[scope])
    if (!force && cached && cached.periodKey === info.periodKey && cached.text) {
      console.log(`[ai-${scope}] cache hit:`, cached.periodKey)
      this.setData({ [`${scope}Comment`]: cached.text, [`${scope}Loading`]: false })
      return
    }

    try {
      const bills = await this.fetchBills(info.start, info.end)
      const summary = summarize(bills)
      const userPrompt = buildUserPrompt(scope, summary, info.label)

      const raw = await this.callAI(userPrompt)
      const cleaned = this.cleanText(raw)
      if (!cleaned) throw new Error('AI返回为空')

      wx.setStorageSync(STORAGE_KEYS[scope], { periodKey: info.periodKey, text: cleaned })
      this.setData({
        [`${scope}Comment`]: cleaned,
        [`${scope}Loading`]: false,
        aiDebugText: `AI调用成功：${scope} ${info.periodKey}，模型 ${AI_MODEL}`
      })
    } catch (err) {
      const reason = this.getErrText(err)
      console.warn(`[ai-${scope}] failed:`, reason)
      this.setData({
        [`${scope}Comment`]: FAIL_FALLBACK,
        [`${scope}Loading`]: false,
        aiDebugText: `AI调用失败：${scope} ${reason}`
      })
      wx.showToast({ title: 'AI请求失败', icon: 'none' })
    }
  },

  async refreshAIComments() {
    this.clearAICache()
    this.setData({
      dailyLoading: true,
      weeklyLoading: true,
      monthlyLoading: true,
      dailyComment: PLACEHOLDER,
      weeklyComment: PLACEHOLDER,
      monthlyComment: PLACEHOLDER,
      aiDebugText: '已清理本地缓存，正在强制请求AI...'
    })
    this.loadAIComments({ force: true })
  },

  clearAICache() {
    wx.removeStorageSync(STORAGE_KEYS.daily)
    wx.removeStorageSync(STORAGE_KEYS.weekly)
    wx.removeStorageSync(STORAGE_KEYS.monthly)
  },

  getErrText(err) {
    if (!err) return '未知错误'
    if (typeof err === 'string') return err
    return err.errMsg || err.message || JSON.stringify(err)
  },

  getPeriodInfo(scope) {
    if (scope === 'daily') {
      const d = yesterdayStr()
      return { start: d, end: d, periodKey: d, label: d }
    }
    if (scope === 'weekly') {
      const r = lastWeekRange()
      return { ...r, periodKey: `${r.start}_${r.end}`, label: `${r.start} 至 ${r.end}` }
    }
    const r = lastMonthRange()
    return { start: r.start, end: r.end, periodKey: r.monthKey, label: r.monthKey }
  },

  async fetchBills(start, end) {
    const db = wx.cloud.database()
    const _ = db.command
    const { data } = await db.collection('bills')
      .where({ type: 'expense', date: _.gte(start).and(_.lte(end)) })
      .get()
    return data
  },

  async callAI(userPrompt, retryCount = 0) {
    const MAX_RETRIES = 2
    const RETRY_DELAYS = [3000, 6000] // 重试等待：3s, 6s

    if (!wx.cloud?.extend?.AI) {
      throw new Error('CloudBase AI 未启用，请确认：1) 已报名小程序成长计划 2) 云开发控制台已开通AI 3) 基础库 ≥ 3.7.1')
    }
    if (typeof wx.cloud.extend.AI.createModel !== 'function') {
      throw new Error('createModel 不可用，基础库版本需 ≥ 3.7.1')
    }

    const model = wx.cloud.extend.AI.createModel('hunyuan-v3')
    console.log('[ai-debug] calling streamText, model:', AI_MODEL, retryCount > 0 ? `(retry ${retryCount})` : '')

    try {
      const res = await model.streamText({
        data: {
          model: AI_MODEL,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt }
          ]
        }
      })

      // 优先使用 textStream
      if (res && res.textStream) {
        let acc = ''
        for await (const text of res.textStream) {
          acc += text
        }
        console.log('[ai-debug] textStream done, length:', acc.length)
        return acc
      }

      // 回退到 eventStream 解析
      if (res && res.eventStream) {
        let acc = ''
        for await (const event of res.eventStream) {
          if (!event || event.data == null) continue
          if (event.data === '[DONE]') break
          try {
            const chunk = JSON.parse(event.data)
            const delta = chunk?.choices?.[0]?.delta
            if (delta && typeof delta.content === 'string') acc += delta.content
          } catch (e) {
            console.warn('[ai-debug] chunk parse failed:', event.data, e?.message)
          }
        }
        console.log('[ai-debug] eventStream done, length:', acc.length)
        return acc
      }

      console.warn('[ai-debug] streamText returned no stream:', res)
      return ''
    } catch (err) {
      const errMsg = err?.errMsg || err?.message || String(err)
      const is429 = errMsg.includes('429') || errMsg.includes('Too Many Requests') || errMsg.includes('CONCURRENT')

      if (is429 && retryCount < MAX_RETRIES) {
        const delay = RETRY_DELAYS[retryCount]
        console.warn(`[ai-debug] 429 限流，${delay / 1000}s 后重试 (${retryCount + 1}/${MAX_RETRIES})`)
        await new Promise(r => setTimeout(r, delay))
        return this.callAI(userPrompt, retryCount + 1)
      }

      throw err
    }
  },

  cleanText(s) {
    if (!s) return ''
    return String(s)
      .trim()
      .replace(/^["“”'`]+/, '')
      .replace(/["“”'`]+$/, '')
      .trim()
  }
})
