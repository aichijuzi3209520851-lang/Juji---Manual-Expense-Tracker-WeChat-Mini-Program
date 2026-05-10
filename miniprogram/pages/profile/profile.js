const THEMES = [
  { id: 'fresh', name: '清新', desc: '暖白底 + 柔和玫瑰色' },
  { id: 'dark', name: '深夜', desc: '深色背景，护眼模式' },
  { id: 'warm', name: '暖阳', desc: '温暖橙调配色' },
  { id: 'mint', name: '薄荷', desc: '清爽薄荷绿调' }
]
const GENDERS = ['未设置', '男', '女']

Page({
  data: {
    avatarUrl: '',
    nickname: '点击登录',
    genderText: '未设置',
    gender: '',
    themeName: '清新'
  },

  onShow() { this.loadUserInfo() },

  async loadUserInfo() {
    const app = getApp()
    if (!app.globalData.openid) return
    try {
      const db = wx.cloud.database()
      const { data } = await db.collection('users').where({ _openid: app.globalData.openid }).get()
      if (data.length > 0) {
        const u = data[0]
        app.globalData.userInfo = u
        const genderText = GENDERS[u.gender === 'male' ? 1 : u.gender === 'female' ? 2 : 0]
        const theme = THEMES.find(t => t.id === (u.theme || 'fresh')) || THEMES[0]
        this.setData({
          avatarUrl: u.avatarUrl || '',
          nickname: u.nickname || '橘记用户',
          genderText,
          gender: u.gender || '',
          themeName: theme.name
        })
      }
    } catch (err) { console.error(err) }
  },

  // 性别设置
  setGender() {
    wx.showActionSheet({
      itemList: ['男', '女'],
      success: async res => {
        const gender = res.tapIndex === 0 ? 'male' : 'female'
        await this.updateUserField('gender', gender)
        this.setData({ gender, genderText: res.tapIndex === 0 ? '男' : '女' })
      }
    })
  },

  // 主题切换
  switchTheme() {
    wx.showActionSheet({
      itemList: THEMES.map(t => t.name),
      success: async res => {
        const theme = THEMES[res.tapIndex]
        await this.updateUserField('theme', theme.id)
        wx.setStorageSync('theme', theme.id)
        this.setData({ themeName: theme.name })
        wx.showToast({ title: `已切换为 ${theme.name}`, icon: 'success' })
      }
    })
  },

  // 自定义分类管理
  manageCategories() {
    wx.navigateTo({ url: '/pages/profile/profile?action=manageCategories' })
    // TODO: 跳转到分类管理子页面
    wx.showToast({ title: '分类管理（即将开放）', icon: 'none' })
  },

  // 清除数据
  clearData() {
    wx.showModal({
      title: '确认清除',
      content: '这将删除你所有的账单和预算数据，不可恢复。确定吗？',
      confirmColor: '#ba1a1a',
      success: async res => {
        if (!res.confirm) return
        try {
          const db = wx.cloud.database()
          const bills = await db.collection('bills').get()
          for (const b of bills.data) {
            await db.collection('bills').doc(b._id).remove()
          }
          wx.showToast({ title: '已清除', icon: 'success' })
        } catch (err) {
          wx.showToast({ title: '清除失败', icon: 'none' })
        }
      }
    })
  },

  async updateUserField(field, value) {
    const app = getApp()
    if (!app.globalData.openid) return
    try {
      const db = wx.cloud.database()
      await db.collection('users').where({ _openid: app.globalData.openid }).update({
        data: { [field]: value }
      })
    } catch (err) { console.error(err) }
  }
})
