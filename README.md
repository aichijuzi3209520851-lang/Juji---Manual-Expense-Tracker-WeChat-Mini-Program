# 橘记 (Juji) — 极简手动记账微信小程序

🍊 一个让人愿意坚持用的记账习惯养成工具。打开就记，记完就走，月底安心回顾。

## 技术栈

- **前端**：微信小程序原生（WXML + WXSS + JS），自定义 TabBar
- **后端**：腾讯云 CloudBase / 云开发（Serverless）
- **数据库**：CloudBase 文档型 NoSQL（`bills` / `budgets` / `users`）
- **AI**：腾讯混元大模型 `hunyuan-v3` → `hy3-preview`（俏皮评论 + AI 海报生成，小程序成长计划 1 亿 Token）
- **存储**：CloudBase 云存储（账单照片、用户头像、AI 生成图片）
- **主题**：CSS 变量 Token 体系（42 个语义变量），4 套预设主题（清爽薄荷 / 暖暖阳光 / 夜猫子 / 蓝天白云），inline-style 注入方案，切换后退出小程序生效

## 功能

### 记账
- 收/支双模式，滑块切换，支出玫瑰色 / 收入薄荷绿双色系
- 金额大字输入（104rpx），分类网格选择（8 预设 + 自创）
- **自创分类**：页内弹窗，名称 + emoji 图标池，即时创建并自动选中
- **日期选择**：原生 picker mode="date"，智能显示今天/昨天/X月X日
- **心情记录**：8 预设 emoji + 自定义输入，可选
- 备注 + 照片（拍照 / 相册，压缩上传云存储）
- 频率限制：3s 防抖 + 单日 500 笔上限

### 首页
- **今天 / 昨天消费**双数字卡
- **预算进度条**：未设引导 / 正常进度 / 超支红色三态
- **季节标签**：当前季节氛围点缀
- **账单流水**：按日分组（日期 + 周几 + 当日净额），近 30 条
- 点击账单 → **手账风格详情页**（拍立得照片框 + 心情印章 + 信纸纹理备注）
- 长按删除（二次确认）

### 统计页
- 月份前后切换 + **收入/支出 segment toggle**
- 甜甜圈类目占比图（Top 8 图例）
- **6 个月收支趋势柱状图**（纯 CSS，当前月高亮）
- **AI 俏皮评论**（小橘的便签）：昨日 / 上周 / 上月三张卡片
  - 混元 `hy3-preview` `streamText`，串行调用 + 429 退避重试
  - `periodKey` 自动缓存，失败不写缓存允许重试

### 预算页
- CSS conic-gradient 进度环（入场 scale-in 动画）
- **6 个月预算达成率历史**条形图（超支月红色）
- **底部滑入面板**（bottom-sheet）调整预算
- 未设预算空态引导

### 我的页
- 头像 / 昵称在线编辑（`editImage` 裁剪 → `compressImage` → 云存储 → `getTempFileURL`）
- **记账足迹卡**：记账天数 / 累计笔数 / 最爱分类（可点击生成 AI 海报）
- **AI 海报生成**：混元文生图，足迹数据驱动 prompt，每日限量
- 性别设置、自定义分类管理、主题切换
- 账单 CSV 导出（打开 / 分享 / 保存到手机）
- 数据清除（二次确认）

### 子页面
- **分类管理** (`pages/categories/`)：预设 + 自创列表，CRUD + emoji 图标池
- **主题预览** (`pages/themes/`)：4 套配色色板卡片，选中切换
- **账单详情** (`pages/detail/`)：手账便签风格，金额 + 照片 + 心情 + 分类 + 日期 + 信纸备注 + 删除

### 登录 & 引导
- 微信一键静默登录（`quickstartFunctions` → `getOpenId`）
- 4 页滑动引导（柔光渐变背景 + emoji 入场动画 + 自定义圆点指示器）
- 首次安装显示，看过一次后不再出现

## 项目结构

