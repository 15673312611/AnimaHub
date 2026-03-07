import { useState, useEffect, useCallback } from "react";
import api from "@/lib/api";

// 视频模型类型定义
export interface VideoModel {
  id: number;       // 模型ID，用于前端传递给后端查询模型代码
  value: string;    // 模型代码（modelCode），仅用于前端展示
  label: string;
  desc: string;
  maxDuration?: number;
  defaultDuration?: number;
  supportedDurations?: number[];
  supportsHd?: boolean;
  supportsEndFrame?: boolean;
  supportedRatios?: string[];
  defaultRatio?: string;
}

// 缓存模型数据
const modelCache: Record<string, { models: VideoModel[]; defaultModel: string; defaultModelId: number | null; timestamp: number }> = {};
const CACHE_TTL = 30 * 1000; // 30秒缓存

/**
 * 获取指定页面的AI视频模型列表
 * @param page 页面代码: script/project/ai-agent
 */
export function useVideoModels(page: string = "project") {
  const [models, setModels] = useState<VideoModel[]>([]);
  const [defaultModel, setDefaultModel] = useState<string>("");
  const [defaultModelId, setDefaultModelId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchModels = useCallback(async (forceRefresh: boolean = false) => {
    // 检查缓存（除非强制刷新）
    if (!forceRefresh) {
      const cached = modelCache[page];
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        setModels(cached.models);
        setDefaultModel(cached.defaultModel);
        setDefaultModelId(cached.defaultModelId);
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    setError(null);
    
    try {
      const res = await api.get(`/config/video-models?page=${page}`);
      const { models: modelList, defaultModel: defModel } = res.data;
      
      if (modelList && modelList.length > 0) {
        setModels(modelList);
        const defModelCode = defModel || modelList[0].value;
        setDefaultModel(defModelCode);
        // 找到默认模型的 ID
        const defModelObj = modelList.find((m: VideoModel) => m.value === defModelCode);
        const defModelIdValue = defModelObj?.id ?? modelList[0]?.id ?? null;
        setDefaultModelId(defModelIdValue);
        // 更新缓存
        modelCache[page] = {
          models: modelList,
          defaultModel: defModelCode,
          defaultModelId: defModelIdValue,
          timestamp: Date.now()
        };
      } else {
        setError("没有可用的视频模型配置");
        setModels([]);
        setDefaultModel("");
        setDefaultModelId(null);
      }
    } catch (err) {
      console.error("Failed to fetch video models", err);
      setError("获取视频模型配置失败");
      // 如果有缓存（即使过期），仍然使用
      const cached = modelCache[page];
      if (cached) {
        setModels(cached.models);
        setDefaultModel(cached.defaultModel);
        setDefaultModelId(cached.defaultModelId);
      }
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  // 提供刷新方法
  const refresh = useCallback(() => {
    clearVideoModelCache();
    fetchModels(true);
  }, [fetchModels]);

  return { models, defaultModel, defaultModelId, loading, error, refresh };
}

/**
 * 清除视频模型缓存
 */
export function clearVideoModelCache() {
  Object.keys(modelCache).forEach(key => delete modelCache[key]);
}
