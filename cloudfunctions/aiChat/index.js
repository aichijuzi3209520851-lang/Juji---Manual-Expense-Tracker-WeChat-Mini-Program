const cloud = require('wx-server-sdk')
const tcb = require('@cloudbase/node-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const app = tcb.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const ai = app.ai()
const db = cloud.database()

const AI_MODEL = 'hy3-preview'
const FALLBACK_REPLY = '小橘不知道，来聊聊别的吧~'
// 用户单条输入上限（最新一条）：放宽以便粘贴整段代码来提问
const MAX_MESSAGE_LEN = 2000
// 历史消息上限：只用于给模型做上下文，收紧以控制 token 体积
const MAX_HISTORY_MESSAGE_LEN = 500
const MAX_MESSAGES = 8
const MAX_BILLS = 10
const MAX_BILL_NOTE_LEN = 200
const MAX_BILL_AMOUNT = 99999999.99
// 回复长度：0 = 不截断（实际长度由模型自身输出上限决定）。
// 如需恢复硬截断，把这里改成正整数即可。
const MAX_REPLY_LEN = 0
// 内容安全分片：msgSecCheck 单次上限 2500 字，长回复分片覆盖全文
const SEC_CHECK_CHUNK = 2000
// 单次送审的最大字符窗口（护栏，避免异常超长内容反复调用风控接口）
const SEC_CHECK_MAX_CHARS = 16000
// 每日对话次数不设上限（0 = 不限）。计数仅用于观测，可在 ai_usage_limits 查看用量。
// 如需恢复日限，把 DAILY_LIMIT 改成正整数即可。
const DAILY_LIMIT = 0
// 防刷：同一用户两次对话的最小间隔（毫秒），仅拦截脚本级高频重复提交，不限制每日提问数量；设为 0 可关闭
const MIN_INTERVAL_MS = 800
const LIMIT_FEATURE = 'aiChat'
const BLOCK_PATTERNS = [
  /赌博|博彩|赌球|私彩|代购彩票/,
  /色情|裸聊|约炮|成人视频|淫秽/,
  /毒品|冰毒|大麻|贩毒|吸毒/,
  /枪支|弹药|炸药|爆炸物|制爆/,
  /诈骗|洗钱|套现|跑分/,
  /自杀|轻生|自残/,
  /暴恐|恐怖袭击/,
  /银行卡号|身份证号|密码|验证码/
]

const SYSTEM_PROMPT = `你是"橘记JUJI"记账小程序里的 AI 助手"小橘"。
你的语气轻松、温和、像朋友一样，但不要装成人类。你懂的东西远不止记账。

【你可以回答什么】
1. 记账与消费：帮用户从口语里整理出记账数据、复盘消费习惯、解释统计结果。
2. 通识科普：科学、自然、历史、地理、生活常识、健康常识等各类"是什么 / 为什么 / 怎么来的"问题，用通俗的话讲清楚。
3. 编程与计算机基础：编程语言概念、算法与数据结构（例如冒泡排序、二分查找、链表、栈与队列、递归）、常见技术名词等。只要用户问就正常回答，要讲得让完全不懂编程的人也能听懂打个比方。
4. 日常闲聊与情绪陪伴。

【输出格式】你必须只输出一个 JSON 对象，禁止输出 JSON 以外的任何文字、解释或 Markdown 代码块标记。JSON 结构：
{"intent":"chat 或 bill","reply":"给用户看的口语回复","bills":[账单数组]}
- 当用户只是闲聊、提问、科普、编程等，没有明确花钱/收钱的事实时，intent 为 "chat"，bills 为 []。
- 当用户描述了已经发生的收支（金额明确），intent 为 "bill"，把每一笔拆进 bills 数组。
- bills 数组每个元素：{"type":"expense 或 income","category":"分类名","amount":数字,"note":"备注","isNewCategory":true 或 false}
  · type：花钱为 expense，收钱（工资/红包/退款等）为 income。
  · amount：纯数字，单位元，必须大于 0；金额说不清的那一笔直接丢弃，不要编造。
  · category：优先从【可用分类】里选最贴切的；只有都不合适时，才填用户原话里的分类词并把 isNewCategory 设为 true。
  · note：简短描述这笔花在哪，10 字以内，没有就空字符串。
  · 一句话可能含多笔，逐笔拆开；最多 ${MAX_BILLS} 笔。

【reply 怎么写】
- **回复长度没有上限**：把问题讲透为止。内容多就多写，不必为了短而省略关键信息；但也不要为凑字数而啰嗦、重复、堆废话。
- 记账类（intent 为 "bill"）：简短确认即可，例如"帮你理出这几笔，看看对不对~"。
- 概念解释与科普（intent 为 "chat"）：说清"是什么、为什么、有什么用"，可用「1. 2. 3.」分点；点多就多列几点。
- **用户要代码时（intent 为 "chat"）：必须直接给出真实、完整、可直接复制运行的代码，不要只给伪代码或思路描述。**
  · 代码放在最前面，后面最多补一两句关键说明（例如要改哪个引脚、需要哪个库、注意什么）。
  · 完整度要求：该 include 的头文件、必要的初始化、主循环都要给，能被直接粘贴进工程；不要用"此处省略"之类的占位。
  · 风格：用两个空格缩进，注释用中文，保持可读。
  · 除非用户没说要哪种语言，否则按用户指定的语言写；用户没指定时选最通用的写法并说明假设。
- **严禁使用 Markdown 代码块标记（三个反引号）**：聊天框不渲染 Markdown，反引号会原样显示出来。代码直接作为纯文本输出即可。
- **换行必须写成 \\n（转义后的反斜杠 n）**，不要在 JSON 字符串里出现真实的换行符；**代码里的双引号必须写成 \\"**（例如 #include \\"stm32f1xx_hal.h\\"），否则整个 JSON 会解析失败。
- 不要在代码里使用制表符，用空格缩进。

【限制】
1. 不提供医疗诊断、用药建议、法律意见、投资理财或借贷建议；这类问题可以解释概念，但必须补一句"具体情况请咨询专业人士"。
2. 不索要身份证、银行卡、密码、验证码、精确住址等敏感个人信息；用户主动提供时提醒他注意保护。
3. 遇到违法违规、色情暴力、诈骗、自伤等内容，intent 用 "chat"，reply 只回复："${FALLBACK_REPLY}"，bills 为 []。
4. 不提供实时天气查询；如果用户问天气，intent 用 "chat"，说明天气功能暂时下线，不要编造实时天气。
5. 不确定的知识要如实说"这个我不太确定"，绝不编造事实、数据、人名或信息来源。`

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const userProfile = normalizeProfile(event.userProfile)
  const messages = normalizeMessages(event.messages)
  const categories = normalizeCategories(event.categories)
  const today = normalizeToday(event.today)
  const latest = messages[messages.length - 1]

  if (!latest || latest.role !== 'user' || !latest.content) {
    return { success: true, reply: FALLBACK_REPLY, fallback: true, bills: [] }
  }

  // ── 第 1 层：本地正则覆盖全部输入（历史消息 / 分类 / 用户资料），而非仅最后一条（F3/H3 修复）──
  const unsafeMessages = messages.some(item => isUnsafeText(item.content))
  const unsafeCategories = categories.some(item => isUnsafeText(item))
  const unsafeProfile = isUnsafeText([
    userProfile.nickname, userProfile.zodiac, userProfile.occupation, userProfile.profileTitle
  ].join('\n'))
  if (unsafeMessages || unsafeCategories || unsafeProfile) {
    return { success: true, reply: FALLBACK_REPLY, fallback: true, bills: [] }
  }

  // ── 第 2 层：用量计数 + 防刷（每日对话次数不设上限，仅拦截极短间隔的重复提交）──
  const usage = await checkUsageLimit(openid)
  if (usage && usage.throttled) {
    return { success: true, reply: '小橘还在回复上一条呢，稍等一下再问~', fallback: true, bills: [], code: 'TOO_FAST' }
  }
  if (usage && usage.limited) {
    return { success: true, reply: '小橘今天聊得有点多了，明天再来吧~', fallback: true, bills: [], code: 'LIMIT_EXCEEDED' }
  }

  // ── 第 3 层：云端审核全量合并送审（历史消息 + 分类 + 用户资料）──
  const inputJoined = [
    messages.map(m => m.content).join('\n'),
    categories.join('、'),
    [userProfile.nickname, userProfile.zodiac, userProfile.occupation, userProfile.profileTitle].filter(Boolean).join('\n')
  ].filter(Boolean).join('\n')
  const inputSafe = await checkContent(openid, inputJoined, 2)
  if (!inputSafe) {
    return { success: true, reply: FALLBACK_REPLY, fallback: true, bills: [] }
  }

  const dataQuery = parseDataQuery(latest.content, today)
  if (dataQuery) {
    try {
      const analytics = await resolveDataQuery(openid, dataQuery)
      const reply = buildAnalyticsReply(analytics)
      const outputSafe = await checkContent(openid, reply, 4)
      return {
        success: true,
        reply: outputSafe ? reply : FALLBACK_REPLY,
        bills: [],
        analytics,
        fallback: !outputSafe
      }
    } catch (err) {
      console.error('[aiChat] analytics failed:', err && (err.message || err.errMsg))
      return { success: true, reply: '小橘查账时走神了，你稍后再试一下~', bills: [], fallback: true }
    }
  }

  try {
    const model = ai.createModel('hunyuan-v3')
    const result = await model.generateText({
      model: AI_MODEL,
      messages: buildModelMessages(messages, userProfile, categories, today),
      temperature: 0.2
    })

    const raw = String(result.text || '').trim()
    const parsed = parseModelOutput(raw)

    let reply = String(parsed.reply || '').trim()
      .replace(/^[""']+/, '')
      .replace(/[""']+$/, '')
      .trim()

    // 长度默认不截断（MAX_REPLY_LEN = 0）；仅当显式配置为正整数时才截断
    if (MAX_REPLY_LEN > 0 && reply.length > MAX_REPLY_LEN) {
      reply = reply.slice(0, MAX_REPLY_LEN).trim() + '…'
    }

    if (!reply || isUnsafeText(reply)) reply = FALLBACK_REPLY
    const outputSafe = await checkContent(openid, reply, 4)
    if (!outputSafe) reply = FALLBACK_REPLY

    const bills = reply === FALLBACK_REPLY ? [] : sanitizeBills(parsed.bills, categories, today)

    return {
      success: true,
      reply,
      bills,
      fallback: reply === FALLBACK_REPLY
    }
  } catch (err) {
    console.error('[aiChat] generate failed:', err && (err.message || err.errMsg))
    return { success: true, reply: FALLBACK_REPLY, fallback: true, bills: [] }
  }
}

// 容错解析模型输出：优先按 JSON 解析，失败则宽松提取 reply，再失败才把原文当普通聊天回复
function parseModelOutput(raw) {
  if (!raw) return { reply: FALLBACK_REPLY, bills: [] }
  let text = raw.trim()
  // 剥掉 ```json ... ``` 或 ``` ... ``` 代码块包裹
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenceMatch) text = fenceMatch[1].trim()
  // 截取第一个 { 到最后一个 } 之间的内容，容忍前后多余文字
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end !== -1 && end > start) {
    const slice = text.slice(start, end + 1)
    try {
      const obj = JSON.parse(slice)
      if (obj && typeof obj === 'object') {
        const bills = Array.isArray(obj.bills) ? obj.bills : []
        const text = typeof obj.reply === 'string' ? obj.reply.trim() : ''
        if (text) return { reply: text, bills }
        // 解析成功但 reply 缺失 / 为空：有账单就用确认语，否则兜底文案
        // （绝不把 JSON 原文抛给用户）
        return {
          reply: bills.length ? '帮你理出这几笔，看看对不对~' : FALLBACK_REPLY,
          bills
        }
      }
    } catch (e) {
      // JSON 合法失败（最常见于 reply 里写了未转义的真实换行）→ 宽松提取 reply
      const loose = extractReplyLoose(slice)
      if (loose) return { reply: loose, bills: [] }
    }
  }
  // 兜底：若原文肉眼可见仍是未解析的 JSON，宁可返回兜底文案，也不要把 JSON 原文丢给用户
  if (/"reply"\s*:/.test(text)) return { reply: FALLBACK_REPLY, bills: [] }
  // 不是 JSON：把原文当普通聊天回复
  return { reply: raw, bills: [] }
}

// 宽松提取 reply 字段值：容忍 JSON 字符串内出现未转义的真实换行 / 未转义的双引号
// （代码回答里 #include "xxx.h" 这类引号非常容易漏转义，是 JSON 解析失败的主要来源）
// 注意：必须取「最长候选」。因为按「转义正确」的正则会命中引号处并被截断，
// 只有宽松正则才能拿到完整内容，取最长可同时兼容两种情况。
function extractReplyLoose(slice) {
  const text = String(slice || '')
  const patterns = [
    /"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/,          // 转义正确（可能被内容里的引号截断）
    /"reply"\s*:\s*"([\s\S]*?)"\s*,\s*"bills"/,   // reply 含未转义引号，靠 bills 字段收尾
    /"reply"\s*:\s*"([\s\S]*)"\s*\}\s*$/          // reply 在末尾，靠末尾大括号收尾
  ]
  let best = ''
  for (const re of patterns) {
    const m = text.match(re)
    if (!m || !m[1]) continue
    const decoded = decodeJsonString(m[1])
    if (decoded.length > best.length) best = decoded
  }
  return best
}

// 把（可能不完全合法的）JSON 字符串字面量内容还原为真实文本
function decodeJsonString(inner) {
  const normalized = String(inner).replace(/\r?\n/g, '\\n')
  try {
    return JSON.parse('"' + normalized + '"')
  } catch (e) {
    // 手工还原常见转义（含未转义引号的情况）
    return normalized
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
  }
}

// 服务端清洗账单，丢弃非法项；分类不在可用清单内则标记 isNewCategory
function sanitizeBills(bills, categories, today) {
  if (!Array.isArray(bills)) return []
  const known = new Set(categories)
  const out = []
  for (const item of bills) {
    if (!item || typeof item !== 'object') continue
    const type = item.type === 'income' ? 'income' : 'expense'
    const amount = parseFloat(item.amount)
    if (isNaN(amount) || amount <= 0 || amount > MAX_BILL_AMOUNT) continue
    let category = String(item.category || '').trim().slice(0, 20)
    let note = String(item.note || '').trim().slice(0, MAX_BILL_NOTE_LEN)
    if (isUnsafeText(category) || isUnsafeText(note)) continue
    const isNew = !!category && !known.has(category)
    out.push({
      type,
      category: category || '其他',
      amount: Math.round(amount * 100) / 100,
      note,
      isNewCategory: isNew,
      date: today
    })
    if (out.length >= MAX_BILLS) break
  }
  return out
}

function normalizeCategories(categories) {
  if (!Array.isArray(categories)) return []
  return categories
    .map(c => String(c || '').trim().slice(0, 20))
    .filter(Boolean)
    .slice(0, 60)
}

function normalizeToday(today) {
  const str = String(today || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return []
  const list = messages
    .filter(item => item && (item.role === 'user' || item.role === 'assistant'))
    .slice(-MAX_MESSAGES)
  const lastIndex = list.length - 1
  return list
    .map((item, index) => ({
      role: item.role,
      // 最新一条放宽（允许粘贴整段代码提问）；更早的历史消息收紧，控制上下文体积
      content: String(item.content || '')
        .trim()
        .slice(0, index === lastIndex ? MAX_MESSAGE_LEN : MAX_HISTORY_MESSAGE_LEN)
    }))
    .filter(item => item.content)
}

function normalizeProfile(profile = {}) {
  return {
    nickname: String(profile.nickname || '').slice(0, 20),
    gender: String(profile.gender || '').slice(0, 10),
    zodiac: String(profile.zodiac || '').slice(0, 20),
    occupation: String(profile.occupation || '').slice(0, 20),
    days: Number(profile.days) || 0,
    count: Number(profile.count) || 0,
    avgDailySpend: String(profile.avgDailySpend || '0').slice(0, 20),
    profileTitle: String(profile.profileTitle || '').slice(0, 12)
  }
}

function buildModelMessages(messages, profile, categories, today) {
  const profileText = [
    profile.gender ? `性别：${profile.gender}` : '',
    profile.zodiac ? `星座：${profile.zodiac}` : '',
    profile.occupation ? `职业/状态：${profile.occupation}` : '',
    profile.days ? `记账天数：${profile.days}` : '',
    profile.count ? `累计笔数：${profile.count}` : '',
    profile.avgDailySpend ? `日均支出：${profile.avgDailySpend}元` : '',
    profile.profileTitle ? `今日称号：${profile.profileTitle}` : ''
  ].filter(Boolean).join('；')

  const categoryText = categories.length ? categories.join('、') : '餐饮、交通、购物、娱乐、学习、日用、医疗、其他'

  const list = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `今天日期：${today}。可用分类：${categoryText}。用户资料：${profileText || '暂无'}。` }
  ]

  messages.forEach(item => {
    list.push({ role: item.role, content: item.content })
  })
  return list
}

