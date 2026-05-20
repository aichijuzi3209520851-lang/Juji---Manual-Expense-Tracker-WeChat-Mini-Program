const CATEGORY_EMOJI = {
  '餐饮':'🍜','交通':'🚇','购物':'🛍️','娱乐':'🎮','学习':'📚','日用':'🏠','医疗':'💊',
  '工资':'💼','兼职':'🧳','理财':'💹','红包':'🎁','退款':'↩️','其他':'📌'
}

const WEEKS = ['日','一','二','三','四','五','六']

Page({
  data: {
    bill: null,
    photoSrc: ''
  },

  onLoad(options) {
    if (!options.id) {
      wx.showToast({ title: '账单不存在', icon: 'none' })
      wx.navigateBack()
      return
    }
    this.loadBill(options.id)
  },

  async loadBill(id) {
    try {
      const db = wx.cloud.database()
      const { data } = await db.collection('bills').doc(id).get()
      if (!data) { wx.navigateBack(); return }

      const icon = CATEGORY_EMOJI[data.category] || '📌'
      const app = getApp()
      if (app.globalData.userInfo?.customCategories) {
        const custom = app.globalData.userInfo.customCategories.find(c => c.name === data.category)
        if (custom?.icon) data.category = custom.name
      }

      const d = new Date(data.date + 'T00:00:00')
      const dateLabel = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 周${WEEKS[d.getDay()]}`

      this.setData({
        bill: {
          ...data,
          amountStr: parseFloat(data.amount).toFixed(2),
          categoryIcon: CATEGORY_EMOJI[data.category] || '📌',
          dateLabel,
          mood: data.mood || ''
        }
      })

      if (data.photoUrl) this.resolvePhoto(data.photoUrl)
    } catch (err) {
      console.error('加载账单失败:', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
      wx.navigateBack()
    }
  },

  async resolvePhoto(fileID) {
    if (!/^cloud:\/\//.test(fileID)) { this.setData({ photoSrc: fileID }); return }
    try {
      const res = await wx.cloud.getTempFileURL({ fileList: [fileID] })
      const url = res.fileList[0]?.tempFileURL
      if (url) this.setData({ photoSrc: url })
    } catch (err) { console.error('解析照片失败:', err) }
  },

  previewPhoto() {
    if (this.data.photoSrc) wx.previewImage({ urls: [this.data.photoSrc] })
  },

  deleteBill() {
    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，确定吗？',
      confirmColor: '#ba1a1a',
      success: async res => {
        if (!res.confirm) return
        try {
          await wx.cloud.database().collection('bills').doc(this.data.bill._id).remove()
          wx.showToast({ title: '已删除', icon: 'success' })
          setTimeout(() => wx.navigateBack(), 800)
        } catch (err) {
          wx.showToast({ title: '删除失败', icon: 'none' })
        }
      }
    })
  }
})
