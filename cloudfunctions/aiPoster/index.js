const cloud = require('wx-server-sdk')
const tcb = require('@cloudbase/node-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const app = tcb.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const ai = app.ai()

const cache = new Map()

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

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

const STYLE_PREFIX = 'Premium 3D render, minimalist, Pop Mart blind box style, cute and elegant, claymorphism texture, soft pastel solid background, studio lighting, octane render, 8k resolution, clean composition, macro photography, --no text, watermarks, clutter'

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

// ═══════════════════════════════════════════
//  天数分段配置 — Premium 3D 盲盒风
// ═══════════════════════════════════════════

const DAYS_CONFIG = [
  {
    max: 7,
    scenes: [
      { scene: 'A cute 3D clay orange tabby kitten sitting on a fluffy cloud of gold coins, a tiny sprouting piggy bank beside it, soft warm pastel background', accentColor: 'Warm Orange' },
      { scene: 'A round 3D clay hedgehog with tiny green leaves on its back, standing next to a sprouting seedling, dewdrops catching light, soft fresh green pastel background', accentColor: 'Fresh Green' },
      { scene: 'A chubby 3D clay red panda hugging a small open ledger book, sitting in a pile of bamboo leaves, sparkling eyes, soft bamboo green pastel background', accentColor: 'Bamboo Green' }
    ]
  },
  {
    max: 30,
    scenes: [
      { scene: 'A 3D clay fox wearing round glasses, sitting at a cozy wooden desk with an open ledger, stacked coins and a steaming coffee cup, soft warm brown pastel background', accentColor: 'Warm Brown' },
      { scene: 'A 3D clay dolphin leaping out of water, holding a pearl necklace of tiny numbers in its mouth, golden sunrise glow, soft ocean blue pastel background', accentColor: 'Ocean Blue' },
      { scene: 'A diligent 3D clay squirrel neatly stacking acorns into labeled wooden compartments, dappled sunlight through leaves, soft amber pastel background', accentColor: 'Amber' }
    ]
  },
  {
    max: 100,
    scenes: [
      { scene: 'A happy 3D clay bunny hugging a giant golden piggy bank, rainbow light rays bursting outward, floating stars, soft pastel pink background', accentColor: 'Pastel Pink' },
      { scene: 'A proud 3D clay penguin standing atop an ice peak with wings spread wide, aurora borealis glowing above, soft aurora purple pastel background', accentColor: 'Aurora Purple' },
      { scene: 'A cheerful 3D clay puppy wearing a tiny chef hat, dancing on top of a layered cake with cream rosettes, confetti floating, soft sweet pink pastel background', accentColor: 'Sweet Pink' }
    ]
  },
  {
    max: 365,
    scenes: [
      { scene: 'A 3D clay bear wearing round glasses, standing before a glowing golden gate, floating numbers and upward arrows around it, soft golden blue pastel background', accentColor: 'Golden Blue' },
      { scene: 'An elegant 3D clay giraffe reaching for stars, each caught star turning into a gold coin falling into its basket, milky way background, soft starry purple pastel background', accentColor: 'Starry Purple' },
      { scene: 'A focused 3D clay koala hugging a giant money tree with golden coin leaves, sunset light bathing everything in gold, soft twilight gold pastel background', accentColor: 'Twilight Gold' }
    ]
  },
  {
    max: Infinity,
    scenes: [
      { scene: 'A legendary 3D clay orange spirit sitting on a cloud throne, wearing a starlight cape, golden feather pen drawing sparkling number trails in the air, soft royal gold pastel background', accentColor: 'Royal Gold' },
      { scene: 'A majestic 3D clay white tiger standing on a cloud peak, cape made of golden threads, a giant hourglass of diamond sand floating before it, soft platinum white pastel background', accentColor: 'Platinum White' },
      { scene: 'A wise 3D clay owl wearing jeweled glasses, perched on a tree of gold coins and open ledgers, seasonal miniature scenes in the branches, soft emerald gold pastel background', accentColor: 'Emerald Gold' }
    ]
  }
]

function getDaysConfig(days) {
  for (const cfg of DAYS_CONFIG) { if (days < cfg.max) return cfg }
  return DAYS_CONFIG[DAYS_CONFIG.length - 1]
}

async function generateDaysImage({ days }, remaining) {
  const tierConfig = getDaysConfig(days)
  const cfg = pick(tierConfig.scenes)

  const prompt = [
    STYLE_PREFIX,
    cfg.scene,
    `3D metallic number "${days}" floating above, glossy texture, subtle glow`,
    'Centered composition, generous negative space, clean and minimal'
  ].join('\n')

  const url = await callHunyuanImage(prompt)
  return { success: true, url, cached: false, quote: '', remaining, totalLimit: DAILY_LIMIT }
}

// ═══════════════════════════════════════════
//  分类最爱海报 — Premium 3D 盲盒风
// ═══════════════════════════════════════════

async function generateCategoryImage({ category, emoji }, remaining) {
  const cacheKey = `cat_${category}`

  if (dailyCounters.has(cacheKey)) {
    const cached = dailyCounters.get(cacheKey)
    if (Date.now() - cached.time < 300000) {
      return { success: true, url: cached.url, cached: true, remaining, totalLimit: DAILY_LIMIT }
    }
  }

  const categoryVariants = {

    '餐饮': [
      [STYLE_PREFIX, 'A 3D clay gourmet burger floating mid-air, glossy melted cheese dripping, sesame seeds on the bun, soft warm orange pastel background', 'Centered, generous negative space, clean and minimal'],
      [STYLE_PREFIX, 'A 3D clay ramen bowl with steam rising, perfectly arranged noodles and a soft-boiled egg, chopsticks resting on top, soft lemon yellow pastel background', 'Centered, generous negative space, clean and minimal'],
      [STYLE_PREFIX, 'A 3D clay tiered cake with cream rosettes and a tiny cherry on top, sprinkles floating around, soft strawberry pink pastel background', 'Centered, generous negative space, clean and minimal']
    ],

    '交通': [
      [STYLE_PREFIX, 'A 3D clay mini car with tiny angel wings, hovering above a fluffy cloud, round headlights glowing, soft sky blue pastel background', 'Centered, generous negative space, clean and minimal'],
      [STYLE_PREFIX, 'A 3D clay vintage bicycle with a basket of flowers, coasting on a rainbow arc, petals trailing behind, soft sunset orange pastel background', 'Centered, generous negative space, clean and minimal'],
      [STYLE_PREFIX, 'A 3D clay bullet train zooming forward with speed lines, windows glowing warmly, tiny stars around it, soft mint green pastel background', 'Centered, generous negative space, clean and minimal']
    ],

    '购物': [
      [STYLE_PREFIX, 'A single glowing 3D shopping bag with a ribbon bow, surrounded by floating gold coins and tiny sparkles, soft dreamy pink pastel background', 'Centered, generous negative space, clean and minimal'],
      [STYLE_PREFIX, 'A 3D clay shopping cart filled with colorful wrapped gifts, a golden star hovering above, soft glittering champagne pastel background', 'Centered, generous negative space, clean and minimal'],
      [STYLE_PREFIX, 'A 3D clay credit card standing upright with tiny wings, gold coins orbiting around it like planets, soft macaron lavender pastel background', 'Centered, generous negative space, clean and minimal']
    ],

    '娱乐': [
      [STYLE_PREFIX, 'A 3D clay game controller with sparkle effects and tiny floating stars, neon glow accents, soft vibrant coral pastel background', 'Centered, generous negative space, clean and minimal'],
      [STYLE_PREFIX, 'A 3D clay vinyl record spinning with colorful sound waves emanating, tiny music notes floating, soft dreamy violet pastel background', 'Centered, generous negative space, clean and minimal'],
      [STYLE_PREFIX, 'A 3D clay movie ticket and popcorn bucket side by side, golden confetti falling, soft warm cinema amber pastel background', 'Centered, generous negative space, clean and minimal']
    ],

    '学习': [
      [STYLE_PREFIX, 'A stack of 3D glowing books with a tiny golden star on top, pages fanning open with light particles, soft warm cream pastel background', 'Centered, generous negative space, clean and minimal'],
      [STYLE_PREFIX, 'A 3D clay graduation cap resting on an open book, golden light rays rising from the pages, soft fresh mint pastel background', 'Centered, generous negative space, clean and minimal'],
      [STYLE_PREFIX, 'A 3D clay lightbulb with a tiny plant growing inside, roots made of glowing filament, soft sage green pastel background', 'Centered, generous negative space, clean and minimal']
    ],

    '日用': [
      [STYLE_PREFIX, 'A 3D clay scented candle with a warm flame, next to a tiny succulent pot on a floating wooden shelf, soft cozy cream pastel background', 'Centered, generous negative space, clean and minimal'],
      [STYLE_PREFIX, 'A 3D clay fluffy towel roll with a lavender sprig, a tiny soap bar with heart stamp, soft gentle lavender pastel background', 'Centered, generous negative space, clean and minimal'],
      [STYLE_PREFIX, 'A 3D clay coffee mug with latte art heart, steam forming tiny stars, a croissant beside it, soft warm caramel pastel background', 'Centered, generous negative space, clean and minimal']
    ],

    '医疗': [
      [STYLE_PREFIX, 'A 3D clay red apple halved open, revealing a glowing golden heart inside, tiny leaf on the stem, soft fresh green pastel background', 'Centered, generous negative space, clean and minimal'],
      [STYLE_PREFIX, 'A 3D clay first-aid kit with a glowing cross emblem, tiny bandage with a smile, a green leaf beside it, soft sprout green pastel background', 'Centered, generous negative space, clean and minimal'],
      [STYLE_PREFIX, 'A 3D clay vitamin bottle with a sunshine cap, tiny capsules floating around in rainbow colors, soft clean white pastel background', 'Centered, generous negative space, clean and minimal']
    ],

    '工资': [
      [STYLE_PREFIX, 'A golden envelope bursting open with 3D metallic coins and tiny stars shooting upward, ribbon unfurling, soft festive gold-red pastel background', 'Centered, generous negative space, clean and minimal'],
      [STYLE_PREFIX, 'A 3D clay paycheck with a golden seal, surrounded by floating champagne bubbles and confetti, soft dazzling champagne pastel background', 'Centered, generous negative space, clean and minimal'],
      [STYLE_PREFIX, 'A 3D crystal piggy bank overflowing with gold coins, a tiny crown on top, sparkles everywhere, soft celebratory red-gold pastel background', 'Centered, generous negative space, clean and minimal']
    ],

    '兼职': [
      [STYLE_PREFIX, 'A 3D clay laptop with a tiny steaming coffee cup beside it, warm desk lamp glow, cozy working atmosphere, soft warm orange pastel background', 'Centered, generous negative space, clean and minimal'],
      [STYLE_PREFIX, 'A 3D clay delivery box with wings, flying through the air with a tiny trail of stars, soft energetic sunrise orange pastel background', 'Centered, generous negative space, clean and minimal'],
      [STYLE_PREFIX, 'A 3D clay toolbox with each tool glowing a different color, a tiny lightbulb above, soft warm sunset gold pastel background', 'Centered, generous negative space, clean and minimal']
    ],

    '理财': [
      [STYLE_PREFIX, 'A 3D crystal piggy bank filled with glowing coins of different sizes, a tiny upward arrow growing from the top, soft deep blue pastel background', 'Centered, generous negative space, clean and minimal'],
      [STYLE_PREFIX, 'A 3D clay bar chart growing upward, each bar a different shade of green, a golden coin at the peak, soft emerald green pastel background', 'Centered, generous negative space, clean and minimal'],
      [STYLE_PREFIX, 'A 3D clay seed sprouting into a golden coin tree, roots visible in transparent soil, steady growth, soft forest green pastel background', 'Centered, generous negative space, clean and minimal']
    ],

    '红包': [
      [STYLE_PREFIX, 'A 3D red envelope opening with golden light rays bursting outward, tiny lucky stars floating, soft festive Chinese red pastel background', 'Centered, generous negative space, clean and minimal'],
      [STYLE_PREFIX, 'A stack of 3D red envelopes tied with golden ribbon, a tiny fortune cat beside them, sparkles rising, soft warm red-gold pastel background', 'Centered, generous negative space, clean and minimal'],
      [STYLE_PREFIX, 'A 3D clay fortune cat waving, golden coins raining from a red envelope above, lantern glow in background, soft palace red pastel background', 'Centered, generous negative space, clean and minimal']
    ],

    '退款': [
      [STYLE_PREFIX, 'A 3D clay boomerang returning with tiny gold coins attached to it, a green checkmark floating above, soft relaxed mint pastel background', 'Centered, generous negative space, clean and minimal'],
      [STYLE_PREFIX, 'A 3D clay arrow doing a U-turn back to a glowing piggy bank, tiny hearts floating, soft bright mint pastel background', 'Centered, generous negative space, clean and minimal'],
      [STYLE_PREFIX, 'A 3D clay parcel returning to open hands, green sparkles and a smiley face, soft clear grass green pastel background', 'Centered, generous negative space, clean and minimal']
    ]
  }

  const defaultVariants = [
    [STYLE_PREFIX, `A cute 3D clay mascot holding a "${emoji}" object, soft warm pastel background`, 'Centered, minimal, clean'],
    [STYLE_PREFIX, `A 3D clay treasure chest opening with "${emoji}" glowing inside, golden sparkles rising, soft pastel background`, 'Centered, minimal, clean'],
    [STYLE_PREFIX, `A 3D clay floating island with "${emoji}" on top, tiny clouds and stars around, soft dreamy pastel background`, 'Centered, minimal, clean']
  ]

  const variants = categoryVariants[category] || defaultVariants
  const prompt = pick(variants).join('\n')

  const url = await callHunyuanImage(prompt)
  dailyCounters.set(cacheKey, { url, time: Date.now() })

  return { success: true, url, cached: false, remaining, totalLimit: DAILY_LIMIT }
}
