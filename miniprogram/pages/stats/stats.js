const COLORS = ['#e8bcba', '#f5dddc', '#ffdad8', '#cee9da', '#d8c1c0', '#f7cac8', '#b2cdbe', '#e9e1df']

// ===== 日期工具 =====
const pad = n => String(n).padStart(2, '0')
const fmtDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function yesterdayStr() {
  const d = new Date(); d.setDate(d.getDate() - 1)
  return fmtDate(d)
}

function lastWeekRange() {
  const today = new Date()
  const day = today.getDay() || 7  // Sun(0) → 7，让周一为 1
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

// ===== 账单汇总 =====
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

// ===== Prompts =====
const SYSTEM_PROMPT = `你是"橘记"记账小程序的俏皮评论助手。根据用户的消费数据，写一句生动幽默的评论。

【风格要求】
- 调侃消费行为本身（餐饮多→大馋丫头/大馋小子；娱乐多→快乐源泉；穿搭多→精致打工人；交通多→职场007 等）
- 偶尔可用网络热梗，但要自然不刻意
- 像朋友间的随意吐槽，亲切又有温度
- 1-2 句话，控制在 50 字以内

【严禁】
- 不能建议减肥、省钱、克制消费
- 不评判用户的生活方式
- 不给任何忠告或建议
- 不出现"建议"、"应该"、"少花点"、"克制"、"注意"等词

直接输出评论本身，不要任何前后缀，不要引号包裹。`

function buildUserPrompt(scope, summary, periodLabel) {
  if (summary.empty) {
    if (scope === 'daily') {
      return `用户昨天（${periodLabel}）一笔消费都没有。请温暖地调侃他，担心他是不是为了省钱没好好吃饭。
可参考但不要照抄："昨天没有消费，不知道你是不是为了省钱又偷偷瞒着家人吃泡面了，对自己好点，一日三餐不能落下~"
换一种说法，体现关心但不教导。1-2 句话 50 字内。`
    }
    if (scope === 'weekly') {
      return `用户上周（${periodLabel}）整整一周都没有任何消费记录。请用调侃但温暖的口吻写一句评论，
可怀疑他是不是把自己饿着了 / 在闭关 / 钱包冬眠，但绝不教导建议。1-2 句话 50 字内。`
    }
    return `用户上月（${periodLabel}）整整一个月都没有任何消费记录。请用俏皮调侃的口吻写一句评论，
可调侃他是不是修仙去了 / 在偷偷攒钱搞大事 / 把消费欲望关进笼子，调侃但不评判。1-2 句话 50 字内。`
  }
  const topStr = summary.top.map(t => `${t.name} ${t.percent}%（${t.amount}元）`).join('、')
  const periodHead = scope === 'daily' ? '昨天' : scope === 'weekly' ? '上周' : '上月'
  return `针对用户【${periodHead}】（${periodLabel}）的消费写一句俏皮评论。

数据：
- 总支出 ${summary.total} 元
- 共 ${summary.count} 笔
- 类目占比：${topStr}

直接输出评论。`
}

// ===== Storage =====
const STORAGE_KEYS = {
  daily: 'juji_ai_daily',
  weekly: 'juji_ai_weekly',
  monthly: 'juji_ai_monthly'
}
const PLACEHOLDER = '小橘正在琢磨…'
const FAIL_FALLBACK = '小橘暂时没词儿了，刷新试试 ✨'

Page({
  data: {
    displayMonth: '',
    currentMonth: '',
    totalExpense: '0.00',
    legendData: [],
    // 三条 AI 评论
    dailyComment: '',
    weeklyComment: '',
    monthlyComment: '',
    dailyLoading: true,
    weeklyLoading: true,
    monthlyLoading: true
  },

  onShow() {
    this.updateCustomTabBar()
    const now = new Date()
    this.setData({
      currentMonth: `${now.getFullYear()}-${pad(now.getMonth() + 1)}`,
      displayMonth: `${now.getFullYear()}年${now.getMonth() + 1}月`
    })
    this.loadStats()
    this.loadAIComments()
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
    const month = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
    this.setData({
      currentMonth: month,
      displayMonth: `${d.getFullYear()}年${d.getMonth() + 1}月`
    })
    this.loadStats()
  },

  nextMonth() {
    const [y, m] = this.data.currentMonth.split('-').map(Number)
    const d = new Date(y, m, 1)
    const month = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
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

      this.setData({
        totalExpense: total.toFixed(2),
        legendData
      })
    } catch (err) {
      console.error('加载统计失败:', err)
    }
  },

  // ============ AI 评论 ============

  loadAIComments() {
    this.loadOneAIComment('daily')
    this.loadOneAIComment('weekly')
    this.loadOneAIComment('monthly')
  },

  async loadOneAIComment(scope) {
    const info = this.getPeriodInfo(scope)

    // 1. 查缓存
    const cached = wx.getStorageSync(STORAGE_KEYS[scope])
    if (cached && cached.periodKey === info.periodKey && cached.text) {
      console.log(`[ai-${scope}] cache hit:`, cached.periodKey)
      this.setData({
        [`${scope}Comment`]: cached.text,
        [`${scope}Loading`]: false
      })
      return
    }

    // 2. 拉账单 + 调 AI
    try {
      const bills = await this.fetchBills(info.start, info.end)
      const summary = summarize(bills)
      console.log(`[ai-${scope}] summary:`, summary)

      const userPrompt = buildUserPrompt(scope, summary, info.label)
      const raw = await this.callAI(userPrompt)
      const cleaned = this.cleanText(raw)
      console.log(`[ai-${scope}] generated:`, cleaned)

      if (!cleaned) throw new Error('AI 返回为空')

      wx.setStorageSync(STORAGE_KEYS[scope], {
        periodKey: info.periodKey,
        text: cleaned
      })
      this.setData({
        [`${scope}Comment`]: cleaned,
        [`${scope}Loading`]: false
      })
    } catch (err) {
      console.warn(`[ai-${scope}] failed:`, (err && (err.errMsg || err.message)) || err)
      this.setData({
        [`${scope}Comment`]: FAIL_FALLBACK,
        [`${scope}Loading`]: false
      })
    }
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

  async callAI(userPrompt) {
    if (!wx.cloud || !wx.cloud.extend || !wx.cloud.extend.AI) {
      throw new Error('CloudBase AI 未启用，请在云开发控制台开通')
    }
    const model = wx.cloud.extend.AI.createModel('cloudbase')
    // 按 CloudBase 官方调用方式：streamText + eventStream + delta 累加
    // 参考：https://docs.cloudbase.net/ai/model/miniprogram-access
    const res = await model.streamText({
      data: {
        model: 'hy3-preview',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ]
      }
    })

    let acc = ''
    if (!res || !res.eventStream) {
      console.warn('[ai] streamText returned no eventStream:', res)
      return ''
    }
    for await (const event of res.eventStream) {
      if (!event || event.data == null) continue
      if (event.data === '[DONE]') break
      try {
        const chunk = JSON.parse(event.data)
        const delta = chunk && chunk.choices && chunk.choices[0] && chunk.choices[0].delta
        if (delta && typeof delta.content === 'string') {
          acc += delta.content
        }
      } catch (e) {
        // 单 chunk parse 失败不影响整体流
        console.warn('[ai] chunk parse failed:', event.data, e && e.message)
      }
    }
    console.log('[ai] stream done, length:', acc.length)
    return acc
  },

  cleanText(s) {
    if (!s) return ''
    return String(s)
      .trim()
      .replace(/^["「""'`]+/, '')
      .replace(/["」""'`]+$/, '')
      .trim()
  }
})
