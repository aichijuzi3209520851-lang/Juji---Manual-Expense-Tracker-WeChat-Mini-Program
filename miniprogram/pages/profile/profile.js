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

  onShow() {
    this.updateCustomTabBar()
    this.loadUserInfo()
  },

  updateCustomTabBar() {
    if (typeof this.getTabBar !== 'function') return
    const tabBar = this.getTabBar()
    if (tabBar && typeof tabBar.updateSelected === 'function') {
      tabBar.updateSelected()
    }
  },

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

  // 头像修改
  changeAvatar() {
    wx.showActionSheet({
      itemList: ['拍照', '从相册选择'],
      success: res => {
        const sourceType = res.tapIndex === 0 ? ['camera'] : ['album']
        this.pickAndCropAvatar(sourceType)
      }
    })
  },

  async pickAndCropAvatar(sourceType) {
    try {
      const choose = await wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType,
        sizeType: ['compressed']
      })
      const tempFile = choose.tempFiles[0].tempFilePath
      const crop = await wx.cropImage({ src: tempFile, cropScale: '1:1' })
      await this.uploadAvatar(crop.tempFilePath)
    } catch (err) {
      if (err && err.errMsg && !/cancel/i.test(err.errMsg)) {
        console.warn('选图失败:', err.errMsg)
      }
    }
  },

  async uploadAvatar(filePath) {
    const app = getApp()
    if (!app.globalData.openid) {
      wx.showToast({ title: '未登录', icon: 'none' })
      return
    }
    wx.showLoading({ title: '上传中…', mask: true })
    try {
      const ext = (filePath.match(/\.([a-zA-Z0-9]+)$/) || [, 'jpg'])[1]
      const cloudPath = `avatars/${app.globalData.openid}_${Date.now()}.${ext}`
      const up = await wx.cloud.uploadFile({ cloudPath, filePath })
      await this.updateUserField('avatarUrl', up.fileID)
      this.setData({ avatarUrl: up.fileID })
      wx.hideLoading()
      wx.showToast({ title: '头像已更新', icon: 'success' })
    } catch (err) {
      wx.hideLoading()
      console.error('头像上传失败:', err)
      wx.showToast({ title: '上传失败', icon: 'none' })
    }
  },

  // 昵称修改
  editNickname() {
    const current = this.data.nickname
    const prefill = (current === '橘记用户' || current === '点击登录') ? '' : current
    wx.showModal({
      title: '修改昵称',
      editable: true,
      placeholderText: '1-20 字，留空恢复默认',
      content: prefill,
      success: async res => {
        if (!res.confirm) return
        const value = (res.content || '').trim()
        if (value.length > 20) {
          wx.showToast({ title: '昵称最长 20 字', icon: 'none' })
          return
        }
        await this.updateUserField('nickname', value)
        this.setData({ nickname: value || '橘记用户' })
        wx.showToast({ title: '昵称已更新', icon: 'success' })
      }
    })
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

  // 导出数据
  exportData() {
    wx.showModal({
      title: '导出账单',
      content: '将生成 CSV 文件，可用 Excel 打开。导出后你可以保存到手机或分享给好友。',
      confirmText: '开始导出',
      success: res => { if (res.confirm) this.doExport() }
    })
  },

  async doExport() {
    wx.showLoading({ title: '导出中…', mask: true })
    try {
      const res = await wx.cloud.callFunction({ name: 'exportBills', data: {} })
      wx.hideLoading()
      if (!res.result.success) {
        wx.showToast({ title: res.result.message, icon: 'none' }); return
      }

      this.exportFileID = res.result.fileID
      this.exportFileName = res.result.filename
      this.exportCount = res.result.count

      // 弹窗让用户选择下一步
      wx.showActionSheet({
        itemList: ['打开文件', '分享给好友', '保存到手机'],
        success: action => {
          if (action.tapIndex === 0) this.openExportFile()
          else if (action.tapIndex === 1) this.shareExportFile()
          else if (action.tapIndex === 2) this.openExportFile() // 同样打开，菜单里有保存选项
        }
      })
    } catch (err) {
      wx.hideLoading()
      console.error('导出失败:', err)
      wx.showToast({ title: '导出失败，请重试', icon: 'none' })
    }
  },

  async openExportFile() {
    wx.showLoading({ title: '加载中…' })
    try {
      const dl = await wx.cloud.downloadFile({ fileID: this.exportFileID })
      wx.hideLoading()
      wx.openDocument({
        filePath: dl.tempFilePath,
        fileType: 'csv',
        showMenu: true,  // 右上角菜单可转发/收藏
        success: () => wx.showToast({ title: `已导出 ${this.exportCount} 条` })
      })
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '打开失败', icon: 'none' })
    }
  },

  async shareExportFile() {
    wx.showLoading({ title: '准备分享…' })
    try {
      const dl = await wx.cloud.downloadFile({ fileID: this.exportFileID })
      wx.hideLoading()
      wx.shareFileMessage({
        filePath: dl.tempFilePath,
        fileName: this.exportFileName,
        success: () => wx.showToast({ title: '已发送' })
      })
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '分享失败', icon: 'none' })
    }
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
