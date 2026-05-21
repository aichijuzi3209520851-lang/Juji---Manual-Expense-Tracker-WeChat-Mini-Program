const { applyTheme, getCurrentThemeId, getThemeStyleString } = require('../../utils/theme')

const THEMES = [
  {
    id: 'mint', name: '清爽薄荷（默认）', desc: '清新绿底，护眼舒适',
    colors: [
      { name: 'primary', value: '#3d7a5c' },
      { name: 'bg', value: '#f6faf7' },
      { name: 'surface', value: '#ffffff' },
      { name: 'text', value: '#1a1f1c' },
      { name: 'income', value: '#3d7a5c' },
      { name: 'error', value: '#ba1a1a' }
    ]
  },
  {
    id: 'fresh', name: '暖暖阳光', desc: '暖白底 + 柔和玫瑰色，温暖亲切',
    colors: [
      { name: 'primary', value: '#785655' },
      { name: 'bg', value: '#fffaf8' },
      { name: 'surface', value: '#ffffff' },
      { name: 'text', value: '#1e1b1a' },
      { name: 'income', value: '#4b6458' },
      { name: 'error', value: '#ba1a1a' }
    ]
  },
  {
    id: 'dark', name: '夜猫子', desc: '深色背景 + 暖金主色，护眼夜间模式',
    colors: [
      { name: 'primary', value: '#d4a574' },
      { name: 'bg', value: '#1a1a1f' },
      { name: 'surface', value: '#242429' },
      { name: 'text', value: '#e8e6e3' },
      { name: 'income', value: '#7db892' },
      { name: 'error', value: '#ffb4ab' }
    ]
  },
  {
    id: 'skyBlue', name: '蓝天白云', desc: '天蓝底 + 清透蓝色，明亮开阔',
    colors: [
      { name: 'primary', value: '#38bdf8' },
      { name: 'bg', value: '#f0f9ff' },
      { name: 'surface', value: '#fafeff' },
      { name: 'text', value: '#0c2233' },
      { name: 'income', value: '#22c55e' },
      { name: 'error', value: '#ba1a1a' }
    ]
  }
]

Page({
  data: {
    themes: THEMES,
    currentTheme: 'fresh',
    themeStyle: ''
  },

  onLoad() {
    const stored = wx.getStorageSync('theme') || 'mint'
    this.setData({ currentTheme: stored, themeStyle: getThemeStyleString(stored) })
  },

  selectTheme(e) {
    const id = e.currentTarget.dataset.id
    if (id === this.data.currentTheme) return

    wx.showModal({
      title: '切换主题',
      content: '主题将在你下次进入小程序时生效，切换后将退出小程序。',
      confirmText: '确认切换',
      cancelText: '取消',
      success: async res => {
        if (!res.confirm) return

        // 1. 写入本地 Storage
        wx.setStorageSync('theme', id)

        // 2. 同步到数据库（跨设备持久化）
        try {
          const app = getApp()
          if (app.globalData.openid) {
            const db = wx.cloud.database()
            await db.collection('users')
              .where({ _openid: app.globalData.openid })
              .update({ data: { theme: id } })
          }
        } catch (err) {
          console.warn('主题同步到数据库失败（非致命）:', err)
        }

        // 3. 退出小程序，让用户手动重新进入（主题在下次 onLaunch 时生效）
        wx.exitMiniProgram()
      }
    })
  }
})
