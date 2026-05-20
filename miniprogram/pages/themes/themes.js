const THEMES = [
  {
    id: 'fresh', name: '清新', desc: '暖白底 + 柔和玫瑰色',
    colors: [
      { name: 'primary', value: '#785655' },
      { name: 'bg', value: '#fffaf8' },
      { name: 'surface', value: '#ffffff' },
      { name: 'text', value: '#1e1b1a' },
      { name: 'income', value: '#4b6458' },
      { name: 'error', value: '#ba1a1a' }
    ]
  },
  {
    id: 'dark', name: '深夜', desc: '深色背景 + 暖金主色，护眼模式',
    colors: [
      { name: 'primary', value: '#d4a574' },
      { name: 'bg', value: '#1a1a1f' },
      { name: 'surface', value: '#242429' },
      { name: 'text', value: '#e8e6e3' },
      { name: 'income', value: '#7db892' },
      { name: 'error', value: '#ffb4ab' }
    ]
  },
  {
    id: 'mint', name: '薄荷', desc: '浅绿底 + 翠绿主色，清爽舒适',
    colors: [
      { name: 'primary', value: '#3d7a5c' },
      { name: 'bg', value: '#f6faf7' },
      { name: 'surface', value: '#ffffff' },
      { name: 'text', value: '#1a1f1c' },
      { name: 'income', value: '#3d7a5c' },
      { name: 'error', value: '#ba1a1a' }
    ]
  },
  {
    id: 'warm', name: '暖阳', desc: '奶黄底 + 暖橙主色，温暖明媚',
    colors: [
      { name: 'primary', value: '#d4865a' },
      { name: 'bg', value: '#fffdf7' },
      { name: 'surface', value: '#ffffff' },
      { name: 'text', value: '#211d18' },
      { name: 'income', value: '#5a8a6a' },
      { name: 'error', value: '#c62828' }
    ]
  }
]

Page({
  data: {
    themes: THEMES,
    currentTheme: 'fresh'
  },

  onLoad() {
    const stored = wx.getStorageSync('theme') || 'fresh'
    this.setData({ currentTheme: stored })
  },

  selectTheme(e) {
    const id = e.currentTarget.dataset.id
    if (id === this.data.currentTheme) return

    wx.showModal({
      title: '切换主题',
      content: '切换后会重新加载小程序',
      confirmText: '切换',
      success: res => {
        if (!res.confirm) return
        wx.setStorageSync('theme', id)
        wx.reLaunch({ url: '/pages/home/home' })
      }
    })
  }
})
