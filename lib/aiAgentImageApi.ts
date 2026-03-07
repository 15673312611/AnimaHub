import api from "./api";

export const aiAgentImageApi = {
  generateCharacterImage: (characterId: number, payload: { modelId?: number; model?: string; ratio?: string }) =>
    api.post(`/ai-agent/characters/${characterId}/generate-image`, payload),

  generateSceneImage: (sceneId: number, payload: { modelId?: number; model?: string; ratio?: string }) =>
    api.post(`/ai-agent/scenes/${sceneId}/generate-image`, payload),

  generateItemImage: (itemId: number, payload: { modelId?: number; model?: string; ratio?: string }) =>
    api.post(`/ai-agent/items/${itemId}/generate-image`, payload),

  generateFirstFrame: (shotId: number, payload: { model?: string; ratio?: string }) =>
    api.post(`/ai-agent/shots/${shotId}/generate-first-frame`, payload),

  generateAllFirstFrames: (workflowId: number, payload: { model?: string; ratio?: string }) =>
    api.post(`/ai-agent/workflows/${workflowId}/generate-all-first-frames`, payload),

  advancedGenerateShot: (
    shotId: number,
    payload: {
      model?: string;
      ratio?: string;
      customPrompt?: string;
      customRefImages?: string[];
      batchCount?: number;
      slotIndices?: number[];
      skipSavePrompt?: boolean; // 不保存提示词到shot（用于尾帧推理等一次性场景）
    }
  ) => api.post(`/ai-agent/shots/${shotId}/advanced-generate`, payload),

  batchGenerateImages: (workflowId: number, payload: { shotIds: number[] }) =>
    api.post(`/ai-agent/workflows/${workflowId}/batch-generate-images`, payload),

  imageEdit: (
    shotId: number,
    payload: {
      slotIndex: number;
      prompt: string;
      sourceImageUrl: string;
      refImageUrls?: string[];
      model?: string;
      mode?: string;
    }
  ) => api.post(`/ai-agent/shots/${shotId}/image-edit`, payload),

  saveMediaSlot: (
    shotId: number,
    payload: {
      gridType: "image" | "video";
      slotIndex: number;
      imageUrl?: string;
      videoUrl?: string;
      sourceTaskId?: number;
      actionType?: string;
    }
  ) => api.post(`/ai-agent/shots/${shotId}/media-slots`, payload),
};
