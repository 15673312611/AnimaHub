"use client";

import { useState, useEffect, useRef } from "react";
import { X, Loader2, Palette, Image as ImageIcon, Check, Sparkles, Upload, Trash2, ChevronDown, RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast-provider";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { uploadToOss } from "@/lib/upload";

// 风格模板接口
interface StyleTemplate {
  id: number;
  templateCode: string;
  templateName: string;
  category: string;
  description: string | null;
  systemPrompt: string | null;
  refImage: string | null;
}

interface AssetStyleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowId: number;
  assetType: "character" | "scene" | "item";
  currentTemplateId: number | null;
  onSaved: () => void;
}

const assetTypeConfig = {
  character: { 
    title: "角色风格设置", 
    category: "CHARACTER_STYLE",
    description: "生成角色图片时将使用该风格",
    color: "purple",
    gradient: "from-purple-500/20 to-indigo-500/20",
    border: "border-purple-500/30"
  },
  scene: { 
    title: "场景风格设置", 
    category: "SCENE_STYLE",
    description: "生成场景图片时将使用该风格",
    color: "blue",
    gradient: "from-blue-500/20 to-cyan-500/20",
    border: "border-blue-500/30"
  },
  item: { 
    title: "道具风格设置", 
    category: "ITEM_STYLE",
    description: "生成道具图片时将使用该风格",
    color: "orange",
    gradient: "from-orange-500/20 to-amber-500/20",
    border: "border-orange-500/30"
  },
};

