/**
 * 小橘动作系统 —— record / profile 两页共用（单一数据源）
 *
 * 小橘的形象是**单张静态 PNG**（miniprogram/images/juji-mascot.png），
 * 所有动作都由两样东西组合而成，不需要任何新素材：
 *   ① CSS transform 动画 —— 按动作给 .juji-pet-img 挂 .juji-pet--<action> 类，
 *      动画定义在 record.wxss / profile.wxss（两页必须保持一致）
 *   ② emoji 粒子 —— 从头顶飘出（❤ 💤 💫 ✨），规格见下方 PARTICLE_SPECS
 *
 * 新增一个动作需要同步 4 处，缺一个就会「点了没反应」：
 *   1. 本文件 ACTION_WEIGHTS / ACTION_BASE_MS 各加一条
 *   2. 本文件 PARTICLE_SPECS 加粒子（没粒子可跳过）
 *   3. utils/petPhrases.js 加同名语录组
 *   4. record.wxss 与 profile.wxss 各加 .juji-pet--<action> 动画 + @keyframes
 * 改完跑 `node test/check-pet-phrases.js` 校验（会逐项检查上述 4 处是否齐全）
 */

// 动作权重（合计 100）。idle 占比最大 —— 大部分时间它在安静呼吸，动作太密会显得吵
const ACTION_WEIGHTS = [
  ['idle', 16],
  ['wave', 11],
  ['heart', 11],
  ['jump', 11],
  ['jelly', 11],
  ['shake', 11],
  ['dance', 10],
  ['sleep', 9],
  ['dizzy', 6],
  ['sparkle', 4]
]

// 各动作的基础停留时长（ms），需 ≥ 对应 CSS 动画的总时长（时长 × 次数）
const ACTION_BASE_MS = {
  idle: 900,
  wave: 1400,   // 0.35s × 4
  heart: 1600,  // 爱心粒子飞行 1.4s
  jump: 1200,   // 0.65s
  jelly: 1000,  // 0.9s
  shake: 1000,  // 0.25s × 4
  dance: 1700,  // 0.42s × 4
  sleep: 1900,
  dizzy: 1400,  // 0.3s × 4
  sparkle: 1200 // 0.6s
}

// 粒子规格：left / bottom 相对 150rpx 的小橘容器，size 为字号（rpx），dur 为飞行时长（ms）
const PARTICLE_SPECS = {
  heart: [
    { emoji: '❤', left: 116, bottom: 116, size: 32, delay: 0, dur: 1400 }
  ],
  sleep: [
    { emoji: '💤', left: 106, bottom: 126, size: 30, delay: 0, dur: 1800 },
    { emoji: '💤', left: 122, bottom: 104, size: 22, delay: 300, dur: 1700 }
  ],
  dizzy: [
    { emoji: '💫', left: 100, bottom: 128, size: 30, delay: 0, dur: 1200 },
    { emoji: '💫', left: 126, bottom: 108, size: 24, delay: 160, dur: 1200 },
    { emoji: '💫', left: 84, bottom: 108, size: 22, delay: 320, dur: 1200 }
  ],
  sparkle: [
    { emoji: '✨', left: 28, bottom: 120, size: 26, delay: 0, dur: 1100 },
    { emoji: '✨', left: 56, bottom: 134, size: 32, delay: 110, dur: 1100 },
    { emoji: '✨', left: 92, bottom: 128, size: 28, delay: 220, dur: 1100 },
    { emoji: '🎉', left: 118, bottom: 116, size: 30, delay: 330, dur: 1100 }
  ]
}

const ACTION_NAMES = ACTION_WEIGHTS.map(function (pair) { return pair[0] })

// 已出现过的上两个动作，用于避免连续重复
var _recent = []

/**
 * 按权重随机抽一个动作
 * @returns {string}
 */
function pickPetAction() {
  var total = 0
  for (var i = 0; i < ACTION_WEIGHTS.length; i++) total += ACTION_WEIGHTS[i][1]

  var hit = Math.random() * total
  var acc = 0
  var picked = ACTION_WEIGHTS[0][0]
  for (var j = 0; j < ACTION_WEIGHTS.length; j++) {
    acc += ACTION_WEIGHTS[j][1]
    if (hit < acc) { picked = ACTION_WEIGHTS[j][0]; break }
  }

  // 同一个动作连着来两次会显得很呆（尤其 dizzy/sparkle 这类低频动作）
  var guard = 0
  while (_recent.indexOf(picked) !== -1 && guard < 4) {
    hit = Math.random() * total
    acc = 0
    picked = ACTION_WEIGHTS[ACTION_WEIGHTS.length - 1][0]
    for (var k = 0; k < ACTION_WEIGHTS.length; k++) {
      acc += ACTION_WEIGHTS[k][1]
      if (hit < acc) { picked = ACTION_WEIGHTS[k][0]; break }
    }
    guard++
  }
  _recent.push(picked)
  if (_recent.length > 2) _recent.shift()

  return picked
}

/**
 * 构造本次要渲染的粒子数组（无粒子的动作返回空数组）
 * @param {string} action
 * @returns {Array<{id:string, emoji:string, style:string}>}
 */
function buildPetParticles(action) {
  var specs = PARTICLE_SPECS[action] || []
  var stamp = Date.now()
  return specs.map(function (s, i) {
    return {
      id: action + '_' + i + '_' + stamp,
      emoji: s.emoji,
      style: 'left:' + s.left + 'rpx;' +
             'bottom:' + s.bottom + 'rpx;' +
             'font-size:' + s.size + 'rpx;' +
             'animation-delay:' + s.delay + 'ms;' +
             'animation-duration:' + s.dur + 'ms;'
    }
  })
}

/**
 * 动作停留时长：动作基础时长与「按字数读得完」取较大值
 * @param {string} action
 * @param {string} phrase 本次气泡文案，空串表示没气泡
 */
function petActionHoldMs(action, phrase) {
  var base = ACTION_BASE_MS[action] || 1100
  if (!phrase) return base
  return Math.max(base, 900 + phrase.length * 70)
}

module.exports = {
  ACTION_WEIGHTS: ACTION_WEIGHTS,
  ACTION_BASE_MS: ACTION_BASE_MS,
  ACTION_NAMES: ACTION_NAMES,
  PARTICLE_SPECS: PARTICLE_SPECS,
  pickPetAction: pickPetAction,
  buildPetParticles: buildPetParticles,
  petActionHoldMs: petActionHoldMs
}
