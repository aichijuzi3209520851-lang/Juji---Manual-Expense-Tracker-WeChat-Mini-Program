/**
 * 橘记 - 主题管理模块
 *
 * 使用 wx.setPageStyle() (基础库 2.20.1+) 动态注入 CSS 变量，
 * 实现多主题切换。每个页面在 onShow 时调用 applyTheme() 即可。
 */

// ==================== 自定义主题调色板（透亮浅色系，参考 Tailwind 400/500）====================
const CUSTOM_PALETTE = [
  { name: '樱花粉', hex: '#fb7299' },
  { name: '蜜桃橙', hex: '#fb923c' },
  { name: '柠檬黄', hex: '#facc15' },
  { name: '青葱绿', hex: '#4ade80' },
  { name: '蒂芙尼蓝', hex: '#22d3ee' },
  { name: '鸢尾紫', hex: '#a78bfa' },
  { name: '玫瑰金', hex: '#f43f5e' },
  { name: '晴空蓝', hex: '#60a5fa' }
]

const MAX_USER_THEMES = 5

// ==================== HSL 转换工具 ====================
function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0, l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) }
}

function hslToHex(h, s, l) {
  s = Math.max(0, Math.min(100, s)) / 100
  l = Math.max(0, Math.min(100, l)) / 100
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs((h / 60) % 2 - 1))
  const m = l - c / 2
  let r = 0, g = 0, b = 0
  if (h < 60)      { r = c; g = x; b = 0 }
  else if (h < 120) { r = x; g = c; b = 0 }
  else if (h < 180) { r = 0; g = c; b = x }
  else if (h < 240) { r = 0; g = x; b = c }
  else if (h < 300) { r = x; g = 0; b = c }
  else              { r = c; g = 0; b = x }
  const toHex = v => Math.round((v + m) * 255).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

// ==================== 自定义主题变量推导 ====================
function generateCustomVars(hex) {
  const p = hexToHsl(hex)
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
  const onPrimary = p.l > 65 ? '#1e293b' : '#ffffff'
  const accentHue = (p.h + 60) % 360

  return {
    '--color-primary': hex,
    '--color-primary-container': hslToHex(p.h, clamp(p.s - 15, 30, 100), clamp(p.l + 22, 0, 92)),
    '--color-primary-light': hslToHex(p.h, clamp(p.s - 8, 35, 100), clamp(p.l + 12, 0, 85)),
    '--color-on-primary': onPrimary,
    '--color-accent': hslToHex(accentHue, clamp(p.s - 10, 30, 90), p.l),
    '--color-secondary': hslToHex(p.h, p.s, clamp(p.l - 15, 25, 100)),
    '--color-secondary-container': hslToHex(p.h, clamp(p.s - 12, 30, 100), clamp(p.l + 20, 0, 90)),
    '--color-tertiary': hslToHex(p.h, clamp(p.s - 5, 30, 100), clamp(p.l - 8, 40, 100)),
    '--color-tertiary-container': hslToHex(p.h, clamp(p.s - 20, 25, 100), clamp(p.l + 22, 0, 92)),
    '--color-error': '#ba1a1a',
    '--color-error-container': '#ffdad6',

    '--color-bg': hslToHex(p.h, 25, 97),
    '--color-surface': '#ffffff',
    '--color-surface-low': hslToHex(p.h, 30, 96),
    '--color-surface-container': hslToHex(p.h, 30, 94),
    '--color-surface-high': hslToHex(p.h, 25, 92),
    '--color-surface-highest': hslToHex(p.h, 22, 89),
    '--color-surface-dim': hslToHex(p.h, 20, 86),

    '--color-text': hslToHex(p.h, 25, 14),
    '--color-text-secondary': hslToHex(p.h, 18, 38),
    '--color-text-tertiary': hslToHex(p.h, 12, 58),
    '--color-text-on-primary': onPrimary,

    '--color-border': hslToHex(p.h, 18, 84),
    '--color-outline': hslToHex(p.h, 12, 58),

    '--color-income': '#16a34a',
    '--color-income-light': '#bbf7d0',
    '--color-warning': '#d97706'
  }
}

