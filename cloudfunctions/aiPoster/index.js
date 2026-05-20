const cloud = require('wx-server-sdk')
const tcb = require('@cloudbase/node-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const app = tcb.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// ⚠️ app.ai() 是方法调用，必须加 () 返回 AI 实例
const ai = app.ai()

// 缓存：避免重复生成（节省 Token）
const cache = new Map()

// 每日生成次数限制 & 计数器（内存级）
const DAILY_LIMIT = 20
const dailyCounters = new Map()

function checkDailyLimit(type) {
  const today = new Date().toISOString().slice(0, 10)
  const key = `${today}_${type}`
  const used = dailyCounters.get(key) || 0
  if (used >= DAILY_LIMIT) return { ok: false, remaining: 0 }
  dailyCounters.set(key, used + 1)
  return { ok: true, remaining: DAILY_LIMIT - used - 1 }
}

exports.main = async (event, context) => {
  const { type, payload } = event
  try {
    if (type === 'days' || type === 'category') {
      const limit = checkDailyLimit(type)
      if (!limit.ok) return { success: false, message: `今日${type === 'days' ? '纪念海报' : '分类海报'}生成次数已用完（${DAILY_LIMIT}次/天），明天再来吧~`, code: 'LIMIT_EXCEEDED' }
      if (type === 'days') return await generateDaysImage(payload, limit.remaining)
      if (type === 'category') return await generateCategoryImage(payload, limit.remaining)
    }
    return { success: false, message: '未知类型' }
  } catch (err) {
    console.error('[aiPoster] error:', err)
    return { success: false, message: err.message || '生成失败' }
  }
}

/**
 * 调用混元 hunyuan-image 模型生成图片
 */
async function callHunyuanImage(prompt) {
  const imageModel = ai.createImageModel('hunyuan-image')
  const res = await imageModel.generateImage({
    model: 'hunyuan-image',
    prompt,
    version: 'v1.9',
    size: '1024x1024',
  })
  return res.data[0].url
}

// ─── 天数分段配置 ────────────────────────────────────────

const DAYS_CONFIG = [
  { max: 7,
    scene: '一只毛茸茸的小橘猫趴在柔软的云朵上，周围飘着闪闪发光的金币、星星和小存钱罐。阳光从画面左上方温柔地洒下，形成温暖的光晕。',
    quote: '"千里之行，始于足下。" — 老子',
    accentColor: '暖橙色', mood: '萌芽初发' },
  { max: 30,
    scene: '一只戴眼镜的小狐狸坐在温馨的书桌前，认真地在账本上写写画画。桌上有一杯冒着热气的咖啡、一盆绿植和几枚硬币。窗外是柔和的黄昏天空。',
    quote: '"积少成多，聚沙成塔。" — 荀子',
    accentColor: '暖棕色', mood: '养成习惯' },
  { max: 100,
    scene: '一只开心的小兔子双手抱住一个巨大的金色存钱罐，存钱罐微微倾斜洒出彩虹般的光芒。背景是一道绚丽的彩虹和漫天飞舞的星星。',
    quote: '"不积跬步，无以至千里。" — 荀子',
    accentColor: '粉彩色', mood: '小有成就' },
  { max: 365,
    scene: '一只戴圆眼镜的小熊站在一扇发光的金色大门前，门上写着"财务自由"。小熊手持羽毛笔，脚下是漂浮的数字、图表和上升的箭头。身后是城市天际线剪影。',
    quote: '"你今天的努力，是未来自由的入场券。"',
    accentColor: '金蓝色', mood: '坚持达人' },
  { max: Infinity,
    scene: '一只传奇的小橘精灵（橘子化身）端坐在云端王座上，身披星光斗篷，脚踩金山银河。它手持一支金色羽毛笔在空中挥舞，笔尖流淌出璀璨的数字星河。',
    quote: '"伟大的成就来自日复一日的平凡坚持。" — 亚里士多德',
    accentColor: '紫金色', mood: '传奇大师' },
]

function getDaysConfig(days) {
  for (const cfg of DAYS_CONFIG) { if (days < cfg.max) return cfg }
  return DAYS_CONFIG[DAYS_CONFIG.length - 1]
}

/**
 * 记账天数纪念海报
 * - 每天最多20次
 * - 根据天数段匹配不同角色、场景、配色和名言
 * - prompt 中融入天数数字作为核心视觉元素
 */
async function generateDaysImage({ days }, remaining) {
  const cfg = getDaysConfig(days)

  const prompt = [
    `精美卡通插画海报，高质量商业插画级别，细节丰富。`,
    `主色调为${cfg.accentColor}系莫兰迪色，整体氛围${cfg.mood}、治愈温暖且充满成就感。`,
    ``,
    `【画面核心】巨大的艺术化数字"${days}"位于画面视觉中心，采用立体描边字体设计，`,
    `数字内部填充渐变色彩并带有微光效果，数字周围环绕着闪烁的星星和光点，使其成为整个画面最醒目的焦点。`,
    ``,
    `【场景描述】${cfg.scene}`,
    ``,
    `【文字排版】画面底部居中用手写体中文优雅地书写："已坚持记账 ${days} 天"，`,
    `右下角以较小的手写体标注名言：${cfg.quote}`,
    ``,
    '构图均衡，层次分明，适合作为手机壁纸分享。'
  ].join('\n')

  const url = await callHunyuanImage(prompt)
  return { success: true, url, cached: false, quote: cfg.quote, remaining, totalLimit: DAILY_LIMIT }
}

/**
 * 分类最爱海报 - 根据分类名称生成贴切图片
 * - 每天20次，5分钟短缓存防重复调用
 */
async function generateCategoryImage({ category, emoji }, remaining) {
  const cacheKey = `cat_${category}`

  // 5分钟内不重复调用
  if (dailyCounters.has(cacheKey)) {
    const cached = dailyCounters.get(cacheKey)
    if (Date.now() - cached.time < 300000) {
      return { success: true, url: cached.url, cached: true, remaining, totalLimit: DAILY_LIMIT }
    }
  }

  const categoryPrompts = {
    '餐饮': [
      '精美卡通插画海报，暖橙色调，令人食欲大开。',
      `画面中央是一张丰盛诱人的美食大餐：热气腾腾的面条、精致的甜点蛋糕、新鲜水果摆满桌面。`,
      `一只圆滚滚的小橘猫坐在餐桌旁，双手捧着脸，眼睛放光，表情幸福陶醉，嘴角似乎还在流口水。`,
      `餐桌上巧妙地融入"${emoji}"装饰元素。`,
      `【核心文字】画面上方用可爱的圆润字体大字展示："最爱 餐饮"`,
      `下方配文："美食是生活的调味剂 🍴"`,
      '热气腾腾的氛围感，食物细节丰富诱人。'
    ].join('\n'),
    '交通': [
      '精美卡通插画海报，清新的蓝绿色调。',
      '一辆Q萌的小巴士穿梭在充满活力的城市街道上，车窗里露出各种快乐的小动物乘客在挥手。',
      `车身侧面装饰着"${emoji}"图案。`,
      '背景是简洁的城市天际线和飘浮的白云。',
      `【核心文字】画面中央突出显示："最爱 交通"`,
      `底部文案："每一步都在路上 🚌"`,
      '动感十足，充满出行的期待感。'
    ].join('\n'),
    '购物': [
      '精美卡通插画海报，梦幻粉色系。',
      '一只兴奋的小兔子拎着好几个印着logo的购物袋，周围漂浮着衣服、鞋子、化妆品盒子像礼花一样散开。',
      `背景是明亮的商场玻璃橱窗，橱窗上反射着"${emoji}"的光影。`,
      `【核心文字】画面中央大号字体："最爱 购物"`,
      `底部文案："适当奖励自己 🛍️"`,
      '欢快满足的购物氛围。'
    ].join('\n'),
    '娱乐': [
      '精美卡通插画海报，活泼明亮的霓虹色彩。',
      '游戏手柄、电影胶片、五线谱音符环绕着一只玩耍中的快乐小狗，小狗戴着VR眼镜手舞足蹈。',
      `背景是星空与霓虹灯光交相辉映，点缀着"${emoji}"元素。`,
      `【核心文字】画面中央炫彩大字："最爱 娱乐"`,
      `底部文案："快乐也是刚需 🎮"`,
      '充满活力和欢乐感。'
    ].join('\n'),
    '学习': [
      '精美卡通插画海报，温暖的米黄书房色调。',
      '一摞高高的书、一盏亮着的台灯、摊开的笔记本。一只戴眼镜的小猫头鹰正专注读书，眼镜滑到鼻尖，表情认真又可爱。',
      `书桌上放着一个小小的"${emoji}"摆件。阳光透过百叶窗洒进来形成光斑。`,
      `【核心文字】画面中央文艺字体："最爱 学习"`,
      `底部文案："投资大脑永不亏 📚"`,
      '安静专注又温馨的学习氛围。'
    ].join('\n'),
    '日用': [
      '精美卡通插画海报，舒适的奶油色家居色调。',
      '一个温馨的小房间角落：绿植盆栽、香薰蜡烛、柔软的针织抱枕随意摆放。一只慵懒的小猫咪蜷缩在天鹅绒沙发里打盹，尾巴轻轻摇晃。',
      `抱枕上绣着"${emoji}"图案。空气中仿佛能看到淡淡的香气线条。`,
      `【核心文字】画面中央柔和字体："最爱 日用"`,
      `底部文案："小确幸最治愈 🏠"`,
      '舒适惬意的居家氛围。'
    ].join('\n'),
    '医疗': [
      '精美卡通插画海报，清新健康的绿色调。',
      '一个可爱的小药箱旁边站着一只有精神的小熊，手里拿着苹果和维生素瓶，表情健康活力满满。',
      `小熊胸前贴着一个"${emoji}"徽章。背景是明亮整洁的药房或医院大厅。`,
      `【核心文字】画面中央清晰字体："最爱 医疗"`,
      `底部文案："健康是一切的本钱 💊"`,
      '积极健康的氛围。'
    ].join('\n'),
    '工资': [
      '精美卡通插画海报，金红色喜庆氛围。',
      '一个超大的红包从天而降裂开，里面的钞票像金色蝴蝶一样飞舞飘落。下面站着惊喜到跳起来的小猪，头顶出现钱币旋转的光环。',
      `红包上印着"${emoji}"符号。背景有烟花绽放的痕迹。`,
      `【核心文字】画面中央最大最醒目："💰 工资到账 💰"`,
      `底部文案："努力被看见的时刻 🎉"`,
      '喜庆惊喜感拉满。'
    ].join('\n'),
    '兼职': [
      '精美卡通插画海报，积极向上的橙色调。',
      '一只勤劳的小蜜蜂同时做着好几件事：送外卖（背着小箱子）、写代码（面前有笔记本电脑）、画画（拿着画板），虽然忙但脸上带着满足的笑容。',
      `小蜜蜂翅膀上有"${emoji}"闪光。背景是日出时分的城市剪影。`,
      `【核心文字】画面中央励志字体："最爱 兼职"`,
      `底部文案："每一份努力都值得 🐝"`,
      '充实奋斗的氛围。'
    ].join('\n'),
    '理财': [
      '精美卡通插画海报，智慧稳重的深蓝色调。',
      '一只戴眼镜的老虎坐在一张巨大的K线趋势图前分析走势，旁边的存钱罐肉眼可见地变大。背景是多条向上的曲线箭头和金币雨。',
      `老虎领带上印着"${emoji}"。桌上摆着计算器和财经报纸。`,
      `【核心文字】画面中央专业字体："最爱 理财"`,
      `底部文案："让钱为你工作 📈"`,
      '专业睿智的投资氛围。'
    ].join('\n'),
    '红包': [
      '精美卡通插画海报，中国红喜庆色调。',
      '一个大大的红包打开后放出耀眼的金色光芒和幸运星星，几只小狗和小猫开心地伸手去接好运。背景有灯笼和烟花的轮廓。',
      `光芒中隐约可见"${emoji}"符号闪烁。地面铺满红色鞭炮碎屑。`,
      `【核心文字】画面中央金色大字："🧧 红包收入 🧧"`,
      `底部文案："惊喜从天而降 ✨"`,
      '热闹喜庆的节日氛围。'
    ].join('\n'),
    '退款': [
      '精美卡通插画海报，轻松愉快的浅绿色调。',
      '一只松鼠正把一枚枚硬币开心地收回自己的树洞储藏室，表情如释重负、眉开眼笑。旁边立着一个小牌子写着"回来了！"。',
      `硬币上刻着"${emoji}"标记。树洞门口挂着小彩灯。`,
      `【核心文字】画面中央轻松字体："最爱 退款"`,
      `底部文案："失而复得的快乐 🌿"`,
      '如释重负的愉快氛围。'
    ].join('\n'),
  }

  const defaultPrompt = [
    `精美卡通插画海报，柔和治愈的色调。`,
    `一只可爱的小动物抱着"${emoji}"在一起，周围环绕着温馨美好的元素（花朵、星星、光点）。`,
    `【核心文字】画面中央展示："最爱 ${category}"`,
    `底部文案："生活中的小美好 ✨"`
  ].join('\n')

  const prompt = categoryPrompts[category] || defaultPrompt
  const url = await callHunyuanImage(prompt)
  dailyCounters.set(cacheKey, { url, time: Date.now() })

  return { success: true, url, cached: false, remaining, totalLimit: DAILY_LIMIT }
}