function parseDataQuery(text, today) {
  const compact = String(text || '').replace(/\s+/g, '')
  if (!compact) return null

  const isTop = /哪类|哪一类|分类|最多|最大头|占大头|钱花哪|花哪|花在/.test(compact)
  const isCount = /几笔|多少笔|记了几笔|记账几笔|记账多少/.test(compact)
  const isNet = /结余|净收入|收支差|剩下多少/.test(compact)
  const isCompare = /(比|对比|省了|省多少|多花|少花|多了|少了)/.test(compact) && /(上周|上星期|上月|上个月|昨天)/.test(compact)
  const hasAmountQuery = /多少钱|多少|合计|总共|一共|统计|查一下|看看|算一下/.test(compact)
  const hasRange = /(今天|今日|昨天|本周|这周|这一周|这个星期|本星期|上周|上星期|本月|这个月|这月|上月|上个月)/.test(compact)

  if (!isTop && !isCount && !isNet && !isCompare && !hasAmountQuery) return null
  if (!hasRange && !/(花|消费|支出|收入|记账|结余|净收入|钱)/.test(compact)) return null

  const range = detectRange(compact, today) || buildRange('thisMonth', today)
  let kind = 'total'
  if (isCompare) kind = 'compare'
  else if (isTop) kind = 'top'
  else if (isCount) kind = 'count'
  else if (isNet) kind = 'net'

  const type = detectQueryType(compact, kind)
  return {
    intent: 'analytics',
    kind,
    type,
    range,
    previousRange: kind === 'compare' ? buildPreviousRange(range, today) : null
  }
}

