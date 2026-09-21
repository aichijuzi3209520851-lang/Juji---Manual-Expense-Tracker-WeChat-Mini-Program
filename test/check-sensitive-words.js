/**
 * 橘记JUJI · 备注违禁词拦截 —— 纯逻辑测试（node test/check-sensitive-words.js）
 *
 * 覆盖三层：
 *  1) 命中：黄赌毒及各类违禁词必须被判定为 blocked，并给出可读类别
 *  2) 变体：空格 / 标点 / 全角 / 大小写混淆不能绕过
 *  3) 防误杀：正常记账备注一律放行
 */
const { scanSensitiveText, checkTextSafe, buildSensitiveMessage, maskSensitiveText } = require('../miniprogram/utils/sensitiveWords')

let pass = 0
let fail = 0

function ok(cond, name, extra) {
  if (cond) { pass++; console.log('PASS ' + name) } else { fail++; console.log('FAIL ' + name + (extra ? ' -- ' + extra : '')) }
}

// 1) 命中：违禁样本（类别级短语，与线上词库同源）
const SHOULD_BLOCK = [
  ['黄', '在网上下了黄色视频'],
  ['黄', '有人发我色情网站链接'],
  ['黄', '昨晚裸聊被骗了'],
  ['赌', '今天赌博输了2000'],
  ['赌', '朋友拉我去赌球'],
  ['赌', '六合彩能不能买'],
  ['赌', '网上投注平台提现不了'],
  ['毒', '买了毒品藏在家里'],
  ['毒', '他在吸毒'],
  ['毒', '冰毒多少钱一克'],
  ['毒', '大麻算不算违禁品'],
  ['武器', '搞一把枪多少钱'],
  ['武器', '自制炸药配方'],
  ['违法', '有人教我洗钱'],
  ['违法', '信用卡套现被风控'],
  ['自伤', '不想活了想自杀'],
  ['自伤', '割腕之后怎么处理']
]
SHOULD_BLOCK.forEach(function (item, i) {
  const res = scanSensitiveText(item[1])
  ok(res.blocked === true, 'B' + (i + 1) + ' 命中拦截[' + item[0] + ']: ' + item[1],
    '实际 blocked=' + res.blocked)
  ok(res.hits.length > 0 && res.hits[0].label, 'B' + (i + 1) + '-label 命中词可归类: ' + JSON.stringify(res.hits.map(h => h.word + '/' + h.label)))
})

// 2) 变体绕过：空格 / 标点 / 全角 / 大小写
const EVASIONS = [
  '冰-毒',
  '冰 毒',
  '毒．品',
  'ＰＯＲＮ',
  'P o r n',
  '赌_博',
  '大麻(干)',
  '赌　博'
]
EVASIONS.forEach(function (t, i) {
  const res = scanSensitiveText(t)
  ok(res.blocked === true, 'E' + (i + 1) + ' 变体不绕过: ' + t, '实际 blocked=' + res.blocked)
})

// 3) 防误杀：正常备注必须放行
const SHOULD_PASS = [
  '和同事聚餐AA',
  '打车去公司',
  '买了一件黄色雨伞',
  '地铁通勤',
  '咖啡续命',
  '房租水电',
  '给妈妈买生日礼物',
  '看电影《长津湖》',
  '超市采购日用品',
  '健身房月卡',
  '病毒感冒买药',
  '下注：午餐吃什么',
  '',
  '   '
]
SHOULD_PASS.forEach(function (t, i) {
  const res = scanSensitiveText(t)
  ok(res.blocked === false, 'P' + (i + 1) + ' 正常备注放行: 「' + t + '」',
    '误杀词=' + JSON.stringify(res.words))
})

// 4) 接口契约
const bad = checkTextSafe('赌博输钱')
ok(bad.ok === false && bad.blocked === true && typeof bad.message === 'string' && bad.message.length > 0,
  'C1 checkTextSafe 返回可拦截结果', JSON.stringify(bad))
ok(/赌博/.test(buildSensitiveMessage(bad.hits)), 'C2 告警文案含违规类别', buildSensitiveMessage(bad.hits))
const good = checkTextSafe('午饭 25 元')
ok(good.ok === true && good.hits.length === 0, 'C3 checkTextSafe 正常内容返回 ok')
ok(maskSensitiveText('买毒品花了钱').indexOf('毒品') === -1, 'C4 maskSensitiveText 脱敏不回显原词', maskSensitiveText('买毒品花了钱'))

console.log('\n用例: ' + (pass + fail) + ' · 通过 ' + pass + ' · 失败 ' + fail + ' · 判定: ' + (fail === 0 ? 'PASS' : 'FAIL'))
process.exit(fail === 0 ? 0 : 1)