```
miniprogram/                # 小程序前端
├── app.js                  # 入口：CloudBase 初始化 + 主题 + 登录
├── app.json                # 路由 + 窗口 + 自定义 TabBar 配置
├── app.wxss                # 全局主题 Token (30+ CSS 变量)
├── custom-tab-bar/         # 自定义毛玻璃 TabBar（5 列，中间记账按钮凸起）
├── pages/
│   ├── login/              # 登录页（柔光 + 漂浮图标 drift 动画）
│   ├── guide/              # 新手引导（swiper + 入场动画）
│   ├── home/               # 首页（今日/昨天 + 预算 + 分组流水 + 季节）
│   ├── stats/              # 统计（甜甜圈 + 趋势图 + AI 评论）
│   ├── record/             # 记账（金额 + 分类 + 日期 + 心情 + 照片）
│   ├── budget/             # 预算（进度环 + 历史 + bottom-sheet）
│   ├── profile/            # 我的（头像 + 足迹 + AI 海报 + 导出）
│   ├── categories/         # 分类管理（预设 + 自创 CRUD）
│   ├── themes/             # 主题切换（4 套配色预览）
│   └── detail/             # 账单详情（手账便签风格）
├── utils/
│   ├── theme.js            # 主题系统（CSS 变量动态注入）
│   ├── rateLimiter.js      # 频率限制（防抖 + 日上限）
│   └── validate.js         # 账单输入校验
└── images/
    ├── login/              # 登录页 SVG 图标
    ├── record/             # 记账页 SVG 图标
    └── tabbar/             # TabBar 图标

cloudfunctions/             # 云函数
├── quickstartFunctions/    # 登录（getOpenId）+ 用户同步
├── bills/                  # 账单服务端校验（create / delete）
├── exportBills/            # CSV 导出（含用户身份 meta 头）
├── aiPoster/               # AI 海报生成（文生图 → 云存储）
└── generateImage-WtU3mJ/   # 混元文生图（CloudBase AI+ 扩展）
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
- **主题怎么切换的**：`utils/theme.js` 把 30 个颜色变量拼成字符串，塞进每页最外层 view 的 `style` 属性，所有 `var(--color-*)` 自动生效

## 开始

1. 微信开发者工具导入项目（AppID: `wx5c263d2b6496fe2d`）
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

### 云函数

| 函数名 | 运行时 | 说明 | 状态 |
|--------|--------|------|------|
| `quickstartFunctions` | Nodejs16.13 | 登录获取 openid，同步用户信息 | Active |
| `bills` | Nodejs16.13 | 账单服务端校验 create / delete | Active（客户端绕过中） |
| `exportBills` | Nodejs16.13 | 生成 CSV 到云存储 `exports/` | Active |
| `aiPoster` | Nodejs16.13 | AI 海报生成（文生图 → 上传云存储） | Active |
| `generateImage-WtU3mJ` | — | CloudBase AI+ 扩展自动生成（混元文生图） | Active |

### 数据库集合

| 集合 | 权限 | 主要字段 |
|------|------|------|
| `bills` | 仅创建者可读写 | `type, amount, category, date, note, photoUrl, mood, createdAt` |
| `budgets` | 仅创建者可读写 | `month, amount, createdAt` |
| `users` | 仅创建者可读写 | `nickname, avatarUrl, gender, customCategories, theme, budgetDefault` |

### AI 能力

- **文本生成**：`hunyuan-v3` → `hy3-preview`，`wx.cloud.extend.AI.createModel('hunyuan-v3').streamText`
  - 用途：统计页 AI 俏皮评论（昨日 / 上周 / 上月）
- **图像生成**：CloudBase AI+ 扩展 `generateImage-WtU3mJ`
  - 用途：我的页 AI 海报（足迹数据驱动 prompt）
- 资源包：小程序成长计划 1 亿 Token（`pkg_hunyuan_token_la_inspire_100m`）
- ⚠️ `hunyuan-exp` 组将于 2026/8/30 下线，已切换至 `hunyuan-v3` 组

### 静态托管

| 项目 | 值 |
|------|------|
| 域名 | `lajiaoyou-d4g78yts61f1a841d-1430379499.tcloudbaseapp.com` |

## License

MIT
