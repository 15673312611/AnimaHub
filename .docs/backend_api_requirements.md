# 后端API需求文档

## 概述
本文档描述了片段创建和分镜生成流程重构所需的后端API变更。

## 需要的API变更

### 1. 片段创建API优化

**当前问题**: 
- `POST /projects/:id/videos` 会创建视频生成任务
- 我们只需要创建片段容器,不需要触发视频生成

**建议方案**:

#### 方案A: 修改现有API
修改 `POST /projects/:id/videos`,当请求body中没有传入视频生成相关参数时,只创建容器:

```typescript
// 如果没有传入 startImageUrl, generationModel, duration 等参数
// 则只创建一个PENDING状态的记录,不触发任何生成任务
POST /projects/:id/videos
Body: {
  name: string,
  description?: string
}
```

#### 方案B: 新增专门的片段API (推荐)
新增专门的片段管理API:

```typescript
POST /api/projects/:id/fragments
Body: {
  name: string,
  description?: string
}
Response: {
  id: number,
  projectId: number,
  name: string,
  description: string,
  createdAt: string
}
```

---

### 2. 分镜模板管理API (新增)

#### 2.1 获取模板列表
```typescript
GET /api/storyboard-templates
Query: {
  isActive?: boolean  // 可选,过滤启用状态
}
Response: {
  templates: [
    {
      id: number,
      name: string,
      description: string,
      styleType: string,  // '2d_anime' | '3d_anime' | 'realistic' | 'custom'
      maxShots: number,
      sortOrder: number,
      isDefault: boolean
    }
  ]
}
```

#### 2.2 获取模板详情
```typescript
GET /api/storyboard-templates/:id
Response: {
  id: number,
  name: string,
  description: string,
  styleType: string,
  customStyle: string | null,
  promptTemplate: string,
  systemPrompt: string,
  maxShots: number,
  enableCharacterExtraction: boolean,
  enableSceneExtraction: boolean,
  enableItemExtraction: boolean,
  autoGenerateCharacterImages: boolean,
  autoGenerateSceneImages: boolean,
  shotSplitRules: object,
  // ... 其他字段
}
```

#### 2.3 创建模板 (管理员)
```typescript
POST /api/storyboard-templates
Headers: { Authorization: "Bearer {admin_token}" }
Body: {
  name: string,
  description: string,
  styleType: string,
  maxShots: number,
  // ... 其他配置
}
```

#### 2.4 更新模板 (管理员)
```typescript
PUT /api/storyboard-templates/:id
Headers: { Authorization: "Bearer {admin_token}" }
Body: {
  // 同创建接口
}
```

#### 2.5 删除模板 (管理员)
```typescript
DELETE /api/storyboard-templates/:id
Headers: { Authorization: "Bearer {admin_token}" }
```

---

### 3. 使用模板生成分镜API (核心功能)

#### 3.1 检查workflow和分镜内容
```typescript
// 这个API已存在,但前端需要用它来判断片段是否有内容
GET /ai-agent/workflows/by-fragment
Query: {
  projectId: number,
  fragmentId: number
}
Response: {
  id: number,
  shots: Array<Shot>,
  // ... 其他workflow数据
}
// 如果不存在返回404
```

#### 3.2 使用模板生成分镜 (新增)
```typescript
POST /ai-agent/workflows/by-fragment/:fragmentId/analyze-with-template

Body: {
  scriptContent: string,  // 用户输入的剧本内容
  templateId: number      // 选择的模板ID
}

功能说明:
1. 如果fragmentId对应的workflow不存在,先创建
2. 根据templateId加载模板配置
3. 将scriptContent保存到workflow.scriptContent
4. 根据模板配置调用AI分析:
   - 使用template.promptTemplate和template.systemPrompt
   - 限制生成的分镜数量为template.maxShots
   - 根据template.enableCharacterExtraction决定是否提取人物
   - 根据template.enableSceneExtraction决定是否提取场景
   - 根据template.enableItemExtraction决定是否提取物品
5. 生成分镜(shots)数据
6. 根据template.autoGenerateCharacterImages决定是否自动生成人物图片
7. 根据template.autoGenerateSceneImages决定是否自动生成场景图片
8. 返回workflow数据

Response: {
  id: number,
  scriptContent: string,
  templateId: number,
  aiAnalysisStatus: "ANALYZING" | "COMPLETED" | "FAILED",
  shots: Array<Shot>,
  characters: Array<Character>,  // 可能为空(如果模板禁用)
  scenes: Array<Scene>,          // 可能为空(如果模板禁用)
  // ... 其他workflow数据
}

错误处理:
- 如果templateId不存在或未启用: 400 Bad Request
- 如果scriptContent为空: 400 Bad Request
- 如果AI分析失败: 返回workflow但status为FAILED,并在error字段返回错误信息
```

