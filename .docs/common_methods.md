# 常用方法与统一入口（前后端）
> 目的：减少重复逻辑、统一第三方生图入口，方便后续 AI/开发快速定位可复用方法。

---
## 前端（Client）

### 统一 API 包装
统一通过 `lib/*Api.ts` 调用，避免散落的 `api.post/get`：

#### `lib/imageApi.ts`
用于全局生图（`/images/*`）
- `imageApi.generate({ prompt, model, size, referenceImages, referenceImage })`
- `imageApi.getStatus(id)`
- `imageApi.getHistory({ page, pageSize })`

#### `lib/aiAgentImageApi.ts`
用于 AI Agent（`/ai-agent/*`）
- 角色/场景/物品生图：
  - `generateCharacterImage(characterId, { model, ratio })`
  - `generateSceneImage(sceneId, { model, ratio })`
  - `generateItemImage(itemId, { model, ratio })`
- 镜头首帧/高级生成：
  - `generateFirstFrame(shotId, { model, ratio })`
  - `generateAllFirstFrames(workflowId, { model, ratio })`
  - `advancedGenerateShot(shotId, { model, ratio, customPrompt, customRefImages, batchCount, slotIndices })`
- 镜头图片编辑：
  - `imageEdit(shotId, { slotIndex, prompt, sourceImageUrl, refImageUrls, model, mode })`
- 四宫格槽位：
  - `saveMediaSlot(shotId, { gridType, slotIndex, imageUrl, videoUrl, sourceTaskId, actionType })`
- 批量首帧：
  - `batchGenerateImages(workflowId, { shotIds })`

#### `lib/scriptsImageApi.ts`
用于剧本（`/scripts/*`）
- `generateCharacterImage(characterId, { model, ratio })`
- `generateSceneImage(sceneId, { model, ratio })`
- `generateAllCharacters(scriptId, { model })`
- `generateAllScenes(scriptId, { model })`

---
### 常用工具方法

#### `lib/upload.ts`
- `uploadToOss(file, folder)`：上传文件到 OSS，返回 URL

#### `lib/utils.ts`
- `toThumbnailUrl(url, width=800)`：OSS 缩略图 URL（仅对 `aliyuncs.com` 生效）
- `cn(...)`：合并 className

---
## 后端（Java Server）

### 统一第三方生图入口
**统一通过 `ImageService` 调用第三方生图 API**，避免在业务服务中直接拼接 `/v1/images/generations`。

推荐入口：
- `ImageService.generateImageUrl(prompt, model, ratio, referenceImage)`  
  单张参考图/无参考图，内部会统一调用第三方 API 并上传 OSS

- `ImageService.generateImageUrlWithReferences(prompt, model, ratio, referenceImages, ossFolder)`  
  多参考图统一入口（推荐）。`ossFolder` 用于区分落盘目录（如 `ai-agent/shots`）

> **原则**：新增后端生图逻辑时，直接调用 `ImageService`，不要在业务 Service 内重复请求第三方 API。

### 比例工具
- `util/ImageRatioUtils.ratioToSize(ratio)`  
  前后端都常用的比例→尺寸映射统一入口（16:9/9:16/4:3/3:4/1:1）

### 超时配置
- `util/GenerationTimeouts.IMAGE_TASK_TIMEOUT_SECONDS`  
  图片/素材/首帧等待超时时间（当前为 360 秒）

---
## 约定（避免后续踩坑）
- 需要第三方生图 → **后端统一走 `ImageService`**
- 前端生图接口 → **优先用 `lib/*Api.ts` 包装调用**