// ==================== 预设主题变量表 ====================
const THEME_VARIABLES = {
  // ==================== 清新 (fresh) — 默认主题 ====================
  fresh: {
    '--color-primary': '#785655',
    '--color-primary-container': '#f7cac9',
    '--color-primary-light': '#eed7d4',
    '--color-on-primary': '#ffffff',
    '--color-accent': '#6a7855',
    '--color-secondary': '#6c5a59',
    '--color-secondary-container': '#f4e3e0',
    '--color-tertiary': '#4b6458',
    '--color-tertiary-container': '#c0dbcc',
    '--color-error': '#ba1a1a',
    '--color-error-container': '#ffdad6',

    '--color-bg': '#fffaf8',
    '--color-surface': '#ffffff',
    '--color-surface-low': '#fdf5f3',
    '--color-surface-container': '#f8efed',
    '--color-surface-high': '#f3eae8',
    '--color-surface-highest': '#ece2df',
    '--color-surface-dim': '#e7ddda',

    '--color-text': '#1e1b1a',
    '--color-text-secondary': '#5b4d4a',
    '--color-text-tertiary': '#938481',
    '--color-text-on-primary': '#ffffff',

    '--color-border': '#e4d5d3',
    '--color-outline': '#938481',

    '--color-income': '#4b6458',
    '--color-income-light': '#c0dbcc',
    '--color-warning': '#6c5a59'
  },

  // ==================== 深夜 (dark) — 夜间模式 ====================
  dark: {
    '--color-primary': '#d4a574',
    '--color-primary-container': '#3d2d22',
    '--color-primary-light': '#5a4335',
    '--color-on-primary': '#1a1a1f',
    '--color-accent': '#a8c986',
    '--color-secondary': '#cfa882',
    '--color-secondary-container': '#362a21',
    '--color-tertiary': '#7db892',
    '--color-tertiary-container': '#1f3a28',
    '--color-error': '#ffb4ab',
    '--color-error-container': '#93000a',

    '--color-bg': '#1a1a1f',
    '--color-surface': '#242429',
    '--color-surface-low': '#1f1f24',
    '--color-surface-container': '#2a2a30',
    '--color-surface-high': '#333340',
    '--color-surface-highest': '#3d3d4a',
    '--color-surface-dim': '#15151a',

    '--color-text': '#e8e6e3',
    '--color-text-secondary': '#b8b4af',
    '--color-text-tertiary': '#888581',
    '--color-text-on-primary': '#1a1a1f',

    '--color-border': '#3a3a44',
    '--color-outline': '#6a6a74',

    '--color-income': '#7db892',
    '--color-income-light': '#1f3a28',
    '--color-warning': '#cfa882'
  },

  // ==================== 薄荷 (mint) ====================
  mint: {
    '--color-primary': '#3d7a5c',
    '--color-primary-container': '#c0ebd3',
    '--color-primary-light': '#a5d4bb',
    '--color-on-primary': '#ffffff',
    '--color-accent': '#477a8b',
    '--color-secondary': '#4d8063',
    '--color-secondary-container': '#b8ddc8',
    '--color-tertiary': '#3d7a5c',
    '--color-tertiary-container': '#c0ebd3',
    '--color-error': '#ba1a1a',
    '--color-error-container': '#ffdad6',

    '--color-bg': '#f6faf7',
    '--color-surface': '#ffffff',
    '--color-surface-low': '#f2f7f3',
    '--color-surface-container': '#edf4ef',
    '--color-surface-high': '#e7f0ea',
    '--color-surface-highest': '#dbe8df',
    '--color-surface-dim': '#d2e2d7',

    '--color-text': '#1a1f1c',
    '--color-text-secondary': '#4a5a50',
    '--color-text-tertiary': '#7a8a80',
    '--color-text-on-primary': '#ffffff',

    '--color-border': '#c8d9cd',
    '--color-outline': '#8a9a90',

    '--color-income': '#3d7a5c',
    '--color-income-light': '#c0ebd3',
    '--color-warning': '#6b8f70'
  },

  // ==================== 蓝天白云 (skyBlue) — #38BDF8 主色 ====================
  skyBlue: {
    '--color-primary': '#38bdf8',
    '--color-primary-container': '#cceeff',
    '--color-primary-light': '#a8dff7',
    '--color-on-primary': '#022c45',
    '--color-accent': '#7e69cf',
    '--color-secondary': '#0ea5e9',
    '--color-secondary-container': '#bae6fd',
    '--color-tertiary': '#6366f1',
    '--color-tertiary-container': '#e0e7ff',
    '--color-error': '#ba1a1a',
    '--color-error-container': '#ffdad6',

    '--color-bg': '#f0f9ff',
    '--color-surface': '#fafeff',
    '--color-surface-low': '#f5fcff',
    '--color-surface-container': '#edf8ff',
    '--color-surface-high': '#e3f4fd',
    '--color-surface-highest': '#d6eef9',
    '--color-surface-dim': '#c8e7f5',

    '--color-text': '#0c2233',
    '--color-text-secondary': '#2e4a5c',
    '--color-text-tertiary': '#5e7d8e',
    '--color-text-on-primary': '#ffffff',

    '--color-border': '#bfdfef',
    '--color-outline': '#7aadc4',

    '--color-income': '#22c55e',
    '--color-income-light': '#bbf7d0',
    '--color-warning': '#d97706'
  }
}

