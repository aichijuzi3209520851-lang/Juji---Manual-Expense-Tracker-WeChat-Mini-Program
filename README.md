# 橘记 (Juji) — 极简手动记账微信小程序

🍊 一个让人愿意坚持用的记账习惯养成工具。打开就记，记完就走，月底安心回顾。

## 技术栈

- **前端**：微信小程序原生（WXML + WXSS + JS），自定义 TabBar
- **后端**：腾讯云 CloudBase / 云开发（Serverless）
- **数据库**：CloudBase 文档型 NoSQL（`bills` / `budgets` / `users`）
- **AI**：腾讯混元大模型 `hunyuan-v3` → `hy3-preview`（俏皮评论 + AI 信件生成，小程序成长计划 1 亿 Token）
- **存储**：CloudBase 云存储（账单照片、用户头像）
- **主题**：Design Token 体系 v2（60+ CSS 变量），4 套预设 + 8 色自定义调色板 + 用户命名主题 CRUD（最多 5 个），inline-style 注入方案，切换后即时生效
- **UI 风格**：小红书 / Apple Wallet 风格（渐变 hero 卡 + 40rpx 大圆角 + Neumorphic 拟物阴影 + 跨色相渐变）
- **字体**：8 级字号 + 5 级字重 + 数字专属字体族（DIN Alternate / Helvetica Neue）

## 功能

### 记账
- 收/支双模式，滑块切换，**Neumorphic 3D 药丸控件**（毛玻璃背景 + 白底滑块）
- 金额大字输入（96rpx 数字专属字体），分类网格选择（8 预设 + 自创）
- **自创分类**：页内弹窗，名称 + emoji 图标池，即时创建并自动选中
- **日期选择**：原生 picker mode="date"，智能显示今天/昨天/X月X日
- **心情记录**：8 预设 emoji + 自定义输入，可选
- 备注 + **Neumorphic 3D 相机按钮**（主色渐变背景 + 高光深影，100rpx 圆形）
- 频率限制：3s 防抖 + 单日 500 笔上限

### 首页
- **渐变 hero 卡**（主色→accent 跨色相渐变）：今天 / 昨天消费双数字卡
- **预算进度条**：未设引导 / 正常进度 / 超支红色三态
- **季节标签**：当前季节氛围点缀
- **账单流水**：按日分组卡片（日期 + 周几 + 当日净额），近 30 条
- 点击账单 → **手账风格详情页**（拍立得照片框 + 心情印章 + 信纸纹理备注）
- 长按删除（二次确认）

### 统计页
- **渐变 hero 月份选择器**（主色→accent 跨色相渐变）
- 收入/支出 **segment toggle**（primary-container 背景 + 白底激活态）
- 甜甜圈类目占比图（Top 8 图例）
- **6 个月收支趋势柱状图**（纯 CSS，当前月渐变高亮）
- **AI 俏皮评论**（小橘的便签）：昨日 / 上周 / 上月三张卡片
  - 混元 `hy3-preview` `streamText`，串行调用 + 429 退避重试
  - `periodKey` 自动缓存，失败不写缓存允许重试

### 预算页
- **渐变 hero 进度环**（主色→accent 跨色相，白色环 + 半透明白未完成）
- **6 个月预算达成率历史**条形图（超支月红色）
- **消费节奏卡**：日均预算 / 今日消费 / 剩余天数 / 建议日均
- **钱去哪了**：Top 3 消费分类（emoji + 金额 + 百分比进度条）
- **底部滑入面板**（bottom-sheet）调整预算
- 未设预算空态引导

### 我的页
- **渐变 hero 头像区**（主色→accent 跨色相，白边头像 + 投影）
- 头像 / 昵称在线编辑（`editImage` 裁剪 → `compressImage` → 云存储 → `getTempFileURL`）
- **记账足迹卡**：记账天数 / 累计笔数 / 最爱分类（可点击生成 AI 专属信件）
- **AI 信件生成**：混元文本大模型，足迹数据驱动 prompt，50-60 字俏皮鼓励信，每日限量
- 性别设置、自定义分类管理、主题切换
- 账单 CSV 导出（打开 / 分享 / 保存到手机）
- 数据清除（二次确认）

