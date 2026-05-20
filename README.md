# 橘记 — 极简手动记账微信小程序

🍊 一个让人愿意坚持用的记账习惯养成工具。打开就记，记完就走，月底安心回顾。

## 技术栈

- **前端**：微信小程序原生（WXML + WXSS + JS）
- **后端**：腾讯云 CloudBase（Serverless）
- **数据库**：CloudBase 文档型 NoSQL
- **AI**：腾讯混元大模型 hy3-preview（俏皮评论生成，微信小程序成长计划 1 亿 Token）

## 功能

- 随手记账（收/支、分类、备注、照片）
- 自创分类 + emoji 图标
- 周度/月度消费统计 + AI 俏皮评论
- 月度预算设定 + 进度追踪
- 多主题切换
- 微信一键登录，无密码
- 数据隔离，仅创建者可读写

## 项目结构

```
miniprogram/          # 小程序前端
cloudfunctions/       # 云函数（登录、校验、导出）
```

## 开始

1. 微信开发者工具导入项目（AppID: `wx5c263d2b6496fe2d`）
2. 部署云函数 `quickstartFunctions`、`bills`、`exportBills`
3. 创建数据库集合 `bills`、`budgets`、`users`（权限：仅创建者可读写）
4. 在微信公众平台 → 行业能力 → 小程序成长计划 报名，获取 AI Token

## 部署信息

### CloudBase 环境

| 项目 | 值 |
|------|------|
| 环境 ID | `lajiaoyou-d4g78yts61f1a841d` |
| 区域 | ap-shanghai |
| 套餐 | 个人版 |

### 云函数

| 函数名 | 运行时 | 说明 |
|--------|--------|------|
| `quickstartFunctions` | Nodejs16.13 | 登录获取 openid |
| `bills` | Nodejs16.13 | 账单服务端校验 create/delete |
| `exportBills` | Nodejs16.13 | CSV 导出账单 |

### 静态托管

| 项目 | 值 |
|------|------|
| 域名 | `lajiaoyou-d4g78yts61f1a841d-1430379499.tcloudbaseapp.com` |
| URL | https://lajiaoyou-d4g78yts61f1a841d-1430379499.tcloudbaseapp.com/ |

### 数据库集合

| 集合 | 权限 |
|------|------|
| `bills` | 仅创建者可读写 |
| `budgets` | 仅创建者可读写 |
| `users` | 仅创建者可读写 |

### AI 能力

- 模型：`hy3-preview`（hunyuan-v3 组，小程序成长计划 1 亿 Token）
- 接入方式：`wx.cloud.extend.AI.createModel('hunyuan-v3')`
- 资源包：小程序成长计划 1 亿 Token（`pkg_hunyuan_token_la_inspire_100m`）
- 计费目标：`hunyuan-exp.la-inspire-plan`
- ⚠️ `hunyuan-exp` 组将于 2026/8/30 下线，已切换至 `hunyuan-v3` 组
- 控制台：https://tcb.cloud.tencent.com/dev?envId=lajiaoyou-d4g78yts61f1a841d#/overview

## License

MIT
