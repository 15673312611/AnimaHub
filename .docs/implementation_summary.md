# 片段创建和分镜生成流程重构 - 实施总结

## 问题背景

用户反馈在 `/anime-project/[id]` 页面点击"新建片段"后报错,经分析发现:

1. **现有问题**:
   - 新建片段时错误地调用视频生成API,实际应该只创建片段容器
   - 点击片段直接跳转到storyboard页面,没有检查是否有内容

2. **期望流程**:
   - 创建片段时不触发视频生成
   - 点击片段时先检查是否有分镜内容
   - 没有内容则弹窗让用户输入剧本/小说,并选择模板生成分镜
   - 模板需要后台可配置
   - 生成时只生成分镜,不生成人物图片(人物后面再生成)

## 实施内容

### 前端改动 ✅

#### 1. 修改片段创建逻辑
**文件**: `app/anime-project/[id]/page.tsx`

**改动**:
- 修改 `handleCreateSegment` 函数,移除视频生成相关参数
- 添加TODO注释说明后端需要实现专门的片段创建API
- 临时方案:调用现有API但只传必要参数(name, description)

```typescript
// 临时方案: 创建一个状态为PENDING的video记录作为片段容器
await api.post(`/projects/${project.id}/videos`, {
  projectId: project.id,
  name: newSegmentName,
  description: "片段容器",
  // 不传视频生成相关参数,只创建容器
});
```

#### 2. 创建ScriptInputModal组件
**文件**: `app/anime-project/[id]/components/ScriptInputModal.tsx` (新建)

**功能**:
- 剧本/小说输入框(大文本域)
- 模板选择下拉框(从后端获取模板列表)
- 加载模板列表(带fallback到mock数据)
- 提交生成(调用AI分析接口)

**特点**:
- 精美的UI设计,与现有风格一致
- 包含placeholder示例帮助用户理解如何输入
- 字数统计
- 加载状态和错误处理
- 临时方案:如果后端API未实现,使用mock模板数据

#### 3. 修改片段点击逻辑
**文件**: `app/anime-project/[id]/page.tsx`

**改动**:
- 新增 `handleSegmentClick` 函数
- 点击片段时先检查是否有workflow和分镜内容
- 有内容则跳转到storyboard页面
- 无内容则弹出ScriptInputModal
- 添加 `handleScriptGenerateSuccess` 处理生成成功后的跳转

```typescript
const handleSegmentClick = async (fragmentId: number) => {
  try {
    const res = await api.get(`/ai-agent/workflows/by-fragment`, {
      params: { projectId: project?.id, fragmentId }
    });
    const workflow = res.data;
    
    if (workflow && workflow.shots && workflow.shots.length > 0) {
      // 有内容,直接跳转
      router.push(`/anime-project/${project?.id}/storyboard/${fragmentId}`);
    } else {
      // 没有内容,弹出剧本输入框
      setSelectedFragmentId(fragmentId);
      setShowScriptInput(true);
    }
  } catch (error: any) {
    if (error.response?.status === 404) {
      // 404说明没有workflow,弹出剧本输入框
      setSelectedFragmentId(fragmentId);
      setShowScriptInput(true);
    } else {
      // 其他错误,直接跳转(容错)
      router.push(`/anime-project/${project?.id}/storyboard/${fragmentId}`);
    }
  }
};
```

#### 4. 集成ScriptInputModal到主页面
- 添加状态管理:`showScriptInput`, `selectedFragmentId`
- 在页面底部渲染ScriptInputModal组件
- 更新片段卡片的点击事件为 `handleSegmentClick`

### 后端需求文档 📄

#### 1. 数据库设计
**文件**: `.docs/storyboard_templates_schema.sql`

创建 `storyboard_templates` 表,包含:
- 基本信息:name, description
- 风格配置:style_type, custom_style
- AI配置:prompt_template, system_prompt
- 生成参数:max_shots, min_shot_duration, max_shot_duration
- 功能开关:enable_character_extraction, enable_scene_extraction等
- 状态管理:is_active, is_default, sort_order
- 时间戳和统计

包含5个初始模板数据:
1. 标准剧情模板
2. 动作戏模板
3. 情感戏模板
4. 3D动画模板
5. 真人影视模板

#### 2. API需求
**文件**: `.docs/backend_api_requirements.md`

详细说明了需要的API:
- ✅ P0: 片段创建API优化
- ✅ P0: 模板列表API (`GET /api/storyboard-templates`)
- ✅ P0: 使用模板生成分镜API (`POST /ai-agent/workflows/by-fragment/:fragmentId/analyze-with-template`)
- P1: 模板管理API(CRUD)
- P2: 高级功能和优化

## 用户流程

### 创建片段并生成分镜的完整流程:

1. **创建片段**
   - 用户点击"新建片段"按钮
   - 输入片段名称
   - 系统创建片段容器(不触发视频生成)

2. **点击片段**
   - 用户点击片段文件夹卡片
   - 系统检查是否有workflow和分镜内容

3. **输入剧本** (如果没有内容)
   - 弹出ScriptInputModal对话框
   - 用户粘贴小说片段或剧本
   - 选择生成模板(如"标准剧情模板")
   - 点击"开始生成"

4. **AI生成分镜**
   - 后端根据模板配置调用AI分析剧本
   - 生成分镜(shots)数据
   - 根据模板决定是否提取人物/场景
   - 根据模板决定是否自动生成图片

