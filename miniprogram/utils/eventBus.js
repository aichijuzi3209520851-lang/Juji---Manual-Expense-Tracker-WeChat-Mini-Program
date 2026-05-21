/**
 * 橘记 - 全局事件总线
 *
 * 解决小程序中跨页面通信问题。
 * 典型用途：主题切换后通知所有页面即时刷新。
 * 用法：
 *   const bus = getApp().globalData.eventBus
 *   bus.on('themeChanged', (id) => { ... })
 *   bus.emit('themeChanged', 'dark')
 *   bus.off('themeChanged', handler)
 */
function EventBus() {
  this._events = {}
}

EventBus.prototype.on = function (event, fn) {
  if (!this._events[event]) this._events[event] = []
  this._events[event].push(fn)
  return this
}

EventBus.prototype.once = function (event, fn) {
  const wrapper = (...args) => {
    this.off(event, wrapper)
    fn.apply(this, args)
  }
  return this.on(event, wrapper)
}

EventBus.prototype.off = function (event, fn) {
  if (!this._events[event]) return this
  if (!fn) {
    delete this._events[event]
  } else {
    this._events[event] = this._events[event].filter(f => f !== fn)
  }
  return this
}

EventBus.prototype.emit = function (event, ...args) {
  const list = this._events[event]
  if (!list || list.length === 0) return false
  for (let i = 0; i < list.length; i++) {
    try { list[i].apply(this, args) } catch (e) { console.error(`[EventBus] ${event} handler error:`, e) }
  }
  return true
}

module.exports = EventBus
