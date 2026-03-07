# 后端优化建议

## 问题分析

在实际查看后端代码后,发现了以下问题:

### 1. VideoService 强制要求 startImageUrl

**位置**: `VideoService.java` 第102-104行

```java
if (startImageUrl == null || startImageUrl.isEmpty()) {
    throw BusinessException.paramInvalid("需要提供首帧图片");
}
```

**问题**: 
- 这个验证导致无法创建"片段容器",因为片段刚创建时还没有图片
- 前端必须传入一个占位图片来绕过这个验证

**影响**:
- 用户体验不佳(会看到占位图片)
- 浪费一次API调用
- 可能触发不必要的视频生成任务

### 2. 缺少专门的片段/Fragment管理

**现状**:
- 使用 `GeneratedVideo` 表来存储片段
- `GeneratedVideo` 设计用于存储生成的视频,不适合作为片段容器

**问题**:
- 概念混淆:片段(Fragment)和生成的视频(GeneratedVideo)是不同的概念
- 片段应该是一个容器,可以包含多个视频版本
- 当前的parentId机制不够清晰

## 建议的改进方案

### 方案1: 修改 VideoService 支持无图片创建

#### 改动点1: VideoService.createVideo

```java
// 修改前:
if (startImageUrl == null || startImageUrl.isEmpty()) {
    throw BusinessException.paramInvalid("需要提供首帧图片");
}

// 修改后:
// 允许不提供startImageUrl,这种情况下只创建记录,不触发生成
boolean shouldGenerate = (startImageUrl != null && !startImageUrl.isEmpty());

if (!shouldGenerate) {
    // 创建 PENDING 状态的记录,等待后续补充图片
    log.info("📝 创建片段容器,暂不生成视频");
    GeneratedVideo video = new GeneratedVideo();
    video.setProjectId(projectId);
    video.setName(name);
    video.setDescription(description);
    video.setGenerationModel(generationModel);
    video.setDuration(duration);
    video.setAspectRatio(ratio);
    video.setParentId(parentId);
    video.setStatus("PENDING"); // 关键:设置为PENDING状态
    video.setProgress(0);
    generatedVideoMapper.insert(video);
    return video;
}

// 后续是原有的生成逻辑...
```

#### 改动点2: ProjectController

在 `POST /api/projects/{projectId}/videos` 中不需要改动,但文档需要说明:
- 如果只传 `name` 和 `description`,不传 `startImageUrl`,则只创建容器
- 如果传了 `startImageUrl`,则触发视频生成

### 方案2: 新增 Fragment 相关表和API (更彻底,推荐)

#### 2.1 新建 fragments 表

```sql
CREATE TABLE fragments (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  project_id BIGINT NOT NULL COMMENT '项目ID',
  name VARCHAR(255) NOT NULL COMMENT '片段名称',
  description TEXT COMMENT '片段描述',
  order_index INT DEFAULT 0 COMMENT '排序序号',
  status VARCHAR(50) DEFAULT 'DRAFT' COMMENT '状态: DRAFT, IN_PROGRESS, COMPLETED',
  workflow_id BIGINT COMMENT '关联的AI工作流ID',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_project (project_id),
  INDEX idx_workflow (workflow_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (workflow_id) REFERENCES ai_agent_workflows(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='片段表';
```

#### 2.2 修改 generated_videos 表

```sql
-- 添加 fragment_id 字段
ALTER TABLE generated_videos 
ADD COLUMN fragment_id BIGINT COMMENT '所属片段ID',
ADD INDEX idx_fragment (fragment_id),
ADD FOREIGN KEY (fragment_id) REFERENCES fragments(id) ON DELETE CASCADE;
```

#### 2.3 修改 ai_agent_workflows 表

```sql
-- 将 fragment_id 改为关联 fragments 表
ALTER TABLE ai_agent_workflows 
DROP FOREIGN KEY IF EXISTS fk_fragment_video,
ADD FOREIGN KEY (fragment_id) REFERENCES fragments(id) ON DELETE CASCADE;
```

#### 2.4 新增 FragmentController

```java
@RestController
@RequestMapping("/api/projects/{projectId}/fragments")
public class FragmentController {
    
    /**
     * 创建片段
     */
    @PostMapping
    public ResponseEntity<FragmentDTO> createFragment(
            @PathVariable Long projectId,
            @RequestBody Map<String, String> request) {
        String name = request.get("name");
        String description = request.get("description");
        
        Fragment fragment = fragmentService.createFragment(projectId, name, description);
        return ResponseEntity.ok(FragmentDTO.fromEntity(fragment));
    }
    
    /**
     * 获取片段列表
     */
    @GetMapping
    public ResponseEntity<List<FragmentDTO>> getFragments(@PathVariable Long projectId) {
        List<Fragment> fragments = fragmentService.getProjectFragments(projectId);
        return ResponseEntity.ok(fragments.stream()
            .map(FragmentDTO::fromEntity)
            .collect(Collectors.toList()));
    }
    
    /**
     * 获取片段详情(包含关联的workflow和videos)
     */
    @GetMapping("/{fragmentId}")
    public ResponseEntity<FragmentDetailDTO> getFragment(
            @PathVariable Long projectId,
            @PathVariable Long fragmentId) {
        FragmentDetailDTO detail = fragmentService.getFragmentDetail(fragmentId);
        return ResponseEntity.ok(detail);
    }
    
    /**
     * 删除片段
     */
    @DeleteMapping("/{fragmentId}")
    public ResponseEntity<?> deleteFragment(
            @PathVariable Long projectId,
            @PathVariable Long fragmentId) {
        fragmentService.deleteFragment(fragmentId);
        return ResponseEntity.ok(Map.of("message", "删除成功"));
    }
}
```

