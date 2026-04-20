<div align="center">

# 🎬 AnimaHub

### AI-Powered Animation & Video Production Platform

[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![Spring Boot](https://img.shields.io/badge/Spring%20Boot-3.2-6DB33F?logo=springboot&logoColor=white)](https://spring.io/projects/spring-boot)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind%20CSS-4.1-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![MySQL](https://img.shields.io/badge/MySQL-8.0-4479A1?logo=mysql&logoColor=white)](https://www.mysql.com/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://docs.docker.com/compose/)

**端到端 AI 动画创作系统 — 从角色设计、剧本编排、分镜绘制到成片输出的全链路智能工作流**

📮 **微信联系：`soe303`** — 欢迎交流合作！

[🌐 在线体验](https://anima.cutb.cn/) · [📖 功能介绍](#-核心功能) · [🏗 系统架构](#-系统架构) · [🚀 快速部署](#-快速部署) · [📡 API 文档](#-api-概览)

</div>

---

## 🌐 在线体验

> **👉 [https://anima.cutb.cn/](https://anima.cutb.cn/)**
>
> 无需部署，注册即可体验全部功能。支持 AI 图像生成、视频合成、剧本工坊、分镜编辑等完整创作流程。

---

## 📸 功能预览

<table>
  <tr>
    <td align="center"><b>🎨 AI 图像生成</b><br/>多模型智能绘图引擎</td>
    <td align="center"><b>🎬 AI 视频合成</b><br/>一键图生视频 / 融合视频</td>
  </tr>
  <tr>
    <td align="center"><b>📝 剧本工坊</b><br/>AI Agent 全自动分镜流水线</td>
    <td align="center"><b>📖 漫画工作流</b><br/>分镜到成品的完整链路</td>
  </tr>
</table>

---

## ✨ 核心功能

### 🤖 多模型 AI 图像生成引擎

- 集成 **Nano Banana 2K/4K**、**Midjourney**、**即梦 (Jimeng)** 等主流 AI 绘图模型
- 智能提示词优化系统 — 支持中文自然语言输入，自动翻译 & 语义增强
- 参考图驱动生成 — 上传参考图片引导 AI 输出风格一致的素材
- 批量并行生成 — 支持多任务队列，高效产出大量素材
- 风格预设库 — 内置多种动画风格模板，一键切换画风

### 🎬 AI 视频生成与合成

- 多视频模型支持，可配置时长、分辨率等参数
- **图生视频** — 静态素材一键转化为动态视频片段
- **融合视频** — 多片段智能拼接，自动过渡衔接
- WebSocket 实时进度推送 — 生成过程全程可视化追踪
- 视频片段管理 — 按分镜组织，支持重新生成与替换

### 📝 剧本工坊 (Script Workshop)

- **全功能分镜编辑器** — 可视化分镜脚本编排，逐镜头精细调整
- **小说/文本导入** — 支持导入长篇小说文本，AI 自动拆解为分镜脚本
- **AI Agent 自动化流水线** — 基于 AI Agent Workflow 的全自动创作管线：
  - 剧本分析 → 角色提取 → 场景规划 → 分镜生成 → 图像生成 → 视频合成
  - 支持自定义工作流预设，可配置每个环节的 AI 模型与参数
  - 实时 WebSocket 推送工作流执行状态与阶段进度
- **工作流预设管理** — 保存和复用常用的创作流水线配置

### 🎨 素材资产管理系统

| 素材类型 | 功能说明 |
|---------|---------|
| **角色库** | AI 生成 / 手动上传角色立绘，支持多角度、多表情管理 |
| **场景库** | 构建场景素材库，支持室内/室外/幻想等多种场景类型 |
| **道具库** | 管理动画所需道具与物品素材 |
| **特效库** | 视觉特效素材管理，支持粒子、光效等分类 |
| **公共素材库** | 平台级共享素材，所有用户可直接引用 |

### 💰 积分与支付系统

- 虚拟积分 (Coin) 体系 — AI 生成按模型计费，精细化成本控制
- 充值套餐管理 — 多档位充值方案，支持在线支付
- 支付网关集成 — 对接 YiZF 支付平台，支持主流支付方式
- 消费明细追踪 — 完整的积分流水与消费记录

### 🔔 实时通信与通知

- **STOMP over WebSocket** — 基于 STOMP 协议的双向实时通信
- AI 任务进度实时推送 — 图像/视频生成进度实时反馈
- 工作流状态同步 — Agent Workflow 各阶段状态实时更新
- 站内通知系统 — 任务完成、系统公告等消息推送

### 🛡 管理后台

- 独立的 **Vue 3 + Element Plus** 管理面板
- AI 模型配置管理 — 动态配置可用模型、定价、路由策略
- 提示词模板管理 — 维护和优化 AI 提示词模板库
- 用户管理与数据统计 — 用户行为分析、资源使用监控
- 风格预设管理 — 平台级风格模板的增删改查

---

## 🏗 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client (Browser)                         │
│                   Next.js 16 + React 19 + TS                    │
│         TailwindCSS 4.1 · Radix UI · Framer Motion             │
└──────────────┬──────────────────────┬───────────────────────────┘
               │ HTTP (Axios)         │ WebSocket (STOMP.js)
               ▼                      ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Java Server (Spring Boot 3.2)                 │
│  ┌────────────┐ ┌──────────────┐ ┌────────────┐ ┌────────────┐  │
│  │ Auth (JWT) │ │ AI Gateway   │ │ WebSocket  │ │ Payment    │  │
│  │ + Security │ │ Multi-Model  │ │ STOMP Broker│ │ Gateway    │  │
│  └────────────┘ └──────────────┘ └────────────┘ └────────────┘  │
│  ┌────────────┐ ┌──────────────┐ ┌────────────┐ ┌────────────┐  │
│  │ AI Agent   │ │ Script       │ │ Asset      │ │ File/OSS   │  │
│  │ Workflow   │ │ Workshop     │ │ Management │ │ Storage    │  │
│  └────────────┘ └──────────────┘ └────────────┘ └────────────┘  │
│                  MyBatis Plus · Spring WebFlux                    │
└──────────────┬──────────────────────┬───────────────────────────┘
               │                      │
               ▼                      ▼
┌──────────────────────┐  ┌───────────────────────┐
│   MySQL 8.0          │  │   Aliyun OSS          │
│   40+ Data Tables    │  │   Cloud File Storage  │
│   Druid Pool         │  │   CDN Acceleration    │
└──────────────────────┘  └───────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                     Admin Panel (独立部署)                        │
│              Vue 3.4 + Element Plus + Pinia + Vite               │
│              独立 Spring Boot 后端 · 独立数据库连接                │
└──────────────────────────────────────────────────────────────────┘
```

### 技术栈详情

<table>
  <tr>
    <th>层级</th>
    <th>技术</th>
    <th>说明</th>
  </tr>
  <tr>
    <td rowspan="6"><b>Frontend</b></td>
    <td>Next.js 16 (App Router)</td>
    <td>SSR/SSG 混合渲染，Turbopack 开发加速</td>
  </tr>
  <tr>
    <td>React 19 + TypeScript 5.9</td>
    <td>类型安全的现代 React 开发</td>
  </tr>
  <tr>
    <td>TailwindCSS 4.1 + Radix UI</td>
    <td>原子化 CSS + 无障碍组件原语</td>
  </tr>
  <tr>
    <td>Framer Motion 12</td>
    <td>声明式动画引擎，流畅交互体验</td>
  </tr>
  <tr>
    <td>STOMP.js + SockJS</td>
    <td>WebSocket 实时双向通信</td>
  </tr>
  <tr>
    <td>JSZip + FileSaver</td>
    <td>客户端文件打包与导出</td>
  </tr>
  <tr>
    <td rowspan="6"><b>Backend</b></td>
    <td>Java 17 + Spring Boot 3.2</td>
    <td>企业级后端框架，生产就绪</td>
  </tr>
  <tr>
    <td>Spring Security + JWT</td>
    <td>完整的认证授权体系</td>
  </tr>
  <tr>
    <td>Spring WebFlux</td>
    <td>响应式 HTTP 客户端，异步调用外部 AI API</td>
  </tr>
  <tr>
    <td>MyBatis Plus 3.5</td>
    <td>增强型 ORM，代码生成器加速开发</td>
  </tr>
  <tr>
    <td>Spring WebSocket (STOMP)</td>
    <td>实时消息推送，任务进度同步</td>
  </tr>
  <tr>
    <td>FFmpeg (bramp wrapper)</td>
    <td>服务端视频处理与转码</td>
  </tr>
  <tr>
    <td rowspan="3"><b>Infrastructure</b></td>
    <td>MySQL 8.0 + Druid</td>
    <td>关系型存储 + 高性能连接池</td>
  </tr>
  <tr>
    <td>Aliyun OSS</td>
    <td>云端对象存储，CDN 加速分发</td>
  </tr>
  <tr>
    <td>Docker Compose</td>
    <td>一键容器化部署，前后端编排</td>
  </tr>
  <tr>
    <td rowspan="3"><b>Admin</b></td>
    <td>Vue 3.4 + Vite 7.3</td>
    <td>独立管理前端，快速构建</td>
  </tr>
  <tr>
    <td>Element Plus 2.4</td>
    <td>企业级 UI 组件库</td>
  </tr>
  <tr>
    <td>Pinia + Vue Router</td>
    <td>状态管理 + 路由控制</td>
  </tr>
</table>

---

## 📁 项目结构

```
sora2/
├── client/                          # Next.js 前端应用
│   ├── app/                         # App Router 页面
│   │   ├── ai-image/               # AI 图像生成工作台
│   │   ├── anime-project/[id]/     # 动画项目编辑器
│   │   ├── script-workshop/        # 剧本工坊
│   │   │   ├── editor/             # 分镜编辑器 (核心模块)
│   │   │   └── pipeline/[id]/      # AI Agent 工作流管线
│   │   ├── characters/             # 角色素材库
│   │   ├── videos/                 # 视频管理
│   │   ├── scripts/[id]/           # 剧本管理
│   │   ├── dashboard/              # 用户仪表盘
│   │   ├── settings/               # 用户设置
│   │   ├── pay-result/             # 支付回调
│   │   └── api/                    # Next.js API Routes
│   ├── components/                  # 共享组件
│   │   ├── ui/                     # shadcn/ui 基础组件
│   │   ├── Navbar.tsx              # 全局导航栏
│   │   └── Sidebar.tsx             # 侧边栏导航
│   └── lib/                        # 工具库
│       ├── api.ts                  # Axios HTTP 客户端封装
│       ├── websocket.ts            # STOMP WebSocket 管理
│       └── utils.ts                # 通用工具函数
│
├── java-server/                     # Spring Boot 后端服务
│   └── src/main/java/com/sora/animecreator/
│       ├── controller/             # 23+ REST 控制器
│       ├── service/                # 40+ 业务服务
│       ├── entity/                 # 数据实体
│       ├── mapper/                 # MyBatis 数据映射
│       ├── config/                 # 安全/WebSocket/OSS 配置
│       └── websocket/              # STOMP 消息处理
│
├── admin/                           # 管理后台 (独立部署)
│   ├── web/                        # Vue 3 管理前端
│   └── server/                     # Spring Boot 管理后端
│
├── db/                              # SQL 迁移脚本 (40+ 版本)
├── docker-compose.yml               # 容器编排配置
└── docs/                            # 项目文档
```

---

## 🚀 快速部署

### 环境要求

| 依赖 | 版本 | 说明 |
|------|------|------|
| Java | 17+ | 后端运行时 |
| Node.js | 20+ | 前端构建 |
| MySQL | 8.0+ | 数据存储 |
| Docker | 20+ | 容器化部署 (可选) |

### 方式一：Docker Compose 一键部署

```bash
git clone https://github.com/yourusername/animahub.git
cd animahub

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入数据库、OSS、AI API 等配置

# 启动服务
docker-compose up -d
```

服务启动后：
- 前端：`http://localhost:3105`
- 后端 API：`http://localhost:3005`

### 方式二：本地开发

```bash
# 1. 克隆项目
git clone https://github.com/yourusername/animahub.git
cd animahub

# 2. 初始化数据库
mysql -u root -p < db/init.sql

# 3. 启动后端 (java-server/)
cd java-server
mvn spring-boot:run

# 4. 启动前端 (新终端)
cd client
npm install
npm run dev
```

---

## 📡 API 概览

### 认证模块
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | 用户注册 (邮箱验证) |
| POST | `/api/auth/login` | 用户登录，返回 JWT |

### AI 生成模块
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/ai/image/generate` | AI 图像生成 (多模型) |
| POST | `/api/ai/video/generate` | AI 视频生成 |
| GET  | `/api/ai/task/{taskId}` | 查询生成任务状态 |
| POST | `/api/ai/prompt/optimize` | 提示词智能优化 |

### 项目与素材
| 方法 | 路径 | 说明 |
|------|------|------|
| CRUD | `/api/projects/**` | 动画项目管理 |
| CRUD | `/api/assets/**` | 素材资产管理 |
| CRUD | `/api/scripts/**` | 剧本管理 |

### 剧本工坊
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/script-workshop/import` | 小说/文本导入 |
| CRUD | `/api/script-workshop/projects/**` | 工坊项目管理 |
| POST | `/api/ai-agent/workflow/start` | 启动 AI Agent 工作流 |
| GET  | `/api/ai-agent/workflow/{id}/status` | 工作流状态查询 |

### WebSocket 订阅
```
STOMP Endpoint: /ws
订阅主题: /topic/ai-agent/workflow/{workflowId}
```

---

## 🔧 AI Agent 工作流引擎

AnimaHub 的核心差异化能力 — 基于 AI Agent 的全自动动画创作管线：

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ 剧本分析  │───▶│ 角色提取  │───▶│ 场景规划  │───▶│ 分镜生成  │
│ Script    │    │ Character │    │ Scene    │    │Storyboard│
│ Analysis  │    │ Extract   │    │ Planning │    │ Generate │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
                                                       │
                    ┌──────────────────────────────────┘
                    ▼
              ┌──────────┐    ┌──────────┐    ┌──────────┐
              │ 图像生成  │───▶│ 视频合成  │───▶│ 成片输出  │
              │ Image    │    │ Video    │    │ Final    │
              │ Generate │    │ Compose  │    │ Export   │
              └──────────┘    └──────────┘    └──────────┘
```

- 每个节点可独立配置 AI 模型、参数与提示词模板
- 支持工作流预设 — 保存常用配置，一键复用
- 全程 WebSocket 实时状态推送
- 失败节点支持单独重试，无需重跑整条流水线

---

## 🤝 参与贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'feat: add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 发起 Pull Request

---

## 📄 开源协议

本项目基于 [MIT License](LICENSE) 开源。

---

<div align="center">

**🌟 如果这个项目对你有帮助，请点个 Star 支持一下！**

**[🌐 在线体验](https://anima.cutb.cn/)** · **[🐛 反馈问题](../../issues)** · **[💡 功能建议](../../issues)**

Made with ❤️ by AnimaHub Team

</div>
