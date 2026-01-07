"use client";

import { useState, useEffect, useRef } from "react";
import { AssetGallery } from "./AssetGallery";
import {
  Layers,
  Upload,
  Loader2,
  Wand2,
  Sparkles,
  User,
  MapPin,
  Box,
  X,
  Video,
  Plus,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import api from "@/lib/api";
import { useToast } from "@/components/ui/toast-provider";
import { useConfirm } from "@/components/ui/confirm-dialog";
import ImageUploader from "./ImageUploader";
import AssetSelectorDialog from "./AssetSelectorDialog";
import ModelSelector from "./ModelSelector";
import { useImageModels } from "@/lib/useImageModels";
import { safeAsync } from "@/lib/error-handler";
import { wsService } from "@/lib/websocket";
import { cn } from "@/lib/utils";

interface CompositeTabProps {
  projectId: number;
  composites: any[];
  onUpdate: () => void;
  onUseForVideo?: (imageUrl: string, prompt: string) => void;
}

// 解析 imageUrls，优先使用 imageUrl 字段
function getFirstImageUrl(image: any): string | null {
  if (image.imageUrl) return image.imageUrl;
  const imageUrls = image.imageUrls;
  if (!imageUrls) return null;
  try {
    const urls = JSON.parse(imageUrls);
    if (Array.isArray(urls) && urls.length > 0) {
      return urls[0];
    }
  } catch {
    if (typeof imageUrls === "string" && imageUrls.startsWith("http")) {
      return imageUrls;
    }
  }
  return null;
}

export default function CompositeTab({
  projectId,
  composites,
  onUpdate,
  onUseForVideo,
}: CompositeTabProps) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [showDialog, setShowDialog] = useState(false);
  const [mode, setMode] = useState<"generate" | "upload">("generate");
  const [creating, setCreating] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // 素材选择器状态
  const [assetSelectorOpen, setAssetSelectorOpen] = useState(false);
  const [assetSelectorType, setAssetSelectorType] = useState<
    "characters" | "scenes" | "props" | "effects"
  >("characters");

  // 已选素材
  const [selectedChars, setSelectedChars] = useState<any[]>([]);
  const [selectedScenes, setSelectedScenes] = useState<any[]>([]);
  const [selectedProps, setSelectedProps] = useState<any[]>([]);
  const [selectedEffects, setSelectedEffects] = useState<any[]>([]);

  // 表单错误状态
  const [errors, setErrors] = useState<{
    name?: boolean;
    prompt?: boolean;
    imageUrl?: boolean;
    assets?: boolean;
  }>({});

  // 使用 API 获取图片模型列表
  const { defaultModel, loading: modelsLoading } = useImageModels("project");

  const [formData, setFormData] = useState({
    name: "",
    prompt: "",
    model: "",
    ratio: "16:9",
    imageUrl: "",
  });

  // 当模型列表加载完成后，设置默认模型
  useEffect(() => {
    if (!modelsLoading && defaultModel && !formData.model) {
      setFormData(prev => ({ ...prev, model: defaultModel }));
    }
  }, [modelsLoading, defaultModel, formData.model]);

  useEffect(() => {
    wsService.connect();
    wsService.subscribeToAssets(handleAssetUpdate);
    
    // 注册重连回调：WebSocket 重连后刷新素材列表
    const unsubscribeReconnect = wsService.onReconnect(() => {
      console.log('🔄 WebSocket 重连，刷新合成素材列表');
      onUpdate();
    });
    
    return () => {
      wsService.unsubscribeFromAssets();
      unsubscribeReconnect();
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const handleAssetUpdate = (message: any) => {
    if (
      message.type === "ASSET_STATUS_UPDATE" &&
      message.assetType === "composite"
    ) {
      if (message.status === "COMPLETED" || message.status === "FAILED") {
        onUpdate();
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      }
    }
  };

  const startPolling = () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(() => onUpdate(), 5000);
    setTimeout(() => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    }, 30000);
  };

  const resetForm = () => {
    setFormData({
      name: "",
      prompt: "",
      model: defaultModel || "",
      ratio: "16:9",
      imageUrl: "",
    });
    setSelectedChars([]);
    setSelectedScenes([]);
    setSelectedProps([]);
    setSelectedEffects([]);
    setErrors({});
  };

  // 打开素材选择器
  const openAssetSelector = (
    type: "characters" | "scenes" | "props" | "effects"
  ) => {
    setAssetSelectorType(type);
    setAssetSelectorOpen(true);
  };

  // 处理素材选择
  const handleAssetSelect = (asset: any) => {
    if (assetSelectorType === "characters") {
      if (!selectedChars.find((c) => c.id === asset.id)) {
        setSelectedChars([...selectedChars, asset]);
      }
    } else if (assetSelectorType === "scenes") {
      if (!selectedScenes.find((s) => s.id === asset.id)) {
        setSelectedScenes([...selectedScenes, asset]);
      }
    } else if (assetSelectorType === "props") {
      if (!selectedProps.find((p) => p.id === asset.id)) {
        setSelectedProps([...selectedProps, asset]);
      }
    } else if (assetSelectorType === "effects") {
      if (!selectedEffects.find((e) => e.id === asset.id)) {
        setSelectedEffects([...selectedEffects, asset]);
      }
    }
    setErrors({ ...errors, assets: false });
  };

  // 移除素材
  const removeChar = (id: number) =>
    setSelectedChars(selectedChars.filter((c) => c.id !== id));
  const removeScene = (id: number) =>
    setSelectedScenes(selectedScenes.filter((s) => s.id !== id));
  const removeProp = (id: number) =>
    setSelectedProps(selectedProps.filter((p) => p.id !== id));
  const removeEffect = (id: number) =>
    setSelectedEffects(selectedEffects.filter((e) => e.id !== id));

  // AI 丰富提示词
  const enhancePromptWithAI = async () => {
    const hasAssets =
      selectedChars.length +
        selectedScenes.length +
        selectedProps.length +
        selectedEffects.length >
      0;
    if (!formData.prompt.trim() && !hasAssets) {
      toast("请先输入描述或选择素材", "error");
      return;
    }
    setAiGenerating(true);
    try {
      let desc = formData.prompt || "";
      selectedChars.forEach((c) => (desc += ` 角色：${c.name}`));
      selectedScenes.forEach((s) => (desc += ` 场景：${s.name}`));
      selectedProps.forEach((p) => (desc += ` 物品：${p.name}`));
      selectedEffects.forEach((e) => (desc += ` 特效：${e.name}`));

      const imageUrl =
        selectedChars[0]?.imageUrl ||
        selectedScenes[0]?.imageUrl ||
        selectedProps[0]?.imageUrl ||
        null;

      const res = await api.post("/ai/enhance-image-prompt", {
        description: desc,
        imageUrl: imageUrl,
      });
      if (res.data?.prompt) {
        setFormData({ ...formData, prompt: res.data.prompt });
        toast("✨ 提示词已丰富", "success");
      }
    } catch (err: any) {
      toast("AI服务暂时不可用", "error");
    } finally {
      setAiGenerating(false);
    }
  };

  const handleSubmit = async () => {
    // 验证表单
    const newErrors: {
      name?: boolean;
      prompt?: boolean;
      imageUrl?: boolean;
      assets?: boolean;
    } = {};
    if (!formData.name) newErrors.name = true;

    if (mode === "generate") {
      const hasAssets =
        selectedChars.length +
          selectedScenes.length +
          selectedProps.length +
          selectedEffects.length >
        0;
      if (!hasAssets && !formData.prompt) {
        newErrors.assets = true;
        newErrors.prompt = true;
      }
    }

    if (mode === "upload" && !formData.imageUrl) newErrors.imageUrl = true;

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      if (newErrors.name) toast("请填写融合图名称", "error");
      else if (newErrors.assets) toast("请选择至少一个素材或填写描述", "error");
      else if (newErrors.imageUrl) toast("请上传图片", "error");
      return;
    }

    setCreating(true);
    await safeAsync(
      async () => {
        if (mode === "generate") {
          // 构建融合提示词
          let fusionPrompt = formData.prompt || "";
          selectedChars.forEach((c) => (fusionPrompt += ` Character: ${c.name}`));
          selectedScenes.forEach((s) => (fusionPrompt += ` Scene: ${s.name}`));
          selectedProps.forEach((p) => (fusionPrompt += ` Prop: ${p.name}`));
          selectedEffects.forEach((e) => (fusionPrompt += ` Effect: ${e.name}`));

          // 获取参考图
          const referenceImage =
            selectedChars[0]?.imageUrl ||
            selectedScenes[0]?.imageUrl ||
            selectedProps[0]?.imageUrl ||
            selectedEffects[0]?.imageUrl ||
            null;

          return await api.post(`/projects/${projectId}/composites/generate`, {
            projectId,
            name: formData.name,
            prompt: fusionPrompt,
            model: formData.model,
            ratio: formData.ratio,
            referenceImage,
            characterIds: selectedChars.map((c) => c.id),
            sceneIds: selectedScenes.map((s) => s.id),
            propIds: selectedProps.map((p) => p.id),
            effectIds: selectedEffects.map((e) => e.id),
          });
        } else {
          return await api.post(`/projects/${projectId}/composites/upload`, {
            projectId,
            name: formData.name,
            imageUrl: formData.imageUrl,
          });
        }
      },
      toast,
      {
        successMessage:
          mode === "generate"
            ? "🎨 融合图生成任务已提交，请稍候..."
            : "✅ 融合图上传成功",
        onSuccess: () => {
          setShowDialog(false);
          resetForm();
          onUpdate();
          if (mode === "generate") startPolling();
        },
      }
    );
    setCreating(false);
  };

  const handleDelete = async (id: number) => {
    const confirmed = await confirm({
      title: "确认删除",
      description: "确定要删除这张融合图吗？此操作无法撤销。",
      confirmText: "删除",
      cancelText: "取消",
      variant: "danger",
    });
    if (!confirmed) return;
    await safeAsync(
      async () => await api.delete(`/composites/${id}`),
      toast,
      { successMessage: "🗑️ 删除成功", onSuccess: () => onUpdate() }
    );
  };

  // 用于生视频
  const handleUseForVideo = (image: any) => {
    const imageUrl = getFirstImageUrl(image);
    if (!imageUrl) {
      toast("图片URL无效", "error");
      return;
    }
    if (onUseForVideo) {
      onUseForVideo(imageUrl, image.additionalPrompt || image.description || "");
    }
  };

  // 转换 composites 数据格式以适配 AssetGallery
  const galleryAssets = composites.map((c) => ({
    ...c,
    imageUrl: getFirstImageUrl(c),
    description: c.additionalPrompt || c.description,
  }));

  return (
    <>
      <AssetGallery
        title="融合图库"
        description="将多个素材（角色、场景、物品、特效）融合生成新图片，支持AI生成和手动上传"
        assets={galleryAssets}
        icon={Layers}
        iconColor="text-cyan-500"
        onGenerate={() => {
          setMode("generate");
          setShowDialog(true);
        }}
        onUpload={() => {
          setMode("upload");
          setShowDialog(true);
        }}
        onDelete={handleDelete}
        onUseForVideo={onUseForVideo ? handleUseForVideo : undefined}
        emptyText="融合多个素材创建独特的画面。选择角色、场景、物品等素材，AI将智能融合生成。"
      />

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="bg-zinc-950/95 backdrop-blur-xl text-white border-white/10 max-w-4xl rounded-2xl shadow-2xl p-0 overflow-hidden max-h-[90vh] overflow-y-auto">
          <DialogHeader className="p-6 border-b border-white/5 bg-gradient-to-r from-cyan-900/20 to-blue-900/20">
            <DialogTitle className="text-xl">
              {mode === "generate" ? "AI 生成融合图" : "上传融合图"}
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              {mode === "generate"
                ? "选择多个素材（角色、场景、物品、特效），AI将智能融合生成新图片"
                : "上传已有的融合图作为项目素材"}
            </DialogDescription>
          </DialogHeader>

          <Tabs value={mode} onValueChange={(v: any) => setMode(v)} className="w-full">
            <div className="px-6 pt-6">
              <TabsList className="grid w-full grid-cols-2 bg-zinc-900/50 p-1 rounded-xl border border-white/5">
                <TabsTrigger
                  value="generate"
                  className="rounded-lg data-[state=active]:bg-zinc-800 data-[state=active]:text-white py-2"
                >
                  <Wand2 className="w-4 h-4 mr-2" /> AI 生成
                </TabsTrigger>
                <TabsTrigger
                  value="upload"
                  className="rounded-lg data-[state=active]:bg-zinc-800 data-[state=active]:text-white py-2"
                >
                  <Upload className="w-4 h-4 mr-2" /> 手动上传
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="p-6">
              {mode === "generate" ? (
                <div className="space-y-6">
                  {/* 素材选择区域 - 每行一个类型 */}
                  <div className="space-y-3">
                    <Label className="text-sm text-zinc-400 flex items-center gap-2">
                      <Layers className="w-4 h-4 text-cyan-400" />
                      选择融合素材（可多选）
                    </Label>

                    {/* 角色行 */}
                    <div className="flex items-start gap-3 p-3 bg-zinc-900/40 rounded-xl border border-purple-500/20">
                      <button
                        onClick={() => openAssetSelector("characters")}
                        className="flex flex-col items-center justify-center w-16 h-16 bg-purple-500/10 border-2 border-dashed border-purple-500/40 rounded-xl text-purple-400 hover:bg-purple-500/20 hover:border-purple-500/60 transition-all shrink-0"
                      >
                        <User className="h-5 w-5 mb-1" />
                        <Plus className="h-4 w-4" />
                      </button>
                      <div className="flex-1 flex flex-wrap gap-3 min-h-[64px] items-start content-start">
                        {selectedChars.length === 0 ? (
                          <span className="text-xs text-zinc-600 self-center">点击左侧添加角色</span>
                        ) : (
                          selectedChars.map((char) => (
                            <div key={`char-${char.id}`} className="relative group">
                              <div className="w-16 h-16 rounded-lg overflow-hidden border-2 border-purple-500/50 bg-purple-500/20">
                                {char.imageUrl ? (
                                  <img src={char.imageUrl} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <User className="h-6 w-6 text-purple-400" />
                                  </div>
                                )}
                              </div>
                              <button 
                                onClick={() => removeChar(char.id)} 
                                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 hover:bg-red-400 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X className="h-3 w-3 text-white" />
                              </button>
                              <p className="text-[10px] text-purple-300 text-center mt-1 truncate w-16">{char.name}</p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* 场景行 */}
                    <div className="flex items-start gap-3 p-3 bg-zinc-900/40 rounded-xl border border-blue-500/20">
                      <button
                        onClick={() => openAssetSelector("scenes")}
                        className="flex flex-col items-center justify-center w-16 h-16 bg-blue-500/10 border-2 border-dashed border-blue-500/40 rounded-xl text-blue-400 hover:bg-blue-500/20 hover:border-blue-500/60 transition-all shrink-0"
                      >
                        <MapPin className="h-5 w-5 mb-1" />
                        <Plus className="h-4 w-4" />
                      </button>
                      <div className="flex-1 flex flex-wrap gap-3 min-h-[64px] items-start content-start">
                        {selectedScenes.length === 0 ? (
                          <span className="text-xs text-zinc-600 self-center">点击左侧添加场景</span>
                        ) : (
                          selectedScenes.map((scene) => (
                            <div key={`scene-${scene.id}`} className="relative group">
                              <div className="w-16 h-16 rounded-lg overflow-hidden border-2 border-blue-500/50 bg-blue-500/20">
                                {scene.imageUrl ? (
                                  <img src={scene.imageUrl} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <MapPin className="h-6 w-6 text-blue-400" />
                                  </div>
                                )}
                              </div>
                              <button 
                                onClick={() => removeScene(scene.id)} 
                                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 hover:bg-red-400 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X className="h-3 w-3 text-white" />
                              </button>
                              <p className="text-[10px] text-blue-300 text-center mt-1 truncate w-16">{scene.name}</p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* 物品行 */}
                    <div className="flex items-start gap-3 p-3 bg-zinc-900/40 rounded-xl border border-amber-500/20">
                      <button
                        onClick={() => openAssetSelector("props")}
                        className="flex flex-col items-center justify-center w-16 h-16 bg-amber-500/10 border-2 border-dashed border-amber-500/40 rounded-xl text-amber-400 hover:bg-amber-500/20 hover:border-amber-500/60 transition-all shrink-0"
                      >
                        <Box className="h-5 w-5 mb-1" />
                        <Plus className="h-4 w-4" />
                      </button>
                      <div className="flex-1 flex flex-wrap gap-3 min-h-[64px] items-start content-start">
                        {selectedProps.length === 0 ? (
                          <span className="text-xs text-zinc-600 self-center">点击左侧添加物品</span>
                        ) : (
                          selectedProps.map((prop) => (
                            <div key={`prop-${prop.id}`} className="relative group">
                              <div className="w-16 h-16 rounded-lg overflow-hidden border-2 border-amber-500/50 bg-amber-500/20">
                                {prop.imageUrl ? (
                                  <img src={prop.imageUrl} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <Box className="h-6 w-6 text-amber-400" />
                                  </div>
                                )}
                              </div>
                              <button 
                                onClick={() => removeProp(prop.id)} 
                                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 hover:bg-red-400 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X className="h-3 w-3 text-white" />
                              </button>
                              <p className="text-[10px] text-amber-300 text-center mt-1 truncate w-16">{prop.name}</p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* 特效行 */}
                    <div className="flex items-start gap-3 p-3 bg-zinc-900/40 rounded-xl border border-pink-500/20">
                      <button
                        onClick={() => openAssetSelector("effects")}
                        className="flex flex-col items-center justify-center w-16 h-16 bg-pink-500/10 border-2 border-dashed border-pink-500/40 rounded-xl text-pink-400 hover:bg-pink-500/20 hover:border-pink-500/60 transition-all shrink-0"
                      >
                        <Sparkles className="h-5 w-5 mb-1" />
                        <Plus className="h-4 w-4" />
                      </button>
                      <div className="flex-1 flex flex-wrap gap-3 min-h-[64px] items-start content-start">
                        {selectedEffects.length === 0 ? (
                          <span className="text-xs text-zinc-600 self-center">点击左侧添加特效</span>
                        ) : (
                          selectedEffects.map((effect) => (
                            <div key={`effect-${effect.id}`} className="relative group">
                              <div className="w-16 h-16 rounded-lg overflow-hidden border-2 border-pink-500/50 bg-pink-500/20">
                                {effect.imageUrl ? (
                                  <img src={effect.imageUrl} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <Sparkles className="h-6 w-6 text-pink-400" />
                                  </div>
                                )}
                              </div>
                              <button 
                                onClick={() => removeEffect(effect.id)} 
                                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 hover:bg-red-400 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X className="h-3 w-3 text-white" />
                              </button>
                              <p className="text-[10px] text-pink-300 text-center mt-1 truncate w-16">{effect.name}</p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                    {errors.assets && (
                      <p className="text-red-400 text-xs">请选择至少一个素材</p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                    {/* 左侧: Prompt */}
                    <div className="md:col-span-7 space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm text-zinc-400">
                          融合描述 (Prompt)
                        </Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={enhancePromptWithAI}
                          disabled={aiGenerating}
                          className="text-xs text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 h-7 px-2"
                        >
                          {aiGenerating ? (
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          ) : (
                            <Sparkles className="w-3 h-3 mr-1" />
                          )}
                          {aiGenerating ? "生成中" : "AI丰富"}
                        </Button>
                      </div>
                      <Textarea
                        value={formData.prompt}
                        onChange={(e) => {
                          setFormData({ ...formData, prompt: e.target.value });
                          if (e.target.value)
                            setErrors({ ...errors, prompt: false });
                        }}
                        placeholder="描述你想要的融合效果，如：角色站在场景中央，手持物品，周围有特效环绕..."
                        className={cn(
                          "bg-zinc-900/30 min-h-[280px] text-sm resize-none rounded-xl focus:ring-1 transition-colors",
                          errors.prompt
                            ? "border-red-500 focus:border-red-500 focus:ring-red-500/20"
                            : "border-white/10 focus:border-cyan-500/50 focus:ring-cyan-500/20"
                        )}
                      />
                    </div>

                    {/* 右侧: 设置 */}
                    <div className="md:col-span-5 space-y-5">
                      <div>
                        <Label className="text-sm text-zinc-400 mb-2 block">
                          融合图名称 *
                        </Label>
                        <Input
                          value={formData.name}
                          onChange={(e) => {
                            setFormData({ ...formData, name: e.target.value });
                            if (e.target.value)
                              setErrors({ ...errors, name: false });
                          }}
                          placeholder="例如: 主角战斗场景"
                          className={cn(
                            "bg-zinc-900/30 h-11 rounded-xl transition-colors",
                            errors.name
                              ? "border-red-500 focus:border-red-500 focus:ring-red-500/20"
                              : "border-white/10"
                          )}
                        />
                        {errors.name && (
                          <p className="text-red-400 text-xs mt-1">
                            请填写融合图名称
                          </p>
                        )}
                      </div>
                      <div>
                        <Label className="text-sm text-zinc-400 mb-2 block">
                          生成模型
                        </Label>
                        <ModelSelector
                          value={formData.model}
                          onChange={(v) =>
                            setFormData({ ...formData, model: v })
                          }
                          className="bg-zinc-900/30 border-white/10 h-11 rounded-xl"
                        />
                      </div>
                      <div>
                        <Label className="text-sm text-zinc-400 mb-2 block">
                          图片比例
                        </Label>
                        <Select
                          value={formData.ratio}
                          onValueChange={(v) =>
                            setFormData({ ...formData, ratio: v })
                          }
                        >
                          <SelectTrigger className="bg-zinc-900/30 border-white/10 h-11 rounded-xl">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border-white/10">
                            <SelectItem value="16:9">16:9 横屏</SelectItem>
                            <SelectItem value="9:16">9:16 竖屏</SelectItem>
                            <SelectItem value="1:1">1:1 方形</SelectItem>
                            <SelectItem value="4:3">4:3 标准</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="max-w-3xl mx-auto">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* 左侧：上传区域 */}
                    <div className="space-y-4">
                      <Label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                        <Upload className="w-4 h-4 text-cyan-400" />
                        上传图片
                      </Label>
                      {formData.imageUrl ? (
                        <div className="relative group rounded-2xl overflow-hidden border border-cyan-500/30 bg-gradient-to-br from-cyan-500/5 to-blue-500/5">
                          <div className="aspect-[4/3]">
                            <img
                              src={formData.imageUrl}
                              alt="Preview"
                              className="w-full h-full object-contain bg-black/20"
                            />
                          </div>
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col items-center justify-center gap-3">
                            <p className="text-white/80 text-sm">点击更换图片</p>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setFormData({ ...formData, imageUrl: "" })
                              }
                              className="bg-red-500/20 hover:bg-red-500/40 text-red-400 border-red-500/50 rounded-full px-5"
                            >
                              移除图片
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div
                          className={cn(
                            "rounded-2xl transition-all duration-300 bg-gradient-to-br from-zinc-900/60 to-zinc-900/30 border-2 border-dashed hover:border-cyan-500/50 hover:bg-zinc-900/50",
                            errors.imageUrl 
                              ? "border-red-500/50 ring-2 ring-red-500/20" 
                              : "border-zinc-700/50"
                          )}
                        >
                          <ImageUploader
                            onUpload={(url) => {
                              setFormData({ ...formData, imageUrl: url });
                              setErrors({ ...errors, imageUrl: false });
                            }}
                            label=""
                            description="支持 JPG、PNG、GIF 等格式，最大 10MB"
                            className="min-h-[320px]"
                          />
                        </div>
                      )}
                      {errors.imageUrl && (
                        <p className="text-red-400 text-xs flex items-center gap-1">
                          <span className="w-1 h-1 rounded-full bg-red-400"></span>
                          请上传图片
                        </p>
                      )}
                    </div>

                    {/* 右侧：表单信息 */}
                    <div className="space-y-6">
                      <div className="bg-gradient-to-br from-zinc-900/80 to-zinc-900/40 rounded-2xl border border-white/5 p-6 space-y-5">
                        <div className="space-y-3">
                          <Label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                            <Layers className="w-4 h-4 text-cyan-400" />
                            融合图名称
                          </Label>
                          <Input
                            value={formData.name}
                            onChange={(e) => {
                              setFormData({ ...formData, name: e.target.value });
                              if (e.target.value)
                                setErrors({ ...errors, name: false });
                            }}
                            placeholder="例如: 主角战斗场景..."
                            className={cn(
                              "bg-black/30 h-12 text-base rounded-xl transition-colors border-white/10 focus:border-cyan-500/50 focus:ring-cyan-500/20",
                              errors.name &&
                                "border-red-500 focus:border-red-500 focus:ring-red-500/20"
                            )}
                          />
                          {errors.name && (
                            <p className="text-red-400 text-xs flex items-center gap-1">
                              <span className="w-1 h-1 rounded-full bg-red-400"></span>
                              请填写融合图名称
                            </p>
                          )}
                        </div>

                        {/* 提示信息 */}
                        <div className="pt-4 border-t border-white/5">
                          <div className="flex items-start gap-3 p-4 bg-cyan-500/5 rounded-xl border border-cyan-500/10">
                            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center shrink-0">
                              <Sparkles className="w-4 h-4 text-cyan-400" />
                            </div>
                            <div className="space-y-1">
                              <p className="text-sm text-zinc-300 font-medium">上传提示</p>
                              <p className="text-xs text-zinc-500 leading-relaxed">
                                上传已有的融合图作为项目素材，支持高清图片。建议使用 16:9 或 4:3 比例的图片以获得最佳展示效果。
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="p-6 bg-zinc-900/50 border-t border-white/5">
              <Button
                variant="ghost"
                onClick={() => setShowDialog(false)}
                className="h-11 px-6 rounded-xl hover:bg-white/5"
              >
                取消
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={creating}
                className="bg-cyan-500 hover:bg-cyan-400 text-white h-11 px-8 rounded-xl shadow-lg shadow-cyan-500/25"
              >
                {creating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    处理中...
                  </>
                ) : (
                  <>
                    {mode === "generate" ? (
                      <Wand2 className="w-4 h-4 mr-2" />
                    ) : (
                      <Upload className="w-4 h-4 mr-2" />
                    )}
                    {mode === "generate" ? "开始生成" : "确认上传"}
                  </>
                )}
              </Button>
            </DialogFooter>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* 素材选择对话框 */}
      <AssetSelectorDialog
        open={assetSelectorOpen}
        onOpenChange={setAssetSelectorOpen}
        projectId={projectId}
        assetType={assetSelectorType}
        onSelect={handleAssetSelect}
        title={`选择${
          assetSelectorType === "characters"
            ? "角色"
            : assetSelectorType === "scenes"
            ? "场景"
            : assetSelectorType === "props"
            ? "物品"
            : "特效"
        }素材`}
      />
    </>
  );
}