export default function CharacterStyleModal({
  open,
  onOpenChange,
  workflowId,
  assetType,
  currentTemplateId,
  onSaved,
}: AssetStyleModalProps) {
  const { toast } = useToast();
  const config = assetTypeConfig[assetType];
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // 模板相关状态
  const [templates, setTemplates] = useState<StyleTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(currentTemplateId);
  const [saving, setSaving] = useState(false);
  
  // 风格内容（参考图 + 提示词）
  const [stylePrompt, setStylePrompt] = useState("");
  const [styleRefImage, setStyleRefImage] = useState("");
  const [uploading, setUploading] = useState(false);
  
  // 初始化：弹窗打开时加载模板列表
  useEffect(() => {
    if (open) {
      setSelectedTemplateId(currentTemplateId);
      setStylePrompt("");
      setStyleRefImage("");
      loadTemplates();
    }
  }, [open, currentTemplateId]);

  // 加载模板列表，并在加载完成后填充当前模板的内容
  const loadTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const res = await api.get("/ai-agent/style-templates", {
        params: { category: config.category }
      });
      const list = res.data || [];
      setTemplates(list);
      
      // 如果有当前模板，填充其内容到输入框
      if (currentTemplateId) {
        const current = list.find((t: StyleTemplate) => t.id === currentTemplateId);
        if (current) {
          setStylePrompt(current.systemPrompt || "");
          setStyleRefImage(current.refImage || "");
        }
      }
    } catch (error) {
      console.error("加载模板失败", error);
    } finally {
      setLoadingTemplates(false);
    }
  };

  // 选择模板 - 复制模板内容到输入框
  const handleSelectTemplate = (template: StyleTemplate) => {
    setSelectedTemplateId(template.id);
    setStylePrompt(template.systemPrompt || "");
    setStyleRefImage(template.refImage || "");
    setDropdownOpen(false);
  };

  // 上传参考图
  const handleUploadRefImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploading(true);
    try {
      const url = await uploadToOss(file, "style-ref");
      setStyleRefImage(url);
    } catch (err) {
      toast("上传失败", "error");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // 删除参考图
  const handleRemoveRefImage = () => {
    setStyleRefImage("");
  };

  // 保存
  const handleSave = async () => {
    setSaving(true);
    const payload = {
      type: assetType,
      templateId: selectedTemplateId,
      customPrompt: stylePrompt.trim() || null,
      customRefImage: styleRefImage || null,
    };
    console.log("[CharacterStyleModal] 保存风格设置:", payload);
    try {
      await api.put(`/ai-agent/workflows/${workflowId}/asset-style`, payload);
      toast("风格设置已保存", "success");
      onSaved();
      onOpenChange(false);
    } catch (error: any) {
      toast(error.response?.data?.error || "保存失败", "error");
    } finally {
      setSaving(false);
    }
  };

  // 清空内容（不关闭弹窗，不调用API）
  const handleClear = () => {
    setSelectedTemplateId(null);
    setStylePrompt("");
    setStyleRefImage("");
  };

  // 是否有任何风格设置（包括选中模板或有自定义内容）
  const hasAnyStyle = selectedTemplateId || stylePrompt.trim() || styleRefImage;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-zinc-950 border-zinc-800 text-zinc-100 p-0 overflow-hidden flex flex-col max-h-[85vh] shadow-2xl [&>button]:hidden">
        {/* 隐藏的 DialogTitle 用于无障碍支持 */}
        <DialogTitle className="sr-only">{config.title}</DialogTitle>
        
        {/* 顶部标题 */}
        <div className={cn(
          "flex items-center justify-between px-5 py-4 border-b border-zinc-800/80",
          "bg-gradient-to-r", config.gradient
        )}>
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center shadow-lg",
              config.color === "purple" && "bg-gradient-to-br from-purple-500 to-indigo-600",
              config.color === "blue" && "bg-gradient-to-br from-blue-500 to-cyan-600",
              config.color === "orange" && "bg-gradient-to-br from-orange-500 to-amber-600"
            )}>
              <Palette className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-base text-white">{config.title}</h2>
              <span className="text-xs text-zinc-400">{config.description}</span>
            </div>
          </div>
          <button 
            onClick={() => onOpenChange(false)}
            className="p-2 hover:bg-zinc-800/80 rounded-lg transition-colors text-zinc-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* 模板快速选择 */}
          <div>
            <label className="text-sm font-medium text-zinc-300 mb-2 block flex items-center gap-2">
              <Sparkles className={cn(
                "w-4 h-4",
                config.color === "purple" && "text-purple-400",
                config.color === "blue" && "text-blue-400",
                config.color === "orange" && "text-orange-400"
              )} />
              快速选择模板
            </label>
            <p className="text-xs text-zinc-500 mb-2">选择模板后会自动填充下方输入框，你可以继续编辑</p>
            <div className="relative">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                disabled={loadingTemplates}
                className={cn(
                  "w-full flex items-center justify-between px-4 py-2.5 rounded-xl border transition-all text-left",
                  "bg-zinc-900/60 border-zinc-800 hover:border-zinc-600",
                  dropdownOpen && "border-zinc-600 ring-1 ring-zinc-600/30"
                )}
              >
                {loadingTemplates ? (
                  <span className="flex items-center gap-2 text-zinc-500 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" /> 加载模板...
                  </span>
                ) : (
                  <span className="text-zinc-400 text-sm">点击选择预设风格模板...</span>
                )}
                <ChevronDown className={cn(
                  "w-4 h-4 text-zinc-500 transition-transform",
                  dropdownOpen && "rotate-180"
                )} />
              </button>

              {/* 下拉列表 */}
              {dropdownOpen && !loadingTemplates && (
                <div className="absolute z-50 w-full mt-2 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl max-h-56 overflow-y-auto">
                  {templates.length === 0 ? (
                    <div className="px-4 py-6 text-sm text-zinc-500 text-center">
                      <Palette className="w-6 h-6 mx-auto mb-2 opacity-30" />
                      暂无可用模板
                    </div>
                  ) : (
                    templates.map((template) => (
                      <button
                        key={template.id}
                        onClick={() => handleSelectTemplate(template)}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800/60 transition-colors text-left",
                          selectedTemplateId === template.id && "bg-zinc-800/40"
                        )}
                      >
                        {template.refImage ? (
                          <img src={template.refImage} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0 border border-zinc-700" />
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0">
                            <ImageIcon className="w-4 h-4 text-zinc-600" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-white">{template.templateName}</span>
                            {selectedTemplateId === template.id && (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            )}
                          </div>
                          {template.description && (
                            <p className="text-xs text-zinc-500 truncate">{template.description}</p>
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 参考图上传 */}
          <div>
            <label className="text-sm font-medium text-zinc-300 mb-2 block flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-cyan-400" />
              参考图
              <span className="text-xs text-zinc-500 font-normal">可选</span>
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleUploadRefImage}
              className="hidden"
            />
            <div className="flex items-start gap-3">
              {styleRefImage ? (
                <div className="relative group">
                  <img
                    src={styleRefImage}
                    alt="参考图"
                    className="w-24 h-24 rounded-xl object-cover border-2 border-zinc-700 group-hover:border-zinc-600 transition-colors"
                  />
                  <button
                    onClick={handleRemoveRefImage}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 hover:bg-red-400 rounded-full flex items-center justify-center transition-colors shadow-lg"
                  >
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className={cn(
                    "w-24 h-24 rounded-xl border-2 border-dashed transition-all",
                    "flex flex-col items-center justify-center gap-1",
                    "border-zinc-700 text-zinc-500 hover:border-cyan-500/50 hover:text-cyan-400 hover:bg-cyan-500/5"
                  )}
                >
                  {uploading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Upload className="w-5 h-5" />
                      <span className="text-[10px]">上传图片</span>
                    </>
                  )}
                </button>
              )}
              <p className="text-xs text-zinc-500 flex-1 pt-1">
                上传参考图后，AI生成时会参考该图片的风格
              </p>
            </div>
          </div>

          {/* 风格提示词 */}
          <div>
            <label className="text-sm font-medium text-zinc-300 mb-2 block flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-yellow-400" />
              风格提示词
              <span className="text-xs text-zinc-500 font-normal">可选</span>
            </label>
            <Textarea
              value={stylePrompt}
              onChange={(e) => setStylePrompt(e.target.value)}
              placeholder="输入风格提示词，如：anime style, soft lighting, pastel colors..."
              className="min-h-[100px] bg-zinc-900/60 border-zinc-700 text-zinc-200 placeholder:text-zinc-600 resize-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600/30"
            />
            <p className="text-xs text-zinc-500 mt-1.5">
              生成图片时会将此提示词拼接到最终prompt中
            </p>
          </div>

          {/* 提示 */}
          {!hasAnyStyle && (
            <div className="flex items-center gap-2 text-xs text-zinc-500 py-2 px-3 bg-zinc-900/40 rounded-lg border border-zinc-800/50">
              <Sparkles className="w-3.5 h-3.5 text-zinc-600" />
              如不设置，将使用全局画风设置
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="p-4 border-t border-zinc-800/80 bg-zinc-900/40 flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="h-9 px-3 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
            disabled={!hasAnyStyle}
          >
            <RotateCcw className="w-4 h-4 mr-1.5" />
            清空
          </Button>
          
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="h-9 px-4 border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-white"
            >
              取消
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className={cn(
                "h-9 px-5 font-medium text-white shadow-lg",
                config.color === "purple" && "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-purple-900/30",
                config.color === "blue" && "bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 shadow-blue-900/30",
                config.color === "orange" && "bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 shadow-orange-900/30"
              )}
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  保存中
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 mr-1" />
                  保存
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
