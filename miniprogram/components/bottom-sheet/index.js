Component({
  properties: {
    visible: { type: Boolean, value: false },
    title: { type: String, value: '' },
    size: { type: String, value: 'medium' },
    showFooter: { type: Boolean, value: false }
  },

  data: {
    animating: false
  },

  observers: {
    'visible': function (val) {
      if (val) {
        this.setData({ animating: true })
      } else {
        this.setData({ animating: true })
        setTimeout(() => {
          this.setData({ animating: false })
        }, 300)
      }
    }
  },

  methods: {
    noop() {},

    onClose() {
      this.triggerEvent('close')
    }
  }
})
