const { applyTheme, getThemeStyleString } = require('../../utils/theme')
const app = getApp()

// 帮助中心内容：所有步骤均与当前版本代码行为逐一核对（2026-09-13）
const HELP_GROUPS = [
  {
    id: 'start',
    icon: '🚀',
    title: '快速上手',
    topics: [
      {
        id: 'first-login',
        title: '第一次使用橘记JUJI',
        steps: [
          '打开小程序，进入登录页',
          '点《隐私协议》《用户协议》可先阅读全文',
          '勾选「我已阅读并同意」',
          '点「微信一键登录」',
          '首次使用会看到 4 屏新手引导，滑到最后一屏，点「开启记账之旅」进入首页'
        ],
        tip: '引导页没有跳过按钮，滑到最后一屏即可。'
      },
      {
        id: 'first-bill',
        title: '记下第一笔账',
        steps: [
          '点底部导航中间的「记一笔」',
          '顶部选择「支出」或「收入」',
          '输入金额（必填，最多 2 位小数，单笔最大 99999999.99）',
          '在分类格子中点选一个（支出 8 类 / 收入 6 类）',
          '按需补充：改日期、加备注（≤200 字）、拍照片、选心情',
          '点「保存」，提示成功后自动回到首页'
        ],
        tip: '金额框聚焦时底部会出现「确认记账」快捷条，按键盘「完成」键也能保存 —— 但快捷保存不写备注和照片，心情固定为 😊。'
      }
    ]
  },
  {
    id: 'bill',
    icon: '✍️',
    title: '记账',
    topics: [
      {
        id: 'edit-bill',
        title: '编辑一笔账',
        steps: [
          '在首页点开某条账单，进入详情页',
          '点底部「✏️ 编辑此账单」，会跳到「记一笔」页并自动回填内容',
          '修改后点「保存修改」；不想改就点「取消」返回'
        ]
      },
      {
        id: 'delete-bill',
        title: '删除一笔账',
        steps: [
          '方式一：在首页长按某条账单 → 点「确定」',
          '方式二：进入账单详情页 → 点「删除此账单」→ 确认'
        ],
        tip: '删除后这笔账不再计入统计；记录在云端仍有留痕（软删除），如需彻底清除请使用「清除所有数据」。'
      },
      {
        id: 'custom-category',
        title: '创建自己的分类',
        steps: [
          '在记一笔页，分类列表滑到末尾，点「+ 自创」',
          '输入名称（1–10 个字，不能与预设重名）并选一个 emoji',
          '保存后即可像普通分类一样使用'
        ],
        tip: '长按自定义分类格可删除；预设分类不可删除。'
      },
      {
        id: 'heatmap',
        title: '记账打卡日历',
        steps: [
          '进入「我的」页，展开「记账打卡」',
          '有账单的日子会自动点亮，点 ‹ › 可切换月份',
          '点颜色圆点可更换打卡颜色'
        ]
      }
    ]
  },
  {
    id: 'stats',
    icon: '📊',
    title: '统计',
    topics: [
      {
        id: 'trend',
        title: '看懂消费趋势',
        steps: [
          '点底部导航「统计」',
          '顶部切换「支出 / 收入」',
          '时间范围三选一：日（近 30 天）/ 周（近 12 周）/ 月（近 12 个月）',
          '点折线上的圆点，可查看当天金额与均值的差距'
        ]
      },
      {
        id: 'ranking',
        title: '分类排行榜',
        steps: [
          '统计页向下滚动到「排行榜」',
          '默认显示前 3 名，点「展开全部」可看最多前 8 名分类'
        ]
      },
      {
        id: 'ai-note',
        title: '小橘的便签（AI 消费点评）',
        steps: [
          '进入统计页会自动生成「昨日 / 上周 / 上月回顾」三张便签',
          '点卡片可查看全文',
          '觉得内容旧了，点「催小橘更新」重新生成'
        ]
      }
    ]
  },
  {
    id: 'budget',
    icon: '💰',
    title: '预算',
    topics: [
      {
        id: 'set-budget',
        title: '设置每月预算',
        steps: [
          '点底部导航「预算」（也可在首页预算条点「去设定」直达）',
          '点「去设定」或「调整预算」',
          '输入本月预算金额（默认 2000，最大 999999）',
          '点「保存」'
        ],
        tip: '圆环显示本月用量：用到 90% 提醒「快了快了」，超过 100% 提示「超预算了」。预算只能调整金额，暂不支持删除。'
      }
    ]
  },
  {
    id: 'ai',
    icon: '🍊',
    title: '小橘 AI',
    topics: [
      {
        id: 'ai-chat',
        title: '和小橘聊天记账',
        steps: [
          '点首页或「我的」页的小橘',
          '点推荐问法，或输入一句话（如「今天午饭 25 块」）',
          '识别为账单后会出现「待确认卡片」，可修改金额和备注',
          '点「确认记账」批量保存（一次最多 10 笔），或「取消」',
          '想留存小橘的回答？长按它的回复气泡，选中后点「复制」（代码答案也能整段选中）'
        ],
        tip: '小橘除记账外，也能回答科普、编程等一般问题；请勿输入密码、证件号等敏感个人信息。'
      },
      {
        id: 'ai-letter',
        title: '今日称号与心情信件',
        steps: [
          '当天记一笔支出后，「我的」页的「今日称号」自动解锁',
          '点「今日称号」→ 在弹窗里点「看看小橘心里话」',
          '也可以直接点「记账天数」数字，生成 AI 心情信件'
        ],
        tip: '心情信件累计最多生成 30 次。'
      }
    ]
  },
  {
    id: 'profile',
    icon: '👤',
    title: '我的与个性化',
    topics: [
      {
        id: 'avatar-nickname',
        title: '换头像和昵称',
        steps: [
          '「我的」页点头像 → 同意隐私授权 → 选拍照或从相册选择',
          '点昵称 → 弹窗输入（1–20 字），留空恢复默认「橘记JUJI用户」',
          '没设置过的话，页面会出现「使用微信资料」，一键带入微信头像和昵称'
        ]
      },
      {
        id: 'birthday-job',
        title: '生日与职业',
        steps: [
          '「我的」页展开「个人资料」',
          '选择出生日期，星座会自动算好',
          '选一个职业/状态，或自己输入（≤20 字）'
        ]
      },
      {
        id: 'theme',
        title: '切换主题',
        steps: [
          '我的 → 个性化设置 → 主题',
          '4 套预设任选：清爽薄荷 / 温馨玫瑰 / 夜猫子 / 蓝天白云',
          '确认后小程序会重启并回到首页'
        ],
        tip: '切换主题会重启小程序，正在编辑的内容会丢失，请先保存。'
      },
      {
        id: 'custom-theme-category',
        title: '自定义主题与分类管理',
        steps: [
          '自定义主题：主题页底部填名称（≤10 字、不重名）+ 选一个主色，创建后可立即应用；最多 5 个，长按可删除',
          '自定义分类：我的 → 个性化设置 → 自定义分类，点某个分类可改名或改 emoji，长按可删除（需二次确认）',
          '删除正在使用的自定义主题会自动回到薄荷绿主题'
        ]
      }
    ]
  },
  {
    id: 'data',
    icon: '🔐',
    title: '数据与隐私',
    topics: [
      {
        id: 'export',
        title: '导出备份',
        steps: [
          '我的 → 数据与隐私 → 导出账单数据',
          '同意隐私授权后，生成「橘记JUJI_账单备份_日期.json」文件',
          '可转发给微信「文件传输助手」长期保存'
        ]
      },
      {
        id: 'import',
        title: '导入恢复',
        steps: [
          '我的 → 数据与隐私 → 导入账单数据',
          '从聊天记录中选中此前导出的 json 备份文件',
          '确认「检测到 N 条」后完成导入'
        ]
      },
      {
        id: 'clear',
        title: '清除所有数据',
        steps: [
          '我的 → 数据与隐私 → 清除所有数据',
          '在红色弹窗中二次确认，删除全部账单、预算、资料与照片'
        ],
        tip: '不可恢复！清除前务必先导出备份。'
      }
    ]
  },
  {
    id: 'faq',
    icon: '❓',
    title: '常见问题',
    topics: [
      {
        id: 'faq-list',
        title: '你可能想问',
        steps: [
          '首页只显示最近 30 笔账单，更早的记录到「统计」里查看',
          '删除的账单去哪了：不计入统计，云端留痕，可用「清除所有数据」彻底删除',
          '切换主题后小程序重启：正常现象，主题全站生效需要重新加载',
          '退出登录后重新登录会再看一次新手引导：属正常流程',
          '小橘目前不支持查询实况天气',
          '数据都存在哪：你的云端专属空间，按账号隔离，其他用户无法看到你的账单'
        ]
      }
    ]
  }
]

// 默认展开每组第一个主题
function buildExpanded() {
  const map = {}
  HELP_GROUPS.forEach(group => {
    if (group.topics.length) map[group.topics[0].id] = true
  })
  return map
}

Page({
  data: {
    themeStyle: '',
    groups: HELP_GROUPS,
    expanded: buildExpanded()
  },

  onLoad() {
    this._onThemeChanged = () => {
      this.setData({ themeStyle: getThemeStyleString() })
    }
    app.globalData.eventBus.on('themeChanged', this._onThemeChanged)
  },

  onShow() {
    applyTheme()
    this.setData({ themeStyle: getThemeStyleString() })
  },

  onUnload() {
    app.globalData.eventBus.off('themeChanged', this._onThemeChanged)
  },

  toggleTopic(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    this.setData({ ['expanded.' + id]: !this.data.expanded[id] })
  }
})