### 主题系统（Design Token 体系 v2）
- **4 套预设主题**：清爽薄荷 / 温馨玫瑰 / 夜猫子 / 蓝天白云
- **8 色自定义调色板**（Tailwind 400/500 级高饱和亮色）：樱花粉 / 蜜桃橙 / 柠檬黄 / 青葱绿 / 蒂芙尼蓝 / 鸢尾紫 / 玫瑰金 / 晴空蓝
- **用户命名主题 CRUD**：最多保存 5 个自定义主题，支持命名、切换、长按删除
- **accent 跨色相渐变**：每个主题有 primary + accent（primary.h + 60°）双色相，hero 渐变自动跨色相
- **Neumorphic 拟物阴影**：`--shadow-light`（高光）+ `--shadow-dark`（深影），per-theme 主题色
- **衍生 token 自动注入**：`--gradient-hero`、`--shadow-card` 等在 `getThemeStyleString()` 里计算实际值，避免 CSS var() 提前解析
- **旧版迁移**：`theme='custom'` + `custom_theme_color` 自动迁移到 `user_themes`

### 子页面
- **分类管理** (`pages/categories/`)：预设 + 自创列表，CRUD + emoji 图标池
- **主题预览** (`pages/themes/`)：预设主题 + 我的主题两区，创建面板（颜色 picker + 名称输入）
- **账单详情** (`pages/detail/`)：手账便签风格，金额 + 照片 + 心情 + 分类 + 日期 + 信纸备注 + 删除

### 登录 & 引导
- 微信一键静默登录（`quickstartFunctions` → `getOpenId`）
- 4 页滑动引导（柔光渐变背景 + emoji 入场动画 + 自定义圆点指示器）
- 首次安装显示，看过一次后不再出现

## Design Token 体系

### 颜色 Token（per-theme）

| Token | 说明 |
|-------|------|
| `--color-primary` | 主色调 |
| `--color-accent` | 跨色相互补色（primary.h + 60°） |
| `--color-primary-container` | 主色浅版（容器背景） |
| `--color-primary-light` | 主色亮版（高光） |
| `--color-on-primary` | 主色上方文字（自动对比度：浅色主色→深字，深色主色→白字） |
| `--color-bg` / `--color-surface` | 页面背景 / 卡片表面 |
| `--color-text` / `--color-text-secondary` / `--color-text-tertiary` | 主/次/辅文字 |
| `--color-border` / `--color-outline` | 边框 / 轮廓 |
| `--color-income` / `--color-error` / `--color-warning` | 语义色 |

### 渐变 Token

| Token | 说明 |
|-------|------|
| `--gradient-hero` | 主色→accent 跨色相渐变（135deg） |
| `--gradient-hero-soft` | primary-container→primary-light 柔和渐变 |

### 阴影 Token（Neumorphic）

| Token | 说明 |
|-------|------|
| `--shadow-light` | 高光色（per-theme，浅色主题白色，暗色主题半透明白） |
| `--shadow-dark` | 深影色（per-theme，fresh 棕色，mint 绿色，dark 黑色） |
| `--shadow-soft` | 双侧柔阴影（-8rpx / 8rpx） |
| `--shadow-card` | 双侧卡片阴影（-12rpx / 12rpx） |
| `--shadow-elevated` | 双侧提升阴影（-16rpx / 16rpx） |
| `--shadow-hero` | 单侧 hero 阴影（0 16rpx） |

### 字体 Token

