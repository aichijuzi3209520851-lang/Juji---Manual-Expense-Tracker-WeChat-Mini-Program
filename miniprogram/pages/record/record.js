const EXPENSE_CATEGORIES = [
  { name: '餐饮', iconPath: '/images/record/utensils.svg' },
  { name: '交通', iconPath: '/images/record/car.svg' },
  { name: '购物', iconPath: '/images/record/bag.svg' },
  { name: '娱乐', iconPath: '/images/record/masks.svg' },
  { name: '学习', iconPath: '/images/record/book.svg' },
  { name: '日用', iconPath: '/images/record/mug.svg' },
  { name: '医疗', iconPath: '/images/record/medical.svg' },
  { name: '其他', iconPath: '/images/record/wheel.svg' }
]

const INCOME_CATEGORIES = [
  { name: '工资', iconPath: '/images/record/wallet.svg' },
  { name: '兼职', iconPath: '/images/record/briefcase.svg' },
  { name: '理财', iconPath: '/images/record/chart.svg' },
  { name: '红包', iconPath: '/images/record/gift.svg' },
  { name: '退款', iconPath: '/images/record/refresh.svg' },
  { name: '其他', iconPath: '/images/record/wheel.svg' }
]

const { validateBill } = require('../../utils/validate')
const { canSaveBill, checkDailyLimit } = require('../../utils/rateLimiter')
const { applyTheme, getThemeStyleString } = require('../../utils/theme')
const { ensureSafeText, checkText } = require('../../utils/contentSafety')
const {
  PRIVACY_AUTH_BUTTON_ID,
  requirePrivacyAuthorization,
  handlePrivacyAuthorize
} = require('../../utils/privacy')
const { CATEGORY_EMOJI } = require('../../utils/profileHelpers')
const { resolveAvatarSrc } = require('../../utils/avatar')

const EMOJI_POOL = [...'🍜🍔🍕🍰🍿🎮📚🚌💊🛒👟🎬🎵🐱🐶🌸✈️🚲📱💻🎂🍺☕️🏀⚽️🎸💍💡📷🛍️💄👗🧋🍩🎁🚗🏠📦💊🩺🎯🏷️🎨']
const AI_CHAT_FALLBACK = '小橘不知道，来聊聊别的吧~'
const AI_CHAT_WELCOME = {
  id: 'chat_welcome',
  role: 'assistant',
  content: '嗨，我是小橘。可以陪你聊聊记账、消费复盘和生活小事。',
  avatar: '/images/juji2.jpg'
}
const CHAT_SUGGESTIONS = [
  '看看这周花了多少钱',
  '这周比上周省了多少',
  '这个月花了多少钱',
  '本月哪类花得最多',
  '今天记了几笔',
  '这个月收入多少'
]
const WEATHER_QUESTION_PATTERN = /天气|气温|下雨|降雨|刮风|冷不冷|热不热|穿什么/
const PRESET_EXPENSE_CATEGORIES = ['餐饮', '交通', '购物', '娱乐', '学习', '日用', '医疗', '其他']
const PRESET_INCOME_CATEGORIES = ['工资', '兼职', '理财', '红包', '退款', '其他']

function pad(n) {
  return n < 10 ? '0' + n : '' + n
}

