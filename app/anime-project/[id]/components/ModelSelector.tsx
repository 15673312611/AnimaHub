"use client";

import { useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useImageModels } from "@/lib/useImageModels";

interface ModelSelectorProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

/**
 * AI绘画模型选择器组件
 * 从后端API获取可用模型列表
 */
export default function ModelSelector({ value, onChange, className }: ModelSelectorProps) {
  const { models, defaultModel, loading } = useImageModels("project");

  // 如果当前值为空或不在可用模型列表中，设置为默认值
  useEffect(() => {
    if (!loading && defaultModel) {
      if (!value || !models.find(m => m.value === value)) {
        onChange(defaultModel);
      }
    }
  }, [loading, defaultModel, value, models, onChange]);

  if (loading) {
    return (
      <Select value={value} disabled>
        <SelectTrigger className={className || "bg-zinc-900/30 border-white/10 h-11 rounded-xl"}>
          <SelectValue placeholder="加载中..." />
        </SelectTrigger>
      </Select>
    );
  }

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className || "bg-zinc-900/30 border-white/10 h-11 rounded-xl"}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="bg-zinc-900 border-white/10">
        {models.map((model) => (
          <SelectItem key={model.value} value={model.value}>
            {model.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
