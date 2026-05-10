# 橘记 — 极简手动记账微信小程序

🍊 一个让人愿意坚持用的记账习惯养成工具。打开就记，记完就走，月底安心回顾。

## 技术栈

- **前端**：微信小程序原生（WXML + WXSS + JS）
- **后端**：腾讯云 CloudBase（Serverless）
- **数据库**：CloudBase 文档型 NoSQL
- **AI**：腾讯混元大模型（俏皮评论生成）

## 功能

- 随手记账（收/支、分类、备注、照片）
- 自创分类 + emoji 图标
- 周度/月度消费统计 + 俏皮评论
- 月度预算设定 + 进度追踪
- 多主题切换
- 微信一键登录，无密码
- 数据隔离，仅创建者可读写

## 项目结构

```
miniprogram/          # 小程序前端
cloudfunctions/       # 云函数（登录、校验、AI评论）
```

## 开始

1. `npm install -g uipro-cli && uipro init --ai claude`
2. 微信开发者工具导入 `miniprogram/`
3. 部署云函数 `quickstartFunctions` 和 `bills`
4. 创建数据库集合 `bills`、`budgets`、`users`（权限：仅创建者可读写）

## License

MIT