function getTodayKey() {
  var d = new Date()
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

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
    noteExpanded: false,
    showMoodSheet: false,
    photoUrl: '',
    photoCloudPath: '',
    mood: '',
    presetMoods: [...'😊😄😢😤😴🤔🥳😱'],
    isCustomMood: false,
    themeStyle: getThemeStyleString(),
    showAddDialog: false,
    addCategoryName: '',
    addCategoryEmoji: '📌',
    addCategoryError: '',
    amountAutoFocus: true,
    amountFocused: false,
    keyboardHeight: 0,
    quickConfirmStyle: 'bottom:0px;',
    quickCanSave: false,
    quickSaving: false,
    // 编辑模式
    editMode: false,
    editBillId: '',
    petAction: 'idle',
    petBubble: '',
    petHearts: [],
    showAiChat: false,
    chatMessages: [],
    chatSuggestions: CHAT_SUGGESTIONS,
    showChatSuggestions: false,
    chatInput: '',
    chatLoading: false,
    chatScrollTo: '',
    chatKeyboardHeight: 0,
    // 隐私授权弹窗
    showPrivacyAuth: false,
    privacyAuthButtonId: PRIVACY_AUTH_BUTTON_ID,
    privacyAuthFeature: '',
    chatModalStyle: '',
    chatUserAvatarUrl: '',
    chatAvatarError: false
  },

  resetForm(nextType = 'expense') {
    const today = new Date()
    const y = today.getFullYear()
    const m = String(today.getMonth() + 1).padStart(2, '0')
    const d = String(today.getDate()).padStart(2, '0')
    const preset = this.getPresetCategories(nextType)
    this.setData({
      type: nextType,
      amount: '',
      note: '',
      showNoteInput: false,
      noteExpanded: false,
      showMoodSheet: false,
      photoUrl: '',
      photoCloudPath: '',
      mood: '',
      isCustomMood: false,
      amountAutoFocus: true,
      amountFocused: false,
      keyboardHeight: 0,
      quickConfirmStyle: 'bottom:0px;',
      quickCanSave: false,
      quickSaving: false,
      dateStr: `${y}-${m}-${d}`,
      displayDate: '今天',
      categories: preset,
      selectedCategory: preset[0]?.name || '',
      editMode: false,
      editBillId: ''
    })
    this.loadCustomCategories(nextType)
    wx.setNavigationBarTitle({ title: '记一笔' })
  },

  scrollToTop() {
    wx.nextTick(() => {
      wx.pageScrollTo({ scrollTop: 0, duration: 0 })
    })
  },

  onLoad(options) {
    this._themeHandler = (id) => { applyTheme(id); this.setData({ themeStyle: getThemeStyleString(id) }) }
    getApp().globalData.eventBus.on('themeChanged', this._themeHandler)

    const today = new Date()
    const y = today.getFullYear()
    const m = String(today.getMonth() + 1).padStart(2, '0')
    const d = String(today.getDate()).padStart(2, '0')
    this.setData({
      dateStr: `${y}-${m}-${d}`,
      displayDate: `${m}月${d}日`
    })
    this.loadCustomCategories('expense')

    // 编辑模式：从详情页跳转过来，回填数据
    if (options && options.id) {
      this.loadBillForEdit(options.id)
    }
  },

  onHide() {
    this.setCustomTabBarHidden(false)
    this.stopPetLoop()
    // 编辑模式下不清除状态（switchTab 会触发 onHide，但编辑链路未结束）
    // 仅在新增模式下重置导航栏标题
    if (!this.data.editMode) {
      wx.setNavigationBarTitle({ title: '记一笔' })
    }
  },

  onUnload() {
    if (this._themeHandler) getApp().globalData.eventBus.off('themeChanged', this._themeHandler)
    if (this._amountBlurTimer) clearTimeout(this._amountBlurTimer)
    this.setCustomTabBarHidden(false)
    this.stopPetLoop()
    this.resetForm()
  },

  updateCustomTabBar() {
    if (typeof this.getTabBar !== 'function') return
    const tabBar = this.getTabBar()
    if (tabBar && typeof tabBar.updateSelected === 'function') {
      tabBar.updateSelected()
    }
  },

  noop() {},

  setCustomTabBarHidden(hidden) {
    if (typeof this.getTabBar !== 'function') return
    const tabBar = this.getTabBar()
    if (tabBar && typeof tabBar.setHidden === 'function') {
      tabBar.setHidden(hidden)
    }
  },

  startPetLoop() {
    this.stopPetLoop()
    this.schedulePetAction()
  },

  stopPetLoop() {
    if (this._petTimer) clearTimeout(this._petTimer)
    if (this._petActionTimer) clearTimeout(this._petActionTimer)
    this._petTimer = null
    this._petActionTimer = null
  },

  schedulePetAction() {
    const delay = 4200 + Math.floor(Math.random() * 5200)
    this._petTimer = setTimeout(() => {
      this.triggerRandomPetAction()
      this.schedulePetAction()
    }, delay)
  },

  triggerRandomPetAction() {
    const roll = Math.random()
    const action = roll < 0.25 ? 'idle' : roll < 0.5 ? 'heart' : roll < 0.75 ? 'wave' : 'jump'
    this.playPetAction(action)
  },

  playPetAction(action) {
    if (this._petActionTimer) clearTimeout(this._petActionTimer)
    const bubble = action === 'wave' ? 'Hi' : action === 'heart' ? '给你小心心' : ''
    const patch = { petAction: action, petBubble: bubble }

    if (action === 'heart') {
      patch.petHearts = [{ id: 'heart_' + Date.now() }]
    }

    this.setData(patch)
    this._petActionTimer = setTimeout(() => {
      this.setData({ petAction: 'idle', petBubble: '', petHearts: [] })
    }, action === 'heart' ? 1600 : 1100)
  },

  openAiChat() {
    const app = getApp()
    const userInfo = (app.globalData && app.globalData.userInfo) || {}
    wx.hideKeyboard()
    this.setCustomTabBarHidden(true)
    this.playPetAction('wave')
    this.setData({
      showAiChat: true,
      chatInput: '',
      chatLoading: false,
      chatMessages: [Object.assign({}, AI_CHAT_WELCOME)],
      chatSuggestions: CHAT_SUGGESTIONS,
      showChatSuggestions: true,
      chatScrollTo: 'chat_welcome',
      chatKeyboardHeight: 0,
      chatModalStyle: '',
      chatUserAvatarUrl: userInfo.avatarUrl || '',
      chatAvatarError: false,
      amountAutoFocus: false,
      amountFocused: false,
      keyboardHeight: 0,
      quickConfirmStyle: 'bottom:0px;'
    })
    // 把 cloud:// fileID 解析成可直接渲染的 https tempFileURL
    resolveAvatarSrc(userInfo.avatarUrl || '').then(resolved => {
      if (resolved) this.setData({ chatUserAvatarUrl: resolved })
    })
  },

  closeAiChat() {
    this.setCustomTabBarHidden(false)
    this.setData({
      showAiChat: false,
      chatMessages: [],
      showChatSuggestions: false,
      chatInput: '',
      chatLoading: false,
      chatScrollTo: '',
      chatKeyboardHeight: 0,
      chatModalStyle: ''
    })
  },

  onChatInput(e) {
    this.setData({ chatInput: e.detail.value || '' })
  },

  onChatKeyboardHeightChange(e) {
    const height = Math.max(0, Math.round((e.detail && e.detail.height) || 0))
    this.setData({
      chatKeyboardHeight: height,
      chatModalStyle: height ? 'bottom:' + height + 'px;' : ''
    })
  },

  onChatInputBlur() {
    this.setData({
      chatKeyboardHeight: 0,
      chatModalStyle: ''
    })
  },

  onChatAvatarError() {
    this.setData({ chatAvatarError: true })
  },

  sendChatSuggestion(e) {
    const text = e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset.text : ''
    this.sendChatMessage(text)
  },

  async sendChatMessage(inputText) {
    const text = (typeof inputText === 'string' ? inputText : (this.data.chatInput || '')).trim()
    if (!text || this.data.chatLoading) return

    const userMessage = this.buildChatMessage('user', text)
    const messages = this.data.chatMessages.concat([userMessage])
    this.setData({
      chatMessages: messages,
      chatInput: '',
      chatLoading: true,
      showChatSuggestions: false,
      chatScrollTo: userMessage.id
    })

    const safety = await checkText(text, { scene: 2 })
    if (!safety.ok) {
      this.appendAssistantMessage(AI_CHAT_FALLBACK)
      this.setData({ chatLoading: false })
      return
    }

    if (this.isWeatherQuestion(text)) {
      this.appendAssistantMessage('天气查询功能先下线了，咱们聊记账、消费复盘或者生活小事吧~')
      this.setData({ chatLoading: false })
      return
    }

    try {
      const res = await wx.cloud.callFunction({
        name: 'aiChat',
        data: {
          messages: this.getRecentChatMessages(messages),
          userProfile: this.getChatUserProfile(),
          categories: this.getKnownCategories(),
          today: getTodayKey()
        },
        config: { timeout: 30000 }
      })
      const result = res.result || {}
      let reply = result.reply || AI_CHAT_FALLBACK
      const replySafety = await checkText(reply, { scene: 4 })
      if (!replySafety.ok) reply = AI_CHAT_FALLBACK
      this.appendAssistantMessage(reply)
      const drafts = Array.isArray(result.bills) ? result.bills : []
      if (reply !== AI_CHAT_FALLBACK && drafts.length) {
        this.appendBillDraft(drafts)
      }
    } catch (err) {
      console.error('[aiChat] 调用失败:', err)
      this.appendAssistantMessage(AI_CHAT_FALLBACK)
    } finally {
      this.setData({ chatLoading: false })
    }
  },

  buildChatMessage(role, content) {
    const id = 'chat_' + role + '_' + Date.now() + '_' + Math.floor(Math.random() * 1000)
    return {
      id,
      role,
      content,
      avatar: role === 'assistant' ? '/images/juji2.jpg' : (this.data.chatUserAvatarUrl || '')
    }
  },

  appendAssistantMessage(content) {
    const message = this.buildChatMessage('assistant', content)
    this.setData({
      chatMessages: this.data.chatMessages.concat([message]),
      chatScrollTo: message.id
    })
  },

  appendBillDraft(drafts) {
    const id = 'chat_draft_' + Date.now() + '_' + Math.floor(Math.random() * 1000)
    const items = drafts.slice(0, 10).map(function(d, i) {
      const isNew = !!d.isNewCategory
      return {
        key: id + '_' + i,
        type: d.type === 'income' ? 'income' : 'expense',
        category: String(d.category || '其他'),
        amount: Number(d.amount) || 0,
        amountText: (Number(d.amount) || 0).toFixed(2),
        note: String(d.note || ''),
        date: d.date || getTodayKey(),
        isNewCategory: isNew,
        createNew: false
      }
    })
    const message = {
      id,
      role: 'assistant',
      type: 'billDraft',
      status: 'pending',
      drafts: items,
      avatar: '/images/juji2.jpg'
    }
    this.setData({
      chatMessages: this.data.chatMessages.concat([message]),
      chatScrollTo: id
    })
  },

  _findDraftMessage(msgId) {
    const messages = this.data.chatMessages
    for (let i = 0; i < messages.length; i++) {
      if (messages[i].id === msgId && messages[i].type === 'billDraft') {
        return { index: i, message: messages[i] }
      }
    }
    return null
  },

  _updateDraftMessage(msgId, mutate) {
    const found = this._findDraftMessage(msgId)
    if (!found) return
    const drafts = found.message.drafts.map(function(d) { return Object.assign({}, d) })
    mutate(drafts, found.message)
    const patch = {}
    patch['chatMessages[' + found.index + '].drafts'] = drafts
    this.setData(patch)
  },

  onDraftAmountInput(e) {
    const msgId = e.currentTarget.dataset.msg
    const key = e.currentTarget.dataset.key
    const val = e.detail.value
    this._updateDraftMessage(msgId, function(drafts) {
      drafts.forEach(function(d) {
        if (d.key === key) {
          d.amountText = val
          d.amount = parseFloat(val) || 0
        }
      })
    })
  },

  onDraftNoteInput(e) {
    const msgId = e.currentTarget.dataset.msg
    const key = e.currentTarget.dataset.key
    const val = e.detail.value
    this._updateDraftMessage(msgId, function(drafts) {
      drafts.forEach(function(d) {
        if (d.key === key) d.note = val
      })
    })
  },

  removeDraftRow(e) {
    const msgId = e.currentTarget.dataset.msg
    const key = e.currentTarget.dataset.key
    const found = this._findDraftMessage(msgId)
    if (!found) return
    const drafts = found.message.drafts.filter(function(d) { return d.key !== key })
    const patch = {}
    patch['chatMessages[' + found.index + '].drafts'] = drafts
    this.setData(patch)
  },

  toggleDraftNewCategory(e) {
    const msgId = e.currentTarget.dataset.msg
    const key = e.currentTarget.dataset.key
    this._updateDraftMessage(msgId, function(drafts) {
      drafts.forEach(function(d) {
        if (d.key === key) d.createNew = !d.createNew
      })
    })
  },

  cancelBillDraft(e) {
    const msgId = e.currentTarget.dataset.msg
    const found = this._findDraftMessage(msgId)
    if (!found) return
    const messages = this.data.chatMessages.filter(function(m) { return m.id !== msgId })
    this.setData({ chatMessages: messages })
  },

  async confirmBillDraft(e) {
    const msgId = e.currentTarget.dataset.msg
    const found = this._findDraftMessage(msgId)
    if (!found || found.message.status !== 'pending') return

    const rows = found.message.drafts
    if (!rows.length) {
      wx.showToast({ title: '没有可记录的账单', icon: 'none' })
      return
    }
    for (let i = 0; i < rows.length; i++) {
      const amt = parseFloat(rows[i].amountText)
      if (isNaN(amt) || amt <= 0) {
        wx.showToast({ title: '第' + (i + 1) + '笔金额无效', icon: 'none' })
        return
      }
    }

    const statusPatch = {}
    statusPatch['chatMessages[' + found.index + '].status'] = 'saving'
    this.setData(statusPatch)

    const newCategoryNames = []
    const bills = rows.map(function(d) {
      let category = d.category
      let note = d.note
      if (d.isNewCategory && !d.createNew) {
        note = note ? (d.category + '·' + note) : d.category
        category = '其他'
      } else if (d.isNewCategory && d.createNew) {
        newCategoryNames.push(d.category)
      }
      return {
        type: d.type,
        amount: parseFloat(d.amountText),
        category,
        note,
        date: d.date || getTodayKey()
      }
    })

    try {
      const res = await wx.cloud.callFunction({
        name: 'bills',
        data: { action: 'batchCreate', data: { bills } },
        config: { timeout: 20000 }
      })
      const result = res.result || {}
      if (!result.success) {
        this._setDraftStatus(msgId, 'pending')
        wx.showToast({ title: result.message || '记账失败', icon: 'none' })
        return
      }
      if (newCategoryNames.length) {
        await this._appendCustomCategories(newCategoryNames)
      }
      const created = result.created || 0
      this._setDraftStatus(msgId, 'done')
      this.loadCustomCategories(this.data.type)
      this.appendAssistantMessage('已记 ' + created + ' 笔，可以在首页查看啦~')
    } catch (err) {
      console.error('[batchCreate] 调用失败:', err)
      this._setDraftStatus(msgId, 'pending')
      wx.showToast({ title: '记账失败，请重试', icon: 'none' })
    }
  },

  _setDraftStatus(msgId, status) {
    const found = this._findDraftMessage(msgId)
    if (!found) return
    const patch = {}
    patch['chatMessages[' + found.index + '].status'] = status
    this.setData(patch)
  },

  async _appendCustomCategories(names) {
    const app = getApp()
    if (!app.globalData.openid) return
    const existing = (app.globalData.userInfo && app.globalData.userInfo.customCategories) || []
    const existingNames = {}
    existing.forEach(function(c) { existingNames[c.name] = true })
    const preset = {}
    PRESET_EXPENSE_CATEGORIES.concat(PRESET_INCOME_CATEGORIES).forEach(function(n) { preset[n] = true })
    const toAdd = []
    names.forEach(function(name) {
      if (!name || existingNames[name] || preset[name]) return
      existingNames[name] = true
      toAdd.push({ name: name, icon: CATEGORY_EMOJI[name] || '🏷️' })
    })
    if (!toAdd.length) return
    const merged = existing.concat(toAdd)
    try {
      await wx.cloud.database().collection('users')
        .where({ _openid: app.globalData.openid })
        .update({ data: { customCategories: merged } })
      if (!app.globalData.userInfo) app.globalData.userInfo = {}
      app.globalData.userInfo.customCategories = merged
    } catch (err) {
      console.warn('[batchCreate] 追加自定义分类失败:', err)
    }
  },

  getRecentChatMessages(messages) {
    return messages
      .filter(function(item) {
        return (item.role === 'user' || item.role === 'assistant') && item.content
      })
      .slice(-8)
      .map(function(item) {
        return {
          role: item.role,
          content: item.content
        }
      })
  },

  getKnownCategories() {
    const custom = (getApp().globalData.userInfo && getApp().globalData.userInfo.customCategories) || []
    const customNames = custom.map(function(c) { return c.name })
    const all = PRESET_EXPENSE_CATEGORIES.concat(PRESET_INCOME_CATEGORIES).concat(customNames)
    const seen = {}
    return all.filter(function(name) {
      if (!name || seen[name]) return false
      seen[name] = true
      return true
    })
  },

  getChatUserProfile() {
    const userInfo = (getApp().globalData && getApp().globalData.userInfo) || {}
    return {
      nickname: userInfo.nickname || '',
      gender: userInfo.gender || '',
      zodiac: userInfo.zodiac || '',
      occupation: userInfo.occupation || '',
      currentType: this.data.type,
      currentCategory: this.data.selectedCategory,
      currentAmount: this.data.amount || '',
      currentDate: this.data.dateStr || getTodayKey()
    }
  },

  isWeatherQuestion(text) {
    return WEATHER_QUESTION_PATTERN.test(String(text || ''))
  },

  onShow() {
    applyTheme()
    this.setData({ themeStyle: getThemeStyleString(), amountAutoFocus: !this.data.showAiChat })
    this.updateCustomTabBar()
    this.loadCustomCategories(this.data.type)
    this.startPetLoop()

    // 检测从详情页跳转过来的编辑请求（通过全局变量，因为 switchTab 不能带参数）
    // 若当前已在编辑模式，跳过，防止状态被意外覆盖
    if (this.data.editMode) return
    const editId = getApp().globalData._editBillId
    if (editId) {
      // 清除标记，避免重复触发
      getApp().globalData._editBillId = ''
      this.loadBillForEdit(editId)
      return
    }

    if (!this.data.amount && !this.data.note && !this.data.photoUrl && !this.data.mood) {
      this.scrollToTop()
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
  onAmountInput(e) {
    const amount = e.detail.value
    this.setData({ amount, quickCanSave: parseFloat(amount) > 0 })
  },
  onAmountFocus() {
    if (this._amountBlurTimer) clearTimeout(this._amountBlurTimer)
    if (!this.data.editMode) {
      this.setData({ amountFocused: true, quickCanSave: parseFloat(this.data.amount) > 0 })
    }
  },
  onAmountBlur() {
    if (this._amountBlurTimer) clearTimeout(this._amountBlurTimer)
    this._amountBlurTimer = setTimeout(() => {
      this.setData({ amountFocused: false })
    }, 160)
  },
  onKeyboardHeightChange(e) {
    const height = Math.max(0, e.detail.height || 0)
    this.setData({
      keyboardHeight: height,
      quickConfirmStyle: `bottom:${height}px;`
    })
  },
  onNoteInput(e) { this.setData({ note: e.detail.value }) },
  onNoteFocus() { this.setData({ showNoteInput: true }) },
  onNoteBlur() { if (!this.data.note) this.setData({ showNoteInput: false }) },

  toggleNoteExpand() {
    this.setData({ noteExpanded: !this.data.noteExpanded })
  },

  clearNote() {
    this.setData({ note: '', noteExpanded: false, showNoteInput: false })
  },

  openMoodSheet() {
    this.setData({ showMoodSheet: true })
  },

  closeMoodSheet() {
    this.setData({ showMoodSheet: false })
  },

  clearMood() {
    this.setData({ mood: '', isCustomMood: false, showMoodSheet: false })
  },
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

  // 隐私链路回调：账单照片等能力触发 wx.onNeedPrivacyAuthorization 时调用，
  // 弹出记账页隐私授权弹窗，内含真实授权按钮（见 record.wxml 的 privacy-auth-btn）。
  showPrivacyAuthorizeButton() {
    this.setData({ showPrivacyAuth: true })
  },

  hidePrivacyAuthorizeButton() {
    this.setData({ showPrivacyAuth: false })
  },

  // 用户点击授权按钮后回调，统一交给 handlePrivacyAuthorize 解析并 resolve 授权结果。
  onPrivacyAuthorize(e) {
    this.setData({ showPrivacyAuth: false })
    handlePrivacyAuthorize(e)
  },

  noop() {},

  async choosePhoto() {
    this.setData({ privacyAuthFeature: '账单照片' })
    const ok = await requirePrivacyAuthorization('账单照片')
    this.setData({ privacyAuthFeature: '' })
    if (!ok) return

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
      success: async res => {
        if (!res.confirm) return
        const v = (res.content || '').trim()
        if (!v) { this.setData({ mood: '', isCustomMood: false }); return }
        if (!(await ensureSafeText(v, { scene: 2 }))) return
        this.setData({ mood: v, isCustomMood: true })
      }
    })
  },

  // ===== 自创分类 =====
  openAddDialog() {
    this.setData({ showAddDialog: true, addCategoryName: '', addCategoryEmoji: '', addCategoryError: '' })
  },
  closeAddDialog() { this.setData({ showAddDialog: false, addCategoryError: '' }) },
  onAddName(e) { this.setData({ addCategoryName: e.detail.value, addCategoryError: '' }) },
  onAddEmoji(e) { this.setData({ addCategoryEmoji: e.detail.value }) },

  async saveAddCategory() {
    const name = this.data.addCategoryName.trim()
    if (!name || name.length > 10) {
      this.setData({ addCategoryError: '名称需要 1-10 字' }); return
    }
    if (name === '自创') {
      this.setData({ addCategoryError: '不能使用这个名称' }); return
    }
    if (!(await ensureSafeText(name, { scene: 2 }))) return
    const icon = (this.data.addCategoryEmoji || '').trim()
    if (!icon || icon.length > 2) {
      wx.showToast({ title: '请仅输入一个Emoji', icon: 'none' }); return
    }
    const presetNames = new Set([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].map(c => c.name))
    const existingCustom = (getApp().globalData.userInfo?.customCategories || []).map(c => c.name)
    if (presetNames.has(name) || existingCustom.includes(name)) {
      this.setData({ addCategoryError: '该分类已存在' }); return
    }

    const app = getApp()
    const custom = [...(app.globalData.userInfo?.customCategories || []), { name, icon }]
    try {
      await wx.cloud.database().collection('users')
        .where({ _openid: app.globalData.openid })
        .update({ data: { customCategories: custom } })
      app.globalData.userInfo.customCategories = custom
      app.globalData.eventBus.emit('categoryChanged')
      this.setData({ showAddDialog: false, selectedCategory: name })
      this.loadCustomCategories(this.data.type)
      wx.showToast({ title: `已创建「${name}」`, icon: 'success' })
    } catch (err) {
      console.error('创建分类失败:', err)
      wx.showToast({ title: '创建失败', icon: 'none' })
    }
  },
  // ===== 长按删除自定义分类 =====
  handleDeleteCategory(e) {
    const item = e.currentTarget.dataset.item
    if (!item) return
    // 安全守卫：仅允许删除自定义分类（无 iconPath 即为自定义）
    const presetNames = new Set([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].map(c => c.name))
    if (presetNames.has(item.name)) return

    wx.showModal({
      title: '删除分类',
      content: '确定要删除该自定义分类吗？',
      success: async (res) => {
        if (!res.confirm) return
        try {
          const app = getApp()
          const updated = (app.globalData.userInfo?.customCategories || []).filter(c => c.name !== item.name)
          await wx.cloud.database().collection('users')
            .where({ _openid: app.globalData.openid })
            .update({ data: { customCategories: updated } })
          app.globalData.userInfo.customCategories = updated
          app.globalData.eventBus.emit('categoryChanged')
          // 如果删的是当前选中的分类，重置为第一个预设分类
          if (this.data.selectedCategory === item.name) {
            const preset = this.getPresetCategories(this.data.type)
            this.setData({ selectedCategory: preset[0]?.name || '' })
          }
          this.loadCustomCategories(this.data.type)
          wx.showToast({ title: '已删除', icon: 'success' })
        } catch (err) {
          console.error('删除分类失败:', err)
          wx.showToast({ title: '删除失败', icon: 'none' })
        }
      }
    })
  },

  previewPhoto() { wx.previewImage({ urls: [this.data.photoUrl] }) },

  // ===== 编辑模式：加载已有数据回填 =====
  async loadBillForEdit(billId) {
    try {
      const db = wx.cloud.database()
      const { data: bill } = await db.collection('bills').doc(billId).get()
      if (!bill) {
        wx.showToast({ title: '账单不存在', icon: 'none' })
        return
      }

      // 设置类型和分类列表
      const preset = this.getPresetCategories(bill.type)
      this.setData({
        type: bill.type,
        amount: String(parseFloat(bill.amount)),
        selectedCategory: bill.category,
        note: bill.note || '',
        photoUrl: bill.photoUrl || '',
        photoCloudPath: bill.photoUrl || '',
        mood: bill.mood || '',
        dateStr: bill.date,
        editMode: true,
        editBillId: billId,
        categories: preset,
        showNoteInput: !!(bill.note)
      })

      // 处理显示日期
      const today = new Date()
      const y = today.getFullYear()
      const m = String(today.getMonth() + 1).padStart(2, '0')
      const d = String(today.getDate()).padStart(2, '0')
      const todayStr = `${y}-${m}-${d}`
      if (bill.date === todayStr) {
        this.setData({ displayDate: '今天' })
      } else {
        const [sy, sm, sd] = bill.date.split('-')
        this.setData({ displayDate: `${parseInt(sm)}月${parseInt(sd)}日` })
      }

      this.loadCustomCategories(bill.type)

      // 处理自定义心情
      if (this.data.mood && !this.data.presetMoods.includes(this.data.mood)) {
        this.setData({ isCustomMood: true })
      }

      wx.setNavigationBarTitle({ title: '编辑账单' })
      this.scrollToTop()
    } catch (err) {
      console.error('加载账单失败:', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  // ===== 取消编辑，返回详情/首页 =====
  cancelEdit() {
    if (this.data.editMode) {
      wx.navigateBack()
    }
  },

  async quickSaveRecord() {
    if (this.data.editMode || this.data.quickSaving) return

    if (!canSaveBill()) {
      wx.showToast({ title: '操作太快，请稍候', icon: 'none' }); return
    }

    const { type, amount, selectedCategory, dateStr, presetMoods } = this.data
    const mood = presetMoods[0] || ''
    const v = validateBill({ type, amount, category: selectedCategory, date: dateStr, note: '', photoUrl: '' })
    if (!v.valid) {
      wx.showToast({ title: v.message, icon: 'none' }); return
    }

    const safetyText = [selectedCategory, mood].filter(Boolean).join('\n')
    if (!(await ensureSafeText(safetyText, { scene: 2 }))) return

    const daily = checkDailyLimit('bills', 500)
    if (daily.exceeded) {
      wx.showToast({ title: '今日已达上限', icon: 'none' }); return
    }

    wx.hideKeyboard()
    this.setData({ quickSaving: true })
    wx.showLoading({ title: '保存中…' })
    try {
      const res = await wx.cloud.callFunction({
        name: 'bills',
        data: {
          action: 'create',
          data: {
            type,
            amount: parseFloat(amount),
            category: selectedCategory,
            date: dateStr,
            note: '',
            photoUrl: '',
            mood
          }
        }
      })
      if (!res.result || !res.result.success) {
        throw new Error((res.result && res.result.message) || '保存失败')
      }
      daily.increment()
      getApp().globalData.eventBus.emit('billChanged')
      wx.hideLoading()
      this.setData({
        amountFocused: false,
        keyboardHeight: 0,
        quickConfirmStyle: 'bottom:0px;',
        quickCanSave: false,
        quickSaving: false
      })
      this.resetForm(type)
      this.scrollToTop()
      wx.showToast({ title: '已保存', icon: 'success', duration: 1200, mask: true })
      setTimeout(() => { wx.switchTab({ url: '/pages/home/home' }) }, 1200)
    } catch (err) {
      wx.hideLoading()
      this.setData({ quickSaving: false })
      console.error('快捷保存失败:', err)
      wx.showToast({ title: err.message || '保存失败，请重试', icon: 'none' })
    }
  },

  // ===== 保存记账 =====
  async saveRecord() {
    // 频率限制：3 秒防抖
    if (!canSaveBill()) {
      wx.showToast({ title: '操作太快，请稍候', icon: 'none' }); return
    }

    const { type, amount, selectedCategory, dateStr, note, photoUrl, mood, editMode, editBillId } = this.data

    // 输入校验
    const v = validateBill({ type, amount, category: selectedCategory, date: dateStr, note, photoUrl })
    if (!v.valid) {
      wx.showToast({ title: v.message, icon: 'none' }); return
    }

    const safetyText = [selectedCategory, note, mood].filter(Boolean).join('\n')
    if (!(await ensureSafeText(safetyText, { scene: 2 }))) return

    wx.showLoading({ title: editMode ? '修改中…' : '保存中…' })
    try {
      let finalPhotoUrl = photoUrl
      // 只有新选择的本地图片才需要上传（cloud:// 开头的是已有云存储图片，不用重传）
      if (photoUrl && !photoUrl.startsWith('cloud://')) {
        const extMatch = photoUrl.match(/\.(\w+)(\?|$)/)
        const ext = extMatch ? extMatch[1].toLowerCase() : 'jpg'
        const allowed = ['png','jpg','jpeg','gif','bmp','webp']
        const safeExt = allowed.includes(ext) ? ext : 'jpg'
        const uploadRes = await wx.cloud.uploadFile({
          cloudPath: `bills/${Date.now()}-${Math.random().toString(36).slice(2)}.${safeExt}`,
          filePath: photoUrl
        })
        finalPhotoUrl = uploadRes.fileID
      }

      if (editMode) {
        // 编辑模式：调用云函数 update
        const res = await wx.cloud.callFunction({
          name: 'bills',
          data: {
            action: 'update',
            data: {
              billId: editBillId,
              type,
              amount,
              category: selectedCategory,
              date: dateStr,
              note: note || '',
              photoUrl: finalPhotoUrl || '',
              mood: mood || ''
            }
          }
        })
        if (!res.result || !res.result.success) {
          throw new Error((res.result && res.result.message) || '修改失败')
        }
        getApp().globalData.eventBus.emit('billChanged')
        wx.hideLoading()
        this.resetForm()
        this.scrollToTop()
        wx.showToast({ title: '已保存', icon: 'success', duration: 1200, mask: true })
        setTimeout(() => { wx.switchTab({ url: '/pages/home/home' }) }, 1200)
      } else {
        // 新增模式：日上限检查 + 走云函数服务端校验
        const daily = checkDailyLimit('bills', 500)
        if (daily.exceeded) {
          wx.hideLoading()
          wx.showToast({ title: '今日已达上限', icon: 'none' }); return
        }
        const res = await wx.cloud.callFunction({
          name: 'bills',
          data: {
            action: 'create',
            data: {
              type, amount: parseFloat(amount), category: selectedCategory,
              date: dateStr, note: note || '', photoUrl: finalPhotoUrl || '',
              mood: mood || ''
            }
          }
        })
        if (!res.result || !res.result.success) {
          throw new Error((res.result && res.result.message) || '保存失败')
        }
        daily.increment()
        getApp().globalData.eventBus.emit('billChanged')
        wx.hideLoading()
        this.resetForm(type)
        this.scrollToTop()
        wx.showToast({ title: '已保存', icon: 'success', duration: 1200, mask: true })
        setTimeout(() => { wx.switchTab({ url: '/pages/home/home' }) }, 1200)
      }
    } catch (err) {
      wx.hideLoading()
      console.error('保存失败:', err)
      wx.showToast({ title: err.message || '保存失败，请重试', icon: 'none' })
    }
  }
})
