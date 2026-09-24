/**
 * 分享配置单一源（转发 / 分享到朋友圈）
 * ────────────────────────────────────────────────────────────
 * 为什么要有这个文件：
 * 1) 微信的「转发」「分享到朋友圈」是**页面级**开关 —— 页面没有实现
 *    onShareAppMessage / onShareTimeline，右上角胶囊菜单里对应两项会直接置灰
 *    （「当前页面不可转发 / 不可分享」），且**没有任何 JSON 配置能打开它**
 *    （app.json 里配不了；enableShareAppMessage 是支付宝小程序的配置项）。
 *    分享回调不继承，每个想支持分享的页面都必须各自实现。
 * 2) **必须显式给 imageUrl**：不传时微信会用「当前页面截图」当分享封面，
 *    而本 App 的首页 / 统计页 / 预算页含金额、分类、备注 —— 截图即泄露用户账目。
 *    这里统一强制使用纯品牌图 images/share-cover.jpg（5:4，含橘子/笔记本/笔，无任何用户数据）。
 * 3) 落地 path 只允许指向**通用功能页**，禁止指向 detail（单笔账单详情）等
 *    携带用户数据的页面；title 也不得出现金额 / 分类 / 昵称 / openid。
 */

// 分享封面：500x400（微信推荐 5:4），纯品牌图，不含用户数据
const SHARE_COVER = '/images/share-cover.jpg'

// 各页分享文案（改了这里，所有页面同步生效）
const TITLES = {
  home: '橘记JUJI · 简单好用的记账本',
  stats: '橘记JUJI · 看看钱都花在哪了',
  record: '橘记JUJI · 记一笔，心里有数',
  budget: '橘记JUJI · 预算花到哪了',
  profile: '橘记JUJI · 简单好用的记账本'
}

// 落地页白名单：只能是通用功能页，且必须是 app.json 里已注册的页面
const LANDING = {
  home: '/pages/home/home',
  stats: '/pages/stats/stats',
  record: '/pages/record/record',
  budget: '/pages/budget/budget',
  profile: '/pages/profile/profile'
}

function normalizeKey(pageKey) {
  return Object.prototype.hasOwnProperty.call(LANDING, pageKey) ? pageKey : 'home'
}

/**
 * 转发给朋友（菜单「转发」+ <button open-type="share">）
 * @param {string} pageKey home | stats | record | budget | profile
 * @returns {{title: string, path: string, imageUrl: string}}
 */
function buildShareAppMessage(pageKey) {
  const key = normalizeKey(pageKey)
  return {
    title: TITLES[key],
    path: LANDING[key],
    imageUrl: SHARE_COVER
  }
}

/**
 * 分享到朋友圈
 * ⚠️ 返回值**不支持 path**（只有 title / query / imageUrl），只能控制标题与封面；
 * 另需注意：该能力仅 Android 微信支持，且只有页面位于**页面栈第一层**时入口才可用
 * （从首页 navigateTo 进去的子页，朋友圈入口依然是灰的）；开发版 / 体验版亦受限。
 * @param {string} pageKey home | stats | record | budget | profile
 * @returns {{title: string, imageUrl: string}}
 */
function buildShareTimeline(pageKey) {
  const key = normalizeKey(pageKey)
  return {
    title: TITLES[key],
    imageUrl: SHARE_COVER
  }
}

module.exports = {
  buildShareAppMessage,
  buildShareTimeline,
  SHARE_COVER,
  SHARE_TITLES: TITLES,
  SHARE_LANDING: LANDING
}
