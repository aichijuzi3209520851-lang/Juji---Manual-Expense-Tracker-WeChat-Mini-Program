const { applyTheme, getThemeStyleString, getCurrentThemeId, getUserThemeById } = require('../../utils/theme')

const THEMES = [
  { id: 'mint', name: '清爽薄荷（默认）', desc: '清新绿底，护眼舒适' },
  { id: 'fresh', name: '温馨玫瑰', desc: '暖白底 + 柔和玫瑰色' },
  { id: 'dark', name: '夜猫子', desc: '深色背景，护眼夜间模式' },
  { id: 'skyBlue', name: '蓝天白云', desc: '天蓝底 + 清透蓝色' }
]

function resolveThemeName(id) {
  if (id && id.indexOf('user_') === 0) {
    const t = getUserThemeById(id)
    if (t) return t.name
  }
  const preset = THEMES.find(t => t.id === id)
  return preset ? preset.name : THEMES[0].name
}
const GENDERS = ['未设置', '男', '女']

const CATEGORY_EMOJI = {
  '餐饮':'🍜','交通':'🚇','购物':'🛍️','娱乐':'🎮','学习':'📚','日用':'🏠','医疗':'💊',
  '工资':'💼','兼职':'🧳','理财':'💹','红包':'🎁','退款':'↩️','其他':'📌'
}

