// 橘记JUJI — 违禁词库与本地实时拦截
//
// 定位：这是**第一道防线**，在用户输入的瞬间就判定，命中即弹窗告警并阻断提交。
// 云端（bills 云函数 validate / contentSafety 云函数）仍保留同名兜底校验，
// 防止绕过前端直接调用云接口写入。两处词库需同步维护。
//
// 设计要点：
//  1. 匹配前做归一化：全角转半角、统一小写、剔除空白与标点，
//     这样「冰-毒」「大 麻」「ＰＯＲＮ」这类简单变体也拦得住。
//  2. 只返回命中词与类别，不回显整段原文，避免告警弹窗二次传播违规内容。

const DEFAULT_ALERT = '包含违禁内容，请修改后再试'

const CATEGORY_LABELS = {
  porn: '色情低俗',
  gamble: '赌博博彩',
  drug: '毒品',
  weapon: '暴力武器',
  crime: '违法交易',
  selfHarm: '自伤自杀'
}

// 归一化时剔除的字符：空白、ASCII 标点、通用/中日韩标点、全角符号。
// 保留中文、英文字母与数字，避免把「餐饮 38」这类正常内容揉成新词。
const FILLER_RE = /[\s\u0000-\u002F\u003A-\u0040\u005B-\u0060\u007B-\u007E\u2000-\u206F\u3000-\u303F\uFF00-\uFFEF]+/g

// 词库：按违规类别分组。校验顺序 = 数组顺序，命中即记录。
// 注意：不要收录会造成明显误杀的常用词（例：单独收录「黄色」会误杀「黄色雨伞」）。
const WORD_BANK = [
  {
    category: 'porn',
    words: [
      '黄赌毒', '色情', '情色', '淫秽', '涉黄', '黄片', '黄网', '黄色视频', '黄色网站', '黄色小说',
      '黄色图片', '黄色影片', '黄色漫画', '黄色录像', '毛片', '三级片', '成人影片', '成人视频',
      '成人电影', '色情网站', '色情视频', '色情聊天', '裸聊', '约炮', '招嫖', '嫖娼', '卖淫',
      '性交易', '性服务', '一夜情', '援交', '包养', '换妻', '裸照', '偷拍', '迷奸', '迷药',
      '催情药', '春药', '强奸', '猥亵', '性侵', 'porn', 'pornhub', 'xvideos'
    ]
  },
  {
    category: 'gamble',
    words: [
      '赌博', '赌场', '赌球', '赌马', '赌资', '赌局', '赌债', '赌徒', '聚赌', '网赌', '网络赌博',
      '境外赌博', '地下赌场', '赌博机', '老虎机', '博彩', '六合彩', '私彩', '地下彩票', '代购彩票',
      '时时彩', '北京赛车', '外围球', '投注', '赌注', '押注', '开盘口', '牌九', '麻将赌博',
      '赌狗', 'bet365', '1xbet', 'casino'
      // 注：不收录单独「下注」——「我下注这家店」这类口语会造成误杀
    ]
  },
  {
    category: 'drug',
    words: [
      '毒品', '吸毒', '贩毒', '制毒', '运毒', '藏毒', '毒资', '冰毒', '海洛因', '大麻', '摇头丸',
      'k粉', '可卡因', '吗啡', '鸦片', '罂粟', '甲基苯丙胺', '注射毒品', '买卖毒品', '毒品交易',
      'cocaine', 'heroin', 'marijuana', 'methamphetamine', 'mdma'
    ]
  },
  {
    category: 'weapon',
    words: [
      '枪支', '一把枪', '买枪', '卖枪', '枪械', '弹药', '子弹', '手枪', '步枪', '猎枪', '制枪', '炸药',
      '炸弹', '爆炸物', '制爆', '雷管', '导火索', '火药', '管制刀具', '恐怖袭击', '暴恐',
      '雇凶', '买凶'
      // 注：不收录单独「杀人」——「杀人游戏/杀人回忆」等影视娱乐场景会误杀
    ]
  },
  {
    category: 'crime',
    words: [
      '诈骗', '电信诈骗', '网络诈骗', '金融诈骗', '骗保', '骗贷', '洗钱', '套现', '跑分', '走私',
      '偷渡', '办假证', '假证', '代开发票', '虚开发票', '假发票', '传销', '非法集资', '高利贷',
      '裸贷', '校园贷', '买卖银行卡', '出售银行卡', '出售个人信息', '盗号', '黑客攻击', '黑灰产',
      '黑产', '刷单返利'
    ]
  },
  {
    category: 'selfHarm',
    words: ['自杀', '自残', '轻生', '割腕', '烧炭', '跳楼', '跳桥', '服毒', '安乐死']
  }
]

