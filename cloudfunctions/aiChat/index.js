const cloud = require('wx-server-sdk')
const tcb = require('@cloudbase/node-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const app = tcb.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const ai = app.ai()

const AI_MODEL = 'hy3-preview'
const FALLBACK_REPLY = '小橘不知道，来聊聊别的吧~'
const MAX_MESSAGE_LEN = 300
const MAX_MESSAGES = 8
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
你可以回答日常闲聊、记账习惯、消费复盘等轻量问题。
限制：
1. 不提供医疗、法律、投资、借贷、博彩、违法违规建议。
2. 不索要身份证、银行卡、密码、验证码、精确住址等敏感个人信息。
3. 遇到违法违规、色情暴力、诈骗、自伤等内容，必须只回复："${FALLBACK_REPLY}"。
4. 回答控制在 120 字以内，中文输出。
5. 不提供实时天气查询；如果用户问天气，只说明天气功能暂时下线，不要编造实时天气。`

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const userProfile = normalizeProfile(event.userProfile)
  const messages = normalizeMessages(event.messages)
  const latest = messages[messages.length - 1]

  if (!latest || latest.role !== 'user' || !latest.content) {
    return { success: true, reply: FALLBACK_REPLY, fallback: true }
  }

  const inputSafe = await checkContent(openid, latest.content, 2)
  if (!inputSafe) {
    return { success: true, reply: FALLBACK_REPLY, fallback: true }
  }

  try {
    const model = ai.createModel('hunyuan-v3')
    const result = await model.generateText({
      model: AI_MODEL,
      messages: buildModelMessages(messages, userProfile)
    })

    let reply = String(result.text || '').trim()
      .replace(/^[""']+/, '')
      .replace(/[""']+$/, '')
      .trim()

    if (!reply || isUnsafeText(reply)) reply = FALLBACK_REPLY
    const outputSafe = await checkContent(openid, reply, 4)
    if (!outputSafe) reply = FALLBACK_REPLY

    return {
      success: true,
      reply,
      fallback: reply === FALLBACK_REPLY
    }
  } catch (err) {
    console.error('[aiChat] generate failed:', err && (err.message || err.errMsg))
    return { success: true, reply: FALLBACK_REPLY, fallback: true }
  }
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

function buildModelMessages(messages, profile) {
  const profileText = [
    profile.gender ? `性别：${profile.gender}` : '',
    profile.zodiac ? `星座：${profile.zodiac}` : '',
    profile.occupation ? `职业/状态：${profile.occupation}` : '',
    profile.days ? `记账天数：${profile.days}` : '',
    profile.count ? `累计笔数：${profile.count}` : '',
    profile.avgDailySpend ? `日均支出：${profile.avgDailySpend}元` : '',
    profile.profileTitle ? `今日称号：${profile.profileTitle}` : ''
  ].filter(Boolean).join('；')

  const list = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `用户资料：${profileText || '暂无'}。` }
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