---

## 数据库变更

### 1. 新建 storyboard_templates 表
详见 `storyboard_templates_schema.sql` 文件

### 2. 修改 ai_agent_workflows 表
```sql
ALTER TABLE ai_agent_workflows 
ADD COLUMN template_id INT COMMENT '使用的模板ID',
ADD CONSTRAINT fk_template FOREIGN KEY (template_id) 
  REFERENCES storyboard_templates(id) ON DELETE SET NULL;
```

---

## 前端集成说明

### 已完成的前端改动:
1. ✅ 修改片段创建逻辑,移除视频生成参数
2. ✅ 创建 `ScriptInputModal` 组件(剧本输入+模板选择)
3. ✅ 修改片段点击逻辑,检查内容并决定跳转或弹窗

### 前端当前使用的临时方案:
- 模板API: 如果后端未实现,使用mock数据
- 分镜生成: 使用现有的 `POST /ai-agent/workflows/:id/analyze` 接口

### 完整集成后的流程:
1. 用户点击"新建片段" -> 调用片段创建API
2. 用户点击片段 -> 检查是否有workflow和分镜
3. 如果没有内容 -> 弹出ScriptInputModal
4. 用户输入剧本并选择模板 -> 调用使用模板生成分镜API
5. 生成成功 -> 跳转到storyboard页面

---

## 实施优先级

### P0 (必需,否则功能无法正常工作):
1. ✅ 片段创建API优化 (方案A或B)
2. ✅ 模板列表API (`GET /api/storyboard-templates`)
3. ✅ 使用模板生成分镜API (`POST /ai-agent/workflows/by-fragment/:fragmentId/analyze-with-template`)

### P1 (重要,影响完整功能):
4. 模板管理API (创建、更新、删除) - 用于管理员后台
5. 数据库表创建和数据初始化

### P2 (优化,可以后续迭代):
6. 模板使用统计
7. 更多高级配置选项

---

## 测试建议

### 单元测试:
- 模板CRUD操作
- workflow创建和模板关联
- AI分析在不同模板配置下的行为

### 集成测试:
- 完整的用户流程:创建片段 -> 输入剧本 -> 选择模板 -> 生成分镜 -> 查看结果
- 错误处理:无效模板ID、空剧本、AI分析失败等

### 性能测试:
- 大量分镜生成的性能
- 并发请求处理

---

## 注意事项

1. **成本控制**: 
   - 模板的 `autoGenerateCharacterImages` 和 `autoGenerateSceneImages` 默认应该为false
   - 自动生成图片会增加AI调用成本

2. **AI调用优化**:
   - 考虑缓存相似剧本的分析结果
   - 实现重试机制处理AI服务不稳定

3. **并发控制**:
   - 防止用户重复提交同一个剧本生成请求

4. **日志记录**:
   - 记录每次模板使用,用于分析和优化
   - 记录AI分析失败的原因

5. 向后兼容:
   - 已有的 `POST /ai-agent/workflows/:id/analyze` 接口需要继续支持
   - 新增的templateId字段应该是可选的

---

## 用户自定义模板功能 (2026-02 新增)

### 概述
扩展现有的 `user_inference_templates` 表，支持三种类别的用户自定义模板：
- `VIDEO_INFERENCE` - 视频提示词推理
- `FIRST_FRAME_INFERENCE` - 首帧提示词推理
- `STORYBOARD` - 分镜生成（新增）

