const { getThemeStyleString } = require('../../utils/theme')

const PRESET_EXPENSE = [
  { name: '餐饮', icon: '🍜' }, { name: '交通', icon: '🚇' }, { name: '购物', icon: '🛍️' },
  { name: '娱乐', icon: '🎮' }, { name: '学习', icon: '📚' }, { name: '日用', icon: '🏠' },
  { name: '医疗', icon: '💊' }, { name: '其他', icon: '📌' }
]
const PRESET_INCOME = [
  { name: '工资', icon: '💼' }, { name: '兼职', icon: '🧳' }, { name: '理财', icon: '💹' },
  { name: '红包', icon: '🎁' }, { name: '退款', icon: '↩️' }, { name: '其他', icon: '📌' }
]

const EMOJI_POOL = [...'🍜🍔🍕🍰🍿🎮📚🚌💊🛒👟🎬🎵🐱🐶🌸✈️🚲📱💻🎂🍺☕️🏀⚽️🎸💍💡📷🛍️💄👗🧋🍩🎁🚗🏠📦💊🩺']

Page({
  data: {
    expenseCategories: [],
    incomeCategories: [],
    showDialog: false,
    editingCategory: null,
    dialogName: '',
    dialogEmoji: '🍜',
    dialogType: 'expense',
    emojiPool: EMOJI_POOL,
    themeStyle: ''
  },

  onLoad() {
    this.setData({ themeStyle: getThemeStyleString() })
    this.buildCategories()
  },

  onShow() {
    this.buildCategories()
  },

  buildCategories() {
    const app = getApp()
    const custom = app.globalData.userInfo?.customCategories || []

    const expenseCategories = [
      ...PRESET_EXPENSE.map(c => ({ ...c, preset: true })),
      ...custom.filter(c => !PRESET_EXPENSE.find(p => p.name === c.name) && !PRESET_INCOME.find(p => p.name === c.name))
        .map(c => ({ name: c.name, icon: c.icon || '📌', preset: false }))
    ]
    const incomeCategories = [
      ...PRESET_INCOME.map(c => ({ ...c, preset: true })),
      ...custom.filter(c => PRESET_INCOME.find(p => p.name === c.name))
        .map(c => ({ name: c.name, icon: c.icon || '📌', preset: false }))
    ]

    this.setData({ expenseCategories, incomeCategories })
  },

  openAddDialog() {
    this.setData({
      showDialog: true, editingCategory: null,
      dialogName: '', dialogEmoji: '🍜', dialogType: 'expense'
    })
  },

  editCategory(e) {
    const name = e.currentTarget.dataset.name
    const cat = [...this.data.expenseCategories, ...this.data.incomeCategories].find(c => c.name === name && !c.preset)
    if (!cat) return
    this.setData({
      showDialog: true, editingCategory: name,
      dialogName: cat.name, dialogEmoji: cat.icon, dialogType: 'expense'
    })
  },

  deleteCategory(e) {
    const name = e.currentTarget.dataset.name
    wx.showModal({
      title: '删除分类',
      content: `确定要删除「${name}」吗？`,
      confirmColor: '#ba1a1a',
      success: async res => {
        if (!res.confirm) return
        await this.syncCustomCategories(cats => cats.filter(c => c.name !== name))
        wx.showToast({ title: '已删除', icon: 'success' })
        this.buildCategories()
      }
    })
  },

  onDialogName(e) { this.setData({ dialogName: e.detail.value }) },
  pickEmoji(e) { this.setData({ dialogEmoji: e.currentTarget.dataset.emoji }) },
  pickType(e) { this.setData({ dialogType: e.currentTarget.dataset.type }) },
  closeDialog() { this.setData({ showDialog: false }) },

  async saveCategory() {
    const name = this.data.dialogName.trim()
    if (!name || name.length > 10) {
      wx.showToast({ title: '名称需要 1-10 字', icon: 'none' }); return
    }
    if (name === '自创') {
      wx.showToast({ title: '不能使用这个名称', icon: 'none' }); return
    }

    const app = getApp()
    const custom = app.globalData.userInfo?.customCategories || []

    if (this.data.editingCategory) {
      const idx = custom.findIndex(c => c.name === this.data.editingCategory)
      if (idx !== -1) custom[idx] = { name, icon: this.data.dialogEmoji }
    } else {
      const exists = custom.some(c => c.name === name)
      if (exists) { wx.showToast({ title: '同名分类已存在', icon: 'none' }); return }
      custom.push({ name, icon: this.data.dialogEmoji })
    }

    await this.syncCustomCategories(() => custom)
    wx.showToast({ title: '保存成功', icon: 'success' })
    this.closeDialog()
    this.buildCategories()
  },

  async syncCustomCategories(transform) {
    const app = getApp()
    const current = app.globalData.userInfo?.customCategories || []
    const updated = typeof transform === 'function' ? transform([...current]) : transform
    const db = wx.cloud.database()
    await db.collection('users').where({ _openid: app.globalData.openid }).update({
      data: { customCategories: updated }
    })
    app.globalData.userInfo.customCategories = updated
  }
})