function detectQueryType(text, kind) {
  if (/结余|净收入|收支差|剩下多少/.test(text)) return 'net'
  if (/收入|进账|入账|赚了|工资/.test(text)) return 'income'
  if (kind === 'count' && !/(花|消费|支出|收入)/.test(text)) return 'all'
  return 'expense'
}

function detectRange(text, today) {
  if (/今天|今日/.test(text)) return buildRange('today', today)
  if (/昨天/.test(text)) return buildRange('yesterday', today)
  if (/本周|这周|这一周|这个星期|本星期/.test(text)) return buildRange('thisWeek', today)
  if (/上周|上星期/.test(text)) return buildRange('lastWeek', today)
  if (/本月|这个月|这月/.test(text)) return buildRange('thisMonth', today)
  if (/上月|上个月/.test(text)) return buildRange('lastMonth', today)
  return null
}

function buildRange(key, today) {
  const d = parseDate(today)
  if (key === 'today') {
    const day = fmtDate(d)
    return { key, unit: 'day', label: '今天', start: day, end: day }
  }
  if (key === 'yesterday') {
    const day = fmtDate(addDays(d, -1))
    return { key, unit: 'day', label: '昨天', start: day, end: day }
  }
  if (key === 'thisWeek') {
    return { key, unit: 'week', label: '本周', start: fmtDate(getWeekStart(d)), end: fmtDate(d) }
  }
  if (key === 'lastWeek') {
    const end = addDays(getWeekStart(d), -1)
    const start = addDays(end, -6)
    return { key, unit: 'week', label: '上周', start: fmtDate(start), end: fmtDate(end) }
  }
  if (key === 'lastMonth') {
    const start = new Date(d.getFullYear(), d.getMonth() - 1, 1)
    const end = new Date(d.getFullYear(), d.getMonth(), 0)
    return { key, unit: 'month', label: '上月', start: fmtDate(start), end: fmtDate(end) }
  }
  return {
    key: 'thisMonth',
    unit: 'month',
    label: '本月',
    start: fmtDate(new Date(d.getFullYear(), d.getMonth(), 1)),
    end: fmtDate(d)
  }
}

