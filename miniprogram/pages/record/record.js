const EXPENSE_CATEGORIES = [
  { name: '餐饮', iconPath: '/images/login/utensils.svg' },
  { name: '交通', iconPath: '/images/login/car.svg' },
  { name: '购物', iconPath: '/images/login/bag.svg' },
  { name: '娱乐', iconPath: '/images/login/masks.svg' },
  { name: '学习', iconPath: '/images/record/book.svg' },
  { name: '日用', iconPath: '/images/login/mug.svg' },
  { name: '医疗', iconPath: '/images/record/medical.svg' },
  { name: '其他', iconPath: '/images/login/wheel.svg' }
]

const INCOME_CATEGORIES = [
  { name: '工资', iconPath: '/images/record/wallet.svg' },
  { name: '兼职', iconPath: '/images/record/briefcase.svg' },
  { name: '理财', iconPath: '/images/record/chart.svg' },
  { name: '红包', iconPath: '/images/record/gift.svg' },
  { name: '退款', iconPath: '/images/record/refresh.svg' },
  { name: '其他', iconPath: '/images/login/wheel.svg' }
]

const { validateBill } = require('../../utils/validate')
const { canSaveBill, checkDailyLimit } = require('../../utils/rateLimiter')
const { applyTheme, getThemeStyleString } = require('../../utils/theme')

const EMOJI_POOL = [...'🍜🍔🍕🍰🍿🎮📚🚌💊🛒👟🎬🎵🐱🐶🌸✈️🚲📱💻🎂🍺☕️🏀⚽️🎸💍💡📷🛍️💄👗🧋🍩🎁🚗🏠📦💊🩺🎯🏷️🎨']

