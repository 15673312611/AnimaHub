// Four-grid (四宫格) video persistence helpers.
//
// Why this exists:
// - Backend/WebSocket messages for video completion do NOT include a slot index.
// - The UI allows multiple videos per shot via a 2x2 grid.
// - We persist:
//   1) pending slots (slotIndex + imageUrl) before submitting generation, so a later WS completion can be routed.
//   2) slot video records (slotIndex -> {imageUrl, videoUrl}) so refresh can restore per-slot videos.
//
// IMPORTANT: Keys/event name are part of the current behavior. Do not change them.

export interface SlotVideoRecord {
  slotIndex: number;
  imageUrl: string;
  videoUrl: string;
  updatedAt: number;
}
export interface SlotVideoErrorRecord {
  slotIndex: number;
  errorMessage: string;
  imageUrl?: string;
  updatedAt: number;
}

export interface PendingVideoSlot {
  slotIndex: number;
  imageUrl: string;
  createdAt: number;
}

export interface SlotImageRecord {
  slotIndex: number;
  imageUrl: string;
  updatedAt: number;
}

export const AI_AGENT_SHOT_VIDEO_UPDATED_EVENT = "ai-agent-shot-video-updated";
export const AI_AGENT_SHOT_IMAGE_UPDATED_EVENT = "ai-agent-shot-image-updated";

// 视频生成 pending 超时时间（30分钟），超过此时间的 pending 会被自动清理
export const PENDING_VIDEO_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Build a pending slot queue for a batch that shares the same source image.
 * Keep this consistent with persistShotVideoCompletion(), which routes by imageUrl.
 */
export function buildPendingVideoSlots(params: {
  slotIndices: number[];
  imageUrl: string;
  createdAt?: number;
}): PendingVideoSlot[] {
  const createdAt = params.createdAt ?? Date.now();
  return params.slotIndices.map((slotIndex) => ({
    slotIndex,
    imageUrl: params.imageUrl,
    createdAt,
  }));
}

function getSlotVideosKey(shotId: number) {
  return `shot_${shotId}_slotVideos`;
}

function getPendingSlotsKey(shotId: number) {
  return `shot_${shotId}_pendingVideoSlots`;
}

function getImageSlotsKey(shotId: number) {
  return `shot_${shotId}_imageSlots`;
}

function getDeletedImageUrlsKey(shotId: number) {
  return `shot_${shotId}_deletedImageUrls`;
}

function getDeletedVideoUrlsKey(shotId: number) {
  return `shot_${shotId}_deletedVideoUrls`;
}
function getVideoErrorsKey(shotId: number) {
  return `shot_${shotId}_videoErrors`;
}

function getCancelledTasksKey(shotId: number) {
  return `shot_${shotId}_cancelledTasks`;
}

function readJson<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota / privacy mode errors.
  }
}

function readJsonArray<T>(key: string): T[] {
  const value = readJson<unknown>(key);
  return Array.isArray(value) ? (value as T[]) : [];
}

export function readSlotVideoRecords(shotId: number): SlotVideoRecord[] {
  return readJsonArray<SlotVideoRecord>(getSlotVideosKey(shotId));
}

export function writeSlotVideoRecords(shotId: number, records: SlotVideoRecord[]) {
  writeJson(getSlotVideosKey(shotId), records);
}

export function readSlotImageRecords(shotId: number): SlotImageRecord[] {
  return readJsonArray<SlotImageRecord>(getImageSlotsKey(shotId));
}

export function writeSlotImageRecords(shotId: number, records: SlotImageRecord[]) {
  writeJson(getImageSlotsKey(shotId), records);
}

export function readPendingVideoSlots(shotId: number): PendingVideoSlot[] {
  return readJsonArray<PendingVideoSlot>(getPendingSlotsKey(shotId));
}

/**
 * 读取 pending 队列并自动清理过期的记录
 * @param shotId 镜头ID
 * @param timeoutMs 超时时间（毫秒），默认 30 分钟
 * @returns 未过期的 pending 队列
 */
export function readAndCleanExpiredPendingSlots(
  shotId: number,
  timeoutMs: number = PENDING_VIDEO_TIMEOUT_MS
): PendingVideoSlot[] {
  const all = readPendingVideoSlots(shotId);
  if (all.length === 0) return [];

  const now = Date.now();
  const valid = all.filter((p) => {
    const age = now - (p.createdAt || 0);
    return age < timeoutMs;
  });

  // 如果有过期的，更新 localStorage
  if (valid.length !== all.length) {
    writePendingVideoSlots(shotId, valid);
  }

  return valid;
}