| Token | 说明 |
|-------|------|
| `--font-numeric` | 数字专属字体族（DIN Alternate / Helvetica Neue） |
| `--font-body` | 正文字体族 |
| `--font-size-display` (96rpx) | 记账页核心大数字 |
| `--font-size-h1` (52rpx) | 首页/预算核心数字 |
| `--font-size-h2` (44rpx) | 次级数字（足迹、进度环） |
| `--font-size-h3` (36rpx) | 三级标题 |
| `--font-size-body` (28rpx) | 正文 |
| `--font-size-regular` (26rpx) | 常规文字 |
| `--font-size-small` (22rpx) | 辅助标签 |
| `--font-weight-black` (800) | 核心数字 |
| `--font-weight-bold` (700) | 大数字 |
| `--font-weight-semibold` (600) | 标签 |
| `--font-weight-medium` (500) | 次级 |
| `--font-weight-regular` (400) | 正文 |

## 项目结构

```
miniprogram/                # 小程序前端
├── app.js                  # 入口：CloudBase 初始化 + 主题迁移 + 登录
├── app.json                # 路由 + 窗口 + 自定义 TabBar 配置
├── app.wxss                # 全局 Design Token（60+ CSS 变量）+ 通用组件样式
├── custom-tab-bar/         # 自定义毛玻璃 TabBar（5 列，中间记账按钮凸起）
├── pages/
│   ├── login/              # 登录页（柔光 + 漂浮图标 drift 动画）
│   ├── guide/              # 新手引导（swiper + 入场动画）
│   ├── home/               # 首页（渐变 hero + 预算 + 分组流水 + 季节）
│   ├── stats/              # 统计（渐变 hero + 甜甜圈 + 趋势图 + AI 评论）
│   ├── record/             # 记账（渐变 hero 金额 + Neumorphic 相机按钮）
│   ├── budget/             # 预算（渐变 hero 进度环 + 历史 + bottom-sheet）
│   ├── profile/            # 我的（渐变 hero 头像 + 足迹 + AI 信件 + 导出）
│   ├── categories/         # 分类管理（预设 + 自创 CRUD）
│   ├── themes/             # 主题切换（预设 + 自定义主题 CRUD）
│   └── detail/             # 账单详情（手账便签风格）
├── utils/
│   ├── theme.js            # 主题系统核心（CSS 变量推导 + 用户主题 CRUD + 衍生 token 注入）
│   ├── eventBus.js         # 事件总线（on/off/emit，跨页面通信）
│   ├── rateLimiter.js      # 频率限制（防抖 + 日上限）
│   └── validate.js         # 账单输入校验
└── images/
    ├── login/              # 登录页 SVG 图标（8 个，灰色调）
    ├── record/             # 记账页 SVG 图标（14 个，黑色调，filter 染色）
    └── tabbar/             # TabBar 图标

cloudfunctions/             # 云函数
├── quickstartFunctions/    # 登录（getOpenId）+ 用户同步
├── bills/                  # 账单服务端校验（create / delete / update）
├── exportBills/            # CSV 导出（含心情列）
└── aiPoster/               # AI 信件生成（混元文本大模型 → 俏皮鼓励信）
```

## 架构概览（给新手）

这个小程序是**纯前端 + 云开发**的模式，不需要自己搭服务器：

```
你写的代码 (WXML/WXSS/JS)  →  微信小程序前端
                                 │
                  ┌──────────────┼──────────────┐
                  ▼              ▼              ▼
            云数据库          云函数           云存储
          (NoSQL文档)     (Node.js后端逻辑)   (照片/头像/导出文件)
                  │              │              │
                  └──────────────┼──────────────┘
                                 ▼
                          腾讯云 CloudBase
                         (帮你管服务器/数据库/文件)
```

- **WXML** = 小程序版的 HTML（写页面结构）
- **WXSS** = 小程序版的 CSS（写样式，支持 `var(--color-primary)` 这种变量）
- **JS** = JavaScript（写交互逻辑，调用 `wx.cloud.database()` 读写数据库）
- **云函数** = 跑在腾讯云上的 Node.js 代码，处理需要服务端做的事情（生成 CSV、调 AI 画图）
- **主题怎么切换的**：`utils/theme.js` 的 `getThemeStyleString()` 把 60+ 个颜色/阴影/渐变变量计算成实际值，拼成字符串注入每页最外层 view 的 `style` 属性，所有 `var(--color-*)` 自动生效
- **为什么不用 CSS var() 继承**：微信小程序的 `page {}` 中声明的 CSS 变量会在声明时被解析为默认值，不会跟随子 view 的内联 style 覆盖重新解析。因此衍生 token（`--gradient-hero` 等）必须在 `getThemeStyleString()` 里直接计算实际值

