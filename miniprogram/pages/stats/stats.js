const {
  applyTheme,
  getThemeStyleString,
  getCurrentThemeId,
  resolveThemeVars
} = require('../../utils/theme')

const { getAll } = require('../../utils/dbPager')
const { checkText } = require('../../utils/contentSafety')

var MORANDI = ['#D4A5A5', '#A9C2DB', '#B2D8C8', '#D4C5A5', '#C2B8D4', '#B8D4D4', '#D4B8A5', '#C8D4A5']

const RANGE_TABS = [
  { key: 'day', label: '天', caption: '近30天' },
  { key: 'week', label: '周', caption: '近12周' },
  { key: 'month', label: '月', caption: '近12个月' }
]

const RANGE_LABELS = {
  day: '近30天',
  week: '近12周',
  month: '近12个月'
}

const CN_MONTHS = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月']
const CN_WEEK_ORDERS = ['第一周', '第二周', '第三周', '第四周', '第五周', '第六周', '第七周', '第八周', '第九周', '第十周', '第十一周', '第十二周']
const CHART_SIZES = {
  day: { width: 1320, tick: 44 },
  week: { width: 920, tick: 76 },
  month: { width: 920, tick: 76 }
}

const pad = n => String(n).padStart(2, '0')
const fmtDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function parseDateStr(s) {
  const parts = String(s || '').split('-').map(Number)
  return new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1)
}

function addDays(d, n) {
  const next = new Date(d)
  next.setDate(next.getDate() + n)
  return next
}

function getWeekStart(d) {
  const next = new Date(d)
  const day = next.getDay() || 7
  next.setDate(next.getDate() - day + 1)
  next.setHours(0, 0, 0, 0)
  return next
}

function monthKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

function yesterdayStr() {
  const d = new Date(); d.setDate(d.getDate() - 1)
  return fmtDate(d)
}

function lastWeekRange() {
  const today = new Date()
  const thisMon = getWeekStart(today)
  const lastMon = addDays(thisMon, -7)
  const lastSun = addDays(thisMon, -1)
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
    monthKey: monthKey(lastDay)
  }
}

function buildRange(mode) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const buckets = []

  if (mode === 'day') {
    const start = addDays(today, -29)
    for (let i = 0; i < 30; i++) {
      const d = addDays(start, i)
      buckets.push({
        key: fmtDate(d),
        label: String(d.getDate())
      })
    }
    return { mode, start: fmtDate(start), end: fmtDate(today), label: RANGE_LABELS.day, buckets }
  }

  if (mode === 'week') {
    const currentMonday = getWeekStart(today)
    const start = addDays(currentMonday, -77)
    for (let i = 0; i < 12; i++) {
      const d = addDays(start, i * 7)
      buckets.push({
        key: fmtDate(d),
        label: CN_WEEK_ORDERS[i] || `第${i + 1}周`
      })
    }
    return { mode, start: fmtDate(start), end: fmtDate(today), label: RANGE_LABELS.week, buckets }
  }

  const firstOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const startMonth = new Date(firstOfThisMonth.getFullYear(), firstOfThisMonth.getMonth() - 11, 1)
  for (let i = 0; i < 12; i++) {
    const d = new Date(startMonth.getFullYear(), startMonth.getMonth() + i, 1)
    buckets.push({
      key: monthKey(d),
      label: CN_MONTHS[d.getMonth()]
    })
  }
  return { mode: 'month', start: fmtDate(startMonth), end: fmtDate(today), label: RANGE_LABELS.month, buckets }
}