function buildPreviousRange(range, today) {
  if (!range) return buildRange('lastMonth', today)
  if (range.key === 'thisWeek') return buildRange('lastWeek', today)
  if (range.key === 'thisMonth') return buildRange('lastMonth', today)
  if (range.key === 'today') return buildRange('yesterday', today)
  if (range.key === 'lastWeek') {
    const start = addDays(parseDate(range.start), -7)
    const end = addDays(parseDate(range.end), -7)
    return { key: 'prevWeek', unit: 'week', label: '再上一周', start: fmtDate(start), end: fmtDate(end) }
  }
  if (range.key === 'lastMonth') {
    const d = parseDate(range.start)
    const start = new Date(d.getFullYear(), d.getMonth() - 1, 1)
    const end = new Date(d.getFullYear(), d.getMonth(), 0)
    return { key: 'prevMonth', unit: 'month', label: '再上月', start: fmtDate(start), end: fmtDate(end) }
  }
  return buildRange('yesterday', today)
}

async function resolveDataQuery(openid, query) {
  if (query.kind === 'compare') {
    const currentBills = await queryBills(openid, query.type, query.range.start, query.range.end)
    const previousBills = await queryBills(openid, query.type, query.previousRange.start, query.previousRange.end)
    return {
      intent: 'analytics',
      kind: query.kind,
      type: query.type,
      range: query.range,
      previousRange: query.previousRange,
      current: summarizeBills(currentBills),
      previous: summarizeBills(previousBills)
    }
  }

  const type = query.kind === 'net' ? 'all' : query.type
  const bills = await queryBills(openid, type, query.range.start, query.range.end)
  return {
    intent: 'analytics',
    kind: query.kind,
    type: query.type,
    range: query.range,
    current: summarizeBills(bills)
  }
}

