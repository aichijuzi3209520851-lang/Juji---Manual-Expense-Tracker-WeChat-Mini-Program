const PRESET_CATEGORIES = [
  { name: '餐饮', icon: '🍜' }, { name: '交通', icon: '🚇' },
  { name: '购物', icon: '🛍️' }, { name: '娱乐', icon: '🎮' },
  { name: '学习', icon: '📚' }, { name: '日用', icon: '🏠' },
  { name: '医疗', icon: '💊' }, { name: '其他', icon: '📌' }
]

const { validateBill } = require('../../utils/validate')
const { canSaveBill, checkDailyLimit } = require('../../utils/rateLimiter')

Page({
  data: {
    type: 'expense',
    amount: '',
    displayDate: '今天',
    dateStr: '',
    categories: PRESET_CATEGORIES,
    selectedCategory: '餐饮',
    note: '',
    showNoteInput: false,
    photoUrl: '',
    photoCloudPath: ''
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
    this.loadCustomCategories()
  },

  onShow() { this.loadCustomCategories() },

  loadCustomCategories() {
    const app = getApp()
    if (app.globalData.userInfo && app.globalData.userInfo.customCategories) {
      const custom = app.globalData.userInfo.customCategories
      this.setData({ categories: [...PRESET_CATEGORIES, ...custom] })
    }
  },

  switchType(e) { this.setData({ type: e.currentTarget.dataset.type }) },
  onAmountInput(e) { this.setData({ amount: e.detail.value }) },
  onNoteInput(e) { this.setData({ note: e.detail.value }) },
  onNoteFocus() { this.setData({ showNoteInput: true }) },
  onNoteBlur() { if (!this.data.note) this.setData({ showNoteInput: false }) },
  selectCategory(e) { this.setData({ selectedCategory: e.currentTarget.dataset.name }) },
  addCategory() { wx.navigateTo({ url: '/pages/profile/profile?action=addCategory' }) },
  pickDate() { wx.showToast({ title: '选择日期', icon: 'none' }) },

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
      success: res => { this.setData({ photoUrl: res.tempFiles[0].tempFilePath }) }
    })
  },

  removePhoto() { this.setData({ photoUrl: '', photoCloudPath: '' }) },
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

    const { type, amount, selectedCategory, dateStr, note, photoUrl } = this.data

    // 输入校验
    const v = validateBill({ type, amount, category: selectedCategory, date: dateStr, note, photoUrl })
    if (!v.valid) {
      wx.showToast({ title: v.message, icon: 'none' }); return
    }

    wx.showLoading({ title: '保存中…' })
    try {
      let cloudPhotoUrl = ''
      if (photoUrl && !photoUrl.startsWith('cloud://')) {
        const ext = photoUrl.split('.').pop() || 'jpg'
        const uploadRes = await wx.cloud.uploadFile({
          cloudPath: `bills/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`,
          filePath: photoUrl
        })
        cloudPhotoUrl = uploadRes.fileID
      }

      const db = wx.cloud.database()
      await db.collection('bills').add({
        data: {
          type, amount: parseFloat(amount), category: selectedCategory,
          date: dateStr, note: note || '', photoUrl: cloudPhotoUrl,
          createdAt: new Date()
        }
      })

      daily.increment()
      wx.hideLoading()
      wx.showToast({ title: '记账成功 ✅', icon: 'success' })
      this.setData({
        amount: '', note: '', photoUrl: '', photoCloudPath: '',
        selectedCategory: '餐饮', type: 'expense'
      })
    } catch (err) {
      wx.hideLoading()
      console.error('保存失败:', err)
      wx.showToast({ title: '保存失败，请重试', icon: 'none' })
    }
  }
})