function getBucketKey(dateStr, mode) {
  if (mode === 'day') return dateStr
  const d = parseDateStr(dateStr)
  if (mode === 'week') return fmtDate(getWeekStart(d))
  return dateStr.slice(0, 7)
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

function alphaColor(color, alpha) {
  if (!color) return `rgba(39,192,125,${alpha})`
  if (color.indexOf('rgba') === 0) return color.replace(/rgba\(([^)]+),\s*[\d.]+\)/, `rgba($1, ${alpha})`)
  if (color.indexOf('rgb') === 0) return color.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`)
  if (color[0] === '#') {
    let hex = color.slice(1)
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('')
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    return `rgba(${r},${g},${b},${alpha})`
  }
  return color
}

const SYSTEM_PROMPT = `你是"橘记JUJI"记账小程序的俏皮评论助手。根据用户的消费数据，写一句生动幽默的评论。
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
    rangeTabs: RANGE_TABS,
    rangeMode: 'month',
    rangeLabel: RANGE_LABELS.month,
    statsType: 'expense',
    totalAmount: '0.00',
    legendData: [],
    showRankingAll: false,
    trendData: [],
    trendAxisLabels: [],
    trendCanvasWidth: CHART_SIZES.month.width,
    trendTickWidth: CHART_SIZES.month.tick,
    trendAverage: '0.00',
    trendEmpty: true,
    dailyComment: '',
    weeklyComment: '',
    monthlyComment: '',
    dailyLoading: true,
    weeklyLoading: true,
    monthlyLoading: true,
    aiCurrentIndex: 0,
    aiHintVisible: true,
    aiDebugText: '',
    statsFailed: false,
    themeStyle: getThemeStyleString()
  },

  onShow() {
    applyTheme()
    this.setData({ themeStyle: getThemeStyleString() })
    this.updateCustomTabBar()
    if (!this._hasLoaded || this._isDirty) {
      this._isDirty = false
      this._hasLoaded = true
      this.loadDashboard()
      this.loadAIComments({ force: false })
    }
  },

  onLoad() {
    this._isDirty = true
    this._hasLoaded = false
    const sys = wx.getSystemInfoSync()
    this._aiScrollStep = (sys.windowWidth || 375) * 0.83
    this.setData({ aiHintVisible: !wx.getStorageSync('juji_ai_note_swiped') })

    this._themeHandler = (id) => {
      applyTheme(id)
      this.setData({ themeStyle: getThemeStyleString(id) }, () => {
        this.drawTrendChart(false)
      })
    }
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
    this.clearTrendAnimation()
  },

  updateCustomTabBar() {
    if (typeof this.getTabBar !== 'function') return
    const tabBar = this.getTabBar()
    if (tabBar && typeof tabBar.updateSelected === 'function') {
      tabBar.updateSelected()
    }
  },

  switchRange(e) {
    const mode = e.currentTarget.dataset.mode
    if (!mode || mode === this.data.rangeMode) return
    this.setData({
      rangeMode: mode,
      rangeLabel: RANGE_LABELS[mode] || RANGE_LABELS.month,
      trendCanvasWidth: (CHART_SIZES[mode] || CHART_SIZES.month).width,
      trendTickWidth: (CHART_SIZES[mode] || CHART_SIZES.month).tick
    }, () => this.loadDashboard())
  },

  switchType(e) {
    const type = e.currentTarget.dataset.type
    if (type === this.data.statsType) return
    this.setData({ statsType: type }, () => this.loadDashboard())
  },

  async loadDashboard() {
    const db = wx.cloud.database()
    const _ = db.command
    const range = buildRange(this.data.rangeMode)

    try {
      const rawData = await getAll(db.collection('bills')
        .where({
          type: this.data.statsType,
          date: _.gte(range.start).and(_.lte(range.end))
        })
      )
      const data = rawData.filter(b => !b || !b.isDeleted)

      this.applyCategoryStats(data)
      this.applyTrendStats(data, range)
      this.setData({ statsFailed: false })
    } catch (err) {
      console.error('加载统计失败:', err)
      this.setData({ statsFailed: true })
    }
  },

  applyCategoryStats(data) {
    const byCategory = {}
    let total = 0
    data.forEach(b => {
      const amount = Number(b.amount) || 0
      byCategory[b.category] = (byCategory[b.category] || 0) + amount
      total += amount
    })

    const categories = Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, amount], i) => ({
        name,
        amount,
        percent: total ? Math.round((amount / total) * 100) : 0,
        color: MORANDI[i % MORANDI.length]
      }))

    const legendData = categories.map(c => ({
      name: c.name,
      amount: c.amount.toFixed(2),
      percent: c.percent,
      color: c.color
    }))

    this.setData({
      totalAmount: total.toFixed(2),
      legendData
    })
  },

  applyTrendStats(data, range) {
    const byBucket = {}
    range.buckets.forEach(b => { byBucket[b.key] = 0 })
    data.forEach(b => {
      const key = getBucketKey(b.date, range.mode)
      if (Object.prototype.hasOwnProperty.call(byBucket, key)) {
        byBucket[key] += Number(b.amount) || 0
      }
    })

    const amounts = range.buckets.map(b => byBucket[b.key] || 0)
    const max = Math.max(...amounts, 1)
    const total = amounts.reduce((sum, amount) => sum + amount, 0)
    const average = amounts.length ? total / amounts.length : 0
    const trendData = range.buckets.map((b, i) => ({
      key: b.key,
      label: b.label,
      amount: amounts[i].toFixed(2),
      rawAmount: amounts[i],
      percent: Math.round((amounts[i] / max) * 100),
      hasData: amounts[i] > 0
    }))

    this.setData({
      rangeLabel: range.label,
      trendData,
      trendAxisLabels: range.buckets.map(b => b.label),
      trendCanvasWidth: (CHART_SIZES[range.mode] || CHART_SIZES.month).width,
      trendTickWidth: (CHART_SIZES[range.mode] || CHART_SIZES.month).tick,
      trendAverage: average.toFixed(2),
      trendEmpty: total <= 0
    }, () => this.drawTrendChart(true))
  },

  getTrendColors() {
    const vars = resolveThemeVars(getCurrentThemeId())
    const line = this.data.statsType === 'income'
      ? (vars['--color-income'] || vars['--color-primary'])
      : vars['--color-primary']
    return {
      line,
      fill: alphaColor(line, 0.14),
      point: vars['--color-surface'] || '#ffffff',
      grid: alphaColor(vars['--color-outline'] || '#82a090', 0.16),
      axis: alphaColor(vars['--color-outline'] || '#82a090', 0.24),
      average: alphaColor(line, 0.36)
    }
  },

  clearTrendAnimation() {
    if (this._trendFrame && this._trendCanvas && this._trendCanvas.canvas && this._trendCanvas.canvas.cancelAnimationFrame) {
      this._trendCanvas.canvas.cancelAnimationFrame(this._trendFrame)
    }
    if (this._trendTimer) clearTimeout(this._trendTimer)
    this._trendFrame = null
    this._trendTimer = null
  },

  drawTrendChart(animated) {
    const query = wx.createSelectorQuery().in(this)
    query.select('#trendCanvas').fields({ node: true, size: true }).exec(res => {
      const info = res && res[0]
      if (!info || !info.node || !info.width || !info.height) return
      const canvas = info.node
      const ctx = canvas.getContext('2d')
      const dpr = wx.getSystemInfoSync().pixelRatio || 1
      canvas.width = info.width * dpr
      canvas.height = info.height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      this.clearTrendAnimation()
      this._trendCanvas = { canvas, ctx, width: info.width, height: info.height }

      const duration = animated ? 300 : 0
      const started = Date.now()
      const step = () => {
        const raw = duration ? Math.min(1, (Date.now() - started) / duration) : 1
        const progress = 1 - Math.pow(1 - raw, 3)
        this.paintTrend(progress)
        if (raw < 1) {
          if (canvas.requestAnimationFrame) {
            this._trendFrame = canvas.requestAnimationFrame(step)
          } else {
            this._trendTimer = setTimeout(step, 16)
          }
        }
      }
      step()
    })
  },

  paintTrend(progress) {
    const box = this._trendCanvas
    if (!box) return
    const { ctx, width, height } = box
    const data = this.data.trendData || []
    const values = data.map(item => Number(item.rawAmount) || 0)
    const max = Math.max(...values, 1)
    const colors = this.getTrendColors()
    const left = 20
    const right = 16
    const top = 22
    const bottom = 34
    const plotW = width - left - right
    const plotH = height - top - bottom

    ctx.clearRect(0, 0, width, height)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 1
    ctx.strokeStyle = colors.grid

    for (let i = 0; i < 4; i++) {
      const y = top + (plotH / 3) * i
      ctx.beginPath()
      ctx.moveTo(left, y)
      ctx.lineTo(width - right, y)
      ctx.stroke()
    }

    ctx.strokeStyle = colors.axis
    ctx.beginPath()
    ctx.moveTo(left, top + plotH)
    ctx.lineTo(width - right, top + plotH)
    ctx.stroke()

    if (!data.length) return

    const points = values.map((value, i) => {
      const x = data.length === 1 ? left + plotW / 2 : left + (plotW / (data.length - 1)) * i
      const y = top + plotH - (value / max) * plotH
      return { x, y, value }
    })

    const avg = values.reduce((sum, value) => sum + value, 0) / values.length
    const avgY = top + plotH - (avg / max) * plotH
    ctx.save()
    ctx.setLineDash([5, 7])
    ctx.strokeStyle = colors.average
    ctx.beginPath()
    ctx.moveTo(left, avgY)
    ctx.lineTo(width - right, avgY)
    ctx.stroke()
    ctx.restore()

    if (this.data.trendEmpty) {
      return
    }

    const visibleCount = Math.max(1, Math.ceil(points.length * progress))
    const visible = points.slice(0, visibleCount)
    const last = visible[visible.length - 1]

    ctx.beginPath()
    ctx.moveTo(visible[0].x, top + plotH)
    visible.forEach((p, i) => {
      if (i === 0) ctx.lineTo(p.x, p.y)
      else ctx.lineTo(p.x, p.y)
    })
    ctx.lineTo(last.x, top + plotH)
    ctx.closePath()
    ctx.fillStyle = colors.fill
    ctx.fill()

    ctx.beginPath()
    visible.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y)
      else ctx.lineTo(p.x, p.y)
    })
    ctx.strokeStyle = colors.line
    ctx.lineWidth = 3
    ctx.stroke()

    visible.forEach((p, i) => {
      if (!data[i].hasData) return
      ctx.beginPath()
      ctx.arc(p.x, p.y, i === visible.length - 1 ? 4.8 : 3.6, 0, Math.PI * 2)
      ctx.fillStyle = colors.point
      ctx.fill()
      ctx.lineWidth = 2
      ctx.strokeStyle = colors.line
      ctx.stroke()
    })
  },

  onAINoteScroll(e) {
    const step = this._aiScrollStep || 312
    const index = Math.max(0, Math.min(2, Math.round((e.detail.scrollLeft || 0) / step)))
    const next = {}
    if (index !== this.data.aiCurrentIndex) next.aiCurrentIndex = index
    if (this.data.aiHintVisible && (e.detail.scrollLeft || 0) > 8) {
      next.aiHintVisible = false
      wx.setStorageSync('juji_ai_note_swiped', true)
    }
    if (Object.keys(next).length) this.setData(next)
  },

  toggleRankingAll() {
    this.setData({ showRankingAll: !this.data.showRankingAll })
  },

  showAINoteFull(e) {
    const scope = e.currentTarget.dataset.scope
    const map = {
      daily: { title: '昨日回顾', loading: this.data.dailyLoading, text: this.data.dailyComment },
      weekly: { title: '上周回顾', loading: this.data.weeklyLoading, text: this.data.weeklyComment },
      monthly: { title: '上月回顾', loading: this.data.monthlyLoading, text: this.data.monthlyComment }
    }
    const item = map[scope]
    if (!item || item.loading || !item.text) return
    wx.showModal({
      title: item.title,
      content: item.text,
      showCancel: false,
      confirmText: '知道了'
    })
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
      const safety = await checkText(cleaned, { scene: 4 })
      if (!safety.ok) throw new Error('AI内容安全检测未通过')

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
    return err.errMsg || err.message || String(err)
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
    const data = await getAll(db.collection('bills')
      .where({ type: 'expense', date: _.gte(start).and(_.lte(end)) })
    )
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
            console.warn('[ai-debug] chunk parse failed:', e?.message)
          }
        }
        console.log('[ai-debug] eventStream done, length:', acc.length)
        return acc
      }

      console.warn('[ai-debug] streamText returned no stream')
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
