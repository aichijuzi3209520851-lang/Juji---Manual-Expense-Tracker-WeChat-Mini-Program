// 原始值转储：把接管目标的 computed 样式原样打出来，不做任何判定
// 目的：区分「接管层写的 none, none」与「页面自带的渐变被覆盖」——这两者观感完全不同
const fs = require('fs')
const path = require('path')
const automator = require('miniprogram-automator')

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function connect() {
  let mp
  for (let i = 0; i < 30; i++) {
    try { mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' }); break }
    catch (_) { await sleep(2000) }
  }
  if (!mp) throw new Error('连不上 9420')
  return mp
}

const applyTheme = async (mp, id) => {
  await mp.evaluate((tid) => {
    wx.setStorageSync('theme', tid)
    getApp().globalData.currentTheme = tid
    const bus = getApp().globalData.eventBus
    if (bus && bus.emit) bus.emit('themeChanged', tid)
  }, id)
  await sleep(800)
}

const probe = (mp, sel) => mp.evaluate((s) => new Promise(res => {
  wx.createSelectorQuery().select(s).fields({
    computedStyle: ['backgroundColor', 'backgroundImage', 'outlineColor',
                    'boxShadow', 'backdropFilter', 'opacity']
  }).exec(r => res(r && r[0] ? r[0] : { missing: true }))
}), sel)

;(async () => {
  const mp = await connect()

  const targets = [
    { route: '/pages/stats/stats', tab: true, sel: ['.trend-card', '.range-toggle'] },
    { route: '/pages/profile/profile', tab: true, sel: ['.profile-menu', '.juji-pet-bubble'] }
  ]

  for (const themeId of ['fresh', 'liquidGlass']) {
    await applyTheme(mp, themeId)
    console.log('\n########## ' + themeId + ' ##########')
    for (const t of targets) {
      await mp.switchTab(t.route)
      await sleep(1500)
      for (const sel of t.sel) {
        const s = await probe(mp, sel)
        console.log('\n' + t.route + '  ' + sel)
        if (s.missing) { console.log('   (missing)'); continue }
        Object.entries(s).forEach(([k, v]) => {
          const str = String(v == null ? '' : v)
          console.log('   ' + k.padEnd(18) + ' = ' + (str.length > 160 ? str.slice(0, 160) + '…' : (str || '(空)')))
        })
      }
    }
  }
  await mp.disconnect()
  process.exit(0)
})().catch(e => { console.error('失败:', e.message); process.exit(2) })
