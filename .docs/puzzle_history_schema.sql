-- =====================================================
-- 拼图历史记录表设计
-- =====================================================
-- 用途: 存储用户使用 AI 编辑器生成的拼图历史记录
--      支持按项目/片段查询历史，便于用户回溯和复用
-- =====================================================

CREATE TABLE puzzle_history (
  -- 主键
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  
  -- 关联信息
  user_id BIGINT NOT NULL COMMENT '用户 ID',
  project_id BIGINT NOT NULL COMMENT '项目 ID (ai_agent_projects.id)',
  fragment_id BIGINT NOT NULL COMMENT '片段 ID (ai_agent_workflows.fragment_id)',
  workflow_id BIGINT NULL COMMENT '工作流 ID (ai_agent_workflows.id)',
  
  -- 拼图结果
  result_url TEXT NOT NULL COMMENT '生成的拼图图片 URL (OSS 地址)',
  thumbnail_url TEXT NULL COMMENT '缩略图 URL (可选，用于列表展示)',
  
  -- 拼图配置 (便于复现或重新编辑)
  config JSON NULL COMMENT '拼图配置: {"aspectRatio": "16:9", "spacing": 10, "radius": 0, "bgColor": "#000000", "sourceImages": ["url1", "url2", ...]}',
  
  -- 元数据
  file_size INT NULL COMMENT '文件大小 (字节)',
  width INT NULL COMMENT '图片宽度',
  height INT NULL COMMENT '图片高度',
  
  -- 时间戳
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  
  -- 索引
  INDEX idx_user_id (user_id),
  INDEX idx_project_id (project_id),
  INDEX idx_fragment_id (fragment_id),
  INDEX idx_created_at (created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI 拼图历史记录表';

-- =====================================================
-- API 端点建议
-- =====================================================
-- POST /api/puzzle-history
--   Body: { projectId, fragmentId, workflowId?, resultUrl, thumbnailUrl?, config?, fileSize?, width?, height? }
--   Response: { id, createdAt }
--
-- GET /api/puzzle-history?fragmentId=xxx&limit=20
--   Response: { list: [{ id, resultUrl, thumbnailUrl, config, createdAt }], total }
--
-- DELETE /api/puzzle-history/:id
--   Response: { success: true }
-- =====================================================