export function writePendingVideoSlots(shotId: number, records: PendingVideoSlot[]) {
  writeJson(getPendingSlotsKey(shotId), records);
}

export function readDeletedImageUrls(shotId: number): string[] {
  // Stored as string[]
  return readJsonArray<string>(getDeletedImageUrlsKey(shotId)).filter(
    (u): u is string => typeof u === "string" && u.length > 0
  );
}

export function writeDeletedImageUrls(shotId: number, urls: string[]) {
  // Ensure we only persist non-empty strings
  const cleaned = (urls || []).filter((u): u is string => typeof u === "string" && u.length > 0);
  writeJson(getDeletedImageUrlsKey(shotId), cleaned);
}

export function readDeletedVideoUrls(shotId: number): string[] {
  // Stored as string[]
  return readJsonArray<string>(getDeletedVideoUrlsKey(shotId)).filter(
    (u): u is string => typeof u === "string" && u.length > 0
  );
}

export function writeDeletedVideoUrls(shotId: number, urls: string[]) {
  // Ensure we only persist non-empty strings
  const cleaned = (urls || []).filter((u): u is string => typeof u === "string" && u.length > 0);
  writeJson(getDeletedVideoUrlsKey(shotId), cleaned);
}

export function readVideoErrorRecords(shotId: number): SlotVideoErrorRecord[] {
  return readJsonArray<SlotVideoErrorRecord>(getVideoErrorsKey(shotId)).filter(
    (r) => typeof r?.slotIndex === "number" && typeof r?.errorMessage === "string"
  );
}

export function writeVideoErrorRecords(shotId: number, records: SlotVideoErrorRecord[]) {
  writeJson(getVideoErrorsKey(shotId), records);
}

export function clearVideoErrorRecords(shotId: number, slotIndices: number[]) {
  if (!slotIndices || slotIndices.length === 0) return;
  const current = readVideoErrorRecords(shotId);
  const next = current.filter((r) => !slotIndices.includes(r.slotIndex));
  if (next.length !== current.length) {
    writeVideoErrorRecords(shotId, next);
  }
}

// 已取消任务记录（用于忽略后续的 WebSocket 结果）
export interface CancelledTaskRecord {
  imageUrl: string;
  slotIndex: number;
  cancelledAt: number;
}

export function readCancelledTasks(shotId: number): CancelledTaskRecord[] {
  return readJsonArray<CancelledTaskRecord>(getCancelledTasksKey(shotId)).filter(
    (r) => typeof r?.imageUrl === "string" && typeof r?.slotIndex === "number"
  );
}

export function writeCancelledTasks(shotId: number, records: CancelledTaskRecord[]) {
  writeJson(getCancelledTasksKey(shotId), records);
}

/**
 * 记录已取消的任务（根据 imageUrl 和 slotIndex）
 * 后续的 WebSocket 结果如果匹配到已取消的任务，将被忽略
 */
export function markTaskAsCancelled(shotId: number, imageUrl: string | undefined, slotIndex: number) {
  if (!imageUrl) return;
  const current = readCancelledTasks(shotId);
  // 避免重复添加
  if (current.some(r => r.imageUrl === imageUrl && r.slotIndex === slotIndex)) return;
  current.push({
    imageUrl,
    slotIndex,
    cancelledAt: Date.now(),
  });
  writeCancelledTasks(shotId, current);
}

/**
 * 检查任务是否已被取消
 */
export function isTaskCancelled(shotId: number, imageUrl: string | undefined): boolean {
  if (!imageUrl) return false;
  const cancelled = readCancelledTasks(shotId);
  return cancelled.some(r => r.imageUrl === imageUrl);
}

/**
 * 清理已取消任务记录（当任务结果到达后移除）
 */
export function removeCancelledTask(shotId: number, imageUrl: string | undefined) {
  if (!imageUrl) return;
  const current = readCancelledTasks(shotId);
  const next = current.filter(r => r.imageUrl !== imageUrl);
  if (next.length !== current.length) {
    writeCancelledTasks(shotId, next);
  }
}

/**
 * 清理过期的已取消任务记录（10分钟后自动清理）
 */
export function cleanExpiredCancelledTasks(shotId: number, timeoutMs: number = 10 * 60 * 1000) {
  const current = readCancelledTasks(shotId);
  const now = Date.now();
  const next = current.filter(r => (now - r.cancelledAt) < timeoutMs);
  if (next.length !== current.length) {
    writeCancelledTasks(shotId, next);
  }
}

