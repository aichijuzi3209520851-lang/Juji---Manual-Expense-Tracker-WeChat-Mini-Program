const {
  applyTheme,
  getCurrentThemeId,
  getThemeStyleString,
  CUSTOM_PALETTE,
  MAX_USER_THEMES,
  getUserThemes,
  saveUserTheme,
  deleteUserTheme
} = require('../../utils/theme')

const PRESET_THEMES = [
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
    id: 'fresh', name: '温馨玫瑰', desc: '暖白底 + 柔和玫瑰色，温暖亲切',
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
    presetThemes: PRESET_THEMES,
    userThemes: [],
    userThemeCount: 0,
    maxUserThemes: MAX_USER_THEMES,
    currentTheme: 'mint',
    themeStyle: '',
    palette: CUSTOM_PALETTE,
    // 创建面板
    showCreate: false,
    createPickerIndex: 0,
    createName: ''
  },

  onLoad() {
    const stored = getCurrentThemeId()
    const userThemes = getUserThemes()
    this.setData({
      currentTheme: stored,
      themeStyle: getThemeStyleString(stored),
      userThemes,
      userThemeCount: userThemes.length
    })
  },

  onShow() {
    applyTheme()
  },

  // ============== 创建面板 ==============
  openCreatePanel() {
    if (this.data.userThemes.length >= MAX_USER_THEMES) {
      wx.showToast({
        title: `最多保存 ${MAX_USER_THEMES} 个主题`,
        icon: 'none'
      })
      return
    }
    this.setData({
      showCreate: true,
      createPickerIndex: 0,
      createName: ''
    })
  },

  closeCreatePanel() {
    this.setData({ showCreate: false })
  },

  onCreatePickerChange(e) {
    this.setData({ createPickerIndex: e.detail.value[0] })
  },

  onCreateNameInput(e) {
    this.setData({ createName: e.detail.value })
  },

  confirmCreateTheme() {
    const name = (this.data.createName || '').trim()
    const hex = CUSTOM_PALETTE[this.data.createPickerIndex].hex

    const res = saveUserTheme(name, hex)
    if (!res.ok) {
      wx.showToast({ title: res.msg, icon: 'none' })
      return
    }

    const newId = res.id
    wx.showModal({
      title: '应用新主题',
      content: `已保存「${name}」，应用后会重新加载小程序`,
      confirmText: '应用',
      success: async modalRes => {
        if (!modalRes.confirm) {
          // 仅保存，不应用：刷新列表
          this.setData({
            showCreate: false,
            userThemes: getUserThemes(),
            userThemeCount: getUserThemes().length
          })
          return
        }

        wx.setStorageSync('theme', newId)

        try {
          const app = getApp()
          if (app.globalData.openid) {
            const db = wx.cloud.database()
            await db.collection('users')
              .where({ _openid: app.globalData.openid })
              .update({ data: { theme: newId } })
          }
        } catch (err) {
          console.warn('主题同步到数据库失败（非致命）:', err)
        }

        const app = getApp()
        app.globalData.currentTheme = newId
        app.globalData.eventBus.emit('themeChanged', newId)

        wx.reLaunch({ url: '/pages/home/home' })
      }
    })
  },

  // ============== 切换主题（预设 + 用户）==============
  selectTheme(e) {
    const id = e.currentTarget.dataset.id
    if (id === this.data.currentTheme) return

    const isUser = id.indexOf('user_') === 0
    const themeName = isUser
      ? (this.data.userThemes.find(t => t.id === id) || {}).name || '该主题'
      : (this.data.presetThemes.find(t => t.id === id) || {}).name || '该主题'

    wx.showModal({
      title: '切换主题',
      content: `切换到「${themeName}」，切换后会重新加载小程序`,
      confirmText: '切换',
      success: async res => {
        if (!res.confirm) return

        wx.setStorageSync('theme', id)

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

        const app = getApp()
        app.globalData.currentTheme = id
        app.globalData.eventBus.emit('themeChanged', id)

        wx.reLaunch({ url: '/pages/home/home' })
      }
    })
  },

  // ============== 长按删除用户主题 ==============
  onLongPressUserTheme(e) {
    const id = e.currentTarget.dataset.id
    const theme = this.data.userThemes.find(t => t.id === id)
    if (!theme) return

    wx.showModal({
      title: '删除主题',
      content: `确定删除「${theme.name}」？`,
      confirmText: '删除',
      confirmColor: '#ba1a1a',
      success: async res => {
        if (!res.confirm) return

        const result = deleteUserTheme(id)
        if (!result.removed) return

        const userThemes = getUserThemes()
        this.setData({ userThemes, userThemeCount: userThemes.length })

        if (result.wasCurrent) {
          try {
            const app = getApp()
            if (app.globalData.openid) {
              const db = wx.cloud.database()
              await db.collection('users')
                .where({ _openid: app.globalData.openid })
                .update({ data: { theme: 'mint' } })
            }
          } catch (err) {
            console.warn('主题同步失败:', err)
          }
          const app = getApp()
          app.globalData.currentTheme = 'mint'
          app.globalData.eventBus.emit('themeChanged', 'mint')
          wx.reLaunch({ url: '/pages/home/home' })
        } else {
          wx.showToast({ title: '已删除', icon: 'success' })
        }
      }
    })
  }
})
