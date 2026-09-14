/**
 * 小橘气泡语录池 —— record / profile 两页共用（单一数据源）
 *
 * ⚠️ 新增语录的硬性约束，改前必读：
 * 1. 单条长度 ≤ MAX_PHRASE_LEN（16 字符，含标点）
 *    气泡样式为 white-space: nowrap 单行不换行；16 字 = 16×22rpx + 内边距 ≈ 395rpx，
 *    右边距对齐后仍能完整落在 750rpx 屏宽内。超长会顶出屏幕右侧。
 * 2. 长度同时决定气泡停留时长（见 holdMsFor），15 字左右约 2 秒，符合阅读节奏。
 * 3. record 页气泡位于 .amount-hero 内，该容器 overflow:hidden，
 *    小橘上方只有 104rpx 可用空间 —— 这就是必须单行的原因（换行会被裁掉）。
 * 4. 文案基调：调皮、陪伴、记账提醒；不要出现真实金额、用户数据或平台品牌名。
 *
 * ⚠️ 组名必须与 utils/petActions.js 的动作名一一对应（wave / heart / jump / jelly /
 *    shake / dance / sleep / dizzy / sparkle），否则该动作永远弹不出气泡。
 *    新增动作的完整同步清单见 petActions.js 顶部注释。
 */
const MAX_PHRASE_LEN = 16

const PET_PHRASES = {
  // 打招呼 / 点开对话（点击小橘、随机招手）
  wave: [
    '耍起！耍起！',
    '嗨，今天记了几笔呀？',
    '小橘上线，元气拉满！',
    '来了来了，小橘在这儿~',
    '记账了吗？小橘盯着你哦',
    '摸鱼可以，记假账不行'
  ],
  // 爱心动作
  heart: [
    '给你小心心',
    '小橘最喜欢你啦',
    '抱一下，充个电',
    '爱你哟，比个心！',
    '今天的你，值得被夸'
  ],
  // 蹦跳动作
  jump: [
    '蹦跶一下，钱要花在刀刃上',
    '省下来的都是小橘的功劳！',
    '记账一时爽，一直记账一直爽',
    '钱包鼓起来，小橘跳起来'
  ],
  // 随机随口（呼吸/idle 时概率触发）
  idle: [
    '来和小橘说话，小橘说话蛮有味~',
    '我超威，你记账不要记假账呀！',
    '小橘掐指一算，你快超支了',
    '这个月预算还稳得住吗？',
    '别乱花，小橘会心疼的',
    '省钱不是抠，是对未来有想法',
    '今天开心吗？不开心就吃顿好的',
    '钱包瘦了，小橘也瘦了',
    '小橘在，账就不会乱'
  ],
  // 果冻弹：Q 弹挤压回弹
  jelly: [
    '弹弹弹，弹走小烦恼',
    '小橘是果冻做的哦~',
    '捏一下，会弹回来',
    'Q弹Q弹，弹一下'
  ],
  // 抖一抖：快速小幅摇摆
  shake: [
    '抖一抖，霉运走开',
    '别捏我，痒痒的！',
    '摇摇头，钱要省下来',
    '抖抖抖，财运来'
  ],
  // 摇摆舞：长摆动
  dance: [
    '扭一扭，心情好一点',
    '小橘给你跳一支！',
    '摇起来，开心最重要',
    '跟着小橘扭两下'
  ],
  // 打盹：呼吸放慢 + 💤
  sleep: [
    '小橘打个盹先~',
    '困了困了，别吵哦',
    '梦里也在帮你记账',
    'Zzz…记得叫醒我'
  ],
  // 转晕：左右晃 + 💫
  dizzy: [
    '转晕了，别逗小橘',
    '晃晃头，清醒一下',
    '眼花花的，钱没花哦'
  ],
  // 撒花：开心上弹 + ✨🎉
  sparkle: [
    '开心！撒花庆祝',
    '记账成功，撒花！',
    '为你撒一把小星星',
    '今天也超棒的！'
  ]
}

// 全量池：idle 时从所有语录里随机，避免同一组反复出现
const ALL_PHRASES = Object.keys(PET_PHRASES).reduce(function (acc, key) {
  return acc.concat(PET_PHRASES[key])
}, [])

// idle 时弹出气泡的概率（其余时间安静呼吸，避免刷屏感）
const IDLE_BUBBLE_RATE = 0.6

var _lastPhrase = ''

function pickPhrase(list) {
  if (!list || !list.length) return ''
  if (list.length === 1) return list[0]
  var phrase = list[Math.floor(Math.random() * list.length)]
  // 避免连续两次完全相同
  var guard = 0
  while (phrase === _lastPhrase && guard < 5) {
    phrase = list[Math.floor(Math.random() * list.length)]
    guard++
  }
  _lastPhrase = phrase
  return phrase
}

/**
 * 按动作选取气泡文案
 * 组名与动作名一一对应（见 utils/petActions.js 的 ACTION_WEIGHTS）：
 * 有同名组就用该组，没有（idle）则按概率从全量池里随机
 * @param {string} action idle | wave | heart | jump | jelly | shake | dance | sleep | dizzy | sparkle
 * @returns {string} 文案；返回空串表示本次不弹气泡
 */
function pickPetPhrase(action) {
  if (action && action !== 'idle' && PET_PHRASES[action]) {
    return pickPhrase(PET_PHRASES[action])
  }
  return Math.random() < IDLE_BUBBLE_RATE ? pickPhrase(ALL_PHRASES) : ''
}

module.exports = {
  MAX_PHRASE_LEN: MAX_PHRASE_LEN,
  PET_PHRASES: PET_PHRASES,
  ALL_PHRASES: ALL_PHRASES,
  pickPetPhrase: pickPetPhrase
}
