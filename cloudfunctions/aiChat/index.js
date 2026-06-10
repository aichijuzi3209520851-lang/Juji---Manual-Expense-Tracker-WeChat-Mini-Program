const cloud = require('wx-server-sdk')
const tcb = require('@cloudbase/node-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const app = tcb.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const ai = app.ai()

const AI_MODEL = 'hy3-preview'
const FALLBACK_REPLY = '小橘不知道，来聊聊别的吧~'
const MAX_MESSAGE_LEN = 300
const MAX_MESSAGES = 8
const MAX_BILLS = 10
const MAX_BILL_NOTE_LEN = 200
const MAX_BILL_AMOUNT = 99999999.99
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
你的语气轻松、温和、像朋友一样，但不要装成人类。
你可以回答日常闲聊、记账习惯、消费复盘等轻量问题，也能帮用户从口语里整理出记账数据。

【输出格式】你必须只输出一个 JSON 对象，禁止输出 JSON 以外的任何文字、解释或 Markdown 代码块标记。JSON 结构：
{"intent":"chat 或 bill","reply":"给用户看的口语回复","bills":[账单数组]}
- 当用户只是闲聊、提问、没有明确花钱/收钱的事实时，intent 为 "chat"，bills 为 []。
- 当用户描述了已经发生的收支（金额明确），intent 为 "bill"，把每一笔拆进 bills 数组。
- bills 数组每个元素：{"type":"expense 或 income","category":"分类名","amount":数字,"note":"备注","isNewCategory":true 或 false}
  · type：花钱为 expense，收钱（工资/红包/退款等）为 income。
  · amount：纯数字，单位元，必须大于 0；金额说不清的那一笔直接丢弃，不要编造。
  · category：优先从【可用分类】里选最贴切的；只有都不合适时，才填用户原话里的分类词并把 isNewCategory 设为 true。
  · note：简短描述这笔花在哪，10 字以内，没有就空字符串。
  · 一句话可能含多笔，逐笔拆开；最多 ${MAX_BILLS} 笔。
- reply：无论 chat 还是 bill 都要有，自然口语，30 字以内。bill 时简单说一句"帮你理出这几笔，看看对不对~"之类。

限制：
1. 不提供医疗、法律、投资、借贷、博彩、违法违规建议。
2. 不索要身份证、银行卡、密码、验证码、精确住址等敏感个人信息。
3. 遇到违法违规、色情暴力、诈骗、自伤等内容，intent 用 "chat"，reply 只回复："${FALLBACK_REPLY}"，bills 为 []。
4. 不提供实时天气查询；如果用户问天气，intent 用 "chat"，说明天气功能暂时下线，不要编造实时天气。`

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

  const inputSafe = await checkContent(openid, latest.content, 2)
  if (!inputSafe) {
    return { success: true, reply: FALLBACK_REPLY, fallback: true, bills: [] }
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

// 容错解析模型输出：优先按 JSON 解析，失败则把原文当普通聊天回复
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
        return {
          reply: typeof obj.reply === 'string' ? obj.reply : raw,
          bills: Array.isArray(obj.bills) ? obj.bills : []
        }
      }
    } catch (e) {
      // 落到下面的兜底
    }
  }
  // 不是 JSON：把原文当普通聊天回复
  return { reply: raw, bills: [] }
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
  return messages
    .filter(item => item && (item.role === 'user' || item.role === 'assistant'))
    .slice(-MAX_MESSAGES)
    .map(item => ({
      role: item.role,
      content: String(item.content || '').trim().slice(0, MAX_MESSAGE_LEN)
    }))
    .filter(item => item.content)
}

function normalizeProfile(profile = {}) {
  return {
    nickname: String(profile.nickname || '').slice(0, 20),
    gender: String(profile.gender || ''),
    zodiac: String(profile.zodiac || ''),
    occupation: String(profile.occupation || '').slice(0, 20),
    days: Number(profile.days) || 0,
    count: Number(profile.count) || 0,
    avgDailySpend: String(profile.avgDailySpend || '0'),
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

async function checkContent(openid, content, scene) {
  if (isUnsafeText(content)) return false
  try {
    const res = await cloud.openapi.security.msgSecCheck({
      version: 2,
      openid,
      scene,
      content: String(content || '').slice(0, 2500)
    })
    const errCode = res.errCode === undefined ? res.errcode : res.errCode
    const result = res.result || {}
    if (errCode === 87014) return false
    if (errCode !== undefined && errCode !== 0) return true
    return result.suggest === 'pass' || result.label === 100 || result.label === '100' || (!result.suggest && result.label === undefined)
  } catch (err) {
    console.warn('[aiChat] msgSecCheck skipped:', err && (err.message || err.errMsg))
    return true
  }
}

function isUnsafeText(text) {
  text = String(text || '')
  if (!text) return false
  return BLOCK_PATTERNS.some(pattern => pattern.test(text))
}
