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
    avatarError: false,
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
        const avatarUrl = await this.resolveAvatarSrc(u.avatarUrl || '')
        this.setData({
          avatarUrl,
          avatarError: false,
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
        this.pickAndUploadAvatar(sourceType)
      }
    })
  },

  async pickAndUploadAvatar(sourceType) {
    // 1. 选图（compressed 让微信先做一次预压缩，省内存；头像场景画质足够）
    let pickedFile
    try {
      const choose = await wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType,
        sizeType: ['compressed']
      })
      if (!choose || !choose.tempFiles || !choose.tempFiles[0]) {
        throw new Error('未取到图片')
      }
      pickedFile = choose.tempFiles[0].tempFilePath
      console.log('[avatar] picked tempFile:', pickedFile)
    } catch (err) {
      if (err && err.errMsg && /cancel/i.test(err.errMsg)) return
      console.warn('[avatar] pick failed:', err)
      wx.showToast({ title: '选图失败', icon: 'none' })
      return
    }

    // 2. 编辑（裁剪/旋转）—— 用 wx.editImage 拉起微信内置编辑界面
    //    用户主动取消 → 中断流程；API 不可用或失败 → 静默回退到原图继续，不打扰用户
    let editedFile = pickedFile
    if (typeof wx.editImage === 'function') {
      try {
        const edit = await wx.editImage({ src: pickedFile })
        if (edit && edit.tempFilePath) {
          editedFile = edit.tempFilePath
          console.log('[avatar] edited:', editedFile)
        }
      } catch (err) {
        if (err && err.errMsg && /cancel/i.test(err.errMsg)) {
          console.log('[avatar] user cancelled edit, abort')
          return
        }
        console.warn('[avatar] edit failed, falling back to original:', err && err.errMsg)
      }
    } else {
      console.warn('[avatar] wx.editImage unavailable, skipping edit step')
    }

    // 3. 压缩（必走，quality 80）—— 头像不需要原图分辨率
    let toUpload = editedFile
    try {
      const comp = await wx.compressImage({ src: editedFile, quality: 80 })
      if (comp && comp.tempFilePath) {
        toUpload = comp.tempFilePath
        console.log('[avatar] compressed:', toUpload)
      }
    } catch (err) {
      console.warn('[avatar] compress failed, uploading uncompressed:', err && err.errMsg)
    }

    // 4. 上传 + 落库 + 刷新（uploadAvatar 内部处理）
    await this.uploadAvatar(toUpload)
  },

  async uploadAvatar(filePath) {
    const app = getApp()
    if (!app.globalData.openid) {
      wx.showToast({ title: '未登录', icon: 'none' })
      return
    }
    wx.showLoading({ title: '上传中…', mask: true })
    try {
      // 扩展名白名单：兼容常见图片格式，未知或缺失兜底 jpg
      const SUPPORTED = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp']
      const m = filePath.toLowerCase().match(/\.([a-z0-9]+)(?:\?|$)/)
      let ext = m && m[1]
      if (!ext || !SUPPORTED.includes(ext)) ext = 'jpg'

      const cloudPath = `avatars/${app.globalData.openid}_${Date.now()}.${ext}`
      console.log('[avatar] upload start:', { cloudPath, filePath })

      const up = await wx.cloud.uploadFile({ cloudPath, filePath })
      console.log('[avatar] uploaded fileID:', up && up.fileID)
      if (!up || !up.fileID) throw new Error('上传返回为空')

      // 直接 db 操作以便捕获错误（updateUserField 内部 swallow 错误，无法暴露落库失败）
      const db = wx.cloud.database()
      const updateRes = await db.collection('users')
        .where({ _openid: app.globalData.openid })
        .update({ data: { avatarUrl: up.fileID } })
      console.log('[avatar] db update result:', updateRes && updateRes.stats)
      if (updateRes && updateRes.stats && updateRes.stats.updated === 0) {
        throw new Error('未找到用户记录')
      }

      this.setData({ avatarUrl: up.fileID, avatarError: false })
      // 立刻把 fileID 换成 https tempFileURL 再 setData 一次，确保 image 一定能渲染
      // （image 直接渲染 cloud:// 在部分基础库下不稳，这是官方推荐的"上传后立即展示"路径）
      const tempUrl = await this.resolveAvatarSrc(up.fileID)
      console.log('[avatar] setData display url:', tempUrl)
      this.setData({ avatarUrl: tempUrl || up.fileID, avatarError: false })
      wx.hideLoading()
      wx.showToast({ title: '头像已更新', icon: 'success' })
    } catch (err) {
      wx.hideLoading()
      console.error('[avatar] upload chain failed:', err)
      const raw = (err && (err.errMsg || err.message)) || '上传失败'
      const msg = raw.length > 14 ? raw.slice(0, 14) + '…' : raw
      wx.showToast({ title: msg, icon: 'none', duration: 2500 })
    }
  },

  // 头像加载失败回退到占位
  onAvatarError(e) {
    const errMsg = e && e.detail && e.detail.errMsg
    console.warn('[avatar] image load failed:', errMsg, 'src:', this.data.avatarUrl)
    this.setData({ avatarError: true })
  },

  // 把 cloud:// fileID 解析成可直接渲染的 https tempFileURL
  // 空 / 已是 http(s) / 本地路径都原样返回；cloud 协议才走 getTempFileURL
  async resolveAvatarSrc(fileID) {
    if (!fileID) return ''
    if (!/^cloud:\/\//.test(fileID)) return fileID
    try {
      const res = await wx.cloud.getTempFileURL({ fileList: [fileID] })
      const item = res && res.fileList && res.fileList[0]
      const url = item && item.tempFileURL
      console.log('[avatar] resolved tempFileURL:', url, 'from:', fileID)
      if (item && item.status !== 0) {
        console.warn('[avatar] getTempFileURL non-zero status:', item.status, item.errMsg)
      }
      return url || ''
    } catch (err) {
      console.warn('[avatar] getTempFileURL failed:', err && err.errMsg)
      return ''
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
        success: () => wx.showToast({ title: '已发送' }),
        fail: err => {
          console.error('[share] wx.shareFileMessage failed:', err)
          const msg = (err && err.errMsg) || '分享失败'
          // 部分机型/基础库不支持文件转发，降级为提示用户手动操作
          wx.showModal({
            title: '无法直接分享',
            content: '当前环境暂不支持文件转发，请选择「打开文件」后通过右上角菜单手动发送。',
            confirmText: '打开文件',
            success: res => { if (res.confirm) this.openExportFile() }
          })
        }
      })
    } catch (err) {
      wx.hideLoading()
      console.error('[share] download failed:', err)
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