#### 2.5 FragmentService

```java
@Service
public class FragmentService {
    
    public Fragment createFragment(Long projectId, String name, String description) {
        // 验证项目存在
        Project project = projectMapper.selectById(projectId);
        if (project == null) {
            throw BusinessException.notFound("项目");
        }
        
        // 创建片段
        Fragment fragment = new Fragment();
        fragment.setProjectId(projectId);
        fragment.setName(name);
        fragment.setDescription(description);
        fragment.setStatus("DRAFT");
        
        // 获取当前最大的 order_index
        QueryWrapper<Fragment> wrapper = new QueryWrapper<>();
        wrapper.eq("project_id", projectId).orderByDesc("order_index").last("LIMIT 1");
        Fragment lastFragment = fragmentMapper.selectOne(wrapper);
        int orderIndex = (lastFragment != null) ? lastFragment.getOrderIndex() + 1 : 0;
        fragment.setOrderIndex(orderIndex);
        
        fragmentMapper.insert(fragment);
        return fragment;
    }
    
    public FragmentDetailDTO getFragmentDetail(Long fragmentId) {
        Fragment fragment = fragmentMapper.selectById(fragmentId);
        if (fragment == null) {
            throw BusinessException.notFound("片段");
        }
        
        FragmentDetailDTO dto = new FragmentDetailDTO();
        dto.setId(fragment.getId());
        dto.setName(fragment.getName());
        dto.setDescription(fragment.getDescription());
        dto.setStatus(fragment.getStatus());
        
        // 加载关联的 workflow
        if (fragment.getWorkflowId() != null) {
            AiAgentWorkflow workflow = workflowMapper.selectById(fragment.getWorkflowId());
            if (workflow != null) {
                dto.setWorkflow(AiAgentWorkflowDTO.fromEntity(workflow));
            }
        }
        
        // 加载该片段下的所有视频
        QueryWrapper<GeneratedVideo> videoWrapper = new QueryWrapper<>();
        videoWrapper.eq("fragment_id", fragmentId).orderByDesc("created_at");
        List<GeneratedVideo> videos = videoMapper.selectList(videoWrapper);
        dto.setVideos(videos);
        
        return dto;
    }
}
```

### 方案3: 最小改动方案 (临时方案,已实现)

**前端改动**:
- 创建片段时传入占位图片作为 `startImageUrl`
- 占位图片使用 `placehold.co` 服务生成
- 描述设置为"片段容器 - 等待输入剧本"

**优点**:
- 不需要改动后端
- 可以立即使用

**缺点**:
- 不够优雅
- 会触发视频生成任务(虽然最终可能失败或被忽略)
- 占位图片对用户可见

## 推荐实施顺序

### 短期(1-2天):
1. **使用方案3** - 前端已实现,可以立即使用
2. 测试并确保不会真正触发视频生成

### 中期(1周):
1. **实施方案1** - 修改VideoService支持无图片创建
   - 改动小,风险低
   - 解决了核心问题
   - 向后兼容

### 长期(2-4周):
1. **实施方案2** - 新增Fragment表和API
   - 更清晰的概念模型
   - 更好的扩展性
   - 需要数据迁移

## 测试建议

### 方案1测试:
```bash
# 测试创建片段容器(无图片)
curl -X POST http://localhost:8080/api/projects/1/videos \
  -H "Content-Type: application/json" \
  -d '{
    "name": "测试片段",
    "description": "片段容器"
  }'

# 应该返回 PENDING 状态的 video,不触发生成
```

### 方案2测试:
```bash
# 测试创建片段
curl -X POST http://localhost:8080/api/projects/1/fragments \
  -H "Content-Type: application/json" \
  -d '{
    "name": "第一个片段",
    "description": "开场镜头"
  }'

# 测试获取片段详情
curl http://localhost:8080/api/projects/1/fragments/1
```

## 数据迁移(方案2)

如果实施方案2,需要迁移现有数据:

```sql
-- 1. 创建 fragments 表
-- (见上面的建表语句)

-- 2. 将现有的 parentId 为 NULL 的 videos 迁移为 fragments
INSERT INTO fragments (project_id, name, description, created_at, updated_at)
SELECT 
    project_id,
    name,
    description,
    created_at,
    updated_at
FROM generated_videos
WHERE parent_id IS NULL;

-- 3. 更新 generated_videos 的 fragment_id
UPDATE generated_videos gv
INNER JOIN fragments f ON f.project_id = gv.project_id AND f.name = gv.name
SET gv.fragment_id = f.id
WHERE gv.parent_id IS NULL;

-- 4. 更新子视频的 fragment_id
UPDATE generated_videos child
INNER JOIN generated_videos parent ON child.parent_id = parent.id
SET child.fragment_id = parent.fragment_id
WHERE child.parent_id IS NOT NULL;

-- 5. 更新 ai_agent_workflows 的关联
-- (需要根据实际情况调整)
```

## 总结

**当前状态**: 使用方案3(临时方案),前端传入占位图片

**建议**: 
1. 短期内保持现状,确保功能可用
2. 1周内实施方案1,解决核心问题
3. 有时间的话考虑方案2,这是最优方案

**优先级**:
- P0: 当前方案3已实现,确保功能可用 ✅
- P1: 方案1(修改VideoService)
- P2: 方案2(新增Fragment表)