### 1. 用户模板 API（已有，需支持新类别）

#### 1.1 获取用户模板列表
```typescript
GET /api/ai-agent/user-inference-templates
Query: {
  category?: 'VIDEO_INFERENCE' | 'FIRST_FRAME_INFERENCE' | 'STORYBOARD'
}
Response: [
  {
    id: number,
    templateName: string,
    description: string | null,
    systemPrompt: string,
    category: string,
    createdAt: string,
    updatedAt: string
  }
]
```

#### 1.2 创建用户模板
```typescript
POST /api/ai-agent/user-inference-templates
Body: {
  templateName: string,
  description?: string,
  systemPrompt: string,
  category: 'VIDEO_INFERENCE' | 'FIRST_FRAME_INFERENCE' | 'STORYBOARD'
}
```

#### 1.3 更新用户模板
```typescript
PUT /api/ai-agent/user-inference-templates/:id
Body: {
  templateName: string,
  description?: string,
  systemPrompt: string,
  category: 'VIDEO_INFERENCE' | 'FIRST_FRAME_INFERENCE' | 'STORYBOARD'
}
```

#### 1.4 删除用户模板
```typescript
DELETE /api/ai-agent/user-inference-templates/:id
```

### 2. Admin 用户模板管理 API（新增）

#### 2.1 获取所有用户的模板列表
```typescript
GET /api/admin/user-templates
Headers: { Authorization: "Bearer {admin_token}" }
Query: {
  category?: 'VIDEO_INFERENCE' | 'FIRST_FRAME_INFERENCE' | 'STORYBOARD',
  userId?: number,
  page?: number,
  pageSize?: number
}
Response: [
  {
    id: number,
    userId: number,
    username: string,  // 关联用户名
    templateName: string,
    description: string | null,
    systemPrompt: string,
    category: string,
    createdAt: string,
    updatedAt: string
  }
]
```

权限说明：仅 `role=ADMIN` 的用户可以访问此接口。

### 3. 分镜生成支持用户模板

#### 3.1 修改 analyze-shots-stream 接口
```typescript
POST /api/ai-agent/workflows/:id/analyze-shots-stream
Body: {
  // 二选一：
  templateCode?: string,      // 系统模板 code
  userTemplateId?: string     // 用户自定义模板 ID
}
```

逻辑说明：
- 如果传入 `templateCode`，使用系统模板
- 如果传入 `userTemplateId`，查询用户模板表，使用 `systemPrompt` 字段作为提示词
- 用户模板的 `systemPrompt` 中必须包含 `{scriptContent}` 变量，后端在调用 AI 时替换为实际剧本内容

### 4. 前端参数校验规则

#### 4.1 必需参数（错误级别）
分镜模板的 `systemPrompt` 必须包含：
- `{scriptContent}` - 剧本内容变量（必需，缺少则拒绝保存）

#### 4.2 JSON 输出格式校验（警告级别）
前端会检查提示词是否：
- 包含 "JSON" 关键词（建议明确要求输出 JSON 格式）
- 提及必需的输出字段：
  - `description` - 画面描述
  - `dialogue` - 对话/台词
  - `duration` - 时长

如果缺少这些内容，前端会显示警告，用户可以选择继续保存或返回修改。

#### 4.3 分镜 JSON 结构
后端解析分镜时期望的 JSON 结构：
```json
[
  {
    "description": "画面描述",
    "dialogue": "对话或旁白，无则为空字符串",
    "duration": 5,
    "cameraMovement": "镜头运动描述（可选）"
  }
]
```

### 5. 数据库表结构参考

`user_inference_templates` 表已存在，确保 category 字段支持 `STORYBOARD` 值：

```sql
-- 确保 category 字段可以存储 'STORYBOARD' 值
-- 如果使用柚举类型，需要添加新值
ALTER TABLE user_inference_templates 
MODIFY COLUMN category ENUM('VIDEO_INFERENCE', 'FIRST_FRAME_INFERENCE', 'STORYBOARD') NOT NULL;
```

---

