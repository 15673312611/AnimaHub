# 🎬 AnimaHub - AI 动画创作平台

<div align="center">

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Next.js](https://img.shields.io/badge/Next.js-16.0-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)
![Node.js](https://img.shields.io/badge/Node.js-20+-green)

**一个基于 AI 的现代化动画创作工具平台**

[功能特性](#-功能特性) • [技术栈](#-技术栈) • [快速开始](#-快速开始) • [项目结构](#-项目结构) • [开发指南](#-开发指南)

</div>

---

## 📖 项目简介

AnimaHub 是一个集成了多种 AI 能力的动画创作平台，旨在为创作者提供从角色设计、场景构建到视频生成的一站式解决方案。平台支持 AI 图像生成、视频合成、漫画工作流等多种创作模式，让动画创作变得更加简单高效。

作者微信:soe303 

项目截图:
<img width="2559" height="1398" alt="image" src="https://github.com/user-attachments/assets/34541fe2-1b10-45c0-ba4d-736691f85c9f" />

<img width="2559" height="1398" alt="image" src="https://github.com/user-attachments/assets/d8eefac7-dffc-4d1e-9da4-c2384f0722fe" />
<img width="2559" height="1398" alt="image" src="https://github.com/user-attachments/assets/18916594-891d-49ba-9604-281d4a86e2bf" />


## ✨ 功能特性

### 🎨 素材管理系统
- **角色库管理** - 创建和管理动画角色，支持 AI 生成和手动上传
- **场景库管理** - 构建丰富的场景素材库，支持多种场景类型
- **道具库管理** - 管理动画所需的各类道具和物品
- **特效库管理** - 添加和管理视觉特效素材

### 🤖 AI 生成能力
- **AI 图像生成** - 集成多种 AI 模型（Nano Banana 2K/4K、Midjourney）
- **智能提示词优化** - 支持中文提示词，自动优化生成效果
- **参考图上传** - 支持本地图片上传作为生成参考
- **批量生成** - 高效的批量素材生成功能

### 🎬 视频创作工作流
- **片段式编辑** - 将动画拆分为多个片段进行精细化管理
- **素材关联** - 为每个片段关联角色、场景、道具和特效
- **AI 视频生成** - 基于 AI 的视频生成功能
- **漫画工作流** - 专门的漫画创作流程支持

### 💎 现代化 UI/UX
- **响应式设计** - 完美适配桌面和移动设备
- **暗色主题** - 精心设计的暗色界面，减少视觉疲劳
- **流畅动画** - 基于 Framer Motion 的流畅交互动画
- **拖拽上传** - 现代化的文件上传体验

## 🛠 技术栈

### 前端
- **框架**: Next.js 16.0 + React 19.2
- **语言**: TypeScript 5.9
- **样式**: TailwindCSS 4.1 + Radix UI
- **动画**: Framer Motion 12.23
- **图标**: Lucide React
- **HTTP 客户端**: Axios

### 后端
- **运行时**: Node.js + Express
- **语言**: TypeScript
- **数据库**: MySQL + Prisma ORM
- **认证**: JWT + bcryptjs
- **文件处理**: Fluent-FFmpeg
- **AI 集成**: OpenAI SDK

## 🚀 快速开始

### 环境要求

- Node.js 20+
- MySQL 8.0+
- npm 或 yarn

### 安装步骤

1. **克隆项目**
```bash
git clone https://github.com/yourusername/animahub.git
cd animahub
```

2. **安装依赖**
```bash
# 安装客户端依赖
cd client
npm install

# 安装服务端依赖
cd ../server
npm install
```

3. **配置环境变量**

在 `server` 目录下创建 `.env` 文件：
```env
# 数据库配置
DATABASE_URL="mysql://user:password@localhost:3306/animahub"

# JWT 密钥
JWT_SECRET="your-secret-key"

# OpenAI API Key (可选)
OPENAI_API_KEY="your-openai-api-key"

# 服务端口
PORT=3001
```

4. **初始化数据库**
```bash
cd server
npx prisma migrate dev
npx prisma generate
```

5. **启动开发服务器**

```bash
# 启动后端服务 (在 server 目录)
npm run dev

# 启动前端服务 (在 client 目录，新终端)
cd ../client
npm run dev
```

6. **访问应用**

打开浏览器访问 `http://localhost:3000`

## 📁 项目结构

```
animahub/
├── client/                 # Next.js 前端应用
│   ├── app/               # App Router 页面
│   │   ├── anime-project/ # 动画项目管理
│   │   ├── ai-image/      # AI 图像生成
│   │   ├── brands/        # 品牌管理
│   │   └── ...
│   ├── components/        # React 组件
│   │   ├── ui/           # UI 基础组件
│   │   ├── Navbar.tsx    # 顶部导航
│   │   └── Sidebar.tsx   # 侧边栏
│   └── lib/              # 工具函数
│       ├── api.ts        # API 客户端
│       └── utils.ts      # 通用工具
│
├── server/                # Express 后端服务
│   ├── src/
│   │   ├── routes/       # API 路由
│   │   ├── controllers/  # 控制器
│   │   ├── middleware/   # 中间件
│   │   └── app.ts        # 应用入口
│   ├── prisma/           # Prisma 配置
│   │   └── schema.prisma # 数据库模型
│   └── public/           # 静态文件
│       ├── uploads/      # 用户上传文件
│       └── exports/      # 导出文件
│
└── README.md             # 项目文档
```

## 🔧 开发指南

### 代码规范

- 使用 TypeScript 进行类型安全开发
- 遵循 ESLint 配置的代码规范
- 组件使用函数式组件 + Hooks
- 使用 Tailwind CSS 进行样式开发

### API 开发

后端 API 遵循 RESTful 设计规范：

```typescript
// 示例：创建角色素材
POST /api/projects/:projectId/assets/characters/generate
{
  "name": "角色名称",
  "prompt": "角色描述",
  "model": "nano-banana-2-4k",
  "referenceImage": "https://..."
}
```

### 数据库迁移

```bash
# 创建新的迁移
npx prisma migrate dev --name migration_name

# 应用迁移
npx prisma migrate deploy

# 重置数据库
npx prisma migrate reset
```

## 🎨 UI 组件

项目使用 Radix UI + TailwindCSS 构建组件系统：

- **Dialog** - 模态对话框
- **Tabs** - 标签页切换
- **Select** - 下拉选择器
- **ScrollArea** - 滚动区域
- **Button** - 按钮组件

所有组件都支持暗色主题，并具有流畅的动画效果。

## 📝 API 文档

### 认证相关
- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录

### 项目管理
- `GET /api/projects` - 获取项目列表
- `POST /api/projects` - 创建新项目
- `GET /api/projects/:id` - 获取项目详情
- `PUT /api/projects/:id` - 更新项目
- `DELETE /api/projects/:id` - 删除项目

### 素材管理
- `POST /api/projects/:id/assets/characters/generate` - AI 生成角色
- `POST /api/projects/:id/assets/characters/upload` - 上传角色
- `GET /api/projects/:id/assets/characters` - 获取角色列表
- 类似的 API 适用于 scenes、props、effects

### 视频生成
- `POST /api/videos/generate` - 生成视频
- `GET /api/videos/task/:taskId` - 查询生成任务状态

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

## 📧 联系方式

如有问题或建议，欢迎通过以下方式联系：

- 提交 Issue
- 发送邮件至：your-email@example.com

---

<div align="center">

**⭐ 如果这个项目对你有帮助，请给它一个 Star！**

Made with ❤️ by AnimaHub Team

</div>
