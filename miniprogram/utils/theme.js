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
 * 将指定主题的 CSS 变量注入当前页面
 * 核心方法：调用 wx.setPageStyle() 动态修改页面级 CSS 变量
 *
 * @param {string} [themeId] - 主题 ID，不传则从 Storage 读取
 * @returns {string} 实际应用的主题 ID
 */
function applyTheme(themeId) {
  const id = themeId || getCurrentThemeId()
  const vars = THEME_VARIABLES[id] || THEME_VARIABLES.fresh

  try {
    wx.setPageStyle({ style: vars })
  } catch (e) {
    // 低版本基础库可能不支持 wx.setPageStyle，静默降级
    console.warn('⚠️ wx.setPageStyle 不支持, 主题切换降级:', e)
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
  applyTheme,
  initAppTheme
}