## 开始

1. 微信开发者工具导入项目（需填入你自己的 AppID）
2. 部署所有云函数：右键每个文件夹 →「上传并部署：云端安装依赖」
3. 创建数据库集合 `bills`、`budgets`、`users`（权限：「仅创建者可读写」）
4. 在微信公众平台 → 行业能力 → 小程序成长计划 报名，获取 AI Token
5. CloudBase 控制台 → AI+ 扩展能力 → 开通混元大模型，接入 `hunyuan-v3`

## 部署信息

### CloudBase 环境

| 项目 | 值 |
|------|------|
| 环境 ID | `lajiaoyou-d4g78yts61f1a841d` |
| 区域 | ap-shanghai |
| 套餐 | 个人版 |
| 状态 | NORMAL ✅ |

### 控制台入口

- [概览](https://tcb.cloud.tencent.com/dev?envId=lajiaoyou-d4g78yts61f1a841d#/overview)
- [云函数](https://tcb.cloud.tencent.com/dev?envId=lajiaoyou-d4g78yts61f1a841d#/scf)
- [数据库](https://tcb.cloud.tencent.com/dev?envId=lajiaoyou-d4g78yts61f1a841d#/db/doc)
- [云存储](https://tcb.cloud.tencent.com/dev?envId=lajiaoyou-d4g78yts61f1a841d#/storage)
- [静态托管](https://tcb.cloud.tencent.com/dev?envId=lajiaoyou-d4g78yts61f1a841d#/static-hosting)

### 云函数（已部署）

| 函数名 | 运行时 | 说明 | 状态 | 最后更新 |
|--------|--------|------|------|----------|
| `quickstartFunctions` | Nodejs16.13 | 登录获取 openid，同步用户信息 | Active | 2026-05-21 |
| **`bills`** | **Nodejs16.13** | 账单服务端校验 create / delete / **update（v1.0.1 新增）** | **Active ✅** | **2026-05-26** |
| `exportBills` | Nodejs16.13 | 生成 CSV 到云存储 `exports/` | Active | 2026-05-24 |
| **`aiPoster`** | **Nodejs16.13** | AI 信件生成（混元文本大模型 → 俏皮鼓励信） | **Active ✅** | **2026-05-27** |

### 数据库集合

| 集合 | 权限 | 主要字段 |
|------|------|------|
| `bills` | 仅创建者可读写 | `type, amount, category, date, note, photoUrl, mood, createdAt` |
| `budgets` | 仅创建者可读写 | `month, amount, createdAt` |
| `users` | 仅创建者可读写 | `nickname, avatarUrl, gender, customCategories, theme, budgetDefault` |

### AI 能力

- **文本生成（客户端）**：`wx.cloud.extend.AI.createModel('hunyuan-v3').streamText`，模型 `hy3-preview`
  - 用途：统计页 AI 俏皮评论（昨日 / 上周 / 上月）
- **文本生成（云函数）**：`app.ai().createModel('hunyuan-v3').chatCompletions`，模型 `hy3-preview`
  - 用途：我的页 AI 信件（记账天数 + 最爱分类 → 50-60 字俏皮鼓励信）
- 资源包：小程序成长计划 1 亿 Token（`pkg_hunyuan_token_la_inspire_100m`）

## License

MIT

---

## 部署历史

| 日期 | 版本 | 变更 |
|------|------|------|
| 2026-05-26 | **v1.0.1** | 部署 `bills`（新增 update）、`aiPoster`（修复语法 + 场景多样化）；引导页重构、主题显示 bug 修复、编辑账单功能、预算弹窗居中化 |
| 2026-05-24 | v1.0.0 | 首次全量部署：4 个云函数 + 小程序前端 |
