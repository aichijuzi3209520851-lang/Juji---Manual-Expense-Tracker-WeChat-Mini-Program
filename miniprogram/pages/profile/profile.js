const { applyTheme, getThemeStyleString, getCurrentThemeId, resolveThemeVars, CUSTOM_PALETTE } = require('../../utils/theme')
const { getAll } = require('../../utils/dbPager')
const { ensureSafeText, checkText } = require('../../utils/contentSafety')
const {
  CATEGORY_EMOJI,
  GENDERS,
  OCCUPATIONS,
  getZodiac,
  resolveThemeName
} = require('../../utils/profileHelpers')

Page({
  data: {
    avatarUrl: '',
    avatarError: false,
    nickname: '点击登录',
    genderText: '未设置',
    gender: '',
    birthday: '',
    birthdayDisplay: '',
    zodiac: '',
    occupation: '',
    themeName: '清新',
    themeStyle: getThemeStyleString(),
    footprint: null,
    // AI 信件弹窗
    showLetter: false,
    letterText: '',
    letterRemaining: -1,
    letterTotalLimit: 30,
    // 记账打卡热力图
    heatmapMonth: '',
    heatmapDays: [],
    heatmapCheckedCount: 0,
    heatmapColor: '',
    heatmapShadowDark: 'rgba(0,0,0,0.08)',
    heatmapCustomColor: '',
    heatmapPalette: CUSTOM_PALETTE,
    weekdays: ['一', '二', '三', '四', '五', '六', '日'],
    _heatmapYear: 0,
    _heatmapMonth: 0,
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
    this.initHeatmap()
  },

  onLoad() {
    this._themeHandler = (id) => {
      applyTheme(id)
      this.setData({ themeStyle: getThemeStyleString(id), themeName: resolveThemeName(id) })
      this.updateHeatmapColor()
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
          birthday: u.birthday || '',
          birthdayDisplay: u.birthday || '',
          zodiac: u.birthday ? getZodiac(u.birthday) : '',
          occupation: u.occupation || '',
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

      const up = await wx.cloud.uploadFile({ cloudPath, filePath })
      if (!up || !up.fileID) throw new Error('上传返回为空')

      // 直接 db 操作以便捕获错误（updateUserField 内部 swallow 错误，无法暴露落库失败）
      const db = wx.cloud.database()
      const updateRes = await db.collection('users')
        .where({ _openid: app.globalData.openid })
        .update({ data: { avatarUrl: up.fileID } })
      if (updateRes && updateRes.stats && updateRes.stats.updated === 0) {
        throw new Error('未找到用户记录')
      }

      this.setData({ avatarUrl: up.fileID, avatarError: false })
      // 立刻把 fileID 换成 https tempFileURL 再 setData 一次，确保 image 一定能渲染
      // （image 直接渲染 cloud:// 在部分基础库下不稳，这是官方推荐的"上传后立即展示"路径）
      const tempUrl = await this.resolveAvatarSrc(up.fileID)
      this.setData({ avatarUrl: tempUrl || up.fileID, avatarError: false })
      wx.hideLoading()
      wx.showToast({ title: '头像已更新', icon: 'success' })
    } catch (err) {
      wx.hideLoading()
      console.error('[avatar] upload chain failed:', err && (err.errMsg || err.message))
      const raw = (err && (err.errMsg || err.message)) || '上传失败'
      const msg = raw.length > 14 ? raw.slice(0, 14) + '…' : raw
      wx.showToast({ title: msg, icon: 'none', duration: 2500 })
    }
  },

  // 头像加载失败回退到占位
  onAvatarError(e) {
    const errMsg = e && e.detail && e.detail.errMsg
    console.warn('[avatar] image load failed:', errMsg)
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
        if (value && !(await ensureSafeText(value, { scene: 2 }))) return
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

  // 出生日期设置
  onBirthdayChange(e) {
    var birthday = e.detail.value
    var zodiac = getZodiac(birthday)
    this.updateUserField('birthday', birthday)
    this.setData({ birthday: birthday, birthdayDisplay: birthday, zodiac: zodiac })
  },

  // 职业设置
  setOccupation() {
    var that = this
    var items = OCCUPATIONS.concat(['自定义输入…'])
    wx.showActionSheet({
      itemList: items,
      success: function(res) {
        if (res.tapIndex < OCCUPATIONS.length) {
          var occ = OCCUPATIONS[res.tapIndex]
          that.updateUserField('occupation', occ)
          that.setData({ occupation: occ })
        } else {
          wx.showModal({
            title: '自定义职业',
            editable: true,
            placeholderText: '请输入你的职业/状态',
            content: that.data.occupation === '' ? '' : that.data.occupation,
            success: async function(modalRes) {
              if (!modalRes.confirm) return
              var value = (modalRes.content || '').trim()
              if (value.length > 20) {
                wx.showToast({ title: '最长 20 字', icon: 'none' })
                return
              }
              if (value) {
                if (!(await ensureSafeText(value, { scene: 2 }))) return
                await that.updateUserField('occupation', value)
                that.setData({ occupation: value })
              }
            }
          })
        }
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

  // ====== 导出账单数据（JSON） ======
  exportData() {
    wx.showModal({
      title: '导出账单数据',
      content: '将生成 JSON 备份文件，可用于数据迁移或恢复。导出后请发送给【文件传输助手】妥善保存。',
      confirmText: '开始导出',
      success: res => { if (res.confirm) this.doExportJSON() }
    })
  },

  async doExportJSON() {
    wx.showLoading({ title: '导出中…', mask: true })
    try {
      const res = await wx.cloud.callFunction({ name: 'dataMigration', data: { action: 'export' } })
      wx.hideLoading()
      const result = res.result || {}
      if (!result.success) {
        wx.showToast({ title: result.message || '导出失败', icon: 'none' }); return
      }

      // 写入本地临时文件
      const now = new Date()
      const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
      const filename = `橘记_账单备份_${ts}.json`
      const filePath = `${wx.env.USER_DATA_PATH}/${filename}`
      const fs = wx.getFileSystemManager()

      fs.writeFile({
        filePath,
        data: JSON.stringify({ version: 1, exportTime: new Date().toISOString(), count: result.count, bills: result.bills }, null, 2),
        encoding: 'utf8',
        success: () => {
          wx.showActionSheet({
            itemList: ['分享给文件传输助手', '打开文件'],
            success: action => {
              if (action.tapIndex === 0) this.shareJSONFile(filePath, filename)
              else this.openJSONFile(filePath)
            }
          })
        },
        fail: (err) => {
          console.error('[export] writeFile failed:', err)
          wx.showToast({ title: '写入文件失败', icon: 'none' })
        }
      })
    } catch (err) {
      wx.hideLoading()
      console.error('[export] failed:', err)
      wx.showToast({ title: '导出失败，请重试', icon: 'none' })
    }
  },

  shareJSONFile(filePath, fileName) {
    wx.shareFileMessage({
      filePath,
      fileName,
      success: () => wx.showToast({ title: '请发送给文件传输助手保存' }),
      fail: err => {
        console.error('[share] wx.shareFileMessage failed:', err)
        wx.showModal({
          title: '无法直接分享',
          content: '当前环境暂不支持文件转发，请选择「打开文件」后通过右上角菜单手动发送。',
          confirmText: '打开文件',
          success: res => { if (res.confirm) this.openJSONFile(filePath) }
        })
      }
    })
  },

  openJSONFile(filePath) {
    wx.openDocument({
      filePath,
      fileType: 'json',
      showMenu: true,
      success: () => wx.showToast({ title: '可从右上角菜单保存' }),
      fail: () => wx.showToast({ title: '打开失败', icon: 'none' })
    })
  },

  // ====== 导入账单数据（JSON） ======
  importData() {
    wx.showModal({
      title: '导入账单数据',
      content: '将从聊天记录中选择之前导出的 JSON 备份文件，导入后数据会合并到当前账单中。',
      confirmText: '选择文件',
      success: res => {
        if (res.confirm) this.doImportJSON()
      }
    })
  },

  async doImportJSON() {
    let filePath
    try {
      const chooseRes = await wx.chooseMessageFile({
        count: 1,
        type: 'file',
        extension: ['json']
      })
      if (!chooseRes || !chooseRes.tempFiles || !chooseRes.tempFiles[0]) return
      filePath = chooseRes.tempFiles[0].path
    } catch (err) {
      if (err && err.errMsg && /cancel/i.test(err.errMsg)) return
      wx.showToast({ title: '选择文件失败', icon: 'none' })
      return
    }

    // 读取并解析
    let parsed
    try {
      const fs = wx.getFileSystemManager()
      const content = fs.readFileSync(filePath, 'utf8')
      parsed = JSON.parse(content)
    } catch (err) {
      wx.showToast({ title: '文件格式错误', icon: 'none' })
      return
    }

    // 兼容两种格式：{ bills: [...] } 或直接 [...]
    const bills = Array.isArray(parsed) ? parsed : (parsed.bills || [])
    if (!Array.isArray(bills) || bills.length === 0) {
      wx.showToast({ title: '文件中没有账单数据', icon: 'none' })
      return
    }

    wx.showModal({
      title: '确认导入',
      content: `检测到 ${bills.length} 条账单记录，确定要导入吗？`,
      success: async (confirmRes) => {
        if (!confirmRes.confirm) return
        wx.showLoading({ title: '正在恢复账单数据…', mask: true })
        try {
          const res = await wx.cloud.callFunction({
            name: 'dataMigration',
            data: { action: 'import', bills }
          })
          wx.hideLoading()
          const result = res.result || {}
          if (result.success) {
            wx.showToast({ title: `成功导入 ${result.count} 条`, icon: 'success' })
            this.loadFootprint()
          } else {
            wx.showToast({ title: result.message || '导入失败', icon: 'none' })
          }
        } catch (err) {
          wx.hideLoading()
          console.error('[import] failed:', err)
          wx.showToast({ title: '导入失败，请重试', icon: 'none' })
        }
      }
    })
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

  // 退出登录
  logout() {
    wx.showModal({
      title: '退出登录',
      content: '退出后本地缓存的主题、引导等设置将保留，账单数据仍保留在云端。下次打开需重新登录。',
      success: res => {
        if (!res.confirm) return
        const app = getApp()
        // 清除全局状态
        app.globalData.openid = ''
        app.globalData.userInfo = null
        // 清除登录相关 Storage
        wx.removeStorageSync('has_seen_guide')
        // 跳转登录页
        wx.reLaunch({ url: '/pages/login/login' })
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
      const data = await getAll(db.collection('bills').where({ _openid: app.globalData.openid }))
      if (!data || data.length === 0) return

      const dates = new Set(data.map(b => b.date)).size
      const byCategory = {}
      var totalSpend = 0
      data.forEach(function(b) {
        byCategory[b.category] = (byCategory[b.category] || 0) + 1
        if (b.type === 'expense' && b.amount) totalSpend += b.amount
      })
      const top = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0]
      var avgDailySpend = dates > 0 ? (totalSpend / dates).toFixed(1) : '0'

      this.setData({
        footprint: {
          days: dates,
          count: data.length,
          topCategory: {
            name: top[0],
            emoji: CATEGORY_EMOJI[top[0]] || '📌'
          },
          totalSpend: totalSpend,
          avgDailySpend: avgDailySpend
        }
      })
    } catch (err) { console.error('加载记账足迹失败:', err) }
  },

  // ====== 记账足迹交互（三个独立入口）======

  /** 点击"记账天数" — 生成专属信件 */
  onTapDays() {
    if (!this.data.footprint) return
    var days = this.data.footprint.days
    var category = this.data.footprint.topCategory ? this.data.footprint.topCategory.name : '记账'
    this.generateLetter(days, category)
  },

  /** 点击"累计笔数" — 跳转首页查看流水 */
  onTapCount() {
    wx.switchTab({ url: '/pages/home/home' })
  },

  /** 点击"最爱xx" — 生成专属信件 */
  onTapTopCategory() {
    if (!this.data.footprint || !this.data.footprint.topCategory) return
    var days = this.data.footprint.days
    var category = this.data.footprint.topCategory.name
    this.generateLetter(days, category)
  },

  closeLetter() {
    this.setData({ showLetter: false, letterText: '' })
  },

  async generateLetter(days, category) {
    var zodiac = this.data.zodiac || ''
    var occupation = this.data.occupation || ''
    var avgDailySpend = (this.data.footprint && this.data.footprint.avgDailySpend) || '0'
    var fallback = '小橘刚才去找星星借灵感去了，稍微走了一会神。不过没关系，看着你坚持记账 ' + days + ' 天的模样，小橘想说：无论是精打细算还是偶尔挥霍，你认真生活的样子，真的很迷人！🍊'
    wx.showLoading({ title: '小橘想对你说说心里话', mask: true })
    try {
      var res = await wx.cloud.callFunction({
        name: 'aiPoster',
        data: { days: days, category: category, zodiac: zodiac, occupation: occupation, avgDailySpend: avgDailySpend },
        config: { timeout: 30000 }
      })
      wx.hideLoading()

      var result = res.result || {}
      // 如果云函数内部 catch 了错误并返回 fallback，日志提醒
      if (result.fallback) {
        console.warn('[generateLetter] 云函数返回了兜底文案')
      }
      var letter = result.letter || fallback
      const letterSafety = await checkText(letter, { scene: 4 })
      if (!letterSafety.ok) letter = fallback
      this.setData({
        showLetter: true,
        letterText: letter,
        letterRemaining: result.remaining !== undefined ? result.remaining : -1,
        letterTotalLimit: result.totalLimit || 30
      })
    } catch (err) {
      wx.hideLoading()
      console.error('[generateLetter] AI调用失败详情:')
      console.error('  errMsg:', err && err.errMsg)
      console.error('  message:', err && err.message)
      console.error('  code:', err && err.code)
      this.setData({ showLetter: true, letterText: fallback })
    }
  },

  // ====== 记账打卡热力图 ======

  initHeatmap() {
    var now = new Date()
    this._heatmapYear = now.getFullYear()
    this._heatmapMonth = now.getMonth() + 1
    this._heatmapCheckedSet = null
    var saved = wx.getStorageSync('juji_heatmap_color') || ''
    this.setData({ heatmapCustomColor: saved })
    this.updateHeatmapColor()
    this.generateHeatmap()
    this.loadHeatmapData()
  },

  updateHeatmapColor() {
    var currentId = getCurrentThemeId()
    var custom = this.data.heatmapCustomColor
    if (custom) {
      this.setData({ heatmapColor: custom })
    } else {
      var vars = resolveThemeVars(currentId) || {}
      var primary = vars['--color-primary'] || '#27c07d'
      this.setData({ heatmapColor: primary })
    }
    var vars2 = resolveThemeVars(currentId) || {}
    var sd = vars2['--shadow-dark'] || 'rgba(0,0,0,0.08)'
    this.setData({ heatmapShadowDark: sd })
  },

  generateHeatmap() {
    var y = this._heatmapYear, m = this._heatmapMonth
    var firstDay = new Date(y, m - 1, 1).getDay()
    var daysInMonth = new Date(y, m, 0).getDate()
    firstDay = firstDay === 0 ? 6 : firstDay - 1
    var tiles = []
    for (var i = 0; i < firstDay; i++) tiles.push({ day: 0, checked: false })
    for (var d = 1; d <= daysInMonth; d++) tiles.push({ day: d, checked: false })
    this.setData({
      heatmapMonth: y + '年' + m + '月',
      heatmapDays: tiles,
      _heatmapYear: y,
      _heatmapMonth: m
    })
  },

  async loadHeatmapData() {
    var y = this._heatmapYear, m = this._heatmapMonth
    var pad = function(n) { return n < 10 ? '0' + n : '' + n }
    var start = y + '-' + pad(m) + '-01'
    var end = y + '-' + pad(m) + '-' + pad(new Date(y, m, 0).getDate())
    try {
      var db = wx.cloud.database()
      var _ = db.command
      var data = await getAll(db.collection('bills').where({
        date: _.gte(start).and(_.lte(end))
      }).field({ date: true }))
      var checkedSet = {}
      var count = 0
      data.forEach(function(b) {
        var day = parseInt(b.date.slice(8, 10), 10)
        if (!checkedSet[day]) { checkedSet[day] = true; count++ }
      })
      this._heatmapCheckedSet = checkedSet
      var tiles = this.data.heatmapDays.map(function(t) {
        return { day: t.day, checked: t.day > 0 && !!checkedSet[t.day] }
      })
      this.setData({ heatmapDays: tiles, heatmapCheckedCount: count })
    } catch (e) {
      console.error('[heatmap] load failed:', e)
    }
  },

  heatmapPrev() {
    this._heatmapMonth--
    if (this._heatmapMonth < 1) { this._heatmapMonth = 12; this._heatmapYear-- }
    this._heatmapCheckedSet = null
    this.generateHeatmap()
    this.loadHeatmapData()
  },

  heatmapNext() {
    this._heatmapMonth++
    if (this._heatmapMonth > 12) { this._heatmapMonth = 1; this._heatmapYear++ }
    this._heatmapCheckedSet = null
    this.generateHeatmap()
    this.loadHeatmapData()
  },

  pickHeatmapColor(e) {
    var hex = e.currentTarget.dataset.hex
    wx.setStorageSync('juji_heatmap_color', hex)
    this.setData({ heatmapCustomColor: hex })
    this.updateHeatmapColor()
  },
})
