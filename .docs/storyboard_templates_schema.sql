-- =====================================================
-- 分镜模板表设计建议
-- =====================================================
-- 用途: 存储可配置的分镜生成模板,允许管理员定义不同的模板
--      用户在生成分镜时可以选择模板,AI会根据模板的配置来生成分镜
-- =====================================================

CREATE TABLE storyboard_templates (
  -- 主键
  id INT PRIMARY KEY AUTO_INCREMENT,
  
  -- 基本信息
  name VARCHAR(100) NOT NULL COMMENT '模板名称,如"标准剧情模板"、"动作戏模板"',
  description TEXT COMMENT '模板描述,说明适用场景和特点',
  
  -- 风格配置
  style_type VARCHAR(50) NOT NULL DEFAULT '2d_anime' COMMENT '风格类型: 2d_anime, 3d_anime, realistic, custom',
  custom_style VARCHAR(255) COMMENT '自定义风格描述(当style_type为custom时使用)',
  
  -- AI配置
  prompt_template TEXT COMMENT 'AI生成提示词模板,可使用变量如{scriptContent}',
  system_prompt TEXT COMMENT '系统提示词,定义AI的角色和行为规则',
  
  -- 生成参数
  max_shots INT DEFAULT 30 COMMENT '默认最大分镜数',
  min_shot_duration DECIMAL(5,2) DEFAULT 3.0 COMMENT '单个镜头最小时长(秒)',
  max_shot_duration DECIMAL(5,2) DEFAULT 10.0 COMMENT '单个镜头最大时长(秒)',
  
  -- 功能开关
  enable_character_extraction BOOLEAN DEFAULT TRUE COMMENT '是否提取人物信息',
  enable_scene_extraction BOOLEAN DEFAULT TRUE COMMENT '是否提取场景信息',
  enable_item_extraction BOOLEAN DEFAULT FALSE COMMENT '是否提取物品信息',
  auto_generate_character_images BOOLEAN DEFAULT FALSE COMMENT '是否自动生成人物图片(注意成本)',
  auto_generate_scene_images BOOLEAN DEFAULT FALSE COMMENT '是否自动生成场景图片(注意成本)',
  
  -- 镜头拆分规则
  shot_split_rules JSON COMMENT '镜头拆分规则配置(JSON格式),例如: {"by_dialogue": true, "by_action": true, "by_scene_change": true}',
  
  -- 状态管理
  is_active BOOLEAN DEFAULT TRUE COMMENT '是否启用此模板',
  is_default BOOLEAN DEFAULT FALSE COMMENT '是否为默认模板',
  sort_order INT DEFAULT 0 COMMENT '排序权重,数值越小越靠前',
  
  -- 使用统计
  usage_count INT DEFAULT 0 COMMENT '使用次数统计',
  
  -- 时间戳
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  created_by INT COMMENT '创建者用户ID(可选)',
  
  -- 索引
  INDEX idx_is_active (is_active),
  INDEX idx_style_type (style_type),
  INDEX idx_sort_order (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='分镜生成模板表';

-- =====================================================
-- 初始数据示例
-- =====================================================

INSERT INTO storyboard_templates (name, description, style_type, max_shots, sort_order, is_default) VALUES
('标准剧情模板', '适合一般剧情类内容,自动提取人物、场景和关键镜头,平衡镜头数量和细节表现', '2d_anime', 30, 1, TRUE),
('动作戏模板', '强化动作场景拆分,适合战斗、追逐等场景,会将动作细分为更多镜头以展现动态', '2d_anime', 50, 2, FALSE),
('情感戏模板', '注重人物表情和情绪变化,适合对话和情感表达,会为对话和表情变化创建更多特写镜头', '2d_anime', 25, 3, FALSE),
('3D动画模板', '针对3D动画风格优化的分镜模板,注重空间感和镜头运动', '3d_anime', 30, 4, FALSE),
('真人影视模板', '模拟真人电影的拍摄手法,包含更多的镜头语言和运镜设计', 'realistic', 35, 5, FALSE);

-- =====================================================
-- 关联修改建议
-- =====================================================
-- 1. ai_agent_workflows表需要新增字段:
--    ALTER TABLE ai_agent_workflows ADD COLUMN template_id INT COMMENT '使用的模板ID';
--    ALTER TABLE ai_agent_workflows ADD CONSTRAINT fk_template FOREIGN KEY (template_id) REFERENCES storyboard_templates(id);

-- 2. 新增API端点:
--    GET  /api/storyboard-templates - 获取可用模板列表
--    GET  /api/storyboard-templates/:id - 获取单个模板详情
--    POST /api/storyboard-templates - 创建新模板(管理员)
--    PUT  /api/storyboard-templates/:id - 更新模板(管理员)
--    DELETE /api/storyboard-templates/:id - 删除模板(管理员)

-- 3. 新增或修改工作流API:
--    POST /ai-agent/workflows/:id/analyze-with-template
--    参数: { scriptContent: string, templateId: number }
--    功能: 根据模板配置生成分镜
--      - 如果template.enable_character_extraction为false,跳过人物提取
--      - 如果template.enable_scene_extraction为false,跳过场景提取
--      - 使用template.prompt_template和template.system_prompt进行AI分析
--      - 使用template.max_shots限制分镜数量
--      - 根据template.auto_generate_*决定是否自动生成图片

-- =====================================================
-- 模板配置示例(JSON字段)
-- =====================================================
-- shot_split_rules 字段示例:
-- {
--   "by_dialogue": true,           // 按对话拆分镜头
--   "by_action": true,              // 按动作拆分镜头
--   "by_scene_change": true,        // 按场景变化拆分镜头
--   "by_emotion_change": false,     // 按情绪变化拆分镜头
--   "by_time_limit": 8.0            // 单个镜头超过此秒数自动拆分
-- }

-- prompt_template 字段示例:
-- "请分析以下剧本内容,生成{max_shots}个分镜。\n\n剧本内容:\n{scriptContent}\n\n要求:\n1. 每个分镜包含画面描述、对话、时长\n2. 风格为{style_type}\n3. 注重{focus_point}"

-- =====================================================
-- 使用流程
-- =====================================================
-- 1. 用户点击片段 -> 检查是否有workflow
-- 2. 如果没有workflow,弹出ScriptInputModal
-- 3. 用户输入剧本并选择模板
-- 4. 前端调用 POST /ai-agent/workflows/:id/analyze-with-template
-- 5. 后端根据templateId加载配置,调用AI生成分镜
-- 6. 根据模板的enable_*配置决定是否生成人物/场景图片
-- 7. 返回生成的workflow数据
-- 8. 前端跳转到storyboard页面展示分镜