// ==================== 用户自定义主题 CRUD ====================
function getUserThemes() {
  return wx.getStorageSync('user_themes') || []
}

function getUserThemeById(id) {
  return getUserThemes().find(t => t.id === id) || null
}

/**
 * 保存一个新的用户主题
 * @returns {{ok:true, id:string} | {ok:false, msg:string}}
 */
function saveUserTheme(name, hex) {
  const trimmed = (name || '').trim()
  if (!trimmed) return { ok: false, msg: '请填写主题名称' }
  if (trimmed.length > 10) return { ok: false, msg: '名称最多 10 字' }

  const list = getUserThemes()
  if (list.length >= MAX_USER_THEMES) {
    return { ok: false, msg: `最多保存 ${MAX_USER_THEMES} 个主题` }
  }
  if (list.some(t => t.name === trimmed)) {
    return { ok: false, msg: '已存在同名主题' }
  }

  const id = `user_${Date.now()}`
  list.push({ id, name: trimmed, hex, createdAt: Date.now() })
  wx.setStorageSync('user_themes', list)
  return { ok: true, id }
}

/**
 * 删除一个用户主题；若是当前主题则回退到 mint
 * @returns {{removed:boolean, wasCurrent:boolean}}
 */
function deleteUserTheme(id) {
  const list = getUserThemes()
  const next = list.filter(t => t.id !== id)
  if (next.length === list.length) return { removed: false, wasCurrent: false }
  wx.setStorageSync('user_themes', next)

  const current = wx.getStorageSync('theme')
  const wasCurrent = current === id
  if (wasCurrent) wx.setStorageSync('theme', 'mint')
  return { removed: true, wasCurrent }
}

/**
 * 迁移旧版 theme='custom' + custom_theme_color → user_themes[0]
 * 仅在首次启动检测到旧数据时执行一次。
 */
function migrateLegacyCustomTheme() {
  const legacyTheme = wx.getStorageSync('theme')
  const legacyHex = wx.getStorageSync('custom_theme_color')
  if (legacyTheme !== 'custom' && !legacyHex) return

  const list = getUserThemes()
  if (list.length === 0 && legacyHex) {
    const id = `user_${Date.now()}`
    list.push({ id, name: '我的自定义', hex: legacyHex, createdAt: Date.now() })
    wx.setStorageSync('user_themes', list)
    if (legacyTheme === 'custom') wx.setStorageSync('theme', id)
  } else if (legacyTheme === 'custom') {
    wx.setStorageSync('theme', 'mint')
  }
  wx.removeStorageSync('custom_theme_color')
}

// ==================== 主题查询/应用 ====================
function getCurrentThemeId() {
  return wx.getStorageSync('theme') || 'mint'
}

function resolveThemeVars(id) {
  if (id && id.indexOf('user_') === 0) {
    const t = getUserThemeById(id)
    if (t) return generateCustomVars(t.hex)
  }
  return THEME_VARIABLES[id] || THEME_VARIABLES.mint
}

function getThemeStyleString(themeId) {
  const id = themeId || getCurrentThemeId()
  const vars = resolveThemeVars(id)
  return Object.keys(vars).map(k => `${k}:${vars[k]}`).join(';')
}

function applyTheme(themeId) {
  const id = themeId || getCurrentThemeId()
  const vars = resolveThemeVars(id)
  try {
    wx.setPageStyle({ style: { backgroundColor: vars['--color-bg'] } })
  } catch (e) {}
  try {
    wx.setNavigationBarColor({
      frontColor: id === 'dark' ? '#ffffff' : '#000000',
      backgroundColor: vars['--color-bg'],
      animation: { duration: 200, timingFunc: 'easeIn' }
    })
  } catch (e) {}
  return id
}

function initAppTheme(appInstance) {
  const id = getCurrentThemeId()
  appInstance.globalData.currentTheme = id
  return id
}

module.exports = {
  THEMES_CONFIG: THEME_VARIABLES,
  CUSTOM_PALETTE,
  MAX_USER_THEMES,
  getCurrentThemeId,
  getThemeStyleString,
  applyTheme,
  initAppTheme,
  getUserThemes,
  getUserThemeById,
  saveUserTheme,
  deleteUserTheme,
  migrateLegacyCustomTheme
}
