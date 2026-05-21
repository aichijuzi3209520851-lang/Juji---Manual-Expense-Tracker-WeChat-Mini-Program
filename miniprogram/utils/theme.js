/**
 * 橘记 - 主题管理模块
 *
 * 使用 wx.setPageStyle() (基础库 2.20.1+) 动态注入 CSS 变量，
 * 实现多主题切换。每个页面在 onShow 时调用 applyTheme() 即可。
 */
const THEME_VARIABLES = {
  // ==================== 清新 (fresh) — 默认主题 ====================
  fresh: {
    '--color-primary': '#785655',
    '--color-primary-container': '#f7cac9',
    '--color-primary-light': '#eed7d4',
    '--color-on-primary': '#ffffff',
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

  // ==================== 暖阳 (warm) ====================
  warm: {
    '--color-primary': '#d4865a',
    '--color-primary-container': '#ffdbc8',
    '--color-primary-light': '#f5c4a8',
    '--color-on-primary': '#ffffff',
    '--color-secondary': '#c4784a',
    '--color-secondary-container': '#ffd8c2',
    '--color-tertiary': '#5a8a6a',
    '--color-tertiary-container': '#c8e4d2',
    '--color-error': '#c62828',
    '--color-error-container': '#ffdad6',

    '--color-bg': '#fffdf7',
    '--color-surface': '#ffffff',
    '--color-surface-low': '#fdfbf5',
    '--color-surface-container': '#f9f5ed',
    '--color-surface-high': '#f4efe3',
    '--color-surface-highest': '#ebe4d6',
    '--color-surface-dim': '#e2dac9',

    '--color-text': '#211d18',
    '--color-text-secondary': '#5c5044',
    '--color-text-tertiary': '#8e8278',
    '--color-text-on-primary': '#ffffff',

    '--color-border': '#e0d4c2',
    '--color-outline': '#9a8e82',

    '--color-income': '#5a8a6a',
    '--color-income-light': '#c8e4d2',
    '--color-warning': '#c4784a'
  },

  // ==================== 翠绿 (mintGreen) — #4ADE80 主色 ====================
  mintGreen: {
    '--color-primary': '#4ade80',
    '--color-primary-container': '#d4f7e2',
    '--color-primary-light': '#a6eec6',
    '--color-on-primary': '#0a2818',
    '--color-secondary': '#329a6a',
    '--color-secondary-container': '#c5eeda',
    '--color-tertiary': '#5c8c5a',
    '--color-tertiary-container': '#d4edce',
    '--color-error': '#ba1a1a',
    '--color-error-container': '#ffdad6',

    '--color-bg': '#f4fdf7',
    '--color-surface': '#ffffff',
    '--color-surface-low': '#f7fef9',
    '--color-surface-container': '#f1fcf5',
    '--color-surface-high': '#edf9f1',
    '--color-surface-highest': '#e6f5ea',
    '--color-surface-dim': '#dfefe5',

    '--color-text': '#132118',
    '--color-text-secondary': '#3a4d44',
    '--color-text-tertiary': '#6e8277',
    '--color-text-on-primary': '#ffffff',

    '--color-border': '#cde5d4',
    '--color-outline': '#7a8f82',

    '--color-income': '#4ade80',
    '--color-income-light': '#d4f7e2',
    '--color-warning': '#b0880a'
  }
}

/**
 * 获取当前存储的主题 ID
 * @returns {string} 主题 ID，默认 'fresh'
 */
function getCurrentThemeId() {
  return wx.getStorageSync('theme') || 'fresh'
}

/**
 * 把指定主题的 CSS 变量拼成 inline-style 字符串。
 * 用法：每个页面 onShow 调此函数，setData 到 themeStyle，
 * wxml 最外层 view 写 style="{{themeStyle}}"，CSS 变量将作用于整个子树。
 *
 * 注：小程序不支持 wx.setPageStyle 注入 CSS 变量（该 API 只接受
 * backgroundColor 系列），所以必须用 inline-style 方案。
 *
 * @param {string} [themeId] - 主题 ID，不传则从 Storage 读取
 * @returns {string} 形如 `--color-primary:#785655;--color-bg:#fffaf8;...`
 */
function getThemeStyleString(themeId) {
  const id = themeId || getCurrentThemeId()
  const vars = THEME_VARIABLES[id] || THEME_VARIABLES.fresh
  return Object.keys(vars).map(k => `${k}:${vars[k]}`).join(';')
}

/**
 * 同步 page 级背景色到 wx.setPageStyle（该 API 只支持 backgroundColor）。
 * inline-style 变量只作用在 view 子树上，page 自身的 var(--color-bg) 仍解析为默认值，
 * 所以需要单独刷一下 page 的背景使其与主题一致。
 *
 * @param {string} [themeId] - 主题 ID，不传则从 Storage 读取
 */
function applyTheme(themeId) {
  const id = themeId || getCurrentThemeId()
  const vars = THEME_VARIABLES[id] || THEME_VARIABLES.fresh
  try {
    wx.setPageStyle({ style: { backgroundColor: vars['--color-bg'] } })
  } catch (e) {
    // 静默降级
  }
  return id
}

/**
 * 应用主题到 App 全局数据（供 app.js onLaunch 使用）
 * @param {Object} appInstance - getApp() 返回的实例
 */
function initAppTheme(appInstance) {
  const id = getCurrentThemeId()
  appInstance.globalData.currentTheme = id
  return id
}

module.exports = {
  THEMES_CONFIG: THEME_VARIABLES,
  getCurrentThemeId,
  getThemeStyleString,
  applyTheme,
  initAppTheme
}