export function upsertVideoErrorRecord(
  shotId: number,
  record: { slotIndex: number; errorMessage: string; imageUrl?: string }
) {
  const current = readVideoErrorRecords(shotId);
  const next = current.filter((r) => r.slotIndex !== record.slotIndex);
  next.push({
    slotIndex: record.slotIndex,
    errorMessage: record.errorMessage,
    imageUrl: record.imageUrl,
    updatedAt: Date.now(),
  });
  writeVideoErrorRecords(shotId, next);
}

export function dispatchShotVideoUpdated(shotId: number) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(AI_AGENT_SHOT_VIDEO_UPDATED_EVENT, {
      detail: { shotId },
    })
  );
}

/**
 * Apply a WS video completion message:
 * - Check if the task was cancelled (if so, ignore and don't write to any slot).
 * - Consume one pending slot (prefer matching imageUrl; fallback to first).
 * - Save to backend database.
 * - Dispatch event to notify ShotCard to reload from backend.
 * - If no pending exists AND task was not cancelled, fallback to slot 0.
 */
export async function persistShotVideoCompletion(params: {
  shotId: number;
  imageUrl: string;
  videoUrl: string;
}) {
  const { shotId, imageUrl, videoUrl } = params;

  // 检查任务是否已被取消，如果是则忽略这个结果
  if (isTaskCancelled(shotId, imageUrl)) {
    console.log(`ℹ️ 忽略已取消任务的视频完成结果: shotId=${shotId}, imageUrl=${imageUrl}`);
    // 清理取消记录
    removeCancelledTask(shotId, imageUrl);
    return;
  }

  const pendingArr = readPendingVideoSlots(shotId);

  let chosenIdx = -1;
  if (pendingArr.length > 0) {
    // 1) 优先按 imageUrl 精确匹配（防止多图批量乱序落位）
    const matchedIdx = pendingArr.findIndex((p) => p?.imageUrl === imageUrl);
    if (matchedIdx !== -1) {
      chosenIdx = matchedIdx;
    } else {
      // 2) 否则按 createdAt 最早的 pending（保持 FIFO 语义）
      let fallbackIdx = 0;
      let minTs = Number.MAX_SAFE_INTEGER;
      pendingArr.forEach((p, i) => {
        const ts = typeof p?.createdAt === "number" ? p.createdAt : Number.MAX_SAFE_INTEGER;
        if (ts < minTs) {
          minTs = ts;
          fallbackIdx = i;
        }
      });
      chosenIdx = fallbackIdx;
    }
  } else {
    // 没有 pending 且不是已取消的任务，说明是一个孤立的结果
    // 不再默认写入槽位 0，而是忽略这个结果
    console.log(`⚠️ 无匹配的 pending 槽位，忽略视频完成结果: shotId=${shotId}, imageUrl=${imageUrl}`);
    return;
  }

  const chosen = pendingArr[chosenIdx];
  const slotIndex = chosen?.slotIndex ?? 0;

  // Remove consumed pending slot.
  if (chosen) {
    pendingArr.splice(chosenIdx, 1);
    writePendingVideoSlots(shotId, pendingArr);
  }

  // Save to backend database
  try {
    // Dynamic import to avoid circular dependency
    const api = (await import("@/lib/api")).default;
    await api.post(`/ai-agent/shots/${shotId}/media-slots`, {
      gridType: "video",
      slotIndex,
      imageUrl,
      videoUrl,
    });
  } catch (error) {
    console.error("保存视频槽位到后端失败:", error);
  }

  // Dispatch event to notify ShotCard to reload from backend
  dispatchShotVideoUpdated(shotId);
}

/**
 * Apply a WS video failure message:
 * - Check if the task was cancelled (if so, ignore and don't write error to any slot).
 * - Consume one pending slot (prefer matching imageUrl; fallback to first/oldest).
 * - Persist an error record for that slot.
 * - Dispatch event to notify ShotCard to refresh UI.
 */
