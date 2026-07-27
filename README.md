# 草料二维码数据分析看板

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new)

## 功能

- 📊 实时数据看板，每5分钟自动刷新
- 📈 月度趋势分析
- 🚦 设备状态监控（压力表/气瓶/灭火器异常告警）
- 👥 人员参与度排行
- 📅 计划执行明细
- 🔔 异常状态自动告警

## 部署

### Railway（推荐）

1. 点击上方按钮或访问 https://railway.app/
2. 用 GitHub 账号登录
3. 选择 "Deploy from GitHub repo"
4. 选择本仓库 `xiaohuoshuan123/cli-dashboard`
5. 等待部署完成，获取访问链接

### Vercel

1. 访问 https://vercel.com/
2. 用 GitHub 账号登录
3. 导入本仓库
4. 一键部署

### 本地运行

```bash
npm install
npm start
# 访问 http://localhost:3000
```

## 技术栈

- 后端：Node.js + Express
- 前端：HTML + CSS + Chart.js
- 数据库：MySQL 5.7（草料二维码官方数据库）