function normalizeForMatch(text) {
  return String(text == null ? '' : text)
    .replace(/[\uFF01-\uFF5E]/g, function (ch) {
      return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
    })
    .replace(/\u3000/g, ' ')
    .toLowerCase()
    .replace(FILLER_RE, '')
}

/**
 * 扫描文本中的违禁词
 * @param {string} text
 * @returns {{ blocked: boolean, hits: Array<{word:string,category:string,label:string}>, words: string[], categories: string[], labels: string[], message: string }}
 */
function scanSensitiveText(text) {
  const raw = String(text == null ? '' : text)
  const empty = { blocked: false, hits: [], words: [], categories: [], labels: [], message: '' }
  if (!raw.trim()) return empty

  const norm = normalizeForMatch(raw)
  if (!norm) return empty

  const hits = []
  const seen = {}
  WORD_BANK.forEach(function (group) {
    group.words.forEach(function (word) {
      const key = normalizeForMatch(word)
      if (!key || seen[word]) return
      if (norm.indexOf(key) !== -1) {
        seen[word] = true
        hits.push({
          word: word,
          category: group.category,
          label: CATEGORY_LABELS[group.category] || '违禁内容'
        })
      }
    })
  })

  if (!hits.length) return empty

  const labels = []
  hits.forEach(function (h) { if (labels.indexOf(h.label) === -1) labels.push(h.label) })
  return {
    blocked: true,
    hits: hits,
    words: hits.map(function (h) { return h.word }),
    categories: hits.map(function (h) { return h.category }),
    labels: labels,
    message: buildSensitiveMessage(hits)
  }
}

function buildSensitiveMessage(hits) {
  const labels = []
  ;(hits || []).forEach(function (h) {
    const label = h.label || CATEGORY_LABELS[h.category] || '违禁内容'
    if (labels.indexOf(label) === -1) labels.push(label)
  })
  if (!labels.length) return DEFAULT_ALERT
  return '包含' + labels.join('、') + '类违禁内容，请修改后再试'
}

/**
 * 判定文本是否可以提交
 * @returns {{ ok: boolean, blocked: boolean, message: string, hits: Array }}
 */
function checkTextSafe(text) {
  const res = scanSensitiveText(text)
  if (!res.blocked) return { ok: true, blocked: false, message: '', hits: [] }
  return { ok: false, blocked: true, message: res.message, hits: res.hits }
}

// 自伤类输入不走「内容违规」的冷处理：命中时聊天场景返回关怀文案（含求助热线），
// 其余场景（备注拦截等）仍按违禁词正常阻断。云端 aiChat 有同文案副本（部署隔离，需同步维护）。
const SELF_HARM_CARE_REPLY = '听到你这么说，小橘很担心你。你现在的感受很重要，别一个人扛着——可以拨打全国心理援助热线 12356（24 小时免费），或和信任的家人朋友聊一聊。小橘会一直在这里陪着你 🍊'

/** 命中列表里是否包含自伤类（用于聊天场景切换为关怀回应，而非普通兜底文案） */
function isSelfHarmHit(hits) {
  return (hits || []).some(function (h) { return h && h.category === 'selfHarm' })
}

/**
 * 弹出明确警示窗口（wx.showModal），阻断后续提交。
 * @returns {boolean} true=可放行；false=已命中违禁词
 */
function alertSensitiveText(text, options) {
  const opts = options || {}
  const res = checkTextSafe(text)
  if (res.ok) return true
  showSensitiveAlert(res, opts)
  return false
}

function showSensitiveAlert(res, options) {
  const opts = options || {}
  const content = opts.content || (res && res.message) || DEFAULT_ALERT
  const payload = {
    title: opts.title || '内容违规提醒',
    content: content,
    showCancel: false,
    confirmText: opts.confirmText || '我知道了',
    confirmColor: opts.confirmColor || '#FF7A45'
  }
  if (typeof wx !== 'undefined' && wx.showModal) {
    wx.showModal(payload)
  }
  return false
}

/** 命中词脱敏，用于日志/埋点（默认保留首字，其余打码） */
function maskSensitiveText(text) {
  const raw = String(text == null ? '' : text)
  const res = scanSensitiveText(raw)
  if (!res.blocked) return raw
  return res.words.reduce(function (acc, word) {
    const masked = word.charAt(0) + '*'.repeat(Math.max(1, word.length - 1))
    return acc.split(word).join(masked)
  }, raw)
}

module.exports = {
  CATEGORY_LABELS,
  WORD_BANK,
  DEFAULT_ALERT,
  SELF_HARM_CARE_REPLY,
  scanSensitiveText,
  checkTextSafe,
  isSelfHarmHit,
  alertSensitiveText,
  showSensitiveAlert,
  buildSensitiveMessage,
  maskSensitiveText,
  normalizeForMatch
}
