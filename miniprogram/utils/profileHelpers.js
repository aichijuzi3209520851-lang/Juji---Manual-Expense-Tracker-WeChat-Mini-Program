const { getUserThemeById } = require('./theme')

const THEMES = [
  { id: 'mint', name: '清爽薄荷（默认）', desc: '清新绿底，护眼舒适' },
  { id: 'fresh', name: '温馨玫瑰', desc: '暖白底 + 柔和玫瑰色' },
  { id: 'dark', name: '夜猫子', desc: '深色背景，护眼夜间模式' },
  { id: 'skyBlue', name: '蓝天白云', desc: '天蓝底 + 清透蓝色' }
]

const GENDERS = ['未设置', '男', '女']

const ZODIAC_SIGNS = [
  { name: '摩羯座', start: [1, 1], end: [1, 19] },
  { name: '水瓶座', start: [1, 20], end: [2, 18] },
  { name: '双鱼座', start: [2, 19], end: [3, 20] },
  { name: '白羊座', start: [3, 21], end: [4, 19] },
  { name: '金牛座', start: [4, 20], end: [5, 20] },
  { name: '双子座', start: [5, 21], end: [6, 21] },
  { name: '巨蟹座', start: [6, 22], end: [7, 22] },
  { name: '狮子座', start: [7, 23], end: [8, 22] },
  { name: '处女座', start: [8, 23], end: [9, 22] },
  { name: '天秤座', start: [9, 23], end: [10, 23] },
  { name: '天蝎座', start: [10, 24], end: [11, 22] },
  { name: '射手座', start: [11, 23], end: [12, 21] },
  { name: '摩羯座', start: [12, 22], end: [12, 31] }
]

const OCCUPATIONS = ['学生', '程序员', '自由职业者', '设计师', '教师']

const CATEGORY_EMOJI = {
  '餐饮':'🍜','交通':'🚇','购物':'🛍️','娱乐':'🎮','学习':'📚','日用':'🏠','医疗':'💊',
  '工资':'💼','兼职':'🧳','理财':'💹','红包':'🎁','退款':'↩️','其他':'📌'
}

function resolveThemeName(id) {
  if (id && id.indexOf('user_') === 0) {
    const t = getUserThemeById(id)
    if (t) return t.name
  }
  const preset = THEMES.find(t => t.id === id)
  return preset ? preset.name : THEMES[0].name
}

function getZodiac(birthday) {
  if (!birthday) return ''
  var parts = birthday.split('-')
  var m = parseInt(parts[1], 10)
  var d = parseInt(parts[2], 10)
  for (var i = 0; i < ZODIAC_SIGNS.length; i++) {
    var z = ZODIAC_SIGNS[i]
    var afterStart = (m > z.start[0]) || (m === z.start[0] && d >= z.start[1])
    var beforeEnd = (m < z.end[0]) || (m === z.end[0] && d <= z.end[1])
    if (afterStart && beforeEnd) return z.name
  }
  return ''
}

module.exports = {
  CATEGORY_EMOJI,
  GENDERS,
  OCCUPATIONS,
  getZodiac,
  resolveThemeName
}
