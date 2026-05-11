Component({
  data: {
    selected: 'pages/home/home',
    list: [
      {
        pagePath: 'pages/home/home',
        url: '/pages/home/home',
        text: '首页',
        iconPath: '../images/tabbar/home-soft.svg',
        selectedIconPath: '../images/tabbar/home-soft-active.svg'
      },
      {
        pagePath: 'pages/stats/stats',
        url: '/pages/stats/stats',
        text: '统计',
        iconPath: '../images/tabbar/stats-soft.svg',
        selectedIconPath: '../images/tabbar/stats-soft-active.svg'
      },
      {
        pagePath: 'pages/record/record',
        url: '/pages/record/record',
        text: '记一笔',
        primary: true
      },
      {
        pagePath: 'pages/budget/budget',
        url: '/pages/budget/budget',
        text: '预算',
        iconPath: '../images/tabbar/budget-soft.svg',
        selectedIconPath: '../images/tabbar/budget-soft-active.svg'
      },
      {
        pagePath: 'pages/profile/profile',
        url: '/pages/profile/profile',
        text: '我的',
        iconPath: '../images/tabbar/profile-soft.svg',
        selectedIconPath: '../images/tabbar/profile-soft-active.svg'
      }
    ]
  },

  lifetimes: {
    attached() {
      this.updateSelected()
    }
  },

  pageLifetimes: {
    show() {
      this.updateSelected()
    }
  },

  methods: {
    switchTab(e) {
      const { url } = e.currentTarget.dataset
      if (!url) return

      const pages = getCurrentPages()
      const currentRoute = pages.length ? pages[pages.length - 1].route : ''
      if (currentRoute === url.replace(/^\//, '')) return

      wx.switchTab({ url })
    },

    updateSelected() {
      const pages = getCurrentPages()
      if (!pages.length) return

      const currentRoute = pages[pages.length - 1].route
      if (currentRoute && currentRoute !== this.data.selected) {
        this.setData({ selected: currentRoute })
      }
    }
  }
})
