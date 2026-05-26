const cloud = require('wx-server-sdk')
const tcb = require('@cloudbase/node-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
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

const DAILY_LIMIT = 30
const dailyCounters = new Map()

function checkDailyLimit() {
  const today = new Date().toISOString().slice(0, 10)
  const used = dailyCounters.get(today) || 0
  if (used >= DAILY_LIMIT) return { ok: false, remaining: 0 }
  dailyCounters.set(today, used + 1)
  return { ok: true, remaining: DAILY_LIMIT - used - 1 }
}

exports.main = async (event, context) => {
  const { days, category, zodiac, occupation, avgDailySpend } = event
  try {
    const limit = checkDailyLimit()
    if (!limit.ok) return { success: false, message: '今日信件生成次数已用完，明天再来吧~', code: 'LIMIT_EXCEEDED' }

    const prompt = SYSTEM_PROMPT
      .replace('${occupation}', occupation || '未知')
      .replace('${zodiac}', zodiac || '未知星座')
      .replace('${days}', days)
      .replace('${category}', category || '日常')
      .replace('${avgDailySpend}', avgDailySpend || '未知')

    const userPrompt = `用户已经记账 ${days} 天，职业是${occupation || '未知'}，${zodiac || '未知星座'}，最爱的消费分类是「${category}」，日均消费 ${avgDailySpend || '未知'} 元。请给 TA 写一封 150-180 字的深情心里话。`

    const model = ai.createModel('hunyuan-v3')
    let letter = ''

    const res = await model.chatCompletions({
      model: 'hy3-preview',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 400,
      temperature: 0.9
    })
    letter = res.choices?.[0]?.message?.content?.trim() || ''

    letter = letter.replace(/^[""']+/, '').replace(/[""']+$/, '').trim()

    if (!letter || letter.length < 10) {
      letter = `小橘刚才去找星星借灵感去了，稍微走了一会神。不过没关系，看着你坚持记账 ${days} 天的模样，小橘想说：无论是精打细算还是偶尔挥霍，你认真生活的样子，真的很迷人！🍊`
    }

    return { success: true, letter, remaining: limit.remaining, totalLimit: DAILY_LIMIT }
  } catch (err) {
    console.error('[aiLetter] error:', err)
    return {
      success: true,
      letter: `小橘刚才去找星星借灵感去了，稍微走了一会神。不过没关系，看着你坚持记账 ${days} 天的模样，小橘想说：无论是精打细算还是偶尔挥霍，你认真生活的样子，真的很迷人！🍊`,
      remaining: -1,
      totalLimit: DAILY_LIMIT,
      fallback: true
    }
  }
}
