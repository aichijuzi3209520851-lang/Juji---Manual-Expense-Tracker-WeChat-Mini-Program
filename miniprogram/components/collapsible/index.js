Component({
  options: {
    multipleSlots: true
  },

  properties: {
    title: { type: String, value: '' },
    meta: { type: String, value: '' },
    icon: { type: String, value: '' },
    expanded: { type: Boolean, value: false },
    bodyMaxHeight: { type: Number, value: 1200 }
  },

  methods: {
    onToggle() {
      const next = !this.data.expanded
      this.setData({ expanded: next })
      this.triggerEvent('toggle', { expanded: next })
    }
  }
})
