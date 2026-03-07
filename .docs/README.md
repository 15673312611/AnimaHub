# 片段创建和分镜生成流程重构

## 📋 快速导航

- **实施总结**: [`implementation_summary.md`](./implementation_summary.md) - 完整的实施说明
- **后端API需求**: [`backend_api_requirements.md`](./backend_api_requirements.md) - 需要的API变更
- **后端改进建议**: [`backend_improvements.md`](./backend_improvements.md) - ⭐ **重要!必读!**
- **数据库设计**: [`storyboard_templates_schema.sql`](./storyboard_templates_schema.sql) - 模板表结构

## ✅ 已完成的工作

### 前端改动
1. ✅ 修改片段创建逻辑 (`app/anime-project/[id]/page.tsx`)
   - 使用占位图片作为 `startImageUrl`
   - 绕过后端的 startImageUrl 验证

2. ✅ 创建ScriptInputModal组件 (`app/anime-project/[id]/components/ScriptInputModal.tsx`)
   - 剧本/小说输入界面
   - 模板选择功能
   - 支持后端API或mock数据

3. ✅ 修改片段点击逻辑 (`app/anime-project/[id]/page.tsx`)
   - 检查是否有workflow和分镜内容
   - 有内容跳转,无内容弹窗

### 文档
1. ✅ 实施总结文档
2. ✅ API需求文档
3. ✅ 后端改进建议 - **包含3个方案**
4. ✅ 数据库表设计

## 🔴 发现的关键问题

### VideoService 强制要求 startImageUrl

**位置**: `java-server/src/main/java/com/sora/animecreator/service/VideoService.java:102-104`

```java
if (startImageUrl == null || startImageUrl.isEmpty()) {
    throw BusinessException.paramInvalid("需要提供首帧图片");
}
```

**影响**: 
- 无法创建空的片段容器
- 前端必须传入占位图片

**临时解决**: 
- 前端传入 `https://placehold.co/1920x1080/1a1a1a/666666/png?text=Fragment+Placeholder`

**永久解决**: 
- 见 [`backend_improvements.md`](./backend_improvements.md) 中的方案1或方案2

## 📝 后端需要实现的API

### P0 (必需,紧急)

1. **修改VideoService** (最优先!)
   - 支持不传 `startImageUrl` 时只创建容器
   - 详见 `backend_improvements.md` 方案1

2. **模板管理**
   ```
   GET  /api/storyboard-templates
   POST /api/storyboard-templates
   PUT  /api/storyboard-templates/:id
   ```

3. **使用模板生成分镜**
   ```
   POST /ai-agent/workflows/by-fragment/:fragmentId/analyze-with-template
   Body: { scriptContent, templateId }
   ```

### P1 (重要)

4. **Fragment表和API** (长期方案)
   - 新建 `fragments` 表
   - 实现 FragmentController
   - 详见 `backend_improvements.md` 方案2

## 🎯 当前状态

### 前端
- ✅ 已完成所有改动
- ✅ 可以立即使用(使用占位图片方案)
- ✅ 支持mock数据作为fallback

### 后端  
- ⚠️ VideoService需要修改
- ❌ 模板API未实现
- ❌ Fragment表未创建

## 🚀 使用方式

### 1. 创建片段
```typescript
// 用户点击"新建片段"
// 前端会调用: POST /api/projects/:id/videos
// 传入: { name, description, startImageUrl: "占位图片" }
```

### 2. 点击片段
```typescript
// 前端会先检查: GET /ai-agent/workflows/by-fragment?fragmentId=xxx
// 如果有内容 -> 跳转到storyboard
// 如果无内容 -> 弹出ScriptInputModal
```

### 3. 输入剧本
```typescript
// 用户在弹窗中输入剧本并选择模板
// 前端调用: POST /ai-agent/workflows/:id/analyze
// (目前使用现有API,未来使用analyze-with-template)
```

## 📚 详细文档

### 后端改进建议 (必读!)

查看 [`backend_improvements.md`](./backend_improvements.md) 了解:
- 问题分析
- 3个改进方案对比
- 实施步骤
- 测试方法
- 数据迁移指南

### API需求文档

查看 [`backend_api_requirements.md`](./backend_api_requirements.md) 了解:
- 需要的API接口定义
- 请求/响应格式
- 错误处理
- 优先级划分

### 数据库设计

查看 [`storyboard_templates_schema.sql`](./storyboard_templates_schema.sql) 了解:
- 模板表结构
- 初始数据
- 字段说明
- 索引设计

## ⏭️ 下一步

### 后端团队 (优先级排序)

1. **立即 (今天)**: 
   - 阅读 `backend_improvements.md`
   - 确认改进方案(推荐方案1)

2. **本周内**:
   - 实施方案1: 修改VideoService
   - 实现模板API
   - 测试完整流程

3. **2-4周内**:
   - 考虑实施方案2: Fragment表
   - 数据迁移
   - 更新文档

### 前端团队

1. **当前**: 
   - 监控是否有异常
   - 收集用户反馈

2. **后端完成后**:
   - 移除占位图片方案
   - 切换到正式API
   - 更新文档

## 🐛 已知问题

1. ⚠️ 占位图片可能对用户可见
2. ⚠️ 可能触发不必要的视频生成任务
3. ℹ️ 模板目前使用mock数据

## 📞 联系方式

- 前端问题: 联系前端团队
- 后端问题: 联系后端团队
- 设计问题: 查看相关文档

## 📅 更新日志

- **2026-01-09**: 
  - ✅ 完成前端实现
  - ✅ 分析后端代码
  - ✅ 创建改进建议
  - ✅ 编写完整文档