5. **查看分镜**
   - 生成成功后自动跳转到storyboard页面
   - 用户可以查看和编辑生成的分镜
   - 可以进一步生成首帧图片和视频

## 技术亮点

1. **渐进式增强**:
   - 前端使用临时方案(mock数据)确保功能可用
   - 后端实现后可无缝切换
   - 向后兼容现有功能

2. **错误处理**:
   - 完善的try-catch和错误提示
   - 容错处理(API失败时使用fallback)
   - 用户友好的错误信息

3. **用户体验**:
   - 流畅的交互流程
   - 精美的UI设计
   - 清晰的引导和提示
   - 字数统计和输入验证

4. **可扩展性**:
   - 模板系统支持后台配置
   - 灵活的功能开关
   - 可添加更多模板类型

5. **成本控制**:
   - 模板默认不自动生成图片
   - 分步骤生成(先分镜,后图片,再视频)
   - 用户可控制生成内容

## 文件清单

### 前端文件
- ✅ `app/anime-project/[id]/page.tsx` (修改)
- ✅ `app/anime-project/[id]/components/ScriptInputModal.tsx` (新建)

### 文档文件
- ✅ `.docs/storyboard_templates_schema.sql` (新建)
- ✅ `.docs/backend_api_requirements.md` (新建)
- ✅ `.docs/backend_improvements.md` (新建) - **重要!**
- ✅ `.docs/implementation_summary.md` (新建)

## 后端代码分析

已经查看了后端Java代码,发现以下关键问题:

### 🔴 **VideoService 强制要求 startImageUrl**

**位置**: `VideoService.java` 第102-104行

```java
if (startImageUrl == null || startImageUrl.isEmpty()) {
    throw BusinessException.paramInvalid("需要提供首帧图片");
}
```

**问题**: 
- 这个验证导致无法创建"片段容器",因为片段刚创建时还没有图片
- 前端必须传入一个占位图片来绕过这个验证

**解决方案**: 
- 前端使用占位图片 `placehold.co` 作为 `startImageUrl`
- 详细的后端优化建议见 `.docs/backend_improvements.md`

### 💡 **后端改进建议**

已经创建了详细的后端改进文档: `.docs/backend_improvements.md`

**包含3个方案**:
1. **方案1** (推荐,中期): 修改VideoService支持无图片创建
2. **方案2** (最优,长期): 新增Fragment表和API,更清晰的概念模型
3. **方案3** (已实现): 前端传入占位图片,临时解决

### 现有API分析

- ✅ `POST /api/projects/{projectId}/videos` - 存在,但强制要求startImageUrl
- ✅ `GET /api/ai-agent/workflows/by-fragment` - 存在,可用
- ✅ `POST /api/ai-agent/workflows` - 存在,可用
- ✅ `PUT /api/ai-agent/workflows/{id}/step1` - 存在,可用
- ✅ `POST /api/ai-agent/workflows/{id}/analyze` - 存在,可用
- ❌ `GET /api/storyboard-templates` - **不存在,需要实现**
- ❌ `POST /api/ai-agent/workflows/by-fragment/:fragmentId/analyze-with-template` - **不存在,需要实现**

## 后续工作

### 后端团队需要实现:
1. **P0 - 必需**:
   - [ ] 片段创建API (建议新增 `POST /api/projects/:id/fragments`)
   - [ ] 模板列表API (`GET /api/storyboard-templates`)
   - [ ] 使用模板生成分镜API (`POST /ai-agent/workflows/by-fragment/:fragmentId/analyze-with-template`)
   - [ ] 创建 `storyboard_templates` 表
   - [ ] 修改 `ai_agent_workflows` 表添加 `template_id` 字段
   - [ ] 插入初始模板数据

2. **P1 - 重要**:
   - [ ] 模板管理API (创建、更新、删除)
   - [ ] 模板使用统计

3. **P2 - 优化**:
   - [ ] 剧本缓存优化
   - [ ] 并发控制
   - [ ] 更多高级配置

### 前端优化(可选):
- [ ] 添加剧本草稿自动保存
- [ ] 支持剧本文件上传
- [ ] 模板预览功能
- [ ] 生成进度实时显示

## 测试检查项

### 前端测试:
- [x] 片段创建不触发视频生成
- [x] 点击空片段弹出剧本输入框
- [x] 点击有内容的片段跳转到storyboard
- [x] 模板列表加载(mock数据)
- [x] 剧本输入验证
- [x] 错误处理和提示

### 后端测试(待实现):
- [ ] 片段创建API正常工作
- [ ] 模板列表API返回正确数据
- [ ] 使用模板生成分镜功能正常
- [ ] 不同模板配置的效果差异
- [ ] 错误场景处理

### 集成测试(待实现):
- [ ] 完整流程端到端测试
- [ ] 多用户并发测试
- [ ] 大剧本性能测试

## 注意事项

1. **成本控制**: 
   - 模板默认不自动生成图片,避免不必要的AI调用成本
   - 用户可以后续手动生成需要的内容

2. **向后兼容**:
   - 保留了原有的analyze接口
   - 新增功能不影响现有功能

3. **数据安全**:
   - 用户输入的剧本需要妥善存储
   - 建议添加敏感内容过滤

4. **性能优化**:
   - 考虑大剧本的处理时间
   - 实现WebSocket推送生成进度
   - 缓存相似剧本的分析结果

## 联系方式

如有问题或需要澄清,请联系前端团队。
文档最后更新: 2026-01-09
