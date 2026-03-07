-- Persist per-shot 2x2 media grids (8 slots total: 4 image slots + 4 video slots)
--
-- Notes:
-- - IMAGE grid: store image_url, video_url MUST be NULL
-- - VIDEO grid: store video_url, image_url is optional (cover/source image for UI)
-- - Deletion can be represented by setting image_url/video_url to NULL
-- - Unique per (shot_id, grid_type, slot_index)
--
-- This is a proposal file for backend migration.

CREATE TABLE ai_agent_shot_media_slots (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  shot_id BIGINT NOT NULL COMMENT 'ai_agent_shots.id',
  grid_type VARCHAR(10) NOT NULL COMMENT 'IMAGE | VIDEO',
  slot_index INT NOT NULL COMMENT '0-3',
  image_url TEXT NULL COMMENT 'IMAGE grid: selected/generated image; VIDEO grid: cover/source image (optional)',
  video_url TEXT NULL COMMENT 'VIDEO grid: generated video URL',
  status VARCHAR(32) NULL COMMENT 'Optional: GENERATING | COMPLETED | FAILED',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uk_shot_grid_slot (shot_id, grid_type, slot_index),
  INDEX idx_shot_id (shot_id),
  INDEX idx_grid_type (grid_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Per-shot 2x2 grids for images/videos';