export function persistShotVideoFailure(params: {
  shotId: number;
  imageUrl?: string;
  errorMessage: string;
  /**
   * 后端 WebSocket 可能会携带 slotIndex（后端已知失败发生在哪个槽位）。
   * 有该字段时应优先使用，避免依赖 imageUrl/pending 队列导致误消费其它槽位。
   */
  slotIndex?: number;
}) {
  const { shotId, imageUrl, errorMessage, slotIndex: wsSlotIndex } = params;

  // [DEBUG] 打印失败消息详情，用于调试四宫格显示问题
  console.log(`🔴 [persistShotVideoFailure] 收到失败消息:`, {
    shotId,
    imageUrl: imageUrl || '(空)',
    errorMessage,
  });

  // 检查任务是否已被取消，如果是则忽略这个失败结果
  if (isTaskCancelled(shotId, imageUrl)) {
    console.log(`ℹ️ 忽略已取消任务的视频失败结果: shotId=${shotId}, imageUrl=${imageUrl}`);
    // 清理取消记录
    removeCancelledTask(shotId, imageUrl);
    return;
  }

  const pendingArr = readPendingVideoSlots(shotId);
  
  // [DEBUG] 打印当前 pending 队列状态
  console.log(`🔴 [persistShotVideoFailure] 当前 pending 队列:`, pendingArr.map((p, i) => ({
    index: i,
    slotIndex: p.slotIndex,
    imageUrl: p.imageUrl?.slice(-30), // 只显示最后30字符
    createdAt: p.createdAt,
  })));

  // 优先使用后端传来的 slotIndex（最可靠）
  if (typeof wsSlotIndex === "number" && wsSlotIndex >= 0) {
    const matchedBySlot = pendingArr.find((p) => p?.slotIndex === wsSlotIndex);

    // 精确移除该 slotIndex 的 pending（不影响其它正在生成的槽位）
    const nextPending = pendingArr.filter((p) => p?.slotIndex !== wsSlotIndex);
    if (nextPending.length !== pendingArr.length) {
      writePendingVideoSlots(shotId, nextPending);
      console.log(`🔴 [persistShotVideoFailure] 按 slotIndex 移除 pending: slotIndex=${wsSlotIndex}, 剩余=${nextPending.length}`);
    }

    upsertVideoErrorRecord(shotId, {
      slotIndex: wsSlotIndex,
      errorMessage,
      imageUrl: imageUrl || matchedBySlot?.imageUrl,
    });

    // 触发 UI 刷新（ShotCard 会 reload 后端槽位数据，并叠加本地错误记录）
    dispatchShotVideoUpdated(shotId);
    return;
  }

  // 兼容旧消息：没有 slotIndex 时，回退到 pending FIFO / imageUrl 匹配
  let chosenIdx = -1;
  if (pendingArr.length > 0) {
    if (imageUrl) {
      const matchedIdx = pendingArr.findIndex((p) => p?.imageUrl === imageUrl);
      console.log(`🔴 [persistShotVideoFailure] imageUrl 匹配结果: matchedIdx=${matchedIdx}`);
      if (matchedIdx !== -1) {
        chosenIdx = matchedIdx;
      }
    }
    if (chosenIdx === -1) {
      let fallbackIdx = 0;
      let minTs = Number.MAX_SAFE_INTEGER;
      pendingArr.forEach((p, i) => {
        const ts = typeof p?.createdAt === "number" ? p.createdAt : Number.MAX_SAFE_INTEGER;
        if (ts < minTs) {
          minTs = ts;
          fallbackIdx = i;
        }
      });
      chosenIdx = fallbackIdx;
      console.log(`🔴 [persistShotVideoFailure] 使用 fallback 选择: fallbackIdx=${fallbackIdx}`);
    }
  } else {
    // 没有 pending 且不是已取消的任务，说明是一个孤立的失败结果
    // 不再默认写入槽位 0，而是忽略这个结果
    console.log(`⚠️ 无匹配的 pending 槽位，忽略视频失败结果: shotId=${shotId}, imageUrl=${imageUrl}`);
    return;
  }

  const chosen = pendingArr[chosenIdx];
  const slotIndex = chosen?.slotIndex ?? 0;
  
  // [DEBUG] 打印最终选择的槽位
  console.log(`🔴 [persistShotVideoFailure] 最终选择:`, {
    chosenIdx,
    slotIndex,
    chosenImageUrl: chosen?.imageUrl?.slice(-30),
  });

  if (chosen) {
    pendingArr.splice(chosenIdx, 1);
    writePendingVideoSlots(shotId, pendingArr);
    console.log(`🔴 [persistShotVideoFailure] 消费 pending 后剩余队列长度: ${pendingArr.length}`);
  }

  upsertVideoErrorRecord(shotId, {
    slotIndex,
    errorMessage,
    imageUrl: imageUrl || chosen?.imageUrl,
  });
  
  // [DEBUG] 打印当前所有错误记录
  const currentErrors = readVideoErrorRecords(shotId);
  console.log(`🔴 [persistShotVideoFailure] 写入后的错误记录:`, currentErrors.map(e => ({
    slotIndex: e.slotIndex,
    errorMessage: e.errorMessage.slice(0, 30),
  })));

  dispatchShotVideoUpdated(shotId);
}