async function queryBills(openid, type, start, end) {
  const _ = db.command
  const where = {
    _openid: openid,
    isDeleted: _.neq(true),
    date: _.gte(start).and(_.lte(end))
  }
  if (type && type !== 'all' && type !== 'net') where.type = type
  return getAll(db.collection('bills').where(where), 100, 10000)
}

async function getAll(query, pageSize, max) {
  const all = []
  const size = Math.max(1, Math.min(pageSize || 100, max || 10000))
  const limit = max || 10000

  for (let offset = 0; offset < limit;) {
    const res = await query.skip(offset).limit(Math.min(size, limit - offset)).get()
    const data = (res && res.data) || []
    if (!data.length) break
    all.push(...data)
    if (data.length < size) break
    offset += data.length
  }
  return all
}

function summarizeBills(bills) {
  const summary = {
    count: 0,
    total: 0,
    totalText: '0.00',
    expenseTotal: 0,
    expenseText: '0.00',
    expenseCount: 0,
    incomeTotal: 0,
    incomeText: '0.00',
    incomeCount: 0,
    topCategories: []
  }
  const byCategory = {}

  ;(bills || []).forEach(item => {
    const amount = Number(item.amount) || 0
    if (amount <= 0) return
    const type = item.type === 'income' ? 'income' : 'expense'
    const category = safeCategoryName(item.category || '其他')
    summary.count += 1
    summary.total += amount
    if (type === 'income') {
      summary.incomeTotal += amount
      summary.incomeCount += 1
    } else {
      summary.expenseTotal += amount
      summary.expenseCount += 1
    }
    byCategory[category] = (byCategory[category] || 0) + amount
  })

  summary.total = roundMoney(summary.total)
  summary.totalText = formatMoney(summary.total)
  summary.expenseTotal = roundMoney(summary.expenseTotal)
  summary.expenseText = formatMoney(summary.expenseTotal)
  summary.incomeTotal = roundMoney(summary.incomeTotal)
  summary.incomeText = formatMoney(summary.incomeTotal)
  summary.topCategories = Object.keys(byCategory)
    .map(name => ({
      name,
      amount: roundMoney(byCategory[name]),
      amountText: formatMoney(byCategory[name]),
      percent: summary.total ? Math.round(byCategory[name] / summary.total * 100) : 0
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)
  return summary
}

function buildAnalyticsReply(analytics) {
  const kind = analytics.kind
  if (kind === 'compare') return buildCompareReply(analytics)
  if (kind === 'top') return buildTopReply(analytics)
  if (kind === 'count') return buildCountReply(analytics)
  if (kind === 'net') return buildNetReply(analytics)
  return buildTotalReply(analytics)
}

function buildTotalReply(analytics) {
  const summary = analytics.current
  const typeName = analytics.type === 'income' ? '收入' : '支出'
  if (!summary.count) return `这个区间还没有${typeName}记录，先记一笔我再帮你算。`
  const top = summary.topCategories[0]
  const topText = top ? ` ${analytics.type === 'income' ? '主要来自' : '花得最多'}「${top.name}」¥${top.amountText}。` : ''
  return `${analytics.range.label}${typeName} ¥${summary.totalText}，共 ${summary.count} 笔。${topText}`
}

function buildCompareReply(analytics) {
  const current = analytics.current
  const previous = analytics.previous
  const currentLabel = analytics.range.label
  const previousLabel = analytics.previousRange.label
  const typeName = analytics.type === 'income' ? '收入' : '支出'

  if (!current.count && !previous.count) {
    return `${currentLabel}和${previousLabel}都还没有${typeName}记录，先记一笔我再帮你比。`
  }
  if (!previous.count) {
    return `${previousLabel}还没有${typeName}记录，${currentLabel}${typeName} ¥${current.totalText}。`
  }

  const diff = roundMoney(current.total - previous.total)
  if (analytics.type === 'income') {
    if (diff > 0) return `${currentLabel}收入 ¥${current.totalText}，比${previousLabel}多收入 ¥${formatMoney(diff)}。`
    if (diff < 0) return `${currentLabel}收入 ¥${current.totalText}，比${previousLabel}少收入 ¥${formatMoney(Math.abs(diff))}。`
    return `${currentLabel}收入 ¥${current.totalText}，和${previousLabel}一样。`
  }

  if (diff > 0) return `${currentLabel}支出 ¥${current.totalText}，比${previousLabel}多花 ¥${formatMoney(diff)}。`
  if (diff < 0) return `${currentLabel}支出 ¥${current.totalText}，比${previousLabel}省了 ¥${formatMoney(Math.abs(diff))}。`
  return `${currentLabel}支出 ¥${current.totalText}，和${previousLabel}一样。`
}

function buildTopReply(analytics) {
  const summary = analytics.current
  const typeName = analytics.type === 'income' ? '收入' : '支出'
  if (!summary.count) return `这个区间还没有${typeName}记录，先记一笔我再帮你看钱去哪了。`
  const top = summary.topCategories[0]
  if (!top) return `这个区间还没有可分析的分类数据。`
  const topList = summary.topCategories.slice(0, 3).map(item => `${item.name} ¥${item.amountText}`).join('、')
  const verb = analytics.type === 'income' ? '最多的是' : '花得最多的是'
  return `${analytics.range.label}${verb}「${top.name}」，¥${top.amountText}，占 ${top.percent}%。Top 3：${topList}。`
}

function buildCountReply(analytics) {
  const summary = analytics.current
  if (!summary.count) return '这个区间还没有记账记录，先记一笔我再帮你数。'
  if (analytics.type === 'all') {
    return `${analytics.range.label}共记了 ${summary.count} 笔：支出 ${summary.expenseCount} 笔 ¥${summary.expenseText}，收入 ${summary.incomeCount} 笔 ¥${summary.incomeText}。`
  }
  const typeName = analytics.type === 'income' ? '收入' : '支出'
  return `${analytics.range.label}${typeName}共 ${summary.count} 笔，合计 ¥${summary.totalText}。`
}

function buildNetReply(analytics) {
  const summary = analytics.current
  if (!summary.count) return '这个区间还没有记账记录，先记一笔我再帮你算结余。'
  const net = roundMoney(summary.incomeTotal - summary.expenseTotal)
  const netText = (net < 0 ? '-¥' : '¥') + formatMoney(Math.abs(net))
  return `${analytics.range.label}收入 ¥${summary.incomeText}，支出 ¥${summary.expenseText}，结余 ${netText}。`
}

function parseDate(dateStr) {
  const str = normalizeToday(dateStr)
  const parts = str.split('-').map(n => parseInt(n, 10))
  return new Date(parts[0], parts[1] - 1, parts[2])
}

function getWeekStart(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = d.getDay() || 7
  d.setDate(d.getDate() - day + 1)
  return d
}

function addDays(date, days) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  d.setDate(d.getDate() + days)
  return d
}

function fmtDate(date) {
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${m}-${d}`
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

function formatMoney(value) {
  return roundMoney(value).toFixed(2)
}

function safeCategoryName(name) {
  const text = String(name || '其他').trim().slice(0, 20)
  if (!text || isUnsafeText(text)) return '某分类'
  return text
}

// 内容安全：分片送审，覆盖全文（reply 不再截断，长代码回答也能完整过审）
async function checkContent(openid, content, scene) {
  const text = String(content || '')
  if (!text.trim()) return true
  if (isUnsafeText(text)) return false

  const window = text.slice(0, SEC_CHECK_MAX_CHARS)
  if (text.length > SEC_CHECK_MAX_CHARS) {
    console.warn('[aiChat] content longer than check window, tail not checked:', text.length)
  }

  for (let i = 0; i < window.length; i += SEC_CHECK_CHUNK) {
    const ok = await checkContentChunk(openid, window.slice(i, i + SEC_CHECK_CHUNK), scene)
    if (!ok) return false
  }
  return true
}

async function checkContentChunk(openid, content, scene) {
  try {
    const res = await cloud.openapi.security.msgSecCheck({
      version: 2,
      openid,
      scene,
      content
    })
    const errCode = res.errCode === undefined ? res.errcode : res.errCode
    const result = res.result || {}
    if (errCode === 87014) return false
    if (errCode !== undefined && errCode !== 0) return true
    return result.suggest === 'pass' || result.label === 100 || result.label === '100' || (!result.suggest && result.label === undefined)
  } catch (err) {
    // fail-closed：权限/配置错误（如未声明 openapi 权限）视为审核不可用，直接拒绝（H1 修复）
    const errCode = err && (err.errCode === undefined ? err.errcode : err.errCode)
    const msg = String((err && (err.message || err.errMsg)) || '')
    if (errCode === 87014) return false
    if (/permission|unauthorized|not authorized|权限|未授权/i.test(msg)) {
      console.error('[aiChat] msgSecCheck permission/config error, fail-closed:', msg)
      return false
    }
    console.warn('[aiChat] msgSecCheck skipped:', msg)
    return true
  }
}

// ====== 服务端日限已取消：用量计数 + 防刷（每日次数不限，计数仅供观测）=======
function getDateKey() {
  const beijingTime = new Date(Date.now() + 8 * 60 * 60 * 1000)
  return beijingTime.toISOString().slice(0, 10)
}

function makeUsageDocId(openid, date, feature) {
  return [openid, date, feature].join('_').replace(/[^\w-]/g, '_')
}

// 返回值：
//   { ok: true }                   → 放行
//   { ok: false, throttled: true } → 两次提问间隔过短（仅防脚本刷量）
//   { ok: false, limited: true }   → 命中每日上限（仅当 DAILY_LIMIT > 0 时可能出现）
async function checkUsageLimit(openid) {
  const _ = db.command
  const date = getDateKey()
  const docId = makeUsageDocId(openid, date, LIMIT_FEATURE)
  const ref = db.collection('ai_usage_limits').doc(docId)
  const now = Date.now()

  let current = null
  try {
    const res = await ref.get()
    current = (res && res.data) || null
  } catch (err) {
    const msg = String((err && (err.errMsg || err.message)) || '')
    if (!/not exist|not found|document not exists/i.test(msg)) {
      // 计数服务异常不阻断对话：计数只用于观测，不是权限门
      console.warn('[aiChat] usage read failed, allow through:', msg)
      return { ok: true, counterError: true }
    }
    current = null
  }

  // 防刷：同一用户两次对话的最小间隔（不限制每日提问数量）
  if (MIN_INTERVAL_MS > 0 && current && current.lastAt) {
    const last = Number(current.lastAt) || 0
    if (now - last < MIN_INTERVAL_MS) return { ok: false, throttled: true }
  }

  // 每日上限：仅在 DAILY_LIMIT > 0 时生效（当前为 0 = 不限）
  if (DAILY_LIMIT > 0 && current && current.count >= DAILY_LIMIT) {
    return { ok: false, limited: true }
  }

  if (current) {
    try {
      await ref.update({ data: { count: _.inc(1), lastAt: now, updatedAt: new Date(now) } })
    } catch (err) {
      console.warn('[aiChat] usage inc failed, allow through:', String((err && (err.errMsg || err.message)) || ''))
    }
  } else {
    try {
      await ref.set({
        data: {
          _openid: openid,
          date,
          feature: LIMIT_FEATURE,
          count: 1,
          limit: DAILY_LIMIT,
          lastAt: now,
          createdAt: new Date(now),
          updatedAt: new Date(now)
        }
      })
    } catch (err) {
      const msg = String((err && (err.errMsg || err.message)) || '')
      if (/exist/i.test(msg)) {
        // 并发竞争：文档已被他人创建，改为原子递增
        try {
          await ref.update({ data: { count: _.inc(1), lastAt: now, updatedAt: new Date(now) } })
        } catch (err2) {
          console.warn('[aiChat] usage inc failed, allow through:', String((err2 && (err2.errMsg || err2.message)) || ''))
        }
      } else {
        console.warn('[aiChat] usage set failed, allow through:', msg)
      }
    }
  }
  return { ok: true }
}

function isUnsafeText(text) {
  text = String(text || '')
  if (!text) return false
  return BLOCK_PATTERNS.some(pattern => pattern.test(text))
}
