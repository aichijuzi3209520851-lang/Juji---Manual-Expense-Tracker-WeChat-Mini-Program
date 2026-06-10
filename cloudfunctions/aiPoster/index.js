const cloud = require('wx-server-sdk')
const tcb = require('@cloudbase/node-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const app = tcb.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const ai = app.ai()

const SYSTEM_PROMPT = `你是一个住在"橘记"记账本里的赛博知己兼哲学家。你的任务是给用户写一封150字左右的心里话。
【用户当前数据】：职业是\${occupation}，\${zodiac}，已经坚持记账\${days}天，最近钱主要花在【\${category}】上，日均消费水平为【\${avgDailySpend}元】。

【创作规则】：
1. 拒绝流水账和低幼感！语气要深情、温暖、带点幽默，且必须包含一点生活哲学。
2. 必须将用户的【职业痛点】、【星座性格】和【消费习惯】发生奇妙的化学反应！
3. 逻辑推演举例：如果消费不高+工作费脑，可以说"别对自己太苛刻，身体需要休息"；如果餐饮花得多+土象星座，可以说"靠美食来慰藉疲惫的灵魂，也是一种稳稳的幸福"。
4. 绝对不要出现"亲爱的用户"、"此致敬礼"等客套话。像一个深夜陪在身边的好友一样娓娓道来。
5. 字数严格控制在 150-180 字之间。`

const PROFILE_TITLE_SYSTEM_PROMPT = `你是"橘记"记账小程序里的俏皮称号策划。
你的任务是根据用户今天的支出数据，生成一个轻松、可爱、不冒犯的今日消费称号。

输出要求：
1. 只输出 JSON，不要 Markdown，不要解释。
2. JSON 格式：{"title":"4到8个中文字符","reason":"18到36个中文字符","category":"主要分类"}
3. title 可以调皮，但必须友好，不能羞辱、不能贬低、不能评价身材、贫富、智商或人格。
4. 严禁使用"败家"、"穷"、"胖"、"懒"、"废"、"蠢"、"丑"、"韭菜"、"冤种"等攻击性词。
5. 已知性别为男时，可以自然使用"小子"；已知性别为女时，可以自然使用"丫头"；未知性别时使用中性称号。
6. 如果餐饮占比最高，可以生成类似"大馋小子"、"大馋丫头"、"饭点雷达"的称号。`

const DAILY_LIMIT = 30
const LIMIT_FEATURE = 'profileLetter'
const PROFILE_TITLE_DAILY_LIMIT = 8
const PROFILE_TITLE_FEATURE = 'profileTitle'
const BLOCK_PATTERNS = [
  /赌博|博彩|赌球|私彩|代购彩票/,
  /色情|裸聊|约炮|成人视频|淫秽/,
  /毒品|冰毒|大麻|贩毒|吸毒/,
  /枪支|弹药|炸药|爆炸物|制爆/,
  /诈骗|洗钱|套现|跑分/,
  /自杀|轻生|自残/,
  /暴恐|恐怖袭击/
]
const TITLE_BLOCK_PATTERNS = [
  /败家|穷|胖|懒|废|蠢|丑|土鳖|韭菜|冤种|饭桶|吃货本货/
]

async function checkDailyLimit(openid, feature = LIMIT_FEATURE, limit = DAILY_LIMIT) {
  const date = getDateKey()
  const docId = makeUsageDocId(openid, date, feature)
  const ref = db.collection('ai_usage_limits').doc(docId)
  const now = new Date()

  const current = await getUsageRecord(ref)
  if (current && current.count >= limit) {
    return { ok: false, remaining: 0 }
  }

  const nextCount = current ? current.count + 1 : 1
  if (current) {
    await ref.update({
      data: {
        count: nextCount,
        updatedAt: now
      }
    })
  } else {
    await ref.set({
      data: {
        _openid: openid,
        date,
        feature,
        count: nextCount,
        limit,
        createdAt: now,
        updatedAt: now
      }
    })
  }

  return { ok: true, remaining: Math.max(limit - nextCount, 0) }
}

async function getUsageRecord(ref) {
  try {
    const res = await ref.get()
    return res && res.data ? res.data : null
  } catch (err) {
    const msg = (err && (err.errMsg || err.message)) || ''
    if (/not exist|not found|document not exists/i.test(msg)) return null
    return null
  }
}

function getDateKey() {
  const beijingTime = new Date(Date.now() + 8 * 60 * 60 * 1000)
  return beijingTime.toISOString().slice(0, 10)
}

function makeUsageDocId(openid, date, feature) {
  return [openid, date, feature].join('_').replace(/[^\w-]/g, '_')
}

function buildFallback(days) {
  return `小橘刚才去找星星借灵感去了，稍微走了一会神。不过没关系，看着你坚持记账 ${days} 天的模样，小橘想说：无论是精打细算还是偶尔挥霍，你认真生活的样子，真的很迷人！🍊`
}

function isUnsafeText(text) {
  text = String(text || '')
  if (!text) return false
  return BLOCK_PATTERNS.some(pattern => pattern.test(text))
}

function isUnsafeProfileTitleText(text) {
  text = String(text || '')
  if (!text) return false
  return isUnsafeText(text) || TITLE_BLOCK_PATTERNS.some(pattern => pattern.test(text))
}

function buildProfileTitleFallback(category, gender) {
  const safeCategory = category || '其他'
  let title
  if (safeCategory === '餐饮') {
    title = gender === 'male' ? '大馋小子' : gender === 'female' ? '大馋丫头' : '饭点雷达'
  } else {
    title = {
      '交通': '通勤飞人',
      '购物': '购物研究员',
      '娱乐': '快乐续费官',
      '学习': '知识充电王',
      '日用': '生活管家',
      '医疗': '健康守护员',
      '其他': '日常收藏家'
    }[safeCategory] || '日常收藏家'
  }

  return {
    success: true,
    title,
    reason: `今天的支出里，${safeCategory}最抢镜，小橘先给你贴一个轻松标签。`,
    category: safeCategory,
    fallback: true,
    remaining: -1,
    totalLimit: PROFILE_TITLE_DAILY_LIMIT
  }
}

function parseJsonObject(text) {
  text = String(text || '').trim()
  if (!text) return null
  text = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch (err) {
    return null
  }
}

function normalizeProfileTitle(raw, fallback) {
  const title = String(raw && raw.title || '').replace(/^[""']+/, '').replace(/[""']+$/, '').trim()
  const reason = String(raw && raw.reason || '').trim()
  const category = String(raw && raw.category || fallback.category || '其他').trim()
  if (!title || title.length < 2 || title.length > 8) return fallback
  if (!reason || reason.length < 6) return fallback
  if (isUnsafeProfileTitleText([title, reason, category].join('\n'))) return fallback
  return {
    success: true,
    title,
    reason: reason.slice(0, 42),
    category: category.slice(0, 12),
    fallback: false
  }
}

async function generateProfileTitle(event, openid) {
  const gender = event.gender || ''
  const summary = event.expenseSummary || {}
  const topCategory = summary.topCategory || (summary.categories && summary.categories[0] && summary.categories[0].name) || '其他'
  const fallback = buildProfileTitleFallback(topCategory, gender)

  if (!summary.count || !summary.categories || !summary.categories.length) {
    return fallback
  }
  if (isUnsafeProfileTitleText(JSON.stringify(summary.categories))) {
    return fallback
  }

  const limit = await checkDailyLimit(openid, PROFILE_TITLE_FEATURE, PROFILE_TITLE_DAILY_LIMIT)
  if (!limit.ok) {
    return {
      ...fallback,
      remaining: 0,
      totalLimit: PROFILE_TITLE_DAILY_LIMIT
    }
  }

  try {
    const genderText = gender === 'male' ? '男' : gender === 'female' ? '女' : '未设置'
    const categoryText = summary.categories.map(item => {
      return `${item.name} ${item.amount}元 ${item.percent || 0}% ${item.count || 0}笔`
    }).join('；')
    const userContent = `日期：${event.dateKey || getDateKey()}。性别：${genderText}。今日支出总额：${summary.total || 0}元，共${summary.count || 0}笔。分类金额排行：${categoryText}。请生成今日消费称号 JSON。`

    const model = ai.createModel('hunyuan-v3')
    console.log('[profileTitle] calling generateText with model=hy3-preview...')
    const result = await model.generateText({
      model: 'hy3-preview',
      messages: [
        { role: 'system', content: PROFILE_TITLE_SYSTEM_PROMPT },
        { role: 'user', content: userContent }
      ],
    })

    const parsed = parseJsonObject(result.text)
    const normalized = normalizeProfileTitle(parsed, fallback)
    return {
      ...normalized,
      remaining: limit.remaining,
      totalLimit: PROFILE_TITLE_DAILY_LIMIT
    }
  } catch (err) {
    console.error('[profileTitle] 调用失败:', err && err.message)
    return {
      ...fallback,
      remaining: limit.remaining,
      totalLimit: PROFILE_TITLE_DAILY_LIMIT,
      errorDetail: err && err.message
    }
  }
}

exports.main = async (event, context) => {
  event = event || {}
  const { days, category, zodiac, occupation, avgDailySpend } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (event.action === 'profileTitle') {
    return generateProfileTitle(event, openid)
  }

  try {
    // ── 限流检查 ──
    const limit = await checkDailyLimit(openid)
    if (!limit.ok) {
      console.warn('[aiLetter] daily limit exceeded')
      return { success: false, message: '今日信件生成次数已用完，明天再来吧~', code: 'LIMIT_EXCEEDED' }
    }

    // ── 构建 prompt ──
    if (isUnsafeText([category, occupation].join('\n'))) {
      return { success: true, letter: buildFallback(days), remaining: limit.remaining, totalLimit: DAILY_LIMIT, fallback: true }
    }

    const systemContent = SYSTEM_PROMPT
      .replace('${occupation}', occupation || '未知')
      .replace('${zodiac}', zodiac || '未知星座')
      .replace('${days}', days)
      .replace('${category}', category || '日常')
      .replace('${avgDailySpend}', avgDailySpend || '未知')

    const userContent = `用户已经记账 ${days} 天，职业是${occupation || '未知'}，${zodiac || '未知星座'}，最爱的消费分类是「${category}」，日均消费 ${avgDailySpend || '未知'} 元。请给 TA 写一封 150-180 字的深情心里话。`

    // ── 调用 AI 模型（CloudBase Node SDK 正确用法）──
    const model = ai.createModel('hunyuan-v3')
    console.log('[aiLetter] calling generateText with model=hy3-preview...')

    const result = await model.generateText({
      model: 'hy3-preview',
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: userContent }
      ],
    })

    // ── 正确解析返回值：CloudBase SDK generateText 返回 result.text ──
    let letter = (result.text || '').trim()

    // 去除首尾引号
    letter = letter.replace(/^[""']+/, '').replace(/[""']+$/, '').trim()

    if (!letter || letter.length < 10) {
      console.warn('[aiLetter] letter too short or empty, using fallback. raw text length:', (result.text || '').length)
      letter = buildFallback(days)
    }
    if (isUnsafeText(letter)) {
      console.warn('[aiLetter] content safety fallback')
      letter = buildFallback(days)
    }

    console.log('[aiLetter] success, letter length:', letter.length)
    return { success: true, letter, remaining: limit.remaining, totalLimit: DAILY_LIMIT }

  } catch (err) {
    console.error('[aiLetter] 调用失败详情:')
    console.error('  message:', err && err.message)
    console.error('  code:', err && err.code)

    return {
      success: true,
      letter: buildFallback(days),
      remaining: -1,
      totalLimit: DAILY_LIMIT,
      fallback: true,
      errorDetail: err && err.message
    }
  }
}