## 剧本工坊批量导入 API（新增）

### 背景
当前剧本工坊的「批量导入全部」功能实现存在严重性能问题：
- 每个分集需要调用 3 个 API（创建片段、创建工作流、创建镜头）
- 每个镜头需要调用 2 个 API（创建 + 更新详情）
- 所有请求串行执行

**问题**：假设 10 集，每集 20 个镜头，需要发起 `10 * (1 + 1 + 20 * 2) = 430` 次请求！

### 6. 批量导入分镜 API（新增）

#### 6.1 批量导入分镜到项目
```typescript
POST /api/script-workshop/batch-import
Body: {
  projectId: number,           // 目标项目ID
  source: {
    swProjectId: string,       // 剧本工坊项目ID
    swProjectTitle: string     // 剧本工坊项目标题（用于描述）
  },
  episodes: [
    {
      index: number,           // 集数索引
      title: string,           // 集标题
      shots: [
        {
          index: number,
          action: string,          // 动作/画面描述
          dialogue: string,        // 对话
          durationSec: number,     // 时长（秒）
          videoPrompt?: string,    // 视频提示词
          firstFramePrompt?: string,
          lastFramePrompt?: string
        }
      ]
    }
  ]
}

Response: {
  success: boolean,
  results: [
    {
      episodeIndex: number,
      fragmentId: number,
      workflowId: number,
      shotCount: number,
      status: "SUCCESS" | "FAILED",
      error?: string
    }
  ]
}
```

后端处理逻辑：
1. 遍历 `episodes` 数组
2. 对每个 episode：
   - 创建 Fragment（`POST /projects/:id/videos`）
   - 创建 Workflow（`POST /ai-agent/workflows`）
   - **批量**创建 Shots（使用事务，一次性插入所有镜头）
3. 返回所有结果

#### 6.2 修改现有创建镜头 API（支持完整字段）
当前 `POST /api/ai-agent/workflows/:workflowId/shots` 只接收 `description` 和 `duration`，导致必须再调用 `PUT /shots/:id/details`。

**建议修改**：让创建接口直接支持所有字段：
```typescript
POST /api/ai-agent/workflows/:workflowId/shots
Body: {
  description?: string,
  dialogue?: string,           // 新增
  duration?: number,
  userVideoPrompt?: string,    // 新增
  userFirstFramePrompt?: string, // 新增  
  lastFramePrompt?: string,    // 新增
  // 原有字段...
  afterSortOrder?: number,
  shotMode?: string,
  firstFrameUrl?: string,
  endFrameUrl?: string
}
```
这样创建时就能一次性传入所有数据，无需再调用 details 接口。

#### 6.3 批量创建镜头 API（新增，推荐）
```typescript
POST /api/ai-agent/workflows/:workflowId/batch-create-shots
Body: {
  shots: [
    {
      description: string,
      dialogue?: string,
      duration?: number,
      userVideoPrompt?: string,
      userFirstFramePrompt?: string,
      lastFramePrompt?: string
    }
  ]
}

Response: {
  success: boolean,
  shots: [
    {
      id: number,
      sortOrder: number
    }
  ]
}
```
后端使用事务批量插入，性能更优。

### 性能对比
| 场景 | 当前实现 | 优化后 |
|------|---------|--------|
| 10集×20镜头 | 430 次请求 | 1 次请求 |
| 请求时间（估计） | 30-60秒 | 1-3秒 |

### 前端调用示例
```typescript
// 优化后的前端代码
const handleImport = async (targetProjectId: number) => {
  const episodesToImport = episodes
    .filter(ep => {
      const draft = swProject?.episodeDrafts?.[ep.index];
      return draft?.shots?.length > 0;
    })
    .map(ep => ({
      index: ep.index,
      title: ep.title,
      shots: swProject!.episodeDrafts![ep.index].shots
    }));

  const res = await api.post('/script-workshop/batch-import', {
    projectId: targetProjectId,
    source: {
      swProjectId: swProject!.id,
      swProjectTitle: swProject!.title
    },
    episodes: episodesToImport
  });

  // 处理结果...
};
```