Page({
  data: {
    type: 'expense',
    amount: '',
    displayDate: '今天',
    dateStr: '',
    categories: EXPENSE_CATEGORIES,
    selectedCategory: '餐饮',
    note: '',
    showNoteInput: false,
    photoUrl: '',
    photoCloudPath: '',
    mood: '',
    presetMoods: [...'😊😄😢😤😴🤔🥳😱'],
    isCustomMood: false,
    themeStyle: getThemeStyleString(),
    showAddDialog: false,
    addCategoryName: '',
    addCategoryEmoji: '📌',
    addCategoryError: ''
  },

  resetForm(nextType = 'expense') {
    const preset = this.getPresetCategories(nextType)
    this.setData({
      type: nextType,
      amount: '',
      note: '',
      showNoteInput: false,
      photoUrl: '',
      photoCloudPath: '',
      categories: preset,
      selectedCategory: preset[0]?.name || ''
    })
    this.loadCustomCategories(nextType)
  },

  onLoad() {
    const today = new Date()
    const y = today.getFullYear()
    const m = String(today.getMonth() + 1).padStart(2, '0')
    const d = String(today.getDate()).padStart(2, '0')
    this.setData({
      dateStr: `${y}-${m}-${d}`,
      displayDate: `${m}月${d}日`
    })
    this.loadCustomCategories('expense')
  },

  onShow() {
    applyTheme()
    this.setData({ themeStyle: getThemeStyleString() })
    // ... existing code after this
    this.updateCustomTabBar()
    this.loadCustomCategories(this.data.type)
  },

  updateCustomTabBar() {
    if (typeof this.getTabBar !== 'function') return
    const tabBar = this.getTabBar()
    if (tabBar && typeof tabBar.updateSelected === 'function') {
      tabBar.updateSelected()
    }
  },

  getPresetCategories(type = 'expense') {
    return type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
  },

  loadCustomCategories(type = 'expense') {
    const app = getApp()
    const preset = this.getPresetCategories(type)
    const presetNames = new Set(preset.map(item => item.name))
    const selectedFallback = preset[0]?.name || ''
    let categories = preset

    if (app.globalData.userInfo && app.globalData.userInfo.customCategories) {
      const custom = app.globalData.userInfo.customCategories.filter(item => !presetNames.has(item.name))
      categories = [...preset, ...custom]
    }

    const stillExists = categories.some(item => item.name === this.data.selectedCategory)
    this.setData({
      categories,
      selectedCategory: stillExists ? this.data.selectedCategory : selectedFallback
    })
  },

  switchType(e) {
    const type = e.currentTarget.dataset.type
    this.setData({
      type
    })
    this.loadCustomCategories(type)
  },
  onAmountInput(e) { this.setData({ amount: e.detail.value }) },
  onNoteInput(e) { this.setData({ note: e.detail.value }) },
  onNoteFocus() { this.setData({ showNoteInput: true }) },
  onNoteBlur() { if (!this.data.note) this.setData({ showNoteInput: false }) },
  selectCategory(e) { this.setData({ selectedCategory: e.currentTarget.dataset.name }) },

  onDateChange(e) {
    const dateStr = e.detail.value
    const today = new Date()
    const y = today.getFullYear()
    const m = String(today.getMonth() + 1).padStart(2, '0')
    const d = String(today.getDate()).padStart(2, '0')
    const todayStr = `${y}-${m}-${d}`
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
    const yd = yesterday.getFullYear()
    const ym = String(yesterday.getMonth() + 1).padStart(2, '0')
    const yday = String(yesterday.getDate()).padStart(2, '0')
    const yestStr = `${yd}-${ym}-${yday}`

    let displayDate
    if (dateStr === todayStr) displayDate = '今天'
    else if (dateStr === yestStr) displayDate = '昨天'
    else {
      const [sy, sm, sd] = dateStr.split('-')
      displayDate = `${parseInt(sm)}月${parseInt(sd)}日`
    }
    this.setData({ dateStr, displayDate })
  },

  choosePhoto() {
    if (this.data.photoUrl) {
      wx.showActionSheet({
        itemList: ['重新拍照', '从相册选择', '删除照片'],
        success: res => {
          if (res.tapIndex === 2) { this.removePhoto(); return }
          this.pickImage(res.tapIndex === 0 ? 'camera' : 'album')
        }
      })
    } else {
      wx.showActionSheet({
        itemList: ['拍照', '从相册选择'],
        success: res => { this.pickImage(res.tapIndex === 0 ? 'camera' : 'album') }
      })
    }
  },

  pickImage(sourceType) {
    wx.chooseMedia({
      count: 1, mediaType: ['image'], sourceType: [sourceType],
      sizeType: ['compressed'],
      success: res => { this.setData({ photoUrl: res.tempFiles[0].tempFilePath }) }
    })
  },

  removePhoto() { this.setData({ photoUrl: '', photoCloudPath: '' }) },

  // ===== 心情 =====
  selectMood(e) {
    const emoji = e.currentTarget.dataset.emoji
    if (this.data.mood === emoji) { this.setData({ mood: '', isCustomMood: false }); return }
    this.setData({ mood: emoji, isCustomMood: false })
  },
  pickCustomMood() {
    wx.showModal({
      title: '输入心情 emoji',
      editable: true,
      placeholderText: '如：😋',
      content: this.data.isCustomMood ? this.data.mood : '',
      success: res => {
        if (!res.confirm) return
        const v = (res.content || '').trim()
        if (!v) { this.setData({ mood: '', isCustomMood: false }); return }
        this.setData({ mood: v, isCustomMood: true })
      }
    })
  },

  // ===== 自创分类 =====
  openAddDialog() {
    this.setData({ showAddDialog: true, addCategoryName: '', addCategoryEmoji: '🍜', addCategoryError: '' })
  },
  closeAddDialog() { this.setData({ showAddDialog: false, addCategoryError: '' }) },
  onAddName(e) { this.setData({ addCategoryName: e.detail.value, addCategoryError: '' }) },
  pickAddEmoji() {
    wx.showModal({
      title: '选择图标',
      content: '在下方输入框中粘贴或输入一个 emoji 表情',
      editable: true,
      placeholderText: '如：🍵 🎵 🐾',
      success: res => {
        if (!res.confirm) return
        const v = (res.content || '').trim()
        if (v) this.setData({ addCategoryEmoji: v })
      }
    })
  },

  async saveAddCategory() {
    const name = this.data.addCategoryName.trim()
    if (!name || name.length > 10) {
      this.setData({ addCategoryError: '名称需要 1-10 字' }); return
    }
    if (name === '自创') {
      this.setData({ addCategoryError: '不能使用这个名称' }); return
    }
    const presetNames = new Set([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].map(c => c.name))
    const existingCustom = (getApp().globalData.userInfo?.customCategories || []).map(c => c.name)
    if (presetNames.has(name) || existingCustom.includes(name)) {
      this.setData({ addCategoryError: '该分类已存在' }); return
    }

    const app = getApp()
    const custom = [...(app.globalData.userInfo?.customCategories || []), { name, icon: this.data.addCategoryEmoji }]
    try {
      await wx.cloud.database().collection('users')
        .where({ _openid: app.globalData.openid })
        .update({ data: { customCategories: custom } })
      app.globalData.userInfo.customCategories = custom
      this.setData({ showAddDialog: false, selectedCategory: name })
      this.loadCustomCategories(this.data.type)
      wx.showToast({ title: `已创建「${name}」`, icon: 'success' })
    } catch (err) {
      console.error('创建分类失败:', err)
      wx.showToast({ title: '创建失败', icon: 'none' })
    }
  },
  previewPhoto() { wx.previewImage({ urls: [this.data.photoUrl] }) },

  // ===== 保存记账 =====
  async saveRecord() {
    // 频率限制：3 秒防抖
    if (!canSaveBill()) {
      wx.showToast({ title: '操作太快，请稍候', icon: 'none' }); return
    }
    // 日上限 500 条
    const daily = checkDailyLimit('bills', 500)
    if (daily.exceeded) {
      wx.showToast({ title: '今日已达上限', icon: 'none' }); return
    }

    const { type, amount, selectedCategory, dateStr, note, photoUrl, mood } = this.data

    // 输入校验
    const v = validateBill({ type, amount, category: selectedCategory, date: dateStr, note, photoUrl })
    if (!v.valid) {
      wx.showToast({ title: v.message, icon: 'none' }); return
    }

    wx.showLoading({ title: '保存中…' })
    try {
      let cloudPhotoUrl = ''
      if (photoUrl && !photoUrl.startsWith('cloud://')) {
        // 兼容各种图片格式：png/jpg/jpeg/gif/bmp/webp
        const extMatch = photoUrl.match(/\.(\w+)(\?|$)/)
        const ext = extMatch ? extMatch[1].toLowerCase() : 'jpg'
        const allowed = ['png','jpg','jpeg','gif','bmp','webp']
        const safeExt = allowed.includes(ext) ? ext : 'jpg'
        const uploadRes = await wx.cloud.uploadFile({
          cloudPath: `bills/${Date.now()}-${Math.random().toString(36).slice(2)}.${safeExt}`,
          filePath: photoUrl
        })
        cloudPhotoUrl = uploadRes.fileID
      }

      const db = wx.cloud.database()
      await db.collection('bills').add({
        data: {
          type, amount: parseFloat(amount), category: selectedCategory,
          date: dateStr, note: note || '', photoUrl: cloudPhotoUrl,
          mood: mood || '', createdAt: new Date()
        }
      })

      daily.increment()
      wx.hideLoading()
      wx.showToast({ title: '记账成功 ✅', icon: 'success' })
      this.resetForm(type)
    } catch (err) {
      wx.hideLoading()
      console.error('保存失败:', err)
      wx.showToast({ title: '保存失败，请重试', icon: 'none' })
    }
  }
})
