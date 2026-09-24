/**
 * 更新公告弹窗
 * ────────────────────────────────────────────────────────────
 * 用法（父页面）：
 *   <update-modal
 *     visible="{{showUpdateModal}}"
 *     entry="{{latestChangelog}}"
 *     bind:close="onCloseUpdateModal"
 *     bind:viewhistory="onViewChangelog" />
 *
 * 注意：属性名用 entry 而不是 item —— 避免与 wx:for 默认的 item 变量重名。
 * 弹层是全屏遮罩，父页面在开关时必须同步收起自定义 tabBar（本项目约定）。
 */
Component({
  properties: {
    visible: { type: Boolean, value: false },
    entry: { type: Object, value: null }
  },

  methods: {
    onMaskTap() {
      this.triggerEvent('close')
    },

    onClose() {
      this.triggerEvent('close')
    },

    onViewHistory() {
      this.triggerEvent('viewhistory')
    },

    // 空实现：供 catchtap 阻止冒泡、catchtouchmove 防止滚动穿透
    stopPop() {}
  }
})
