import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";

export interface StylePreset {
  id: number;
  name: string;
  description?: string | null;
  previewUrl?: string | null;
  visualPromptSnippet: string;
  toneTags?: string | null;
  aspectRatio?: string | null;
  duration?: number | null;
  sortOrder?: number | null;
  isDefault?: boolean;
}

export interface StylePresetConfig {
  presets: StylePreset[];
  defaultPreset: StylePreset | null;
}

const CACHE_TTL = 30 * 1000;
let cache: { data: StylePresetConfig; timestamp: number } | null = null;

export function useStylePresets() {
  const [presets, setPresets] = useState<StylePreset[]>([]);
  const [defaultPreset, setDefaultPreset] = useState<StylePreset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPresets = useCallback(async (forceRefresh: boolean = false) => {
    if (!forceRefresh && cache && Date.now() - cache.timestamp < CACHE_TTL) {
      setPresets(cache.data.presets || []);
      setDefaultPreset(cache.data.defaultPreset || null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await api.get<StylePresetConfig>("/config/style-presets");
      const data = res.data || { presets: [], defaultPreset: null };
      setPresets(data.presets || []);
      setDefaultPreset(data.defaultPreset || null);
      cache = { data, timestamp: Date.now() };
    } catch (err) {
      console.error("Failed to fetch style presets", err);
      setError("获取画风预设失败");
      if (cache) {
        setPresets(cache.data.presets || []);
        setDefaultPreset(cache.data.defaultPreset || null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPresets();
  }, [fetchPresets]);

  const refresh = useCallback(() => {
    cache = null;
    fetchPresets(true);
  }, [fetchPresets]);

  return { presets, defaultPreset, loading, error, refresh };
}
