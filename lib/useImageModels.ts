import { useState, useEffect, useCallback } from "react";
import api from "@/lib/api";

// 模型类型定义
export interface ImageModel {
  id: number;      // 模型ID
  value: string;   // 模型代码
  label: string;   // 显示名称
  desc: string;
  maxRef?: number;
}

// 缓存模型数据（不再使用硬编码默认值，强制从API获取）
const modelCache: Record<string, { models: ImageModel[]; defaultModel: string; timestamp: number }> = {};
const CACHE_TTL = 30 * 1000; // 30秒缓存（缩短缓存时间，确保配置更新能及时生效）

/**
 * 获取指定页面的AI绘画模型列表
 * @param page 页面代码: ai-image/script/project
 */
export function useImageModels(page: string = "project") {
  const [models, setModels] = useState<ImageModel[]>([]);
  const [defaultModel, setDefaultModel] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchModels = useCallback(async (forceRefresh: boolean = false) => {
    // 检查缓存（除非强制刷新）
    if (!forceRefresh) {
      const cached = modelCache[page];
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        setModels(cached.models);
        setDefaultModel(cached.defaultModel);
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    setError(null);
    
    try {
      const res = await api.get(`/config/image-models?page=${page}`);
      const { models: modelList, defaultModel: defModel } = res.data;
      
      if (modelList && modelList.length > 0) {
        setModels(modelList);
        setDefaultModel(defModel || modelList[0].value);
        // 更新缓存
        modelCache[page] = {
          models: modelList,
          defaultModel: defModel || modelList[0].value,
          timestamp: Date.now()
        };
      } else {
        setError("没有可用的模型配置");
        setModels([]);
        setDefaultModel("");
      }
    } catch (err) {
      console.error("Failed to fetch models", err);
      setError("获取模型配置失败");
      // 如果有缓存（即使过期），仍然使用
      const cached = modelCache[page];
      if (cached) {
        setModels(cached.models);
        setDefaultModel(cached.defaultModel);
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
    clearModelCache();
    fetchModels(true);
  }, [fetchModels]);

  return { models, defaultModel, loading, error, refresh };
}

/**
 * 清除模型缓存（在后台配置更新后调用）
 */
export function clearModelCache() {
  Object.keys(modelCache).forEach(key => delete modelCache[key]);
}