Page({
  data: {
    avatarUrl: '',
    avatarError: false,
    nickname: '点击登录',
    genderText: '未设置',
    gender: '',
    themeName: '清新',
    themeStyle: getThemeStyleString(),
    footprint: null,
    // AI 海报弹窗
    showPoster: false,
    posterLoading: false,
    posterUrl: '',
    posterError: '',
    loadingTip: '小橘正在画画中…',
    posterRemaining: -1,   // -1 表示未加载
    posterTotalLimit: 20,

    // 俏皮加载文案轮播
    _loadingTips: [
      '小橘正在画画中…',
      '小橘正在调色盘里翻找灵感 🎨',
      '小橘正在和AI讨论画风 ✨',
      '小橘正在给画笔蘸墨水 🖌️',
      '小橘正在思考怎么画更好看 🤔',
      '小橘马上就好，再等一下下~ 🍊',
    ],
    _tipTimer: null,
  },

  onShow() {
    applyTheme()
    this.setData({
      themeStyle: getThemeStyleString(),
      themeName: resolveThemeName(getCurrentThemeId())
    })
    this.updateCustomTabBar()
    this.loadUserInfo()
    this.loadFootprint()
  },

  onLoad() {
    this._themeHandler = (id) => {
      applyTheme(id)
      this.setData({ themeStyle: getThemeStyleString(id), themeName: resolveThemeName(id) })
    }
    getApp().globalData.eventBus.on('themeChanged', this._themeHandler)
  },

  onUnload() {
    if (this._themeHandler) getApp().globalData.eventBus.off('themeChanged', this._themeHandler)
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
        const themeName = resolveThemeName(getCurrentThemeId())
        const avatarUrl = await this.resolveAvatarSrc(u.avatarUrl || '')
        this.setData({
          avatarUrl,
          avatarError: false,
          nickname: u.nickname || '橘记JUJI用户',
          genderText,
          gender: u.gender || '',
          themeName
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
    const prefill = (current === '橘记JUJI用户' || current === '点击登录') ? '' : current
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
        this.setData({ nickname: value || '橘记JUJI用户' })
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
    wx.navigateTo({ url: '/pages/themes/themes' })
  },

  // 自定义分类管理
  manageCategories() {
    wx.navigateTo({ url: '/pages/categories/categories' })
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
          this.setData({ footprint: null })
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
  },

  async loadFootprint() {
    const app = getApp()
    if (!app.globalData.openid) return
    try {
      const db = wx.cloud.database()
      const { data } = await db.collection('bills').where({ _openid: app.globalData.openid }).get()
      if (!data || data.length === 0) return

      const dates = new Set(data.map(b => b.date)).size
      const byCategory = {}
      data.forEach(b => { byCategory[b.category] = (byCategory[b.category] || 0) + 1 })
      const top = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0]

      this.setData({
        footprint: {
          days: dates,
          count: data.length,
          topCategory: {
            name: top[0],
            emoji: CATEGORY_EMOJI[top[0]] || '📌'
          }
        }
      })
    } catch (err) { console.error('加载记账足迹失败:', err) }
  },

  // ====== 记账足迹交互（三个独立入口）======

  /** 点击"记账天数" — 弹出混元AI生成的天数纪念海报 */
  onTapDays() {
    if (!this.data.footprint) return
    this.showPosterModal()
    this.generateDaysPoster(this.data.footprint.days)
  },

  /** 点击"累计笔数" — 跳转首页查看流水 */
  onTapCount() {
    wx.switchTab({ url: '/pages/home/home' })
  },

  /** 点击"最爱xx" — 弹出该分类的AI生成海报 */
  onTapTopCategory() {
    if (!this.data.footprint || !this.data.footprint.topCategory) return
    const { name, emoji } = this.data.footprint.topCategory
    this.showPosterModal()
    this.generateCategoryPoster(name, emoji)
  },

  // --- 弹窗控制 ---

  showPosterModal() {
    this.setData({
      showPoster: true, posterLoading: true,
      posterUrl: '', posterError: '',
      loadingTip: this.data._loadingTips[0],
      posterRemaining: -1
    })
    this._startTipRotation()
  },

  closePoster() {
    if (this.data._tipTimer) {
      clearInterval(this.data._tipTimer)
      this.data._tipTimer = null
    }
    this.setData({ showPoster: false, posterUrl: '', posterError: '' })
  },

  /** 每2秒切换一条俏皮加载文案 */
  _startTipRotation() {
    if (this.data._tipTimer) clearInterval(this.data._tipTimer)
    let idx = 0
    const tips = this.data._loadingTips
    this.data._tipTimer = setInterval(() => {
      idx = (idx + 1) % tips.length
      this.setData({ loadingTip: tips[idx] })
    }, 2000)
  },

  // --- AI 图片生成 ---

  async generateDaysPoster(days) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'aiPoster',
        data: { type: 'days', payload: { days } }
      })

      if (res.result && res.result.success) {
        if (this.data._tipTimer) { clearInterval(this.data._tipTimer); this.data._tipTimer = null }
        this.setData({
          posterLoading: false,
          posterUrl: res.result.url,
          posterError: '',
          posterRemaining: res.result.remaining ?? -1,
          posterTotalLimit: res.result.totalLimit ?? 20
        })
      } else if (res.result && res.result.code === 'LIMIT_EXCEEDED') {
        throw new Error(res.result.message)
      } else {
        throw new Error((res.result && res.result.message) || '生成失败')
      }
    } catch (err) {
      if (this.data._tipTimer) { clearInterval(this.data._tipTimer); this.data._tipTimer = null }
      console.error('[daysPoster] 失败:', err)
      this.setData({ posterLoading: false, posterUrl: '', posterError: err.message || '生成失败，请稍后重试' })
    }
  },

  async generateCategoryPoster(category, emoji) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'aiPoster',
        data: { type: 'category', payload: { category, emoji } }
      })

      if (res.result && res.result.success) {
        if (this.data._tipTimer) { clearInterval(this.data._tipTimer); this.data._tipTimer = null }
        this.setData({
          posterLoading: false,
          posterUrl: res.result.url,
          posterError: '',
          posterRemaining: res.result.remaining ?? -1,
          posterTotalLimit: res.result.totalLimit ?? 20
        })
      } else if (res.result && res.result.code === 'LIMIT_EXCEEDED') {
        throw new Error(res.result.message)
      } else {
        throw new Error((res.result && res.result.message) || '生成失败')
      }
    } catch (err) {
      if (this.data._tipTimer) { clearInterval(this.data._tipTimer); this.data._tipTimer = null }
      console.error('[categoryPoster] 失败:', err)
      this.setData({ posterLoading: false, posterUrl: '', posterError: err.message || '生成失败，请稍后重试' })
    }
  },
})
