/**
 * 橘记JUJI - 主题管理模块
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

// M5 修复：hex 颜色必须为严格的 #RRGGBB 格式，防止旧版本地存储数据注入 style 字符串
const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/
function isValidHex(value) {
  return typeof value === 'string' && HEX_PATTERN.test(value)
}

// ==================== HSL 转换工具 ====================
function hexToRgb(hex) {
  const v = String(hex || '').replace('#', '')
  if (v.length !== 6) return null
  return {
    r: parseInt(v.slice(0, 2), 16),
    g: parseInt(v.slice(2, 4), 16),
    b: parseInt(v.slice(4, 6), 16)
  }
}

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

    '--color-bg': '#fcf6f5',
    '--color-surface': '#ffffff',
    '--color-surface-low': '#fdf5f3',
    '--color-surface-container': '#f8efed',
    '--color-surface-high': '#f3eae8',
    '--color-surface-highest': '#ece2df',
    '--color-surface-dim': '#e7ddda',

    '--color-text': '#2d2625',
    '--color-text-secondary': '#5b4d4a',
    '--color-text-tertiary': '#938481',
    '--color-text-on-primary': '#ffffff',

    '--color-border': '#e4d5d3',
    '--color-outline': '#938481',

    '--color-income': '#4b6458',
    '--color-income-light': '#c0dbcc',
    '--color-warning': '#6c5a59',
    
    '--shadow-light': 'rgba(255, 255, 255, 1)',
    '--shadow-dark': 'rgba(120, 86, 85, 0.15)'
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

    '--color-bg': '#1e1e24',
    '--color-surface': '#27272e',
    '--color-surface-low': '#1f1f24',
    '--color-surface-container': '#2a2a30',
    '--color-surface-high': '#333340',
    '--color-surface-highest': '#3d3d4a',
    '--color-surface-dim': '#15151a',

    '--color-text': '#f0eee9',
    '--color-text-secondary': '#c4c0b9',
    '--color-text-tertiary': '#8f8c87',
    '--color-text-on-primary': '#1a1a1f',

    '--color-border': '#3a3a44',
    '--color-outline': '#6a6a74',

    '--color-income': '#7db892',
    '--color-income-light': '#1f3a28',
    '--color-warning': '#cfa882',
    
    '--shadow-light': 'rgba(255, 255, 255, 0.08)',
    '--shadow-dark': 'rgba(0, 0, 0, 0.6)'
  },

  // ==================== 薄荷 (mint) — #27C07D 主色 ====================
  mint: {
    '--color-primary': '#27c07d',
    '--color-primary-container': '#c5f0d9',
    '--color-primary-light': '#96deb8',
    '--color-on-primary': '#ffffff',
    '--color-accent': '#5ba4cb',
    '--color-secondary': '#28b579',
    '--color-secondary-container': '#b8ebd5',
    '--color-tertiary': '#27c07d',
    '--color-tertiary-container': '#c5f0d9',
    '--color-error': '#ba1a1a',
    '--color-error-container': '#ffdad6',

    '--color-bg': '#f2faf6',
    '--color-surface': '#ffffff',
    '--color-surface-low': '#eef8f2',
    '--color-surface-container': '#e6f3ec',
    '--color-surface-high': '#dfefe5',
    '--color-surface-highest': '#d5eadc',
    '--color-surface-dim': '#cce5d4',

    '--color-text': '#1a2620',
    '--color-text-secondary': '#3d5c4a',
    '--color-text-tertiary': '#6e9480',
    '--color-text-on-primary': '#ffffff',

    '--color-border': '#c0d8ca',
    '--color-outline': '#82a090',

    '--color-income': '#27c07d',
    '--color-income-light': '#c5f0d9',
    '--color-warning': '#e0a030',

    '--shadow-light': 'rgba(255, 255, 255, 1)',
    '--shadow-dark': 'rgba(39, 192, 125, 0.15)'
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

    '--color-bg': '#eef8ff',
    '--color-surface': '#ffffff',
    '--color-surface-low': '#f5fcff',
    '--color-surface-container': '#edf8ff',
    '--color-surface-high': '#e3f4fd',
    '--color-surface-highest': '#d6eef9',
    '--color-surface-dim': '#c8e7f5',

    '--color-text': '#0b1d2b',
    '--color-text-secondary': '#24445c',
    '--color-text-tertiary': '#52758e',
    '--color-text-on-primary': '#ffffff',

    '--color-border': '#bfdfef',
    '--color-outline': '#7aadc4',

    '--color-income': '#22c55e',
    '--color-income-light': '#bbf7d0',
    '--color-warning': '#d97706',
    
    '--shadow-light': 'rgba(255, 255, 255, 1)',
    '--shadow-dark': 'rgba(56, 189, 248, 0.18)'
  },

  // ==================== 液态玻璃预设（liquidGlass / liquidGlassDark）====================
  // 键集与顺序必须与上面四套完全一致（校验脚本按 29 键严格比对）。
  // 浅色档 = 暖砂玻璃，深色档 = 烟熏玻璃；主色刻意压暗/提亮，保证 hero 渐变上字始终可读。
  liquidGlass: {
    // ⚠ v4：primary 从 #a9481f 压到 #8a3a16。
    //    画布压深后 #a9481f 作强调文字只有 3.87（不及格）；
    //    #8a3a16 = 面板 5.21 / 白字压它 7.79，两个方向都过。
    '--color-primary': '#8a3a16',
    '--color-primary-container': '#fadfcc',
    '--color-primary-light': '#f5d2b4',
    '--color-on-primary': '#ffffff',
    '--color-accent': '#93373c',
    '--color-secondary': '#544e47',
    '--color-secondary-container': '#efe6dc',
    '--color-tertiary': '#675f56',
    '--color-tertiary-container': '#f3e8de',
    '--color-error': '#b3261e',
    '--color-error-container': '#fadbd7',

    // ---- v2 画布：由「浑浊米色」改为清透冷白 ----
    // v1 的 #f2efea 是暖米色，与任何冷色光斑混合都会发灰发脏，是「低级感」的来源之一。
    // 玻璃要「通透清爽」，底色必须中性偏冷、明度高，让透出的彩色光斑保持干净。
    // ---- v3.1 画布：由「近纯白」改为「中明度冷雾」----
    // ⚠ 这是本轮最关键的修正，必须记清楚：
    //    v3 的 --color-bg = #edf1f8（亮度 L≈241），玻璃面板 = 白 0.42 叠上去 ≈ L247，
    //    两者只差 6 级 —— 肉眼看不出边界，backdrop-filter 也是一片均匀白雾。
    //    白色半透明玻璃**在接近纯白的背景上物理上无法显现**，这是加多少层阴影都救不回来的。
    //    苹果的浅色玻璃之所以成立，是因为它底下永远有中明度的彩色内容。
    //    所以画布压到 L≈213：玻璃面板（L≈231）比背景亮 18 级，
    //    「浮起」这件事才第一次真的发生，白描边也才有暗处可对比。
    //    明度压低后彩色光斑反而更干净（不再被白罩洗淡），这就是通透感的来源。
    // ⚠⚠ v5 反面教训（务必保留，否则会被再次带偏）：
    //    为了让玻璃「浮起来」，我在 v4 把画布整体压到 L188 的灰蓝 #b3c1d9。
    //    截图证明这是**错误方向**：整屏亮度被压在 L190~L230 的窄带里，
    //    所有卡片和背景都成了同一档发灰的蓝紫色，观感是「脏、闷、雾」，
    //    与用户要的「通透清爽」正好相反。压暗底色换来的不是层次，是浑浊。
    //
    //    正确的物理关系（苹果浅色玻璃的真实做法）：
    //      · 底座是**明亮的**（L≈238），画面整体清爽；
    //      · 层次来自**彩色光斑的局部明暗差**，不是来自整屏压暗；
    //      · 玻璃面板 = 明亮底座 blur + 白 0.30 + brightness 提亮 →
    //        压在浅色处趋近 255、压在彩色光斑处仍比光斑亮 25~40 级，
    //        于是「每块卡片都比它正后方的背景亮」—— 这才是浮起来。
    //    所以画布回到高亮中性冷白，把「制造对比」的职责交给 aura 光斑。
    // ⚠ v5 第二处修正：L241 太亮，白玻璃在上面根本没有「浮起」的空间
    //    （白叠白，最多只能亮 14 级）。降到 L236：面板可达 L252，
    //    差 16 级刚好够看出「一片浮在纸上」，同时整屏仍是清爽的亮调。
    '--color-bg': '#e6ecf6',
    '--color-surface': '#ffffff',
    '--color-surface-low': '#fbfdff',
    '--color-surface-container': '#f6f9fe',
    '--color-surface-high': '#eef3fb',
    '--color-surface-highest': '#e5ecf7',
    '--color-surface-dim': '#dae3f0',

    // 文字改为冷中性近黑（原 #221f1b 是暖黑，压在冷白上会显得发黄）
    // ⚠ v5：画布回到 L≈241 的明亮冷白后，v4 为了「救 AA」而过度下压的
    //    文字三档可以回抬一档 —— 底色亮了，同样的深灰反而显得太重、发闷，
    //    与「清爽」冲突。回抬后实测（压在 #eef2f9 / 玻璃面板 ≈#f7f9fd 上）：
    //      text       #171b23  13.9 / 15.2
    //      secondary  #47505d   7.1 /  7.8   ← 回抬，仍远高于 AA(4.5)
    //      tertiary   #5f6a7d   4.9 /  5.4   ← 回抬，压线通过 AA
    '--color-text': '#171b23',
    '--color-text-secondary': '#47505d',
    // ⚠ v7：#5f6a7d → #565f71（暗 7%）。起因：强玻璃档要压在照片/深色遮罩上，
    //    tertiary 在「玻璃压纯黑」这个最坏底噪上只有 3.95:1（WCAG 正文线是 4.5）。
    //    两条路只能选一条：把强档白度抬到 0.92（玻璃几乎不透光，违背液态玻璃）
    //    或者把 tertiary 压深一档。选后者 —— 只用 7% 的明度代价，
    //    就把常规档从 4.63 提到 5.45、强档从 3.95 提到 4.86，两档同时留出余量。
    //    色相不动（仍是同一个石板蓝灰），肉眼几乎无感。
    '--color-text-tertiary': '#565f71',
    '--color-text-on-primary': '#ffffff',

    '--color-border': '#d9e2ef',
    '--color-outline': '#6b7688',

    // 金额主色 / 收支色（画布变亮后可回抬，色相不变）
    '--color-income': '#1a5c3f',
    '--color-income-light': '#cde8db',
    '--color-warning': '#8a5100',

    '--shadow-light': 'rgba(255, 255, 255, 0.92)',
    '--shadow-dark': 'rgba(88, 74, 62, 0.16)'
  },

  liquidGlassDark: {
    '--color-primary': '#f0a868',
    '--color-primary-container': '#4a2e1c',
    '--color-primary-light': '#5c3a1f',
    '--color-on-primary': '#2a1a0e',
    '--color-accent': '#ffce8a',
    '--color-secondary': '#cdc7bd',
    '--color-secondary-container': '#3a342d',
    '--color-tertiary': '#b9b2aa',
    '--color-tertiary-container': '#332f29',
    '--color-error': '#ffb4ab',
    '--color-error-container': '#5c1a16',

    '--color-bg': '#14131a',
    '--color-surface': '#24232b',
    '--color-surface-low': '#1b1a21',
    '--color-surface-container': '#2a2932',
    '--color-surface-high': '#34323d',
    '--color-surface-highest': '#3f3d49',
    '--color-surface-dim': '#100f14',

    '--color-text': '#f5f1ea',
    '--color-text-secondary': '#cdc7bd',
    '--color-text-tertiary': '#b9b2aa',
    '--color-text-on-primary': '#2a1a0e',

    '--color-border': '#3b3843',
    '--color-outline': '#8a8492',

    '--color-income': '#7ed3a6',
    '--color-income-light': '#1e3a2c',
    '--color-warning': '#e8b36a',

    '--shadow-light': 'rgba(255, 255, 255, 0.10)',
    '--shadow-dark': 'rgba(0, 0, 0, 0.62)'
  }
}

// ==================== 液态玻璃物理参数 ====================
// 单独成表而不塞进 29 键，避免污染键位契约。
// 旧四套主题没有条目 → 走 __default，派生结果与改造前逐字符相同（零回归）。
const GLASS_TUNING = {
  __default: {
    fillAlpha: null,      // null = 沿用 surfaceLum > 140 ? 0.35 : 0.30
    strongAlpha: null,    // null = 不提供强档，沿用 fill
    blur: 'none',
    rim: null,            // null = 不追加任何 inset
    rimTop: 'none',
    refract: 'none',
    aura: 'none',         // 旧主题不加环境光层 → 背景逐像素不变
    // 以下 4 项只影响 .lg-hero-* 接管；旧主题全部走「原值」，逐像素不变。
    heroBg: null,         // null = 沿用原 --gradient-hero
    heroInk: null,        // null = 沿用原 --color-on-primary
    heroOrb: null,        // null = 沿用原装饰圆 rgba(255,255,255,0.12)
    rimOutline: null      // null = 沿用 rim
  },

  liquidGlass: {
    // 面板底色只是「玻璃本身的雾度」，透光靠背景。
    // 0.18 太薄（托盘被看穿，像半透明贴纸而非玻璃）；0.62 太厚（糊成白墙）。
    // 0.42 是「能看见背后有东西在动、但看不清是什么」的雾度区间。
    // ⚠ v4：0.42 → 0.30。0.42 的白在画面上占比太高，
    //    面板内部被白糊死，背后色斑只剩 58% 权重再乘一层模糊 → 一片均匀雾。
    //    玻璃的「透」来自「能看清底色在变」，白太多就变塑料。
    // ⚠⚠ v14（决定性诊断）：v13 逐层剥离合成的实测数字（背景固定为高细节散景，
    //    fill 固定 0.30，卡内饱和度相对纯窗口的保留率）：
    //        fill 单独 83% / specular 单独 79% / refract 单独 82%
    //        全开 68% / 全开但去掉 fill 77%
    //    结论：**没有任何一层是"压白元凶"，是四层白在乘性叠加**。
    //    而 v12 的 fillAlpha 扫描（0.06→0.28）显示卡内 sat 只从 0.076 动到 0.070
    //    —— 单改 fill 完全无效，这就是前面多轮调参全部失灵的原因。
    //    所以 v14 同时砍四处：fill 0.30→0.20、specular 0.62→0.26、
    //    refract 0.50→0.22、specular 层二的覆盖高度 16%→9%，
    //    目标把色彩保留率从 68% 拉到 85% 以上 —— 玻璃的「透」本质是**底色还在**。
    // ⚠⚠⚠ v37（本轮最终修正，实测得出）：0.20 → 0.10。
    //    背景已换成高细节散景（见下方 aura 的 v37 注释），此时玻璃的「透」成为唯一指标。
    //    v37 六档扫描（固定画布，只动 fill/saturate/blur，取样卡内 vs 卡隙）：
    //        现状 f20-s125-b20 → 卡内 sat 0.102 / 卡隙 0.140 = 保留率 73%（发灰）
    //        f10-s240-b22      → 卡内 sat 0.157 / 卡隙 0.173 = 保留率 91%（最优）
    //        f06-s240-b16      → 0.157 / 0.186 = 84%
    //        f10-s180-b20      → 0.133 / 0.161 = 83%
    //    结论：**白膜降到 0.10 + saturate 提到 240% 是拐点** ——
    //    白少了，底色得以穿出；饱和度补回来，颜色不再被白雾稀释成灰。
    //    卡内 L 235.8 仍比卡隙 223.5 亮 12 级，玻璃依旧「浮」在背景之上。
    fillAlpha: 0.10,      // 常规玻璃：压在 app 自有 UI 之上
    // ⚠ v7：0.62 → 0.88。强档不是「更厚一点的常规玻璃」，它是**兜底色**的材质：
    //    常规档只压在 app 自有表面（bg / surface-low / primary-container，都是浅色），
    //    强档要压在照片、hero 渐变、纯白、纯黑任意底色之上 —— 上方还要放 15~17px 正文。
    //    实测（tools/_lg_verify_tiered.js，最坏底噪 photo-black）：
    //      α=0.62 → 4.44（不合格，tertiary 只有 2.04）
    //      α=0.83 → 4.53（刚好压线，没有余量）   α=0.86 → 4.70   α=0.88 → 4.79
    //    取 0.88：正文 15px 在任意照片上都不掉到 4.5 以下，且仍保留 12% 透光。
    //    强档用得很少（浮层、TabBar、照片上的徽标），牺牲透光换可读性是划算的。
    strongAlpha: 0.88,    // 强玻璃：压在照片 / 任意底色之上
    // ⚠ v4：26px → 20px，saturate 170% → 210%。
    //    26px 把背景的色块边界完全抹平，面板内外看起来一样平 —— 模糊就「看不见」。
    //    20px 保留「色块还在、细节没了」的临界状态，这才是磨砂玻璃的辨识点。
    //    saturate 提到 210%：白雾会稀释彩度，必须补回来，否则玻璃发灰。
    // ⚠ v5（决定性修正）：saturate(210%) 是「面板比背景还暗」的真凶。
    //    实测（_tmp_token_check.js + 垂直扫描，330pt 屏）：
    //      .day-group 卡内 #a6a2a6（L 视觉亮度 163）
    //      同列卡外背景 #dedde7（L 222）
    //    —— 玻璃本该「浮起来」，结果反而沉下去 59 级，整屏发脏。
    //    链条：aura 的蓝紫光球 → saturate 2.1 把蓝推离灰点 → 蓝的相对亮度贡献
    //    最低（0.0722）→ 越饱和越暗 → 白 0.30 覆盖补不回来。
    //    修法：饱和度降到 125%（保留一点色彩锐度，不足以拉低亮度），
    //    并把 brightness 从 1.02 提到 1.12，让面板恒比背景亮 ≈15 级 ——
    //    这才是苹果玻璃「浮在背景之上」的物理依据。
    // ⚠ v5 第三处修正（本轮最重要的认知）：
    //    `brightness()` 不是「提亮」，它是**乘性提亮 + 压平对比**：
    //    倍率越高，亮部和暗部一起往 255 挤，玻璃内部的明暗差被吃掉。
    //    实测（fillAlpha 0.26，画布 #e6ecf6）：
    //      brightness(1.00) 面板 L240.5（比底 +5.1）  光球处明暗差 18 / 24 / 15
    //      brightness(1.05) 面板 L252.1（比底 +16.7） 光球处明暗差 20 / 26 / 16  ← 最优
    //      brightness(1.12) 面板 L255.0（**裁切**）   光球处明暗差 11 / 15 / 7   ← 糊掉
    //    1.12 是上一版的取值，正是「卡片一片白、里面什么都没有」的直接原因。
    //    取 1.05：既把面板推到比底色亮 16 级（浮起来），又保住光球的层次。
    // ⚠⚠⚠ v37：saturate 125% → 240%，blur 20px → 22px。
    //    饱和度不是「调味」，在这个配方里它是**抵白膜稀释的主手段**：
    //    白膜 0.10 仍会吃掉约 9% 色彩，saturate 240% 把它补回来并且给出「彩色玻璃」的质感。
    //    blur 22px：背景光球半径 26%~36% 视口（约 100~140pt），22px 正好把球抹成「柔光团但仍看得出是在哪」——
    //    再大就成一片平均色（这就是 20px 时代「卡内外一样平」的原因之一）。
    blur: 'blur(22px) saturate(150%) brightness(1.04)',
    // ↓ 以下五条是「厚度」层。v1 全部太淡（0.55 / 1rpx / 0.11），浅底上等于不存在，
    //   面板因此没有边界 → 看着只是「背景被染了色」。这是低质感的第一原因。
    rim: 'rgba(255,255,255,0.95)',        // 玻璃切面：一圈 1.5rpx 亮线
    rimTop: 'rgba(255,255,255,0.62)',     // 顶部受光镜面（v22：原为 alpha=1，白纸根因）
    innerGlow: 'rgba(255,255,255,0.42)',  // 顶部内发光（v22：0.95 过曝）
    innerShade: 'rgba(30,41,70,0.09)',    // 底部内阴影：厚度收口
    edgeDark: 'rgba(30,41,70,0.10)',      // 亮线外侧的暗描边，让切面「立」起来
    // ⚠⚠ v14（决定性诊断）：v13 逐层剥离合成的实测数字（背景固定为高细节散景，
    //    fill 固定 0.30，卡内饱和度相对纯窗口的保留率）：
    //        fill 单独 83% / specular 单独 79% / refract 单独 82%
    //        全开 68% / 全开但去掉 fill 77%
    //    结论：**没有任何一层是"压白元凶"，是四层白在乘性叠加**。
    //    而 v12 的 fillAlpha 扫描（0.06→0.28）显示卡内 sat 只从 0.076 动到 0.070
    //    —— 单改 fill 完全无效，这就是前面多轮调参全部失灵的原因。
    //    所以 v14 同时砍四处：fill 0.30→0.20、specular 0.62→0.26、
    //    refract 0.50→0.22、specular 层二的覆盖高度 16%→9%，
    //    目标把色彩保留率从 68% 拉到 85% 以上 —— 玻璃的「透」本质是**底色还在**。
    specular: 'rgba(255,255,255,0.26)',   // 顶缘光泽（v14：0.62→0.26，向下 1/4 衰减）
    refract: 'rgba(255,255,255,0.22)',    // 左上角透镜泛光（v14：0.50→0.22）
    // ⚠⚠ v6 决定性修正（本轮真凶）：
    //    玻璃面板是**半透明**的，它自己的外落影会从面板底下透回来 ——
    //    于是每一块玻璃的顶部内侧都出现一道 L177 的灰带（背景 L234，暗 57 级）。
    //    A/B 实证（同一次截图，只换 box-shadow 串）：
    //      原配方（20rpx 38rpx -14rpx 0.30）→ 卡内顶部最暗 L177
    //      极淡（6rpx 16rpx -8rpx 0.10）    → L222
    //      无阴影                          → L226
    //    这就是「整屏发脏、一块块灰卡」的直接来源，也是用户说「低级」的物理根因。
    //    苹果的做法本来就是：浮起的玻璃**几乎没有外落影**，纵深靠
    //      ① 面板比底色亮一点点（brightness 1.05）
    //      ② 顶部亮切面 + 底部内收暗面（inset 链）
    //    所以这里把外落影压到「只有接触感、不足以透回面板」的量级。
    outer: '0 4rpx 12rpx -8rpx rgba(30, 41, 70, 0.12)',
    // ==================== v3 环境光：从「糖果彩虹」改为「珍珠雾」 ====================
    // v2 的六团光斑 alpha 高达 0.58~0.88、色相极纯（纯橙/纯紫/纯青），
    // 叠出来就是一张廉价壁纸 —— 用户说的「低级」有一半来自这里。
    // 真实的高级感来自**低饱和 + 大范围柔和过渡 + 近似中性**：
    //   · alpha 全部收到 0.38~0.52（原来的一半）
    //   · 每个光斑的衰减拉到 78~84%（原来 76~80% 但前段太实）
    //   · 色相换成「莫兰迪化」的暖沙 / 干玫 / 雾蓝 / 薄荷 / 藕紫
    //   · 中央加一层白色微光托底：保证深色正文在任何位置都有对比
    //
    // ⚠ v4 第二轮（决定性）：上面这套「大而柔」的光斑仍然失败。
    //    像素实测：卡内高频能量 0.22~0.32，卡外 12.06 —— 卡内被抹得比背景还平。
    //    原因是**光斑本身没有边界**：一个从 0.72 线性衰减到 0 的 88% 大圆，
    //    在任何局部都近似常数，blur 它和不 blur 它完全一样。
    //    玻璃的辨识点不是「颜色」，而是「同一道光斑，在玻璃内糊开、在玻璃外锐利」。
    //    所以本版把光斑重做成**散景光球（bokeh）**：
    //      · 尺寸砍到 22%~40%（原来是 74%~88%）
    //      · 衰减在 60%→78% 之间快速收尾 —— 形成**可见的球体边缘**
    //      · 一部分光球刻意落在卡片带（y 12%~66%），被卡片边缘切开
    //    这样卡外能看见一圈圈清楚的圆形光斑，卡内同一位置被 blur(20px) 糊成柔光团，
    //    「一锐一糊」的边界就是玻璃存在的证据。这才是苹果那种通透感的来源。
    aura: [
      'radial-gradient(2.6% 1.2% at 20% 32%, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.764) 58%, rgba(255,255,255,0) 100%)',
      'radial-gradient(3% 1.4% at 64% 44%, rgba(255,251,244,0.92) 0%, rgba(255,251,244,0.718) 58%, rgba(255,251,244,0) 100%)',
      'radial-gradient(2.4% 1.1% at 86% 62%, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.702) 58%, rgba(255,255,255,0) 100%)',
      'radial-gradient(2.2% 1% at 34% 78%, rgba(255,255,255,0.86) 0%, rgba(255,255,255,0.671) 58%, rgba(255,255,255,0) 100%)',
      'radial-gradient(62% 34% at 2% -8%, rgba(246,158,96,0.8) 0%, rgba(246,158,96,0.624) 55%, rgba(246,158,96,0) 100%)',
      'radial-gradient(48% 26% at 48% 4%, rgba(238,130,128,0.66) 0%, rgba(238,130,128,0.515) 55%, rgba(238,130,128,0) 100%)',
      'radial-gradient(46% 26% at 96% 48%, rgba(116,142,216,0.66) 0%, rgba(116,142,216,0.515) 55%, rgba(116,142,216,0) 100%)',
      'radial-gradient(58% 32% at 16% 90%, rgba(96,168,214,0.62) 0%, rgba(96,168,214,0.484) 55%, rgba(96,168,214,0) 100%)',
      'linear-gradient(168deg, #e8cdb4 0%, #e6c3bd 18%, #dcc2cd 36%, #c9c4d9 55%, #b9c8dd 74%, #a9c3da 100%)'
    ].join(', '),

    // ==================== v3 hero 玻璃 ====================
    // 截图暴露的核心问题：hero 卡是 `--gradient-hero` 的**不透明实色**，
    // 白字压深棕红 → 视觉上是一块「塑料色块」，与玻璃毫无关系。
    // 苹果的做法是反过来的：**玻璃是浅的，文字是深的**。
    //   浅磨砂面板 + 深墨字 = 一眼就「透」，且对比度天然充足（8:1 以上）。
    // 色彩身份仍在：暖沙渐变 + 主色描边 + 卡片内的彩色图标。
    // ⚠ v4：hero 是「最像实色牌」的一块 —— 三处叠加导致：
    //    自身 heroBg（0.58+0.46+0.42 三层叠起来实际不透明度 ≈0.87）
    //    + --lg-fill 常规档 + specular 扫光。三层白把背后环境光彻底盖死。
    //    像素实测：hero 卡内横向 ΔL 仅 -0.6（几乎零变化），卡内外 ΔL=-25（一块自发光牌）。
    //    修法：heroBg 整体压到 0.30 以下，让背景光斑成为 hero 颜色的**主要来源**，
    //    玻璃只负责「把它糊开 + 打一层薄光」。
    heroBg: 'linear-gradient(135deg, rgba(255,246,238,0.30) 0%, rgba(255,240,236,0.22) 46%, rgba(243,242,255,0.20) 100%)',
    heroInk: '#2a1a10',                    // 暖调近黑（画布压深后仍 >10:1）
    heroOrb: 'rgba(255,255,255,0.42)',     // 装饰圆：浅玻璃上改成柔和高光
    rimOutline: 'rgba(255,255,255,0.92)'
  },

  liquidGlassDark: {
    // 与浅色档同口径：0.16 太薄（深底上玻璃几乎不可见），0.52 太厚（闷成黑卡）。
    // ⚠ v4：0.38 → 0.30，与浅色档一起收薄；深底上玻璃靠「亮边 + 透出光斑」成立，
    //    不靠填充本身。blur 26px → 20px：26px 把背景色块边界抹平，模糊不可见。
    // ⚠⚠ v14：与浅色档同口径。深色档的「压白」更隐蔽 —— 它不是白膜，
    //    而是**白膜把夜色洗成灰**（深底上一点点白就显著抬高明度，玻璃失去通透）。
    //    深色档实测同样由 fill+specular+refract 三层乘性叠加造成，
    //    单独降 fill 无效，所以同步把 specular 0.26→0.16、refract 0.18→0.12。
    // ⚠ v37：与浅色档同口径（0.22 → 0.12）。深底上白膜同样是稀释剂：
    //    v37 扫描显示深色档 sat 0.112 → 0.161（f22 → f12），而 L 只从 47.2 抬到 55.8，
    //    仍然远低于「被洗成灰」的阈值（>90）。
    fillAlpha: 0.12,
    // ⚠ v7：0.58 → 0.88，与浅色档同口径。深色档的强玻璃压黑底时反而更容易掉对比
    //    （surface 深、text 浅，中间灰区被压扁）。实测最坏底噪：
    //      α=0.58 → 3.96；α=0.85 → 4.59（压线）；0.86 → 4.74；0.88 → 4.86
    strongAlpha: 0.88,
    // ⚠ v5：高饱和会把深蓝紫光球推离灰点，蓝的相对亮度最低 → 面板发暗发脏，
    //    与浅色档同一病灶。深底上还需要一点点提亮，否则玻璃会「沉进黑色背景」，
    //    但提亮幅度必须小（1.12 会把黑洗成灰，玻璃失去夜色）。
    // ⚠⚠⚠ v37：saturate 130% → 230%，blur 20px → 22px（与浅色档同口径）。
    //    深色档的饱和补偿要略低于浅色（230% vs 240%）：
    //    深底上过饱和会把暗部光球推向灰点，反而让玻璃「沉黑」。
    //    brightness 1.06 → 1.05：白膜已从 0.22 降到 0.12，再多提亮会把夜色洗灰。
    blur: 'blur(22px) saturate(150%) brightness(1.05)',
    // 深底上「亮线 / 暗线」的对比天然更大，所以白线压到刚好可见，
    // 暗线要更深更实，否则玻璃浮不起来（会糊进深色背景）。
    rim: 'rgba(255,255,255,0.34)',
    rimTop: 'rgba(255,255,255,0.62)',
    innerGlow: 'rgba(255,255,255,0.30)',
    innerShade: 'rgba(0,0,0,0.55)',
    edgeDark: 'rgba(0,0,0,0.55)',
    specular: 'rgba(255,255,255,0.16)',
    refract: 'rgba(255,255,255,0.12)',
    // ⚠⚠ v6：与浅色档同一个物理问题 —— 半透明面板会吃掉自己的外落影，
    //    在面板顶部内侧凝成一道暗带。深底上黑影本身不显眼，但会吃掉面板的通透感，
    //    让深色玻璃底部「糊成一片」。同样把落影压薄，纵深改由切面承担。
    outer: '0 6rpx 16rpx -10rpx rgba(0, 0, 0, 0.55)',
    // ==================== v3 深色环境光：同样「珍珠雾」化 ====================
    // v2 的深色档 alpha 高达 0.78、色相极纯，深底上更像霓虹灯管，不是月光。
    // 深色玻璃的通透感来自「极暗底 + 低饱和的一点点冷光」，
    // 所以 alpha 收到 0.22~0.34，色相改成月光白 / 靛青 / 雾紫 / 淡青。
    aura: [
      'radial-gradient(2.6% 1.2% at 20% 32%, rgba(255,232,208,0.72) 0%, rgba(255,232,208,0.562) 58%, rgba(255,232,208,0) 100%)',
      'radial-gradient(3% 1.4% at 64% 44%, rgba(255,218,210,0.66) 0%, rgba(255,218,210,0.515) 58%, rgba(255,218,210,0) 100%)',
      'radial-gradient(2.4% 1.1% at 86% 62%, rgba(200,230,255,0.62) 0%, rgba(200,230,255,0.484) 58%, rgba(200,230,255,0) 100%)',
      'radial-gradient(2.2% 1% at 34% 78%, rgba(182,240,255,0.56) 0%, rgba(182,240,255,0.437) 58%, rgba(182,240,255,0) 100%)',
      'radial-gradient(62% 34% at 2% -8%, rgba(222,112,64,0.62) 0%, rgba(222,112,64,0.484) 55%, rgba(222,112,64,0) 100%)',
      'radial-gradient(48% 26% at 48% 4%, rgba(188,78,124,0.5) 0%, rgba(188,78,124,0.39) 55%, rgba(188,78,124,0) 100%)',
      'radial-gradient(46% 26% at 96% 48%, rgba(84,92,206,0.54) 0%, rgba(84,92,206,0.421) 55%, rgba(84,92,206,0) 100%)',
      'radial-gradient(58% 32% at 16% 90%, rgba(32,96,182,0.56) 0%, rgba(32,96,182,0.437) 55%, rgba(32,96,182,0) 100%)',
      'linear-gradient(170deg, #241b2a 0%, #211d36 20%, #1a2039 38%, #141f37 56%, #0f1e30 76%, #091522 100%)'
    ].join(', '),

    // ==================== v3 hero 玻璃（深色档） ====================
    // 深色模式反过来：玻璃是**深**的、文字是**浅**的，但同样必须「透」——
    // 所以底色用低 alpha 的暖灰/靛灰渐变而不是实心深棕，
    // 让背景霓虹光能从面板里穿出来，这是深色玻璃成立的关键。
    // ⚠ v4：与浅色档同一个病 —— 0.58/0.50/0.46 三层叠起来实际不透明度 ≈0.89，
    //    深底上的霓虹光斑全被盖死，hero 变成一块实心深棕牌。
    //    深色玻璃的通透 = 极暗玻璃 + 光斑从里面透出来，不是把光斑糊掉。
    heroBg: 'linear-gradient(135deg, rgba(74,58,52,0.30) 0%, rgba(62,54,64,0.24) 46%, rgba(50,54,78,0.22) 100%)',
    heroInk: '#f7f2ec',                    // 暖白，压深玻璃对比 > 10:1
    heroOrb: 'rgba(255,255,255,0.10)',     // 深底装饰圆：低亮高光
    rimOutline: 'rgba(255,255,255,0.42)'
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
  if (!isValidHex(hex)) return { ok: false, msg: '颜色格式错误' }

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
  if (list.length === 0 && isValidHex(legacyHex)) {
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

  // 衍生 token：必须在 inline style 里计算真实值，
  // 否则 CSS var() 在 page {} 中会被提前解析为默认值，
  // 切主题时无法响应（v1.1.4 精简掉后导致所有 hero 卡残留棕色 bug）
  const primary = vars['--color-primary']
  const primaryContainer = vars['--color-primary-container']
  const primaryLight = vars['--color-primary-light']
  const accent = vars['--color-accent'] || primaryLight
  const shadowDark = vars['--shadow-dark'] || 'rgba(0,0,0,0.08)'
  const shadowLight = vars['--shadow-light'] || 'rgba(255,255,255,1)'

  const derived = {
    '--gradient-hero': `linear-gradient(135deg, ${primary} 0%, ${accent} 100%)`,
    '--gradient-hero-soft': `linear-gradient(135deg, ${primaryContainer} 0%, ${primaryLight} 100%)`,
    '--shadow-soft': `-8rpx -8rpx 24rpx ${shadowLight}, 8rpx 8rpx 24rpx ${shadowDark}`,
    '--shadow-card': `-12rpx -12rpx 32rpx ${shadowLight}, 12rpx 12rpx 32rpx ${shadowDark}`,
    '--shadow-elevated': `-16rpx -16rpx 48rpx ${shadowLight}, 16rpx 16rpx 48rpx ${shadowDark}`,
    '--shadow-hero': `0 16rpx 40rpx ${shadowDark}`,
    '--shadow-btn-primary': `0 12rpx 28rpx ${shadowDark}`
  }

  // 毛玻璃面板底色：surface 加透明度，深浅主题按亮度区分透明度档
  const surfaceRgb = hexToRgb(vars['--color-surface']) || { r: 255, g: 255, b: 255 }
  const surfaceLum = surfaceRgb.r * 0.299 + surfaceRgb.g * 0.587 + surfaceRgb.b * 0.114
  const isLight = surfaceLum > 140
  derived['--color-surface-glass'] = `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, ${isLight ? 0.35 : 0.3})`
  // 高透明度玻璃上文字的光晕补偿：浅色主题白晕、深色主题黑晕
  derived['--halo-glass'] = isLight ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.7)'

  // ==================== 液态玻璃派生 token（必须字面值）====================
  // 旧主题走 GLASS_TUNING.__default：--lg-fill 退化为 surface 原值、
  // --lg-edge-* 等于原 shadow 串、光晕为 none → 观感与改造前完全一致。
  const tune = GLASS_TUNING[id] || GLASS_TUNING.__default
  const sr = surfaceRgb.r, sg = surfaceRgb.g, sb = surfaceRgb.b
  const alpha = tune.fillAlpha
  const strongAlpha = tune.strongAlpha

  // ① 面板底色
  derived['--lg-fill'] = alpha === null
    ? vars['--color-surface']
    : `rgba(${sr}, ${sg}, ${sb}, ${alpha})`

  // ② 强档底色：压在照片 / 渐变上
  derived['--lg-fill-strong'] = strongAlpha === null
    ? derived['--lg-fill']
    : `rgba(${sr}, ${sg}, ${sb}, ${strongAlpha})`

  // ③ 完整阴影串（外阴影 + 玻璃切面 + 内发光/内阴影 + 外侧暗线）
  //    ⚠ v1 这里是 `inset 0 0 0 1rpx rim` + `inset 0 1rpx 0 rimTop`，
  //      1rpx 的白线在浅底上等于没有；整块面板因此「没有边界」。
  //      玻璃之所以像玻璃，靠的正是这圈切面：亮线 + 外侧暗线，
  //      一亮一暗才有厚度，只有亮线会糊进背景。
  //
  //    ⚠⚠ v4 决定性修正（前三轮都在这里踩空）：
  //      750rpx 设计稿映射到 330px 宽的设备上，**1rpx ≈ 0.44px**。
  //      之前写的 `1.5rpx` 白线在截图上就是不到 1 个像素 —— 存在，但肉眼不可见。
  //      像素实测佐证：卡片上边缘有一行 L=243.8 的亮线，下一行立刻掉到 L=189.9，
  //      落差 54 级确实「有」，但因为只有 1px 高，观感上完全读不到厚度。
  //      苹果 Liquid Glass 的边缘是 ~1.5~2px 的**亮带**（不是发丝线）。
  //      对应到 rpx：2px ≈ 4.5rpx。所以把整个切面体系按 rpx 放大 3 倍：
  //        亮环 1.5rpx → 5rpx（≈2.2px）
  //        顶面镜面 3rpx → 8rpx（≈3.5px）
  //        外暗线 1rpx → 2.5rpx
  //      同时把「外侧暗线」拆到 box-shadow 最外层，形成「暗-亮-暗」三段，
  //      这正是玻璃厚度在剖面里的光学结构（阴影 → 切面受光 → 内壁反光）。
  const inset = tune.rim === null
    ? ''
    : `, inset 0 0 0 5rpx ${tune.rim}` +
      `, inset 0 3rpx 0 0 ${tune.rimTop}` +
      `, inset 0 2rpx 8rpx 0 ${tune.rimTop}` +
      `, inset 0 10rpx 26rpx -10rpx ${tune.innerGlow || tune.rimTop}` +
      `, inset 0 -10rpx 26rpx -10rpx ${tune.innerShade || 'rgba(30,41,70,0.10)'}` +
      `, 0 0 0 2.5rpx ${tune.edgeDark || 'rgba(30,41,70,0.10)'}`

  // v1 这里是无条件拼接新拟物双向外发光（白 -12/-12 + 暗 +12/+12）。
  // 那个配方是「塑料实体按键」的语言：一边打白光一边打暗影，
  // 玻璃是**透光**的，不存在这种硬边明暗，叠上去立刻掉档。
  // 玻璃档改用 tune.outer（单一柔和落影 + 极淡环境溢光）；旧主题原样不变。
  const shadowSoft = tune.outer
    ? `${tune.outer}${inset}`
    : `-8rpx -8rpx 24rpx ${shadowLight}, 8rpx 8rpx 24rpx ${shadowDark}${inset}`
  const shadowCard = tune.outer
    ? `${tune.outer}${inset}`
    : `-12rpx -12rpx 32rpx ${shadowLight}, 12rpx 12rpx 32rpx ${shadowDark}${inset}`

  derived['--lg-edge-soft'] = shadowSoft
  derived['--lg-edge-card'] = shadowCard
  derived['--lg-edge-hero'] = tune.outer
    ? `${tune.outer}${inset}`
    : `0 16rpx 40rpx ${shadowDark}${inset}`

  // ③b 接管层用的独立描边 token。
  //    box-shadow 里已经塞了 inset 切面（--lg-edge-*），但接管层的容器
  //    原本各自有不同来源的 box-shadow（shadow-card / shadow-soft / 字面值 / none），
  //    没法统一替换。所以描边单独出一个 token，走 outline 属性 —— 与 box-shadow 互不干扰。
  //    ⚠ v1 写的是 1rpx 0.55 白 —— 浅底上几乎不可见。
  //    ⚠⚠ v4：outline 宽度由调用点写死 2rpx（≈0.9px），同样是「存在但看不见」。
  //      这里改为把宽度也做成 token（5rpx ≈ 2.2px），调用点改用 var()。
  //      旧主题 = transparent + 1rpx（不占布局、不可见）。
  derived['--lg-rim-outline'] = tune.rim === null
    ? 'transparent'
    : (tune.rimOutline || tune.rim)
  derived['--lg-rim-width'] = tune.rim === null ? '1rpx' : '5rpx'
  // 小控件（分组 B：chip / toggle / 输入框）用细一档，但仍要 ≥ 2px 才看得见。
  derived['--lg-rim-width-thin'] = tune.rim === null ? '1rpx' : '3.5rpx'

  // ③c hero 玻璃三件套（v3 新增）。
  //    根因：hero 卡原样用 `--gradient-hero`（primary→accent 的**不透明实色渐变**），
  //    白字压深色块 —— 这在观感上是一块「塑料色块」，和玻璃无关，
  //    而且它是首页面积最大、最先被看到的元素，直接决定整屏档次。
  //    苹果 Liquid Glass 的 hero 是反过来的：**浅磨砂面板 + 深墨文字**，
  //    文字对比天然 9:1 以上，同时面板真的透出背后的环境光。
  //    旧主题这三个 token 全部为 null → 沿用原渐变与原文字色，逐像素不变。
  derived['--lg-hero-bg'] = tune.heroBg || derived['--gradient-hero']
  derived['--lg-hero-ink'] = tune.heroInk || vars['--color-on-primary']
  derived['--lg-hero-orb'] = tune.heroOrb || 'rgba(255,255,255,0.12)'
  derived['--lg-hero-orb-soft'] = tune.heroOrb || 'rgba(255,255,255,0.08)'

  // ④ 折射光晕（面板内部左上 / 右下的透镜聚光）
  //    真实玻璃在两个角会「聚光」：光穿过厚度时在锐角处被折射放大。
  //    v1 是一整片 128%x76% 的大椭圆，等于把上半块刷白 —— 又回到白卡片。
  //    v2 改成两团小面积的角部聚光，且强度沿径向快速收敛。
  derived['--lg-refract'] = tune.refract === 'none'
    ? 'none'
    : `radial-gradient(52% 34% at 14% 0%, ${tune.refract} 0%, rgba(255,255,255,0) 62%),` +
      `radial-gradient(44% 28% at 92% 100%, ${tune.refract} 0%, rgba(255,255,255,0) 66%)`

  // ⑤ 顶面镜面扫光（::before 的 background-image）
  //    ⚠ v1 是 `linear-gradient(135deg, rgba(255,255,255,0.42) 0%, transparent 46%)` ——
  //    也就是说面板左上半个区域被均匀刷上一层 0.42 的白，整块变成「白纸」。
  //    这是「只看出颜色变化、毫无玻璃感」的第二根因（第一根因是 fillAlpha 0.62）。
  //    v2 改成「三层边缘光」：
  //      ① 顶缘 2rpx 硬亮线（切面受光）
  //      ② 顶缘下方 ~18% 快速衰减的柔光（厚度里的散射）
  //      ③ 斜向 160° 的窄扫光（只剩一条斜带，且止于 12%）
  //    三层都只贴着边缘，内容区完全不受影响。
  derived['--lg-specular'] = tune.rim === null
    ? 'none'
    : `linear-gradient(to bottom, ${tune.rimTop} 0%, rgba(255,255,255,0.46) 1.2%, rgba(255,255,255,0) 2.6%),` +
      // ⚠ v14：层二原来是「顶部 0.62 白 → 16% 处衰减到 0」，也就是面板上部 16% 高度
      //    被均匀刷上一层 0.62 的白 —— 一条 103px 高的卡片，就是顶部 16px 全白。
      //    v13 实测这一层单独吃掉 21% 的色彩。改成 9% 且中段再补一个 0.12 的过渡，
      //    让「厚度里的散射」只贴着顶缘出现，不进内容区。
      `linear-gradient(to bottom, ${tune.specular || 'rgba(255,255,255,0.55)'} 0%, rgba(255,255,255,0.12) 4%, rgba(255,255,255,0) 9%, rgba(255,255,255,0) 90%, rgba(255,255,255,0.16) 100%),` +
      `linear-gradient(160deg, rgba(255,255,255,0.30) 0%, rgba(255,255,255,0) 9%)`

  // ⑥ 背景模糊（渐进增强，不支持时属性整体失效，只剩 fill alpha）
  derived['--lg-blur'] = tune.blur || 'none'

  // ⑦ TabBar 边框：玻璃档由 inset 描边承担，这里让 border 退化为透明；
  //    旧主题没有该 token → 调用方 fallback 到原 border，观感不变。
  derived['--lg-tabbar-border'] = tune.rim === null
    ? '1rpx solid var(--color-border)'
    : '1rpx solid transparent'

  // ⑦b TabBar 的模糊档位：不能直接复用 --lg-blur。
  //    旧四套主题 --lg-blur 是字符串 `none`（有效的合法值，而且是真值），
  //    无论 `var(--lg-blur, ...)` 的 fallback 还是 `tune.blur || ...` 都不会触发，
  //    TabBar 会静默丢掉原本的 8px 模糊 → 回归。
  //    所以单开一个 token，用 rim（只有玻璃档非 null）判档：
  //    旧主题显式写回原值 blur(8px) saturate(180%)，玻璃档才跟随档位。
  derived['--lg-tabbar-blur'] = tune.rim === null
    ? 'blur(8px) saturate(180%)'
    : tune.blur

  // ⑦c TabBar 内部元件（v31）。
  //    v30 的放大截图暴露出三处「破材质」：
  //      ① 未选中图标下面垫着一块实色小方块（--color-surface-low，α=1），
  //         压在强档玻璃底壳上像贴纸；
  //      ② 中间「+」是 8rpx 的**纯白实心描边**，在玻璃上是一圈厚白环；
  //      ③ 选中项是实色 primary-container，与周围玻璃不是同一种材质。
  //    苹果 TabBar 的做法是：底壳一层玻璃，未选中项只有图标，
  //    选中项是**同一材质的药丸**（更亮、更靠前），色相从 tint 来。
  //    旧主题这里全部输出原值（逐字），观感不变。
  const pcRgb = hexToRgb(vars['--color-primary-container'])
  if (tune.rim === null || !pcRgb) {
    derived['--lg-tabbar-icon-bg'] = 'var(--color-surface-low)'
    derived['--lg-tabbar-icon-border'] = '1rpx solid rgba(0, 0, 0, 0.04)'
    derived['--lg-tabbar-icon-shadow'] = 'inset 0 1rpx 0 rgba(255, 255, 255, 0.72)'
    derived['--lg-tabbar-active-bg'] = 'var(--color-primary-container)'
    derived['--lg-tabbar-active-border'] = 'rgba(0, 0, 0, 0.04)'
    derived['--lg-tabbar-active-shadow'] = '0 12rpx 24rpx rgba(0, 0, 0, 0.08)'
    derived['--lg-tabbar-primary-border'] = '8rpx solid var(--color-surface)'
  } else {
    // ① 未选中：没有底托。图标本身压在玻璃上，靠 TabBar 的强档底壳统一承托。
    derived['--lg-tabbar-icon-bg'] = 'transparent'
    derived['--lg-tabbar-icon-border'] = '1rpx solid transparent'
    derived['--lg-tabbar-icon-shadow'] = 'none'
    // ② 选中：tint 玻璃药丸 —— primary-container 的色相 + 玻璃的白 + 切面。
    //    浅色档 0.72 / 深色档 0.62：深档底色本来暗，再透就看不见形状。
    const pillA = isLight ? 0.72 : 0.62
    derived['--lg-tabbar-active-bg'] = `rgba(${pcRgb.r}, ${pcRgb.g}, ${pcRgb.b}, ${pillA})`
    // ⚠ 这里是**纯颜色**，不是 border 简写：消费方 index.wxss:102 写的是
    //   `border-color: var(--lg-tabbar-active-border, ...)`。
    //   v58 曾误写成 `1rpx solid rgba(...)`，作为 border-color 非法 → 声明被丢弃
    //   → 回退到初始值 currentColor（= 文字色 rgb(152,147,144)），
    //   药丸左右各出现一条 1px 脏灰线（截图 lg-v58 实测）。
    derived['--lg-tabbar-active-border'] = isLight
      ? 'rgba(255, 255, 255, 0.72)'
      : 'rgba(255, 255, 255, 0.16)'
    // 切面**不能**直接复用 --lg-edge-card：它带 `inset 0 0 0 5rpx rim`
    // 与一层 innerGlow，在 96rpx 见方的药丸上会吃掉近一半面积，
    // 把橙色 tint 冲成灰白块（v54 TabBar 放大图实测）。药丸只保留：
    // 一条 1.5rpx 顶缘高光 + 一条极淡底部内阴影 + 一条细落影。
    const pillRim = isLight ? '1.5rpx' : '1rpx'
    const pillRimC = isLight ? 'rgba(255, 255, 255, 0.72)' : 'rgba(255, 255, 255, 0.18)'
    const pillShade = isLight ? 'rgba(30, 41, 70, 0.06)' : 'rgba(0, 0, 0, 0.35)'
    // 药丸**不要**外落影：浅桃底 + 深色落影 = 一圈脏灰边（v55 TabBar 放大图实测
    // 环色 rgb(204,177,166)）。苹果的选中态靠内高光与色相表达，不靠投影。
    derived['--lg-tabbar-active-shadow'] =
      `inset 0 ${pillRim} 0 0 ${pillRimC}, inset 0 -3rpx 8rpx -4rpx ${pillShade}`
    // 中间「+」同理：只留一圈细内高光，不要外投影。
    derived['--lg-tabbar-primary-shadow'] =
      `inset 0 2rpx 0 0 ${pillRimC}, inset 0 -4rpx 10rpx -6rpx ${pillShade}`
    derived['--lg-tabbar-primary-shadow-active'] =
      `inset 0 2rpx 0 0 ${pillRimC}, inset 0 -4rpx 10rpx -6rpx ${pillShade}`
    // ③ 「+」主按钮：8rpx 纯白实心环 → 3.5rpx 半透白环（≈1.5px）。
    //    厚度交给 box-shadow 的 inset 切面，不再靠一圈厚白边。
    derived['--lg-tabbar-primary-border'] = isLight
      ? '3.5rpx solid rgba(255, 255, 255, 0.88)'
      : '3.5rpx solid rgba(255, 255, 255, 0.24)'
  }

  // ⑦d 预算环形图中心（v32）。
  //     v31 的多页截图里，`.budget-ring-center` 仍是 `background: var(--color-surface)`
  //     的**实白圆盘**，压在玻璃 hero 上就是一个「白洞」—— 环形进度是玻璃、
  //     中心是纸，材质断裂。旧主题输出原值，逐像素不变。
  if (tune.rim === null) {
    derived['--lg-fill-center'] = 'var(--color-surface)'
    derived['--lg-edge-ring'] = 'none'
    derived['--lg-rim-ring'] = 'transparent'
  } else {
    // 中心盘要比卡片本体更「厚」一点，否则圆环压不住它。
    //    0.42 / 0.34：透出 hero 的橙色底色，但仍能托住里面的金额数字。
    derived['--lg-fill-center'] = isLight
      ? 'rgba(255, 255, 255, 0.42)'
      : 'rgba(255, 255, 255, 0.22)'
    derived['--lg-edge-ring'] = derived['--lg-edge-card']
    derived['--lg-rim-ring'] = tune.rimOutline || tune.rim
  }

  // ⑦e 分类九宫格的图标底板（v68）。
  //     记录页分类卡在接管层里已经是玻璃，但卡内的 `.category-icon`
  //     仍是 `background: var(--color-primary-container)` 的**不透明色块** ——
  //     九颗里八颗各压一块实心淡橙，玻璃瓦片里嵌着实心塑料块，
  //     整片网格的材质当场断裂（v67 截图 5x 放大实测）。
  //     这里给一块「淡橙玻璃」底板：同一个色相，改成低 alpha，
  //     让下方瓦片的折射透上来。旧主题输出原 token，逐像素不变。
  if (tune.rim === null || !pcRgb) {
    derived['--lg-tile-bg'] = 'var(--color-primary-container)'
    derived['--lg-tile-shadow'] = 'inset 0 1rpx 0 rgba(255, 255, 255, 0.5)'
    derived['--lg-tile-bg-on'] = 'var(--gradient-hero)'
    derived['--lg-tile-shadow-on'] = '0 12rpx 24rpx var(--shadow-dark)'
    derived['--lg-tile-img-filter-on'] = 'brightness(0) invert(1) opacity(0.95)'
  } else {
    //    浅色 0.45 / 深色 0.55：深档底色暗，再透就分不清底板与瓦片。
    derived['--lg-tile-bg'] =
      `rgba(${pcRgb.r}, ${pcRgb.g}, ${pcRgb.b}, ${isLight ? 0.45 : 0.55})`
    derived['--lg-tile-shadow'] = isLight
      ? 'inset 0 1.5rpx 0 rgba(255, 255, 255, 0.62)'
      : 'inset 0 1.5rpx 0 rgba(255, 255, 255, 0.10)'
    // ② 选中态：不能再用不透明的 --gradient-hero。
    //    那是一块实心塑料片，九颗瓦片里唯独它不透光（v67 截图实测）。
    //    改成**同色相的高浓度 tint 玻璃** —— 选中 = 更厚、更靠前的一块玻璃，
    //    与接管层对选中卡的处理逻辑一致。
    //
    //    ⚠ 底色必须用 --color-primary / --color-accent，**不能**用
    //      --color-primary-container：后者是「浅色容器色」，在浅色档是淡桃
    //      (#fadfcc)，白图标压上去几乎看不见（v68 首版实测）。
    //      primary/accent 在浅色档同为深色（#8a3a16 / #93373c），
    //      在深色档同为浅色（#f0a868 / #ffce8a）——
    //      所以每个档位内部的渐变是**同明度**的，图标色可以一刀切。
    const acRgb = hexToRgb(vars['--color-accent'] || vars['--color-primary-light'])
    const pcPrimRgb = hexToRgb(vars['--color-primary'])
    //    浅色档深底：α 0.76 —— 白图标压上去实算 5.6:1（≥4.5），
    //    同时留 24% 让背后画布的颜色透进来，选中块也是「玻璃」而不是塑料。
    //    深色档浅底：α 0.92，深图标压上去 ~9:1（深底上必须更实，否则发灰）。
    const onA = isLight ? 0.76 : 0.92
    //    ④ 把 tint 做成「一块深色玻璃」而不是「一块塑料壳」：
    //       在 tint 之上再叠一层顶层高光（多背景层里第一个在最上），
    //       上缘亮、下缘暗，配合 inset 切面就出现厚度。
    const onTint = acRgb && pcPrimRgb
      ? `linear-gradient(135deg, rgba(${pcPrimRgb.r}, ${pcPrimRgb.g}, ${pcPrimRgb.b}, ${onA}) 0%, ` +
        `rgba(${acRgb.r}, ${acRgb.g}, ${acRgb.b}, ${onA}) 100%)`
      : `rgba(${pcRgb.r}, ${pcRgb.g}, ${pcRgb.b}, ${onA})`
    derived['--lg-tile-bg-on'] = isLight
      ? 'linear-gradient(180deg, rgba(255, 255, 255, 0.30) 0%, ' +
        'rgba(255, 255, 255, 0.10) 34%, rgba(255, 255, 255, 0) 58%, ' +
        'rgba(0, 0, 0, 0.10) 100%), ' + onTint
      : 'linear-gradient(180deg, rgba(255, 255, 255, 0.34) 0%, ' +
        'rgba(255, 255, 255, 0.12) 34%, rgba(255, 255, 255, 0) 58%, ' +
        'rgba(0, 0, 0, 0.18) 100%), ' + onTint
    // 切面 + 内高光：把「实心块」变成「一块有厚度的玻璃」。
    derived['--lg-tile-shadow-on'] = isLight
      ? 'inset 0 2rpx 0 rgba(255, 255, 255, 0.34), ' +
        'inset 0 0 0 2rpx rgba(255, 255, 255, 0.20), ' +
        '0 10rpx 22rpx -8rpx rgba(30, 41, 70, 0.42)'
      : 'inset 0 2rpx 0 rgba(255, 255, 255, 0.55), ' +
        'inset 0 0 0 2rpx rgba(255, 255, 255, 0.22), ' +
        '0 10rpx 22rpx -8rpx rgba(0, 0, 0, 0.60)'
    // ③ 图标：浅色档深底 → 白图标；深色档浅底 → 深图标（原本是白图标压浅橙，糊）。
    derived['--lg-tile-img-filter-on'] = isLight
      ? 'brightness(0) invert(1) opacity(0.95)'
      : 'brightness(0) opacity(0.82)'
  }

  // ⑦f 分段控件（stats 页「天/周/月」与「支出/收入」）与主行动按钮（v69）。
  //     v67 全页截图里还剩两块「塑料」：
  //       ① `.range-item.is-active / .seg-item.is-active` = `var(--color-primary)`
  //          深棕实心块，压在玻璃轨道上，像贴了一块塑料片；
  //       ② `.budget-empty-btn` 同样是 `var(--color-primary)` 深的实心药丸。
  //     苹果的分段控件语义是「玻璃轨道 + 一块更亮的玻璃滑块」，
  //     选中态靠**更厚更亮**表达，而不是靠填深色；
  //     主按钮则保留品牌色，但同样要有一层顶层高光 + 切面，才不是平涂。
  //     旧主题输出逐字原值，逐像素不变。
  //    ⚠ acRgb / pcPrimRgb 在 ⑦e 的 else 分支里，块级作用域出不来，这里重算。
  const segAcRgb = hexToRgb(vars['--color-accent'] || vars['--color-primary-light'])
  const segPrimRgb = hexToRgb(vars['--color-primary'])
  if (tune.rim === null || !pcRgb || !segAcRgb || !segPrimRgb) {
    derived['--lg-seg-bg'] = 'var(--color-surface)'
    derived['--lg-seg-thumb-bg'] = 'var(--color-primary)'
    derived['--lg-seg-thumb-color'] = 'var(--color-on-primary)'
    derived['--lg-seg-thumb-shadow'] = 'none'
    derived['--lg-cta-bg'] = 'var(--color-primary)'
    derived['--lg-cta-color'] = 'var(--color-on-primary)'
    derived['--lg-cta-shadow'] = 'var(--shadow-elevated)'
  } else {
    //    轨道：几乎全透，只留一层极淡的白，让画布颜色从缝里透上来。
    derived['--lg-seg-bg'] = isLight
      ? 'rgba(255, 255, 255, 0.22)'
      : 'rgba(255, 255, 255, 0.06)'
    //    滑块：比轨道明显更亮更实 —— 这才读作「被照亮的一格」。
    //    浅色 0.72 / 深色 0.16：深档底色暗，白太多会糊成灰片。
    derived['--lg-seg-thumb-bg'] = isLight
      ? 'linear-gradient(180deg, rgba(255, 255, 255, 0.86) 0%, ' +
        'rgba(255, 255, 255, 0.70) 100%)'
      : 'linear-gradient(180deg, rgba(255, 255, 255, 0.20) 0%, ' +
        'rgba(255, 255, 255, 0.10) 100%)'
    //    字色用 --color-text：它本身随主题翻转（浅档深字 / 深档浅字），
    //    而滑块的白度只有 0.86 / 0.20 两档，正文字色压上去对比都够。
    derived['--lg-seg-thumb-color'] = 'var(--color-text)'
    derived['--lg-seg-thumb-shadow'] = isLight
      ? 'inset 0 2rpx 0 rgba(255, 255, 255, 0.90), ' +
        '0 2rpx 6rpx rgba(30, 41, 70, 0.10)'
      : 'inset 0 2rpx 0 rgba(255, 255, 255, 0.22), ' +
        '0 2rpx 6rpx rgba(0, 0, 0, 0.35)'
    //    主按钮：保留品牌色相，但换成「带顶光的色玻璃」。
    //    顶层高光在最上（多背景层第一个绘制在最前），下缘压暗做厚度。
    derived['--lg-cta-bg'] =
      `linear-gradient(180deg, rgba(255, 255, 255, ${isLight ? 0.26 : 0.30}) 0%, ` +
      `rgba(255, 255, 255, ${isLight ? 0.08 : 0.10}) 46%, ` +
      `rgba(0, 0, 0, ${isLight ? 0.08 : 0.14}) 100%), ` +
      `linear-gradient(135deg, rgba(${segPrimRgb.r}, ${segPrimRgb.g}, ${segPrimRgb.b}, 0.96) 0%, ` +
      `rgba(${segAcRgb.r}, ${segAcRgb.g}, ${segAcRgb.b}, 0.96) 100%)`
    derived['--lg-cta-color'] = 'var(--color-on-primary)'
    derived['--lg-cta-shadow'] = isLight
      ? 'inset 0 2rpx 0 rgba(255, 255, 255, 0.34), ' +
        'inset 0 0 0 2rpx rgba(255, 255, 255, 0.18), ' +
        '0 12rpx 26rpx -10rpx rgba(30, 41, 70, 0.46)'
      : 'inset 0 2rpx 0 rgba(255, 255, 255, 0.30), ' +
        'inset 0 0 0 2rpx rgba(255, 255, 255, 0.14), ' +
        '0 12rpx 26rpx -10rpx rgba(0, 0, 0, 0.64)'
  }

  // ⑧ hero 卡上弱化文字的不透明度。
  //    旧主题保持原值（0.78 / 0.72）逐像素不变；玻璃档抬到 0.92 ——
  //    hero 渐变上 opacity 0.72 的白字实测仅 3.80（<4.5），抬到 0.92 可达 5.0+。
  const isGlass = tune.rim !== null
  derived['--lg-hero-label-opacity'] = isGlass ? '0.92' : '0.78'
  derived['--lg-hero-value-opacity'] = isGlass ? '0.92' : '0.72'

  // ⑨ 环境光层（背景内容层）。
  //    玻璃面板的 backdrop-filter 模糊的是「它下方已绘制的内容」；
  //    页面背景若是纯色，模糊结果就是一片均匀白雾 —— 玻璃彻底失效。
  //    这里给玻璃主题的页面根容器叠一层多色径向渐变，让模糊层有东西可折射。
  //    旧主题 = 'none'，.lg-aura 不产生任何绘制，背景逐像素不变。
  derived['--lg-aura'] = tune.aura || 'none'

  // ⑩ 阴影 token 全局改配方（只对玻璃档生效）。
  //    ⚠ 这一步比改 .lg-panel 更关键：全项目 13 个页面的卡片
  //      几乎全部写 `box-shadow: var(--shadow-card / --shadow-soft)`。
  //      而 --shadow-card = -12rpx -12rpx 32rpx 白 + 12rpx 12rpx 32rpx 暗，
  //      是 iOS 早期**新拟物（Neumorphism）**的配方 —— 一块「凸起的塑料」。
  //      玻璃是透光的，不存在左右两道光影夹击，叠上这个配方立刻廉价。
  //      在这里一次性改掉，所有页面自动跟随，零页面 wxss 改动。
  if (tune.outer) {
    derived['--shadow-soft'] = tune.soft || tune.outer
    derived['--shadow-card'] = tune.outer
    derived['--shadow-elevated'] = tune.outer
    derived['--shadow-hero'] = tune.outer
    // 主按钮保留一点向上的「压场」重量，但同样只用单向下落影
    derived['--shadow-btn-primary'] = isLight
      ? '0 10rpx 26rpx rgba(43, 58, 92, 0.20)'
      : '0 10rpx 26rpx rgba(0, 0, 0, 0.50)'
  }

  const allVars = { ...vars, ...derived }
  return Object.keys(allVars).map(k => `${k}:${allVars[k]}`).join(';')
}

function applyTheme(themeId) {
  const id = themeId || getCurrentThemeId()
  const vars = resolveThemeVars(id)
  try {
    wx.setPageStyle({ style: { backgroundColor: vars['--color-bg'] } })
  } catch (e) {}
  try {
    // 导航栏字色按 bg 亮度判定：原实现硬编码 id === 'dark'，
    // 新增的深色主题（liquidGlassDark）会被误判成浅色 → 黑字压深底。
    const bgRgb = hexToRgb(vars['--color-bg']) || { r: 255, g: 255, b: 255 }
    const bgLum = (bgRgb.r * 0.299 + bgRgb.g * 0.587 + bgRgb.b * 0.114) / 255
    wx.setNavigationBarColor({
      frontColor: bgLum < 0.5 ? '#ffffff' : '#000000',
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
  resolveThemeVars,
  applyTheme,
  initAppTheme,
  getUserThemes,
  getUserThemeById,
  saveUserTheme,
  deleteUserTheme,
  migrateLegacyCustomTheme
}
