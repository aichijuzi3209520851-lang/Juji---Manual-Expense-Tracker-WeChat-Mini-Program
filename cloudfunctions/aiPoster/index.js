const cloud = require('wx-server-sdk')
const tcb = require('@cloudbase/node-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const app = tcb.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const ai = app.ai()

const SYSTEM_PROMPT = `你是一个住在"橘记"记账本里的温柔且俏皮的数字精灵。你需要根据用户的记账数据，给用户写一封超短的感谢/鼓励信。
【风格要求】
- 语气像好朋友一样俏皮、有温度，可以适当用emoji
- 字数严格控制在 50-60 字之间
- 必须包含用户的具体记账天数和最爱分类
- 直接输出正文，不要输出"亲爱的用户"、"此致敬礼"之类的格式废话
【示例】
哇哦！不知不觉我们已经相伴整整 5 天啦！悄悄看了一眼，原来你是个不折不扣的【购物】小达人呀～每一笔都是认真生活的痕迹呢！接下来的日子，也要一起开心记账哦，摸摸头！🍊`

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
  const { days, category } = event
  try {
    const limit = checkDailyLimit()
    if (!limit.ok) return { success: false, message: '今日信件生成次数已用完，明天再来吧~', code: 'LIMIT_EXCEEDED' }

    const userPrompt = `用户已经记账 ${days} 天，最爱的消费分类是「${category}」。请给 TA 写一封 50-60 字的俏皮鼓励信。`

    const model = ai.createModel('hunyuan-v3')
    let letter = ''

    const res = await model.chatCompletions({
      model: 'hy3-preview',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 200,
      temperature: 0.85
    })
    letter = res.choices?.[0]?.message?.content?.trim() || ''

    letter = letter.replace(/^[""']+/, '').replace(/[""']+$/, '').trim()

    if (!letter || letter.length < 10) {
      letter = `${days}天的坚持，每一笔都闪闪发光！原来你是【${category}】小达人呀～继续加油，橘子永远陪着你！🍊`
    }

    return { success: true, letter, remaining: limit.remaining, totalLimit: DAILY_LIMIT }
  } catch (err) {
    console.error('[aiLetter] error:', err)
    return {
      success: true,
      letter: `${days}天的坚持，每一笔都闪闪发光！原来你是【${category}】小达人呀～继续加油，橘子永远陪着你！🍊`,
      remaining: -1,
      totalLimit: DAILY_LIMIT,
      fallback: true
    }
  }
}
