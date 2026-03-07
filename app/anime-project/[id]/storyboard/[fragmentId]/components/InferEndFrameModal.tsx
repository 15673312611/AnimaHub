"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { 
  X, Sparkles, Loader2, Image as ImageIcon, Wand2, ChevronDown,
  Users, MapPin, Box, Zap, Plus, Upload, FolderOpen, Briefcase, Globe
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast-provider";
import { cn, toThumbnailUrl } from "@/lib/utils";
import { useImageModels } from "@/lib/useImageModels";
import { uploadToOss } from "@/lib/upload";
import api, { apiFetch } from "@/lib/api";
import type { CharacterData, SceneData, ItemData, ShotData } from "../types";

// 引用类型定义
type RefType = "character" | "scene" | "item" | "effect";

interface InferEndFrameModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shot: ShotData; // 传入完整 shot 对象
  firstFrameUrl: string;
  videoPrompt: string;
  defaultModel: string;
  customStyle: string;
  lastFramePrompt?: string | null; // AI分镜时生成的尾帧提示词
  // 参考素材
  characters: CharacterData[];
  scenes: SceneData[];
  items: ItemData[];
  projectId: number;
  onGenerate: (data: {
    model: string;
    prompt: string;
    ratio: string;
    batchCount: number;
    targetSlotIndex: number;
    refImages: { type: string; url: string }[];
  }) => Promise<boolean>;
  // 从父组件传递的推理模板配置
  endFrameInferenceTemplateCode?: string;
  endFrameInferenceTemplateType?: 'system' | 'user';
  // 刷新回调
  onUpdate?: () => void;
}

