"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast-provider";
import { Loader2, Palette, Image, X, ChevronDown, Check } from "lucide-react";
import api from "@/lib/api";
import { cn } from "@/lib/utils";

interface StyleTemplate {
  id: number;
  templateCode: string;
  templateName: string;
  category: string;
  description: string | null;
  systemPrompt: string | null;
  refImage: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowId: number;
  assetType: "character" | "scene" | "item";
  currentTemplateId: number | null;
  onSaved: () => void;
}

const ASSET_TYPE_LABELS: Record<string, string> = {
  character: "角色风格",
  scene: "场景风格",
  item: "道具风格",
};

// 素材类型对应的模板分类
const ASSET_TYPE_CATEGORY: Record<string, string> = {
  character: "CHARACTER_STYLE",
  scene: "SCENE_STYLE",
  item: "ITEM_STYLE",
};

export default function AssetStyleModal({
  open,
  onOpenChange,
  workflowId,
  assetType,
  currentTemplateId,
  onSaved,
}: Props) {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<StyleTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(currentTemplateId);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // 当前选中的模板详情
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  // 加载模板列表
  useEffect(() => {
    if (open) {
      loadTemplates();
      setSelectedTemplateId(currentTemplateId);
    }
  }, [open, currentTemplateId]);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      // 根据素材类型获取对应分类的模板
      const category = ASSET_TYPE_CATEGORY[assetType];
      const res = await api.get("/ai-agent/style-templates", {
        params: { category }
      });
      setTemplates(res.data || []);
    } catch (error) {
      toast("加载模板失败", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/ai-agent/workflows/${workflowId}/asset-style`, {
        type: assetType,
        templateId: selectedTemplateId,
      });
      toast("风格设置已保存", "success");
      onSaved();
      onOpenChange(false);
    } catch (error: any) {
      toast(error.response?.data?.error || "保存失败", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    try {
      await api.put(`/ai-agent/workflows/${workflowId}/asset-style`, {
        type: assetType,
        templateId: null,
      });
      toast("已清除风格设置", "success");
      setSelectedTemplateId(null);
      onSaved();
      onOpenChange(false);
    } catch (error: any) {
      toast(error.response?.data?.error || "清除失败", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-950 border-zinc-800 text-white rounded-xl max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Palette className="w-4 h-4 text-purple-400" />
            {ASSET_TYPE_LABELS[assetType] || "风格设置"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* 模板选择器 */}
          <div>
            <label className="text-sm text-zinc-400 mb-2 block">选择风格模板</label>
            <div className="relative">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                disabled={loading}
                className={cn(
                  "w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-all text-left",
                  "bg-zinc-900/50 border-zinc-700 hover:border-purple-500/50",
                  dropdownOpen && "border-purple-500"
                )}
              >
                {loading ? (
                  <span className="flex items-center gap-2 text-zinc-500">
                    <Loader2 className="w-4 h-4 animate-spin" /> 加载中...
                  </span>
                ) : selectedTemplate ? (
                  <span className="text-white">{selectedTemplate.templateName}</span>
                ) : (
                  <span className="text-zinc-500">请选择风格模板...</span>
                )}
                <ChevronDown
                  className={cn(
                    "w-4 h-4 text-zinc-500 transition-transform",
                    dropdownOpen && "rotate-180"
                  )}
                />
              </button>

              {/* 下拉列表 */}
              {dropdownOpen && !loading && (
                <div className="absolute z-50 w-full mt-2 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl max-h-64 overflow-y-auto">
                  {templates.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-zinc-500 text-center">
                      暂无可用模板
                    </div>
                  ) : (
                    templates.map((template) => (
                      <button
                        key={template.id}
                        onClick={() => {
                          setSelectedTemplateId(template.id);
                          setDropdownOpen(false);
                        }}
                        className={cn(
                          "w-full flex items-start gap-3 px-4 py-3 hover:bg-zinc-800/50 transition-colors text-left",
                          selectedTemplateId === template.id && "bg-purple-500/10"
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-white">
                              {template.templateName}
                            </span>
                            {selectedTemplateId === template.id && (
                              <Check className="w-4 h-4 text-purple-400" />
                            )}
                          </div>
                          {template.description && (
                            <p className="text-xs text-zinc-500 mt-0.5 truncate">
                              {template.description}
                            </p>
                          )}
                        </div>
                        {template.refImage && (
                          <img
                            src={template.refImage}
                            alt=""
                            className="w-12 h-12 rounded-md object-cover flex-shrink-0"
                          />
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 选中模板的详情预览 */}
          {selectedTemplate && (
            <div className="space-y-3 p-4 bg-zinc-900/30 rounded-lg border border-zinc-800">
              <div className="flex items-start gap-4">
                {/* 参考图预览 */}
                {selectedTemplate.refImage && (
                  <div className="flex-shrink-0">
                    <label className="text-xs text-zinc-500 mb-1 block">参考图</label>
                    <img
                      src={selectedTemplate.refImage}
                      alt="参考图"
                      className="w-32 h-32 rounded-lg object-cover border border-zinc-700"
                    />
                  </div>
                )}

                {/* 提示词预览 */}
                <div className="flex-1 min-w-0">
                  <label className="text-xs text-zinc-500 mb-1 block">风格提示词</label>
                  <div className="bg-zinc-900/50 rounded-lg p-3 border border-zinc-700">
                    <p className="text-sm text-zinc-300 whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
                      {selectedTemplate.systemPrompt || "（无提示词）"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="text-xs text-zinc-500 bg-zinc-800/30 px-3 py-2 rounded-md">
                💡 生成时将自动拼接：<span className="text-purple-400">模板提示词</span> +{" "}
                {assetType === "character" && <span className="text-rose-400">外貌:</span>}
                {assetType === "scene" && <span className="text-sky-400">场景描述:</span>}
                {assetType === "item" && <span className="text-amber-400">道具描述:</span>}{" "}
                <span className="text-zinc-300">素材提示词</span>
                {selectedTemplate.refImage && (
                  <span className="text-emerald-400"> + 参考图</span>
                )}
              </div>
            </div>
          )}

          {/* 未选择模板时的提示 */}
          {!selectedTemplate && !loading && (
            <div className="text-center py-8 text-zinc-500">
              <Palette className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">选择一个风格模板后，生成图片时将自动应用该风格</p>
              <p className="text-xs mt-1 text-zinc-600">
                如不选择，将使用全局画风设置
              </p>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              onClick={handleClear}
              disabled={saving || !currentTemplateId}
              className="border-zinc-700 hover:bg-zinc-800 rounded-lg text-zinc-400"
            >
              <X className="w-4 h-4 mr-1" /> 清除风格
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="border-zinc-700 hover:bg-zinc-800 rounded-lg"
              >
                取消
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving}
                className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Check className="w-4 h-4 mr-1" />
                )}
                保存设置
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
