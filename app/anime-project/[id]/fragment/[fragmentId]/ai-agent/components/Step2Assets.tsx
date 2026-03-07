"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast-provider";
import { 
  Loader2, Upload, Wand2, ChevronRight, ChevronLeft, 
  Users, MapPin, Check, AlertCircle, Edit3, X, Save, Box
} from "lucide-react";
import { cn, toThumbnailUrl } from "@/lib/utils";
import api from "@/lib/api";
import { uploadToOss } from "@/lib/upload";
import { AiAgentWorkflow, AiAgentCharacter, AiAgentScene } from "../page";
import { useImageModels } from "@/lib/useImageModels";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import AssetStyleModal from "./AssetStyleModal";

interface Props {
  workflow: AiAgentWorkflow;
  onUpdate: () => void;
  onNext: () => void;
  onBack: () => void;
}

export default function Step2Assets({ workflow, onUpdate, onNext, onBack }: Props) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"characters" | "scenes">("characters");
  const [generating, setGenerating] = useState<Record<string, boolean>>({});
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadTarget, setUploadTarget] = useState<{ type: "character" | "scene"; id: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  
  // 图片预览
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  
  // 模型选择
  const { models, defaultModel, loading: modelsLoading } = useImageModels("project");
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  
  // 编辑提示词状态
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<{ type: "character" | "scene"; item: AiAgentCharacter | AiAgentScene } | null>(null);
  const [editPrompt, setEditPrompt] = useState("");
  const [saving, setSaving] = useState(false);

  // 风格设置弹窗状态
  const [styleModalOpen, setStyleModalOpen] = useState(false);
  const [styleModalType, setStyleModalType] = useState<"character" | "scene" | "item">("character");

  // 设置默认模型
  useEffect(() => {
    if (!modelsLoading && defaultModel && !selectedModel) {
      setSelectedModel(defaultModel);
    }
  }, [modelsLoading, defaultModel, selectedModel]);

  // 当 workflow 更新时，同步 generating 状态
  useEffect(() => {
    setGenerating(prev => {
      const newState = { ...prev };
      
      // 检查人物
      (workflow.characters || []).forEach(char => {
        const key = `character-${char.id}`;
        if (char.imageStatus === "GENERATING") {
          // 后端正在生成，保持 generating 状态
          newState[key] = true;
        } else if (char.imageStatus === "COMPLETED" || char.imageStatus === "FAILED") {
          // 已完成或失败，清除 generating 状态
          delete newState[key];
        }
      });
      
      // 检查场景
      (workflow.scenes || []).forEach(scene => {
        const key = `scene-${scene.id}`;
        if (scene.imageStatus === "GENERATING") {
          // 后端正在生成，保持 generating 状态
          newState[key] = true;
        } else if (scene.imageStatus === "COMPLETED" || scene.imageStatus === "FAILED") {
          // 已完成或失败，清除 generating 状态
          delete newState[key];
        }
      });
      
      return newState;
    });
  }, [workflow]);

  const characters = workflow.characters || [];
  const scenes = workflow.scenes || [];
  const allCharactersCompleted = characters.every(c => c.imageStatus === "COMPLETED");
  const allScenesCompleted = scenes.every(s => s.imageStatus === "COMPLETED");
  const canProceed = allCharactersCompleted && allScenesCompleted;

  const handleGenerate = async (type: "character" | "scene", id: number, isBatch = false) => {
    const key = `${type}-${id}`;
    // 如果已经在生成中，不允许再次点击
    if (generating[key]) return;
    
    setGenerating(prev => ({ ...prev, [key]: true }));
    try {
      const endpoint = type === "character" 
        ? `/ai-agent/characters/${id}/generate`
        : `/ai-agent/scenes/${id}/generate`;
      // 人物和场景都用 16:9，人物会自动拼接三视图提示词
      await api.post(endpoint, { 
        model: selectedModel || defaultModel, 
        ratio: "16:9",
        appendThreeView: type === "character" // 人物自动拼接三视图
      });
      if (!isBatch) {
        toast("开始生成图片...", "success");
      }
      // 不在这里清除 generating 状态，让轮询来更新
    } catch (error: any) {
      toast(error.response?.data?.error || "生成失败", "error");
      // 只有失败时才清除本地状态
      setGenerating(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleUpload = async (file: File) => {
    if (!uploadTarget) return;
    setUploading(true);
    try {
      const folder = uploadTarget.type === "character" ? "ai-agent/characters" : "ai-agent/scenes";
      const imageUrl = await uploadToOss(file, folder);
      const endpoint = uploadTarget.type === "character"
        ? `/ai-agent/characters/${uploadTarget.id}/image`
        : `/ai-agent/scenes/${uploadTarget.id}/image`;
      await api.put(endpoint, { imageUrl });
      toast("上传成功", "success");
      setUploadOpen(false);
      onUpdate();
    } catch (error) {
      toast("上传失败", "error");
    } finally {
      setUploading(false);
    }
  };

  const handleComplete = async () => {
    try {
      await api.post(`/ai-agent/workflows/${workflow.id}/complete-step2`);
      toast("资产管理完成", "success");
      onUpdate();
      onNext();
    } catch (error: any) {
      toast(error.response?.data?.error || "操作失败", "error");
    }
  };

  const handleBatchGenerate = async (type: "character" | "scene") => {
    const items = type === "character" ? characters : scenes;
    // 过滤出未完成的项目（PENDING 或 FAILED 状态）
    const pendingItems = items.filter(item => 
      item.imageStatus === "PENDING" || item.imageStatus === "FAILED" || !item.imageUrl
    );
    if (pendingItems.length === 0) { toast("没有待生成的项目", "info"); return; }
    
    // 先把所有待生成的项目标记为生成中（本地状态）
    const newGenerating: Record<string, boolean> = {};
    pendingItems.forEach(item => {
      newGenerating[`${type}-${item.id}`] = true;
    });
    setGenerating(prev => ({ ...prev, ...newGenerating }));
    
    try {
      // 调用后端批量生成接口，后端会并发处理
      const endpoint = type === "character" 
        ? `/ai-agent/workflows/${workflow.id}/batch-generate-characters`
        : `/ai-agent/workflows/${workflow.id}/batch-generate-scenes`;
      
      const res = await api.post(endpoint, { 
        model: selectedModel || defaultModel, 
        ratio: "16:9",
        appendThreeView: type === "character"
      });
      
      const count = res.data.count || pendingItems.length;
      toast(`开始批量生成 ${count} 个${type === "character" ? "人物" : "场景"}...`, "success");
      
      // 触发刷新
      onUpdate();
    } catch (error: any) {
      toast(error.response?.data?.error || "批量生成失败", "error");
      // 失败时清除本地状态
      setGenerating(prev => {
        const newState = { ...prev };
        pendingItems.forEach(item => {
          delete newState[`${type}-${item.id}`];
        });
        return newState;
      });
    }
  };

  // 打开编辑提示词弹窗
  const handleOpenEdit = (type: "character" | "scene", item: AiAgentCharacter | AiAgentScene) => {
    setEditTarget({ type, item });
    setEditPrompt(item.prompt || "");
    setEditOpen(true);
  };

  // 保存提示词
  const handleSavePrompt = async () => {
    if (!editTarget) return;
    setSaving(true);
    try {
      const endpoint = editTarget.type === "character"
        ? `/ai-agent/characters/${editTarget.item.id}/prompt`
        : `/ai-agent/scenes/${editTarget.item.id}/prompt`;
      await api.put(endpoint, { prompt: editPrompt });
      toast("提示词已保存", "success");
      setEditOpen(false);
      onUpdate();
    } catch (error: any) {
      toast(error.response?.data?.error || "保存失败", "error");
    } finally {
      setSaving(false);
    }
  };

  const charCompleted = characters.filter(c => c.imageStatus === "COMPLETED").length;
  const sceneCompleted = scenes.filter(s => s.imageStatus === "COMPLETED").length;
  const charGenerating = characters.filter(c => c.imageStatus === "GENERATING").length;
  const sceneGenerating = scenes.filter(s => s.imageStatus === "GENERATING").length;

  return (
    <div className="h-full flex flex-col">
      {/* 顶部工具栏 */}
      <div className="flex-shrink-0 border-b border-white/5 bg-black/10 backdrop-blur-sm px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Tab 切换 */}
            <div className="flex gap-1 p-1 bg-zinc-900/50 rounded-lg">
              <button
                onClick={() => setActiveTab("characters")}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
                  activeTab === "characters" 
                    ? "bg-rose-500/20 text-rose-400" 
                    : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                <Users className="w-4 h-4" />
                人物
                <span className={cn(
                  "text-xs px-1.5 py-0.5 rounded",
                  activeTab === "characters" ? "bg-rose-500/20" : "bg-zinc-800"
                )}>
                  {charCompleted}/{characters.length}
                </span>
              </button>
              <button
                onClick={() => setActiveTab("scenes")}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
                  activeTab === "scenes" 
                    ? "bg-sky-500/20 text-sky-400" 
                    : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                <MapPin className="w-4 h-4" />
                场景
                <span className={cn(
                  "text-xs px-1.5 py-0.5 rounded",
                  activeTab === "scenes" ? "bg-sky-500/20" : "bg-zinc-800"
                )}>
                  {sceneCompleted}/{scenes.length}
                </span>
              </button>
            </div>

            {/* 生成中状态 */}
            {(charGenerating > 0 || sceneGenerating > 0) && (
              <div className="flex items-center gap-1.5 text-xs text-purple-400 bg-purple-500/10 px-3 py-1.5 rounded-lg">
                <Loader2 className="w-3 h-3 animate-spin" />
                生成中 {charGenerating + sceneGenerating}
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {/* 风格设置按钮 */}
            <button
              onClick={() => {
                setStyleModalType(activeTab === "characters" ? "character" : "scene");
                setStyleModalOpen(true);
              }}
              className="flex items-center gap-2 text-[11px] font-medium text-gray-400 hover:text-white transition-colors bg-white/5 hover:bg-white/10 px-3 py-2 rounded-lg border border-white/5"
            >
              <svg className="w-3.5 h-3.5 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
                <circle cx="8" cy="14" r="2"/>
                <circle cx="12" cy="8" r="2"/>
                <circle cx="16" cy="14" r="2"/>
              </svg>
              <span>风格设置</span>
              {((activeTab === "characters" && workflow.characterStyleTemplateId) ||
                (activeTab === "scenes" && workflow.sceneStyleTemplateId)) && (
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
              )}
            </button>

            {/* 模型选择器 */}
            <DropdownMenu open={modelDropdownOpen} onOpenChange={setModelDropdownOpen}>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 text-[11px] font-medium text-gray-400 hover:text-white transition-colors bg-white/5 hover:bg-white/10 px-3 py-2 rounded-lg border border-white/5 outline-none">
                  <Box className="w-3.5 h-3.5 text-amber-500" />
                  <span className="truncate max-w-[100px]">
                    {models.find(m => m.value === selectedModel)?.label?.split('(')[0] || '选择模型'}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-[#1a1a1a] border-white/10 p-2 w-64 backdrop-blur-xl">
                <div className="space-y-1">
                  {models.map(m => (
                    <button
                      key={m.value}
                      onClick={() => {
                        setSelectedModel(m.value);
                        setModelDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-md transition-all ${
                        selectedModel === m.value 
                        ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30' 
                        : 'text-gray-300 hover:bg-white/5 hover:text-white border border-transparent'
                      }`}
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-medium">{m.label}</span>
                        <span className="text-[10px] opacity-60">{m.desc}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              size="sm"
              onClick={() => handleBatchGenerate(activeTab === "characters" ? "character" : "scene")}
              className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg text-xs h-8"
            >
              <Wand2 className="w-3.5 h-3.5 mr-1.5" />
              一键生成全部
            </Button>
          </div>
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto p-5">
        {activeTab === "characters" ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {characters.map((char) => (
              <CharacterCard
                key={char.id}
                character={char}
                isGenerating={generating[`character-${char.id}`] || char.imageStatus === "GENERATING"}
                onGenerate={() => { handleGenerate("character", char.id); onUpdate(); }}
                onUpload={() => { setUploadTarget({ type: "character", id: char.id }); setUploadOpen(true); }}
                onEdit={() => handleOpenEdit("character", char)}
                onPreview={(url) => setPreviewImage(url)}
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {scenes.map((scene) => (
              <SceneCard
                key={scene.id}
                scene={scene}
                isGenerating={generating[`scene-${scene.id}`] || scene.imageStatus === "GENERATING"}
                onGenerate={() => { handleGenerate("scene", scene.id); onUpdate(); }}
                onUpload={() => { setUploadTarget({ type: "scene", id: scene.id }); setUploadOpen(true); }}
                onEdit={() => handleOpenEdit("scene", scene)}
                onPreview={(url) => setPreviewImage(url)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 底部操作栏 */}
      <div className="flex-shrink-0 border-t border-white/5 bg-black/10 backdrop-blur-sm px-6 py-3">
        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={onBack} size="sm" className="border-zinc-700 hover:bg-zinc-800 rounded-lg h-8">
            <ChevronLeft className="w-4 h-4 mr-1" /> 上一步
          </Button>
          <div className="flex items-center gap-3">
            {!canProceed && (
              <div className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 px-3 py-1.5 rounded-lg">
                <AlertCircle className="w-3.5 h-3.5" />
                请完成所有素材
              </div>
            )}
            <Button onClick={handleComplete} disabled={!canProceed} size="sm" className="bg-gradient-to-r from-emerald-500 to-teal-500 rounded-lg h-8">
              下一步 <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      </div>

      {/* 上传弹窗 */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white rounded-xl max-w-sm">
          <DialogHeader><DialogTitle className="text-base">上传图片</DialogTitle></DialogHeader>
          <div 
            className="border-2 border-dashed border-zinc-700 rounded-xl p-8 text-center cursor-pointer hover:border-purple-500 hover:bg-purple-500/5 transition-all"
            onClick={() => { 
              const input = document.createElement("input"); 
              input.type = "file"; 
              input.accept = "image/*"; 
              input.onchange = (e: any) => { const file = e.target.files?.[0]; if (file) handleUpload(file); }; 
              input.click(); 
            }}
          >
            {uploading ? (
              <Loader2 className="w-8 h-8 mx-auto animate-spin text-purple-500" />
            ) : (
              <>
                <Upload className="w-8 h-8 mx-auto text-zinc-500 mb-2" />
                <p className="text-sm text-zinc-400">点击选择图片</p>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 编辑提示词弹窗 */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white rounded-xl max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Edit3 className="w-4 h-4 text-purple-400" />
              编辑提示词 - {editTarget?.item.name}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* 基本信息 */}
            {editTarget && (
              <div className="p-3 bg-zinc-900/50 rounded-lg space-y-2">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-zinc-500">名称：</span>
                  <span className="text-white">{editTarget.item.name}</span>
                </div>
                {editTarget.type === "character" && (
                  <>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-zinc-500">身份：</span>
                      <span className="text-white">{(editTarget.item as AiAgentCharacter).identity || "-"}</span>
                    </div>
                    <div className="flex items-start gap-2 text-xs">
                      <span className="text-zinc-500 shrink-0">特征：</span>
                      <span className="text-white">{(editTarget.item as AiAgentCharacter).coreFeatures || "-"}</span>
                    </div>
                  </>
                )}
                {editTarget.type === "scene" && (
                  <>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-zinc-500">类型：</span>
                      <span className="text-white">{(editTarget.item as AiAgentScene).type || "-"}</span>
                    </div>
                    <div className="flex items-start gap-2 text-xs">
                      <span className="text-zinc-500 shrink-0">特点：</span>
                      <span className="text-white">{(editTarget.item as AiAgentScene).spaceFeatures || "-"}</span>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* 提示词编辑 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-zinc-400">AI 生图提示词</label>
                <span className={cn(
                  "text-xs px-2 py-0.5 rounded",
                  editPrompt.length >= 50 ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"
                )}>
                  {editPrompt.length} 字 {editPrompt.length < 50 && "(建议≥50字)"}
                </span>
              </div>
              <Textarea
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                placeholder="输入详细的 AI 生图提示词..."
                className="h-48 bg-zinc-900/50 border-zinc-700 focus:border-purple-500 rounded-lg resize-none text-sm"
              />
              <p className="text-xs text-zinc-500 mt-2">
                提示：提示词应包含画风、外貌/环境、服装/细节、气质/氛围等要素，越详细生成效果越好
              </p>
              {editTarget?.type === "character" && (
                <p className="text-xs text-purple-400 mt-1">
                  💡 人物生成时会自动拼接三视图提示词（正面、侧面、背面，纯色背景）
                </p>
              )}
            </div>

            {/* 操作按钮 */}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditOpen(false)} className="border-zinc-700 hover:bg-zinc-800 rounded-lg">
                <X className="w-4 h-4 mr-1" /> 取消
              </Button>
              <Button onClick={handleSavePrompt} disabled={saving} className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg">
                {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                保存
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 图片预览弹窗 */}
      {previewImage && (
        <div 
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-8 cursor-pointer"
          onClick={() => setPreviewImage(null)}
        >
          <button 
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            onClick={() => setPreviewImage(null)}
          >
            <X className="w-6 h-6 text-white" />
          </button>
          <img 
            src={previewImage} 
            alt="预览" 
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* 风格设置弹窗 */}
      <AssetStyleModal
        open={styleModalOpen}
        onOpenChange={setStyleModalOpen}
        workflowId={workflow.id}
        assetType={styleModalType}
        currentTemplateId={
          styleModalType === "character" 
            ? workflow.characterStyleTemplateId 
            : styleModalType === "scene"
            ? workflow.sceneStyleTemplateId
            : workflow.itemStyleTemplateId
        }
        onSaved={onUpdate}
      />
    </div>
  );
}

// 人物卡片 - 16:9 比例，底部文字按钮
function CharacterCard({ character, isGenerating, onGenerate, onUpload, onEdit, onPreview }: { 
  character: AiAgentCharacter; isGenerating: boolean; onGenerate: () => void; onUpload: () => void; onEdit: () => void; onPreview: (url: string) => void;
}) {
  const hasImage = character.imageStatus === "COMPLETED" && character.imageUrl;
  
  return (
    <div className="group relative bg-zinc-800/60 rounded-xl border border-purple-500/40 overflow-hidden hover:border-purple-500/70 transition-all">
      {/* 图片区域 - 改为 16:9 */}
      <div className="aspect-video relative bg-gradient-to-br from-zinc-700/40 to-zinc-800/60">
        {isGenerating ? (
          // 生成中状态优先显示
          <div className="w-full h-full flex flex-col items-center justify-center bg-purple-500/5">
            <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
            <span className="text-xs text-purple-300 mt-2">生成中...</span>
          </div>
        ) : hasImage ? (
          <img src={toThumbnailUrl(character.imageUrl!, 800)} alt={character.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-zinc-500">
            <Users className="w-8 h-8 mb-1" />
            <span className="text-xs">待生成</span>
          </div>
        )}
        
        {/* 状态角标 - 只在有图片且不在生成中时显示 */}
        {hasImage && !isGenerating && (
          <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
            <Check className="w-3 h-3 text-white" strokeWidth={3} />
          </div>
        )}
      </div>
      
      {/* 底部信息和操作 */}
      <div className="p-2.5 bg-zinc-800/80 space-y-2">
        <p className="text-xs font-medium text-zinc-200 truncate text-center">{character.name}</p>
        
        {/* 底部文字按钮 */}
        <div className="flex items-center justify-center gap-2">
          {isGenerating ? (
            <span className="text-[10px] text-purple-400 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> 生成中
            </span>
          ) : (
            <>
              {hasImage && (
                <>
                  <button 
                    onClick={() => onPreview(character.imageUrl!)} 
                    className="text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors"
                  >
                    查看
                  </button>
                  <span className="text-zinc-600">|</span>
                </>
              )}
              <button 
                onClick={onGenerate} 
                disabled={isGenerating}
                className="text-[10px] text-purple-400 hover:text-purple-300 transition-colors disabled:opacity-50"
              >
                AI生成
              </button>
              <span className="text-zinc-600">|</span>
              <button 
                onClick={onUpload} 
                className="text-[10px] text-zinc-400 hover:text-zinc-300 transition-colors"
              >
                上传
              </button>
              <span className="text-zinc-600">|</span>
              <button 
                onClick={onEdit} 
                className="text-[10px] text-sky-400 hover:text-sky-300 transition-colors"
              >
                编辑
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// 场景卡片 - 底部文字按钮
function SceneCard({ scene, isGenerating, onGenerate, onUpload, onEdit, onPreview }: { 
  scene: AiAgentScene; isGenerating: boolean; onGenerate: () => void; onUpload: () => void; onEdit: () => void; onPreview: (url: string) => void;
}) {
  const hasImage = scene.imageStatus === "COMPLETED" && scene.imageUrl;
  
  return (
    <div className="group relative bg-zinc-800/60 rounded-xl border border-purple-500/40 overflow-hidden hover:border-purple-500/70 transition-all">
      {/* 图片区域 */}
      <div className="aspect-video relative bg-gradient-to-br from-zinc-700/40 to-zinc-800/60">
        {isGenerating ? (
          // 生成中状态优先显示
          <div className="w-full h-full flex flex-col items-center justify-center bg-purple-500/5">
            <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
            <span className="text-xs text-purple-300 mt-2">生成中...</span>
          </div>
        ) : hasImage ? (
          <img src={toThumbnailUrl(scene.imageUrl!, 800)} alt={scene.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-zinc-500">
            <MapPin className="w-8 h-8 mb-1" />
            <span className="text-xs">待生成</span>
          </div>
        )}
        
        {/* 状态角标 - 只在有图片且不在生成中时显示 */}
        {hasImage && !isGenerating && (
          <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
            <Check className="w-3 h-3 text-white" strokeWidth={3} />
          </div>
        )}
      </div>
      
      {/* 底部信息和操作 */}
      <div className="p-2.5 bg-zinc-800/80 space-y-2">
        <p className="text-xs font-medium text-zinc-200 truncate text-center">{scene.name}</p>
        
        {/* 底部文字按钮 */}
        <div className="flex items-center justify-center gap-2">
          {isGenerating ? (
            <span className="text-[10px] text-purple-400 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> 生成中
            </span>
          ) : (
            <>
              {hasImage && (
                <>
                  <button 
                    onClick={() => onPreview(scene.imageUrl!)} 
                    className="text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors"
                  >
                    查看
                  </button>
                  <span className="text-zinc-600">|</span>
                </>
              )}
              <button 
                onClick={onGenerate} 
                disabled={isGenerating}
                className="text-[10px] text-purple-400 hover:text-purple-300 transition-colors disabled:opacity-50"
              >
                AI生成
              </button>
              <span className="text-zinc-600">|</span>
              <button 
                onClick={onUpload} 
                className="text-[10px] text-zinc-400 hover:text-zinc-300 transition-colors"
              >
                上传
              </button>
              <span className="text-zinc-600">|</span>
              <button 
                onClick={onEdit} 
                className="text-[10px] text-sky-400 hover:text-sky-300 transition-colors"
              >
                编辑
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