export default function InferEndFrameModal({
  open,
  onOpenChange,
  shot,
  firstFrameUrl,
  videoPrompt,
  defaultModel,
  customStyle,
  lastFramePrompt,
  characters,
  scenes,
  items,
  projectId,
  onGenerate,
  endFrameInferenceTemplateCode,
  endFrameInferenceTemplateType = 'system',
  onUpdate
}: InferEndFrameModalProps) {
  const { toast } = useToast();
  const { models } = useImageModels("project");
  
  const [selectedModel, setSelectedModel] = useState(defaultModel);
  const [inferredPrompt, setInferredPrompt] = useState("");
  const [saving, setSaving] = useState(false);
  
  // 用于跟踪是否是用户手动编辑（而非推理结果更新）
  const isUserEditRef = useRef(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [inferring, setInferring] = useState(false);
  const [ratio, setRatio] = useState("16:9");
  const [editableStyle, setEditableStyle] = useState(customStyle);
  
  // 参考图状态
  const [refImages, setRefImages] = useState<Record<RefType, string[]>>({
    character: [],
    scene: [],
    item: [],
    effect: []
  });
  
  // 首帧是否作为参考图
  const [includeFirstFrame, setIncludeFirstFrame] = useState(true);
  
  // 计算总参考图数量
  const totalRefCount = Object.values(refImages).flat().length + (includeFirstFrame ? 1 : 0);
  
  // 素材选择器状态
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [activeSelectorType, setActiveSelectorType] = useState<RefType>("character");
  
  // 记录上一次的 open 状态
  const [prevOpen, setPrevOpen] = useState(false);
  
  // 自动保存尾帧提示词（用户手动编辑后防抖保存）
  const saveLastFramePrompt = useCallback(async (prompt: string) => {
    if (!prompt.trim() || !shot?.id) return;
    setSaving(true);
    try {
      await api.put(`/ai-agent/shots/${shot.id}/details`, {
        lastFramePrompt: prompt
      });
      onUpdate?.();
    } catch (e) {
      console.error("保存尾帧提示词失败:", e);
    } finally {
      setSaving(false);
    }
  }, [shot?.id, onUpdate]);
  
  // 监听用户手动编辑并自动保存
  useEffect(() => {
    if (!isUserEditRef.current) return;
    
    // 清除之前的定时器
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // 防抖：用户停止输入800ms后自动保存
    saveTimeoutRef.current = setTimeout(() => {
      if (inferredPrompt.trim()) {
        saveLastFramePrompt(inferredPrompt);
      }
    }, 800);
    
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [inferredPrompt, saveLastFramePrompt]);
  
  // 处理用户手动编辑
  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    isUserEditRef.current = true;
    setInferredPrompt(e.target.value);
  };
  
  // 重置状态
  useEffect(() => {
    const justOpened = open && !prevOpen;
    setPrevOpen(open);
    
    if (!justOpened) return;
    
    setInferring(false);
    setEditableStyle(customStyle);
    if (defaultModel) setSelectedModel(defaultModel);
    isUserEditRef.current = false; // 重置用户编辑标记
    setIncludeFirstFrame(true); // 重置首帧状态
    
    // 自动加载已绑定的角色参考图
    const newRefImages: Record<RefType, string[]> = {
      character: [],
      scene: [],
      item: [],
      effect: []
    };
    
    if (shot) {
      // 加载角色参考图
      if (shot.refCharacterIds && shot.refCharacterIds.length > 0) {
        shot.refCharacterIds.forEach(charId => {
          const char = characters.find(c => c.id === charId);
          if (char && char.imageUrl && char.imageStatus === "COMPLETED") {
            newRefImages.character.push(char.imageUrl);
          }
        });
      }
      
      // 加载场景参考图
      if (shot.refSceneId) {
        const scene = scenes.find(s => s.id === shot.refSceneId);
        if (scene && scene.imageUrl && scene.imageStatus === "COMPLETED") {
          newRefImages.scene.push(scene.imageUrl);
        }
      }
    }
    
    setRefImages(newRefImages);
    
    // 如果已有尾帧提示词，直接显示，不需要推理
    if (lastFramePrompt && lastFramePrompt.trim()) {
      isUserEditRef.current = false; // 这是初始加载，不是用户编辑
      setInferredPrompt(lastFramePrompt);
    } else {
      setInferredPrompt("");
      // 打开弹窗后立即开始推理
      handleInferEndFramePrompt();
    }
  }, [open]);
  
  // 参考图操作
  const handleRemoveRef = (type: RefType, index: number) => {
    setRefImages(prev => ({ 
      ...prev, 
      [type]: prev[type].filter((_, i) => i !== index) 
    }));
  };

  const handleSelectAsset = (url: string) => {
    if (totalRefCount >= 6) {
      toast("最多只能添加6张额外参考图（不含首帧）", "error");
      return;
    }
    setRefImages(prev => ({ 
      ...prev, 
      [activeSelectorType]: [...prev[activeSelectorType], url] 
    }));
    setSelectorOpen(false);
  };
  
  const handleOpenSelector = (type: RefType) => {
    setActiveSelectorType(type);
    setSelectorOpen(true);
  };

  // 直接上传处理
  const handleDirectUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: RefType) => {
    if (totalRefCount >= 6) {
      toast("最多只能添加6张额外参考图", "error");
      return;
    }
    
    const file = e.target.files?.[0];
    if (!file) return;
    
    toast("正在上传...", "info");
    try {
      const url = await uploadToOss(file, `ai-agent/refs/${type}`);
      setRefImages(prev => ({ 
        ...prev, 
        [type]: [...prev[type], url] 
      }));
      toast("上传成功", "success");
    } catch (error) {
      toast("上传失败", "error");
    }
  };

  // 推理尾帧提示词（流式输出）
  const handleInferEndFramePrompt = async () => {
    if (!firstFrameUrl) {
      toast("缺少首帧图片", "error");
      return;
    }
    if (!videoPrompt.trim()) {
      toast("缺少视频提示词", "error");
      return;
    }
    
    setInferring(true);
    setInferredPrompt("");
    isUserEditRef.current = false; // 推理过程中不触发自动保存
    
    try {
      const response = await apiFetch(`/ai-agent/shots/${shot.id}/infer-end-frame-prompt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          firstFrameUrl,
          videoPrompt,
          templateType: endFrameInferenceTemplateType,
          templateId:
            endFrameInferenceTemplateType === 'user'
              ? endFrameInferenceTemplateCode
              : undefined,
          templateCode:
            endFrameInferenceTemplateType === 'system'
              ? (endFrameInferenceTemplateCode || 'END_FRAME_INFERENCE')
              : undefined
        })
      });
      
      // 解析流式输出内容
      const extractText = (payload: string): string => {
        const raw = (payload || "").trim();
        if (!raw) return "";
        try {
          const parsed = JSON.parse(raw);
          if (typeof parsed === "string") return parsed;
          return (
            parsed?.endFramePrompt ||
            parsed?.prompt ||
            parsed?.content ||
            parsed?.text ||
            parsed?.data ||
            ""
          );
        } catch {
          return raw;
        }
      };

      if (!response.ok) {
        const errText = extractText(await response.text());
        throw new Error(errText || "推理失败");
      }

      let accumulated = "";
      let rawText = "";

      if (response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          rawText += chunk;
          buffer += chunk;
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || "";
          
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            if (trimmed.startsWith("data:")) {
              const payload = trimmed.replace(/^data:\s?/, "").trim();
              if (!payload || payload === "[DONE]") continue;
              const text = extractText(payload);
              if (text) {
                accumulated += text;
                setInferredPrompt(accumulated);
              }
            } else if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
              const text = extractText(trimmed);
              if (text) {
                accumulated += text;
                setInferredPrompt(accumulated);
              }
            }
          }
        }
      } else {
        rawText = await response.text();
      }

      // 如果流式输出没有累积到内容，尝试从原始文本解析
      if (!accumulated.trim()) {
        const fallback = extractText(rawText);
        if (fallback) {
          setInferredPrompt(fallback);
          accumulated = fallback;
        } else {
          toast("推理结果为空", "error");
        }
      }

      if (accumulated.trim()) {
        // 保存推理结果到后端
        try {
          await api.put(`/ai-agent/shots/${shot.id}/details`, {
            lastFramePrompt: accumulated
          });
          onUpdate?.();
        } catch (e) {
          console.error("保存尾帧提示词失败:", e);
        }
        toast("推理完成", "success");
      }
    } catch (error: any) {
      const msg = error?.message || "推理失败";
      toast(msg, "error");
    } finally {
      setInferring(false);
    }
  };
  
  const handleSubmit = async () => {
    if (!inferredPrompt.trim()) {
      toast("请等待推理完成或手动输入提示词", "error");
      return;
    }

    // 收集所有参考图
    const validRefs: { type: string; url: string }[] = [];

    // 如果勾选了首帧，添加首帧作为第一张参考图
    if (includeFirstFrame && firstFrameUrl) {
      validRefs.push({ type: "character", url: firstFrameUrl });
    }

    (Object.keys(refImages) as RefType[]).forEach(key => {
      refImages[key].forEach(url => {
        validRefs.push({ type: key, url });
      });
    });

    // 触发生成（目标槽位索引为 1，即第二格 - 尾帧位置）
    const started = await onGenerate({
      model: selectedModel,
      prompt: inferredPrompt,
      ratio,
      batchCount: 1,
      targetSlotIndex: 1, // 尾帧固定放在第二格
      refImages: validRefs
    });

    if (started) {
      onOpenChange(false);
    }
  };
  
  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl bg-zinc-950 border-zinc-800 text-zinc-100 p-0 overflow-hidden flex flex-col max-h-[90vh] shadow-2xl [&>button]:hidden">
        <VisuallyHidden>
          <DialogTitle>AI推理尾帧</DialogTitle>
        </VisuallyHidden>
        {/* 顶部标题 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center border border-purple-500/30">
              <Sparkles className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="font-semibold text-base text-white">AI推理尾帧</h2>
              <p className="text-xs text-zinc-500">根据首帧和视频提示词推理尾帧画面</p>
            </div>
          </div>
          <button 
            onClick={() => onOpenChange(false)}
            className="p-2 hover:bg-zinc-800 rounded-full transition-colors text-zinc-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar bg-[#141416]">
          {/* 1. 参考图选择区域 */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-zinc-500" />
                参考素材
              </h3>
              <span className={cn("text-xs font-medium", totalRefCount >= 7 ? "text-red-400" : "text-zinc-500")}>
                {totalRefCount}/7 张
              </span>
            </div>
            
            {/* 首帧参考图（可删除） */}
            {includeFirstFrame && firstFrameUrl ? (
              <div className="mb-3 p-3 rounded-xl bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/30">
                <div className="flex items-center gap-3">
                  <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-purple-500/50 bg-zinc-900 flex-shrink-0 group">
                    <img 
                      src={toThumbnailUrl(firstFrameUrl, 200)} 
                      className="w-full h-full object-cover" 
                      alt="首帧"
                    />
                    <button 
                      onClick={() => setIncludeFirstFrame(false)}
                      className="absolute top-0.5 right-0.5 p-0.5 bg-black/60 hover:bg-red-500 rounded-full text-white transition-colors backdrop-blur-sm z-10 opacity-0 group-hover:opacity-100"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-purple-300 flex items-center gap-1">
                      <ImageIcon className="w-3 h-3" />
                      首帧参考
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-0.5">首帧图片作为主参考图</p>
                  </div>
                </div>
              </div>
            ) : !includeFirstFrame && firstFrameUrl ? (
              <div 
                className="mb-3 p-3 rounded-xl border border-dashed border-zinc-700 hover:border-purple-500/50 cursor-pointer transition-colors"
                onClick={() => setIncludeFirstFrame(true)}
              >
                <div className="flex items-center gap-3 text-zinc-500 hover:text-purple-400 transition-colors">
                  <div className="w-16 h-16 rounded-lg border border-zinc-700 bg-zinc-900/50 flex items-center justify-center">
                    <Plus className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-medium">添加首帧参考</div>
                    <p className="text-[10px] text-zinc-600 mt-0.5">点击重新添加首帧作为参考图</p>
                  </div>
                </div>
              </div>
            ) : null}
            
            {/* 额外参考图 */}
            <div className="grid grid-cols-2 gap-3">
              <RefCard 
                title="角色参考" 
                icon={<Users className="w-3.5 h-3.5 text-purple-400" />}
                type="character"
                imageUrls={refImages.character}
                onRemove={(idx) => handleRemoveRef("character", idx)}
                onOpenSelector={() => handleOpenSelector("character")}
                onUpload={(e) => handleDirectUpload(e, "character")}
                colorClass="group-hover:border-purple-500/30 hover:bg-purple-500/5"
                disableAdd={totalRefCount >= 6}
              />
              <RefCard 
                title="场景参考" 
                icon={<MapPin className="w-3.5 h-3.5 text-blue-400" />}
                type="scene"
                imageUrls={refImages.scene}
                onRemove={(idx) => handleRemoveRef("scene", idx)}
                onOpenSelector={() => handleOpenSelector("scene")}
                onUpload={(e) => handleDirectUpload(e, "scene")}
                colorClass="group-hover:border-blue-500/30 hover:bg-blue-500/5"
                disableAdd={totalRefCount >= 6}
              />
              <RefCard 
                title="道具参考" 
                icon={<Box className="w-3.5 h-3.5 text-orange-400" />}
                type="item"
                imageUrls={refImages.item}
                onRemove={(idx) => handleRemoveRef("item", idx)}
                onOpenSelector={() => handleOpenSelector("item")}
                onUpload={(e) => handleDirectUpload(e, "item")}
                colorClass="group-hover:border-orange-500/30 hover:bg-orange-500/5"
                disableAdd={totalRefCount >= 6}
              />
              <RefCard 
                title="特效参考" 
                icon={<Zap className="w-3.5 h-3.5 text-yellow-400" />}
                type="effect"
                imageUrls={refImages.effect}
                onRemove={(idx) => handleRemoveRef("effect", idx)}
                onOpenSelector={() => handleOpenSelector("effect")}
                onUpload={(e) => handleDirectUpload(e, "effect")}
                colorClass="group-hover:border-yellow-500/30 hover:bg-yellow-500/5"
                disableAdd={totalRefCount >= 6}
              />
            </div>
          </section>

          {/* 2. AI推理的尾帧提示词 */}
          <section className="bg-zinc-900/30 p-4 rounded-xl border border-zinc-800/50">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="w-1 h-4 rounded-full bg-purple-500"></span>
                <h3 className="text-sm font-medium text-zinc-200">AI推理的尾帧提示词</h3>
              </div>
              <div className="flex items-center gap-2">
                {inferring && (
                  <div className="flex items-center gap-1.5 text-xs text-purple-400">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>推理中...</span>
                  </div>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleInferEndFramePrompt}
                  disabled={inferring}
                  className="h-7 px-2.5 rounded-md text-xs text-purple-400 hover:text-purple-300 hover:bg-purple-500/10"
                >
                  {inferring ? null : (
                    <>
                      <Sparkles className="w-3 h-3 mr-1" />
                      重新推理
                    </>
                  )}
                </Button>
              </div>
            </div>
            <div className="relative">
            <Textarea
                value={inferredPrompt}
                onChange={handlePromptChange}
                className="bg-zinc-950 border-zinc-800 min-h-[140px] text-sm leading-relaxed p-3 rounded-lg focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 resize-none transition-all hover:border-zinc-700 custom-scrollbar"
                placeholder={inferring ? "AI正在分析首帧图片并推理尾帧..." : "推理结果将显示在此处，您也可以手动编辑"}
                disabled={inferring}
              />
              <div className="absolute bottom-2 right-2 flex items-center gap-2">
                {saving && (
                  <span className="text-[10px] text-purple-400 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    保存中
                  </span>
                )}
                <span className="text-[10px] text-zinc-600 bg-zinc-900/80 px-1.5 py-0.5 rounded border border-zinc-800">
                  {inferredPrompt.length} 字符
                </span>
              </div>
            </div>
          </section>

          {/* 3. 生成参数 */}
          <div className="grid grid-cols-2 gap-4">
            <section className="bg-zinc-900/30 p-4 rounded-xl border border-zinc-800/50">
              <div className="flex items-center gap-2 mb-3">
                <Wand2 className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-medium text-zinc-200">AI模型</h3>
              </div>
              <div className="relative group">
                <select
                  value={selectedModel}
                  onChange={e => setSelectedModel(e.target.value)}
                  className="w-full h-10 pl-3 pr-8 appearance-none bg-zinc-950 border border-zinc-800 rounded-lg focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 outline-none text-sm transition-all group-hover:border-zinc-700 text-zinc-300"
                >
                  {models.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
              </div>
            </section>

            <section className="bg-zinc-900/30 p-4 rounded-xl border border-zinc-800/50">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-1 h-4 rounded-full bg-blue-500"></span>
                <h3 className="text-sm font-medium text-zinc-200">画面比例</h3>
              </div>
              <div className="flex bg-zinc-950 p-1 rounded-lg border border-zinc-800/80">
                {["16:9", "9:16", "1:1", "4:3", "3:4"].map(r => (
                  <button
                    key={r}
                    onClick={() => setRatio(r)}
                    className={cn(
                      "flex-1 py-2 text-[11px] font-medium rounded-md transition-all",
                      ratio === r 
                        ? "bg-zinc-800 text-white border border-zinc-700" 
                        : "text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </section>
          </div>

        </div>

        {/* 底部按钮 */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-900/80 backdrop-blur-md flex items-center justify-end gap-3 sticky bottom-0 z-10">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="h-10 px-5 rounded-lg border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-white text-sm"
          >
            取消
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={inferring || !inferredPrompt.trim()}
            className="h-10 px-6 rounded-lg font-medium text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 shadow-lg shadow-purple-900/30 border border-purple-500/20 transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 text-sm"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            生成尾帧图片
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    
    {/* 素材选择弹窗 */}
    <AssetSelectorModal
      open={selectorOpen}
      onOpenChange={setSelectorOpen}
      type={activeSelectorType}
      projectId={projectId}
      characters={characters}
      scenes={scenes}
      items={items}
      onSelect={handleSelectAsset}
    />
    </>
  );
}

// 内部组件：参考图卡片
function RefCard({ 
  title, icon, type, imageUrls, onRemove, onOpenSelector, onUpload, colorClass, disableAdd
}: { 
  title: string; 
  icon: React.ReactNode; 
  type: RefType;
  imageUrls: string[];
  onRemove: (index: number) => void;
  onOpenSelector: () => void;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  colorClass?: string;
  disableAdd: boolean;
}) {
  return (
    <div className={cn(
      "flex flex-col gap-2 p-3 rounded-xl bg-zinc-900/50 border border-zinc-800/50 transition-all duration-300 group hover:shadow-lg",
      colorClass
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {icon}
          <span className="text-xs font-medium text-zinc-300">{title}</span>
        </div>
        <span className="text-[10px] text-zinc-500">{imageUrls.length} 张</span>
      </div>
      
      {/* 图片列表区域 */}
      <div className="min-h-[56px] grid grid-cols-4 gap-1.5">
        {imageUrls.map((url, i) => (
          <div key={i} className="relative aspect-square rounded-md overflow-hidden border border-zinc-700/50 group/img">
            <img src={toThumbnailUrl(url, 200)} className="w-full h-full object-cover" alt="" />
            <button 
              onClick={() => onRemove(i)}
              className="absolute top-0.5 right-0.5 p-0.5 bg-black/60 hover:bg-red-500 rounded-full text-white transition-colors backdrop-blur-sm z-10"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
        ))}
        
        {/* 添加按钮 */}
        {!disableAdd && (
          <div 
            className="aspect-square rounded-md bg-zinc-800/30 border border-dashed border-zinc-700 hover:bg-zinc-800/50 hover:border-zinc-500 transition-all flex flex-col items-center justify-center cursor-pointer gap-0.5 group/add" 
            onClick={onOpenSelector}
          >
            <Plus className="w-3 h-3 text-zinc-500 group-hover/add:text-zinc-400" />
            <span className="text-[8px] text-zinc-600 group-hover/add:text-zinc-500">添加</span>
          </div>
        )}
      </div>
      
      {/* 底部上传按钮 */}
      {imageUrls.length === 0 && !disableAdd && (
        <label className="text-center cursor-pointer">
           <span className="text-[9px] text-zinc-600 hover:text-zinc-400 underline decoration-zinc-700/50 underline-offset-2 transition-colors">
             或上传本地图片
           </span>
           <input type="file" accept="image/*" className="hidden" onChange={onUpload} />
        </label>
      )}
    </div>
  );
}

// 内部组件：素材选择器
function AssetSelectorModal({
  open,
  onOpenChange,
  type,
  projectId,
  characters,
  scenes,
  items,
  onSelect
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: RefType;
  projectId: number;
  characters: CharacterData[];
  scenes: SceneData[];
  items: ItemData[];
  onSelect: (url: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<"current" | "project" | "public">("current");
  const [assets, setAssets] = useState<{ id: number | string; imageUrl: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      loadAssets();
    }
  }, [open, activeTab]);

  const loadAssets = async () => {
    setAssets([]);
    
    if (activeTab === "current") {
      let list: { id: number | string; imageUrl: string; name: string }[] = [];
      if (type === "character") {
        list = characters.filter(c => c.imageUrl).map(c => ({ id: c.id, imageUrl: c.imageUrl!, name: c.name }));
      } else if (type === "scene") {
        list = scenes.filter(s => s.imageUrl).map(s => ({ id: s.id, imageUrl: s.imageUrl!, name: s.name }));
      } else if (type === "item") {
        list = items.filter(i => i.imageUrl).map(i => ({ id: i.id, imageUrl: i.imageUrl!, name: i.name }));
      }
      setAssets(list);
    } else if (activeTab === "project") {
      if (!projectId) return;
      setLoading(true);
      try {
        const cat = type === "effect" ? "item" : type;
        const res = await api.get(`/ai-agent/projects/${projectId}/assets?category=${cat}`);
        const key = type === "character" ? "characters" : type === "scene" ? "scenes" : "items";
        const list = res.data[key] || [];
        setAssets(list.map((a: any) => ({ id: a.id, imageUrl: a.imageUrl, name: a.name })));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    } else if (activeTab === "public") {
      setLoading(true);
      try {
        const cat = type === "effect" ? "item" : type;
        const res = await api.get(`/public-assets?category=${cat}`);
        const list = Array.isArray(res.data) ? res.data : [];
        setAssets(list.map((a: any) => ({ id: a.id, imageUrl: a.imageUrl, name: a.name || "未命名" })));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
  };
  
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    toast("上传中...", "info");
    try {
      const url = await uploadToOss(file, `ai-agent/assets/${type}`);
      onSelect(url);
      toast("上传成功", "success");
    } catch (e) {
      toast("上传失败", "error");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl bg-[#1a1a1e] border-zinc-800 text-zinc-100 p-0 flex flex-col max-h-[80vh]">
        <VisuallyHidden>
          <DialogTitle>选择素材</DialogTitle>
        </VisuallyHidden>
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-[#1e1e22]">
          <h3 className="font-semibold text-lg">选择素材</h3>
        </div>
        
        <div className="flex border-b border-zinc-800">
          {[
            { id: "current", label: "当前剧集", icon: <FolderOpen className="w-4 h-4" /> },
            { id: "project", label: "项目素材库", icon: <Briefcase className="w-4 h-4" /> },
            { id: "public", label: "公共素材库", icon: <Globe className="w-4 h-4" /> },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors",
                activeTab === tab.id
                  ? "border-indigo-500 text-indigo-400 bg-indigo-500/5"
                  : "border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
          
          <div className="ml-auto p-2 flex items-center">
             <label className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs cursor-pointer transition-colors border border-zinc-700">
                <Upload className="w-3.5 h-3.5" />
                上传图片
                <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
             </label>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar bg-[#141415]">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-zinc-600" />
            </div>
          ) : assets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
              <Box className="w-12 h-12 mb-3 opacity-20" />
              <p>暂无素材</p>
            </div>
          ) : (
            <div className="grid grid-cols-4 md:grid-cols-5 gap-4">
              {assets.map((asset, i) => (
                <div 
                  key={asset.id || i}
                  onClick={() => onSelect(asset.imageUrl)}
                  className="group relative aspect-square rounded-xl bg-zinc-800 border-2 border-transparent hover:border-indigo-500 cursor-pointer overflow-hidden transition-all"
                >
                  <img src={toThumbnailUrl(asset.imageUrl, 800)} className="w-full h-full object-cover" alt={asset.name} />
                  <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-[10px] text-white truncate">{asset.name}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
