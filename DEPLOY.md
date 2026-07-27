# 草料二维码看板 - 部署指南

## 项目结构

```
cli-dashboard/
├── server.js          # Express 后端 + API
├── public/
│   └── index.html     # 前端看板页面
├── package.json       # 依赖配置
├── railway.json       # Railway 部署配置
├── vercel.json        # Vercel 部署配置
└── .gitignore
```

## 方式一：Railway 部署（推荐）

### 步骤

1. **注册 Railway**
   - 访问 https://railway.app/
   - 用 GitHub 账号登录

2. **创建项目**
   - 点击 "New Project"
   - 选择 "Deploy from GitHub repo"
   - 将本项目上传到 GitHub 后选择仓库

3. **配置环境变量**（可选）
   - 在 Railway 项目的 Variables 页面，可以覆盖数据库配置：
     - `DB_HOST` - 数据库主机
     - `DB_PORT` - 数据库端口
     - `DB_NAME` - 数据库名
     - `DB_USER` - 用户名
     - `DB_PASSWORD` - 密码

4. **获取访问链接**
   - 部署完成后，Railway 会自动生成访问链接
   - 点击即可访问实时看板

### 一键部署按钮

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new)

---

## 方式二：Vercel 部署

### 步骤

1. **注册 Vercel**
   - 访问 https://vercel.com/
   - 用 GitHub 账号登录

2. **导入项目**
   - 点击 "Add New" → "Project"
   - 选择本项目的 GitHub 仓库

3. **配置**
   - Framework Preset: 选择 "Other"
   - Build Command: 留空
   - Install Command: `npm install`
   - Output Directory: 留空

4. **部署**
   - 点击 "Deploy"
   - 等待部署完成，获取访问链接

---

## 方式三：本地运行

```bash
# 进入项目目录
cd cli-dashboard

# 安装依赖
npm install

# 启动服务
npm start

# 浏览器访问
# http://localhost:3000
```

---

## 功能说明

- 📊 **实时数据看板** - 每5分钟自动刷新
- 📈 **月度趋势分析** - 各类检查记录趋势
- 🚦 **设备状态监控** - 压力表、气瓶、灭火器等状态
- 👥 **人员参与度排行** - 提交记录统计
- 📅 **计划执行明细** - 完成率、超期情况
- 🔔 **异常告警** - 自动检测异常状态并提示

## 数据来源

- 数据库：草料二维码官方数据库（MySQL 5.7）
- 数据表：35张表，覆盖码信息、表单数据、计划执行、设备状态等
- 自动同步：草料平台实时推送数据到官方数据库
