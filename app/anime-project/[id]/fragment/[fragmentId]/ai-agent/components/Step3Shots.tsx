"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast-provider";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { 
  Loader2, Wand2, ChevronRight, ChevronLeft, Film, Image as ImageIcon, 
  Edit2, ChevronDown, ChevronUp, MessageSquare, Camera, Clock, Check,
  Plus, Trash2, Upload, X, Box, Eye, Sparkles, Settings2, Layers
} from "lucide-react";
import { cn, toThumbnailUrl } from "@/lib/utils";
import api from "@/lib/api";
import { aiAgentImageApi } from "@/lib/aiAgentImageApi";
import { uploadToOss } from "@/lib/upload";
import { AiAgentWorkflow, AiAgentShot, AiAgentCharacter, AiAgentScene } from "../page";
import { useImageModels } from "@/lib/useImageModels";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface Props {
  workflow: AiAgentWorkflow;
  onUpdate: () => void;
  onNext: () => void;
  onBack: () => void;
}

export default function Step3Shots({ workflow, onUpdate, onNext, onBack }: Props) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [generating, setGenerating] = useState<Record<number, boolean>>({});
  const [expandedShot, setExpandedShot] = useState<number | null>(null);
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  
  // 模型选择
  const { models, defaultModel, loading: modelsLoading } = useImageModels("project");
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  
  // 比例选择
  const [selectedRatio, setSelectedRatio] = useState<string>("16:9");
  const [ratioDropdownOpen, setRatioDropdownOpen] = useState(false);
  const ratioOptions = [
    { value: "16:9", label: "16:9", desc: "横屏视频" },
    { value: "9:16", label: "9:16", desc: "竖屏视频" },
    { value: "1:1", label: "1:1", desc: "正方形" },
    { value: "4:3", label: "4:3", desc: "传统比例" },
    { value: "3:4", label: "3:4", desc: "竖版传统" },
  ];
  
  // 弹窗状态
  const [advancedGenOpen, setAdvancedGenOpen] = useState(false);
  const [advancedGenShot, setAdvancedGenShot] = useState<AiAgentShot | null>(null);
  const [addShotOpen, setAddShotOpen] = useState(false);
  const [addAfterSortOrder, setAddAfterSortOrder] = useState<number | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  // 设置默认模型
  useEffect(() => {
    if (!modelsLoading && defaultModel && !selectedModel) {
      setSelectedModel(defaultModel);
    }
  }, [modelsLoading, defaultModel, selectedModel]);

  // 当 workflow 更新时，清除已完成项目的本地 generating 状态
  useEffect(() => {
    const completedIds: number[] = [];
    (workflow.shots || []).forEach(shot => {
      if (shot.firstFrameStatus === "COMPLETED" || shot.firstFrameStatus === "FAILED") {
        completedIds.push(shot.id);
      }
    });
    if (completedIds.length > 0) {
      setGenerating(prev => {
        const newState = { ...prev };
        completedIds.forEach(id => delete newState[id]);
        return newState;
      });
    }
  }, [workflow]);

  const shots = workflow.shots || [];
  const characters = workflow.characters || [];
  const scenes = workflow.scenes || [];

  const handleGenerateFirstFrame = async (shotId: number) => {
    setGenerating(prev => ({ ...prev, [shotId]: true }));
    try {
      await aiAgentImageApi.generateFirstFrame(shotId, { 
        model: selectedModel || defaultModel, 
        ratio: selectedRatio 
      });
      toast("开始生成第一帧...", "success");
      onUpdate();
    } catch (error: any) {
      toast(error.response?.data?.error || "生成失败", "error");
      setGenerating(prev => ({ ...prev, [shotId]: false }));
    }
  };

  const handleBatchGenerate = async () => {
    const pendingShots = shots.filter(s => 
      s.firstFrameStatus === "PENDING" || s.firstFrameStatus === "FAILED"
    );
    if (pendingShots.length === 0) { 
      toast("没有待生成的镜头", "info"); 
      return; 
    }
    
    // 标记所有待生成的为生成中
    const newGenerating: Record<number, boolean> = {};
    pendingShots.forEach(s => { newGenerating[s.id] = true; });
    setGenerating(prev => ({ ...prev, ...newGenerating }));
    setBatchGenerating(true);
    
    try {
      await aiAgentImageApi.generateAllFirstFrames(workflow.id, { 
        model: selectedModel || defaultModel, 
        ratio: selectedRatio 
      });
      toast(`开始批量生成 ${pendingShots.length} 个镜头...`, "success");
      onUpdate();
    } catch (error: any) {
      toast(error.response?.data?.error || "批量生成失败", "error");
      setGenerating({});
    } finally {
      setBatchGenerating(false);
    }
  };

  const handleComplete = async () => {
    try {
      await api.post(`/ai-agent/workflows/${workflow.id}/complete-step3`);
      toast("分镜管理完成", "success");
      onUpdate();
      onNext();
    } catch (error: any) {
      toast(error.response?.data?.error || "操作失败", "error");
    }
  };

  const handleDeleteShot = async (shotId: number) => {
    const confirmed = await confirm({
      title: "删除镜头",
      description: "确定要删除这个镜头吗？此操作无法撤销。",
      confirmText: "删除",
      variant: "danger"
    });
    if (!confirmed) return;
    try {
      await api.delete(`/ai-agent/shots/${shotId}`);
      toast("镜头已删除", "success");
      onUpdate();
    } catch (error: any) {
      toast(error.response?.data?.error || "删除失败", "error");
    }
  };

  const handleRegenerateShots = async () => {
    const confirmed = await confirm({
      title: "重新解析镜头",
      description: "将保留人物和场景素材，重新生成镜头列表和提示词。确定继续吗？",
      confirmText: "重新解析",
      variant: "warning"
    });
    if (!confirmed) return;
    setRegenerating(true);
    try {
      await api.post(`/ai-agent/workflows/${workflow.id}/regenerate-shots`);
      toast("开始重新生成镜头...", "success");
      onUpdate();
    } catch (error: any) {
      toast(error.response?.data?.error || "重新生成失败", "error");
      setRegenerating(false);
    }
  };

  // 监听 workflow 状态变化，清除 regenerating 状态
  useEffect(() => {
    if (workflow.aiAnalysisStatus !== "ANALYZING") {
      setRegenerating(false);
    }
  }, [workflow.aiAnalysisStatus]);

  const completedCount = shots.filter(s => s.firstFrameStatus === "COMPLETED").length;
  const generatingCount = shots.filter(s => s.firstFrameStatus === "GENERATING").length;
  const allCompleted = shots.length > 0 && shots.every(s => s.firstFrameStatus === "COMPLETED");

  return (
    <div className="h-full flex flex-col">
      {/* 顶部工具栏 */}
      <div className="flex-shrink-0 border-b border-white/5 bg-black/10 backdrop-blur-sm px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
                <Film className="w-4 h-4 text-white" />
              </div>
              <h3 className="font-semibold text-white">分镜列表</h3>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="px-3 py-1 rounded-lg bg-zinc-800/50 text-zinc-400">
                共 <span className="text-white font-medium">{shots.length}</span> 个镜头
              </span>
              <span className="px-3 py-1 rounded-lg bg-emerald-500/10 text-emerald-400">
                <Check className="w-3 h-3 inline mr-1" />
                已生成 <span className="font-medium">{completedCount}</span>
              </span>
              {generatingCount > 0 && (
                <span className="px-3 py-1 rounded-lg bg-purple-500/10 text-purple-400">
                  <Loader2 className="w-3 h-3 inline animate-spin mr-1" />
                  生成中 {generatingCount}
                </span>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
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
                      onClick={() => { setSelectedModel(m.value); setModelDropdownOpen(false); }}
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

            {/* 比例选择器 */}
            <DropdownMenu open={ratioDropdownOpen} onOpenChange={setRatioDropdownOpen}>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 text-[11px] font-medium text-gray-400 hover:text-white transition-colors bg-white/5 hover:bg-white/10 px-3 py-2 rounded-lg border border-white/5 outline-none">
                  <Layers className="w-3.5 h-3.5 text-sky-500" />
                  <span>{selectedRatio}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-[#1a1a1a] border-white/10 p-2 w-40 backdrop-blur-xl">
                <div className="space-y-1">
                  {ratioOptions.map(r => (
                    <button
                      key={r.value}
                      onClick={() => { setSelectedRatio(r.value); setRatioDropdownOpen(false); }}
                      className={`w-full text-left px-3 py-2 rounded-md transition-all ${
                        selectedRatio === r.value 
                        ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30' 
                        : 'text-gray-300 hover:bg-white/5 hover:text-white border border-transparent'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">{r.label}</span>
                        <span className="text-[10px] opacity-60">{r.desc}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => { setAddAfterSortOrder(null); setAddShotOpen(true); }}
              className="border-zinc-700 hover:bg-zinc-800 rounded-lg h-8"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              添加镜头
            </Button>

            <Button 
              size="sm" 
              variant="outline" 
              onClick={handleRegenerateShots}
              disabled={regenerating || workflow.aiAnalysisStatus === "ANALYZING"}
              className="border-amber-500/50 text-amber-400 hover:bg-amber-500/10 rounded-lg h-8"
            >
              {regenerating || workflow.aiAnalysisStatus === "ANALYZING" ? (
                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 mr-1" />
              )}
              重新解析镜头
            </Button>
            
            <Button 
              size="sm"
              onClick={handleBatchGenerate} 
              disabled={batchGenerating} 
              className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg h-8"
            >
              {batchGenerating ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5 mr-1.5" />}
              一键生成全部
            </Button>
          </div>
        </div>
      </div>

      {/* 镜头列表 */}
      <div className="flex-1 overflow-y-auto p-5">
        <div className="space-y-3">
          {shots.map((shot, index) => (
            <ShotCard
              key={shot.id}
              shot={shot}
              characters={characters}
              scenes={scenes}
              isExpanded={expandedShot === shot.id}
              isGenerating={generating[shot.id] || shot.firstFrameStatus === "GENERATING"}
              onToggleExpand={() => setExpandedShot(expandedShot === shot.id ? null : shot.id)}
              onGenerate={() => handleGenerateFirstFrame(shot.id)}
              onAdvancedGen={() => { setAdvancedGenShot(shot); setAdvancedGenOpen(true); }}
              onDelete={() => handleDeleteShot(shot.id)}
              onAddAfter={() => { setAddAfterSortOrder(shot.sortOrder); setAddShotOpen(true); }}
              onPreviewImage={setPreviewImage}
              onUpdate={onUpdate}
            />
          ))}
        </div>
      </div>

      {/* 底部操作栏 */}
      <div className="flex-shrink-0 border-t border-white/5 bg-black/10 backdrop-blur-sm px-6 py-3">
        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={onBack} size="sm" className="border-zinc-700 hover:bg-zinc-800 rounded-lg h-8">
            <ChevronLeft className="w-4 h-4 mr-1" /> 上一步
          </Button>
          <div className="flex items-center gap-3">
            {!allCompleted && (
              <div className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 px-3 py-1.5 rounded-lg">
                <Sparkles className="w-3.5 h-3.5" />
                请完成所有镜头第一帧
              </div>
            )}
            <Button onClick={handleComplete} disabled={!allCompleted} size="sm" className="bg-gradient-to-r from-emerald-500 to-teal-500 rounded-lg h-8">
              下一步 <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      </div>

      {/* 图片预览 */}
      {previewImage && (
        <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-8" onClick={() => setPreviewImage(null)}>
          <button className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20" onClick={() => setPreviewImage(null)}>
            <X className="w-6 h-6 text-white" />
          </button>
          <img src={previewImage} alt="" className="max-w-full max-h-full object-contain rounded-lg" onClick={e => e.stopPropagation()} />
        </div>
      )}

      {/* 高级生成弹窗 */}
      {advancedGenOpen && advancedGenShot && (
        <AdvancedGenerateDialog
          shot={advancedGenShot}
          characters={characters}
          scenes={scenes}
          model={selectedModel || defaultModel}
          onClose={() => { setAdvancedGenOpen(false); setAdvancedGenShot(null); }}
          onGenerate={async (customPrompt, customRefImages) => {
            setGenerating(prev => ({ ...prev, [advancedGenShot.id]: true }));
            try {
              await aiAgentImageApi.advancedGenerateShot(advancedGenShot.id, {
                model: selectedModel || defaultModel,
                ratio: selectedRatio,
                customPrompt,
                customRefImages
              });
              toast("开始生成...", "success");
              setAdvancedGenOpen(false);
              setAdvancedGenShot(null);
              onUpdate();
            } catch (error: any) {
              toast(error.response?.data?.error || "生成失败", "error");
              setGenerating(prev => ({ ...prev, [advancedGenShot.id]: false }));
            }
          }}
        />
      )}

      {/* 添加镜头弹窗 */}
      {addShotOpen && (
        <AddShotDialog
          workflowId={workflow.id}
          afterSortOrder={addAfterSortOrder}
          onClose={() => setAddShotOpen(false)}
          onSuccess={() => { setAddShotOpen(false); onUpdate(); }}
        />
      )}
    </div>
  );
}


// 镜头卡片组件
function ShotCard({ shot, characters, scenes, isExpanded, isGenerating, onToggleExpand, onGenerate, onAdvancedGen, onDelete, onAddAfter, onPreviewImage, onUpdate }: {
  shot: AiAgentShot;
  characters: AiAgentCharacter[];
  scenes: AiAgentScene[];
  isExpanded: boolean;
  isGenerating: boolean;
  onToggleExpand: () => void;
  onGenerate: () => void;
  onAdvancedGen: () => void;
  onDelete: () => void;
  onAddAfter: () => void;
  onPreviewImage: (url: string) => void;
  onUpdate: () => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editData, setEditData] = useState({
    description: shot.description || "",
    dialogue: shot.dialogue || "",
    duration: shot.duration || 5,
    userFirstFramePrompt: shot.userFirstFramePrompt || shot.firstFramePrompt || "",
    userVideoPrompt: shot.userVideoPrompt || shot.videoPrompt || ""
  });

  const refChars = characters.filter(c => shot.refCharacterIds?.includes(c.id));
  const refScene = scenes.find(s => s.id === shot.refSceneId);
  const hasFirstFrame = shot.firstFrameStatus === "COMPLETED" && shot.firstFrameUrl;
  const isFirstLast = shot.shotMode === "first_last";
  const prompt = shot.userFirstFramePrompt || shot.firstFramePrompt;

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/ai-agent/shots/${shot.id}/details`, editData);
      toast("保存成功", "success");
      setEditing(false);
      onUpdate();
    } catch (error: any) {
      toast(error.response?.data?.error || "保存失败", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cn(
      "bg-zinc-900/40 rounded-xl border transition-all duration-200",
      isExpanded ? "border-purple-500/50 shadow-lg shadow-purple-500/5" : "border-zinc-800/50 hover:border-zinc-700"
    )}>
      {/* 主行 */}
      <div className="flex items-center gap-3 p-3">
        {/* 序号 */}
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center text-sm font-bold text-white border border-zinc-700 flex-shrink-0">
          {shot.sortOrder}
        </div>

        {/* 缩略图 */}
        <div className="w-24 h-14 rounded-lg bg-zinc-800 overflow-hidden flex-shrink-0 border border-zinc-700 relative group">
          {hasFirstFrame ? (
            <>
              <img 
                src={toThumbnailUrl(shot.firstFrameUrl!)} 
                alt="" 
                className="w-full h-full object-cover"
              />
              <div 
                className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                onClick={() => onPreviewImage(shot.firstFrameUrl!)}
              >
                <Eye className="w-5 h-5 text-white" />
              </div>
            </>
          ) : isGenerating ? (
            <div className="w-full h-full flex items-center justify-center bg-purple-500/10">
              <Loader2 className="w-5 h-5 animate-spin text-purple-500" />
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-600">
              <ImageIcon className="w-5 h-5" />
            </div>
          )}
          {/* 首尾帧模式标记 */}
          {isFirstLast && (
            <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-amber-500/80 text-[9px] text-white font-medium">
              首尾帧
            </div>
          )}
        </div>

        {/* 信息 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-white font-medium truncate max-w-[200px]">
              {shot.description || "镜头描述"}
            </span>
            <span className="flex items-center gap-1 text-[10px] text-zinc-500 bg-zinc-800/50 px-1.5 py-0.5 rounded">
              <Clock className="w-2.5 h-2.5" />{shot.duration}s
            </span>
            <div className="flex flex-wrap gap-1">
              {refChars.map(c => (
                <span key={c.id} className="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  {c.name}
                </span>
              ))}
              {refScene && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  {refScene.name}
                </span>
              )}
            </div>
          </div>
          {/* 第一帧提示词 */}
          {prompt && (
            <div className="text-[10px] text-zinc-500 leading-relaxed line-clamp-2">
              <span className="text-zinc-600">提示词：</span>
              {prompt}
            </div>
          )}
        </div>

        {/* 状态 */}
        <div className={cn(
          "px-2 py-1 rounded text-[10px] font-medium flex-shrink-0",
          hasFirstFrame 
            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
            : isGenerating 
              ? "bg-purple-500/10 text-purple-400 border border-purple-500/20" 
              : "bg-zinc-800 text-zinc-500"
        )}>
          {hasFirstFrame ? (
            <span className="flex items-center gap-1"><Check className="w-3 h-3" /> 已完成</span>
          ) : isGenerating ? (
            <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> 生成中</span>
          ) : "待生成"}
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {!hasFirstFrame && !isGenerating && !isFirstLast && (
            <>
              <button 
                onClick={onGenerate}
                className="text-[10px] text-purple-400 hover:text-purple-300 px-2 py-1 rounded hover:bg-purple-500/10 transition-colors"
              >
                生成
              </button>
              <button 
                onClick={onAdvancedGen}
                className="text-[10px] text-amber-400 hover:text-amber-300 px-2 py-1 rounded hover:bg-amber-500/10 transition-colors"
              >
                高级
              </button>
            </>
          )}
          {hasFirstFrame && !isFirstLast && (
            <button 
              onClick={onAdvancedGen}
              className="text-[10px] text-amber-400 hover:text-amber-300 px-2 py-1 rounded hover:bg-amber-500/10 transition-colors"
            >
              重新生成
            </button>
          )}
          <button 
            onClick={onAddAfter}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
            title="在此后添加镜头"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button 
            onClick={onDelete}
            className="p-1.5 rounded hover:bg-red-500/10 text-zinc-500 hover:text-red-400 transition-colors"
            title="删除镜头"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button 
            onClick={onToggleExpand}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* 展开详情 */}
      {isExpanded && (
        <div className="border-t border-zinc-800/50 p-4 space-y-4 bg-black/20">
          {/* 编辑模式切换 */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">镜头详情</span>
            {!editing ? (
              <button 
                onClick={() => setEditing(true)}
                className="text-[10px] text-sky-400 hover:text-sky-300 flex items-center gap-1"
              >
                <Edit2 className="w-3 h-3" /> 编辑
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setEditing(false)}
                  className="text-[10px] text-zinc-400 hover:text-zinc-300"
                >
                  取消
                </button>
                <button 
                  onClick={handleSave}
                  disabled={saving}
                  className="text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                >
                  {saving && <Loader2 className="w-3 h-3 animate-spin" />}
                  保存
                </button>
              </div>
            )}
          </div>

          {editing ? (
            // 编辑模式
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-zinc-500 mb-1 block">镜头描述</label>
                  <Input
                    value={editData.description}
                    onChange={e => setEditData(prev => ({ ...prev, description: e.target.value }))}
                    className="h-8 text-xs bg-zinc-900/50 border-zinc-700"
                    placeholder="描述这个镜头..."
                  />
                </div>
                <div>
                  <label className="text-[10px] text-zinc-500 mb-1 block">时长（秒）</label>
                  <Input
                    type="number"
                    value={editData.duration}
                    onChange={e => setEditData(prev => ({ ...prev, duration: parseInt(e.target.value) || 5 }))}
                    className="h-8 text-xs bg-zinc-900/50 border-zinc-700"
                    min={1}
                    max={30}
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 mb-1 block">对白</label>
                <Input
                  value={editData.dialogue}
                  onChange={e => setEditData(prev => ({ ...prev, dialogue: e.target.value }))}
                  className="h-8 text-xs bg-zinc-900/50 border-zinc-700"
                  placeholder="角色对白..."
                />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <label className="text-[10px] text-zinc-500">第一帧提示词</label>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">❌ 不含对白</span>
                </div>
                <Textarea
                  value={editData.userFirstFramePrompt}
                  onChange={e => setEditData(prev => ({ ...prev, userFirstFramePrompt: e.target.value }))}
                  className="min-h-[80px] text-xs bg-zinc-900/50 border-zinc-700 resize-none"
                  placeholder="描述静态画面..."
                />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <label className="text-[10px] text-zinc-500">视频运动提示词</label>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">✅ 可含对白</span>
                </div>
                <Textarea
                  value={editData.userVideoPrompt}
                  onChange={e => setEditData(prev => ({ ...prev, userVideoPrompt: e.target.value }))}
                  className="min-h-[80px] text-xs bg-zinc-900/50 border-zinc-700 resize-none"
                  placeholder="描述镜头运动、动作..."
                />
              </div>
            </div>
          ) : (
            // 查看模式
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Camera className="w-3.5 h-3.5 text-zinc-500" />
                    <span className="text-[10px] font-medium text-zinc-400">第一帧提示词</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">❌ 不含对白</span>
                  </div>
                  <div className="p-3 rounded-lg bg-zinc-900/50 border border-zinc-800 text-[11px] text-zinc-400 leading-relaxed max-h-28 overflow-y-auto">
                    {prompt || <span className="text-zinc-600 italic">待生成</span>}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Film className="w-3.5 h-3.5 text-zinc-500" />
                    <span className="text-[10px] font-medium text-zinc-400">视频运动提示词</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">✅ 可含对白</span>
                  </div>
                  <div className="p-3 rounded-lg bg-zinc-900/50 border border-zinc-800 text-[11px] text-zinc-400 leading-relaxed max-h-28 overflow-y-auto">
                    {shot.userVideoPrompt || shot.videoPrompt || <span className="text-zinc-600 italic">待生成</span>}
                  </div>
                </div>
              </div>

              {shot.dialogue && (
                <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 flex items-start gap-2">
                  <MessageSquare className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="text-[10px] text-amber-400 font-medium">对白：</span>
                    <span className="text-[11px] text-amber-300 ml-1">"{shot.dialogue}"</span>
                  </div>
                </div>
              )}

              {/* 参考素材 */}
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-zinc-500 font-medium">参考素材：</span>
                <div className="flex gap-2">
                  {refChars.map(c => c.imageUrl && (
                    <img 
                      key={c.id} 
                      src={toThumbnailUrl(c.imageUrl, 76)} 
                      alt={c.name} 
                      className="w-10 h-10 rounded-lg object-cover border border-zinc-700 cursor-pointer hover:border-purple-500 transition-colors"
                      onClick={() => onPreviewImage(c.imageUrl!)}
                      title={c.name}
                    />
                  ))}
                  {refScene?.imageUrl && (
                    <img 
                      src={toThumbnailUrl(refScene.imageUrl, 76)} 
                      alt={refScene.name} 
                      className="w-16 h-10 rounded-lg object-cover border border-zinc-700 cursor-pointer hover:border-purple-500 transition-colors"
                      onClick={() => onPreviewImage(refScene.imageUrl!)}
                      title={refScene.name}
                    />
                  )}
                  {refChars.length === 0 && !refScene && (
                    <span className="text-[10px] text-zinc-600 italic">无参考素材</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// 高级生成弹窗
function AdvancedGenerateDialog({ shot, characters, scenes, model, onClose, onGenerate }: {
  shot: AiAgentShot;
  characters: AiAgentCharacter[];
  scenes: AiAgentScene[];
  model: string;
  onClose: () => void;
  onGenerate: (customPrompt: string, customRefImages: string[]) => void;
}) {
  const { toast } = useToast();
  const [customPrompt, setCustomPrompt] = useState(shot.userFirstFramePrompt || shot.firstFramePrompt || "");
  const [selectedCharIds, setSelectedCharIds] = useState<number[]>(shot.refCharacterIds || []);
  const [selectedSceneId, setSelectedSceneId] = useState<number | null>(shot.refSceneId);
  const [customImages, setCustomImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const handleUploadImage = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadToOss(file, "ai-agent/reference");
      setCustomImages(prev => [...prev, url]);
    } catch (error) {
      toast("上传失败", "error");
    } finally {
      setUploading(false);
    }
  };

  const handleGenerate = () => {
    // 收集参考图
    const refImages: string[] = [...customImages];
    selectedCharIds.forEach(id => {
      const char = characters.find(c => c.id === id);
      if (char?.imageUrl) refImages.push(char.imageUrl);
    });
    if (selectedSceneId) {
      const scene = scenes.find(s => s.id === selectedSceneId);
      if (scene?.imageUrl) refImages.push(scene.imageUrl);
    }
    
    setGenerating(true);
    onGenerate(customPrompt, refImages);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-3xl rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-amber-400" />
            高级生成 - 镜头 {shot.sortOrder}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-5 pt-2">
          {/* 提示词编辑 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white">第一帧提示词</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">❌ 禁止包含对白</span>
              </div>
              <span className={cn(
                "text-[10px] px-2 py-0.5 rounded",
                customPrompt.length >= 50 ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"
              )}>
                {customPrompt.length} 字 {customPrompt.length < 50 && "(建议≥50字)"}
              </span>
            </div>
            <Textarea
              value={customPrompt}
              onChange={e => setCustomPrompt(e.target.value)}
              placeholder="描述静态画面：画风、色调、人物外貌、场景环境、构图景别..."
              className="min-h-[120px] bg-zinc-900/50 border-zinc-700 rounded-xl text-sm resize-none"
            />
            <p className="text-[10px] text-zinc-500">
              提示：使用专业术语如三分构图、黄金分割、低角度仰拍、高调光影、丁达尔效应等
            </p>
          </div>

          {/* 参考素材选择 */}
          <div className="space-y-3">
            <span className="text-sm font-medium text-white">参考素材</span>
            
            {/* 人物选择 */}
            <div className="space-y-2">
              <span className="text-[10px] text-zinc-500">人物参考</span>
              <div className="flex flex-wrap gap-2">
                {characters.filter(c => c.imageUrl).map(char => (
                  <div
                    key={char.id}
                    onClick={() => {
                      setSelectedCharIds(prev => 
                        prev.includes(char.id) 
                          ? prev.filter(id => id !== char.id)
                          : [...prev, char.id]
                      );
                    }}
                    className={cn(
                      "relative w-16 h-16 rounded-lg overflow-hidden cursor-pointer border-2 transition-all",
                      selectedCharIds.includes(char.id) 
                        ? "border-purple-500 ring-2 ring-purple-500/30" 
                        : "border-zinc-700 hover:border-zinc-500"
                    )}
                  >
                    <img src={toThumbnailUrl(char.imageUrl!, 76)} alt={char.name} className="w-full h-full object-cover" />
                    {selectedCharIds.includes(char.id) && (
                      <div className="absolute inset-0 bg-purple-500/20 flex items-center justify-center">
                        <Check className="w-5 h-5 text-white" />
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5">
                      <span className="text-[8px] text-white truncate block">{char.name}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 场景选择 */}
            <div className="space-y-2">
              <span className="text-[10px] text-zinc-500">场景参考</span>
              <div className="flex flex-wrap gap-2">
                {scenes.filter(s => s.imageUrl).map(scene => (
                  <div
                    key={scene.id}
                    onClick={() => setSelectedSceneId(selectedSceneId === scene.id ? null : scene.id)}
                    className={cn(
                      "relative w-24 h-14 rounded-lg overflow-hidden cursor-pointer border-2 transition-all",
                      selectedSceneId === scene.id 
                        ? "border-sky-500 ring-2 ring-sky-500/30" 
                        : "border-zinc-700 hover:border-zinc-500"
                    )}
                  >
                    <img src={toThumbnailUrl(scene.imageUrl!)} alt={scene.name} className="w-full h-full object-cover" />
                    {selectedSceneId === scene.id && (
                      <div className="absolute inset-0 bg-sky-500/20 flex items-center justify-center">
                        <Check className="w-5 h-5 text-white" />
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5">
                      <span className="text-[8px] text-white truncate block">{scene.name}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 自定义上传 */}
            <div className="space-y-2">
              <span className="text-[10px] text-zinc-500">自定义参考图</span>
              <div className="flex flex-wrap gap-2">
                {customImages.map((url, idx) => (
                  <div key={idx} className="relative w-16 h-16 rounded-lg overflow-hidden border border-zinc-700">
                    <img src={toThumbnailUrl(url, 76)} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => setCustomImages(prev => prev.filter((_, i) => i !== idx))}
                      className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-red-500 flex items-center justify-center"
                    >
                      <X className="w-2.5 h-2.5 text-white" />
                    </button>
                  </div>
                ))}
                <div
                  onClick={() => {
                    const input = document.createElement("input");
                    input.type = "file";
                    input.accept = "image/*";
                    input.onchange = (e: any) => {
                      const file = e.target.files?.[0];
                      if (file) handleUploadImage(file);
                    };
                    input.click();
                  }}
                  className="w-16 h-16 rounded-lg border-2 border-dashed border-zinc-700 hover:border-purple-500 flex items-center justify-center cursor-pointer transition-colors"
                >
                  {uploading ? (
                    <Loader2 className="w-5 h-5 animate-spin text-purple-500" />
                  ) : (
                    <Upload className="w-5 h-5 text-zinc-500" />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-zinc-800">
          <Button variant="outline" onClick={onClose} className="border-zinc-700 rounded-xl">
            取消
          </Button>
          <Button 
            onClick={handleGenerate} 
            disabled={generating || !customPrompt.trim()}
            className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl"
          >
            {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2" />}
            开始生成
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// 添加镜头弹窗
function AddShotDialog({ workflowId, afterSortOrder, onClose, onSuccess }: {
  workflowId: number;
  afterSortOrder: number | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [mode, setMode] = useState<"normal" | "first_last">("normal");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState(5);
  const [firstFrameUrl, setFirstFrameUrl] = useState("");
  const [endFrameUrl, setEndFrameUrl] = useState("");
  const [uploading, setUploading] = useState<"first" | "end" | null>(null);
  const [saving, setSaving] = useState(false);

  const handleUpload = async (type: "first" | "end", file: File) => {
    setUploading(type);
    try {
      const url = await uploadToOss(file, "ai-agent/shots");
      if (type === "first") {
        setFirstFrameUrl(url);
      } else {
        setEndFrameUrl(url);
      }
    } catch (error) {
      toast("上传失败", "error");
    } finally {
      setUploading(null);
    }
  };

  const handleSave = async () => {
    if (mode === "first_last" && (!firstFrameUrl || !endFrameUrl)) {
      toast("首尾帧模式需要上传首帧和尾帧图片", "error");
      return;
    }
    
    setSaving(true);
    try {
      await api.post(`/ai-agent/workflows/${workflowId}/shots`, {
        shotMode: mode,
        afterSortOrder,
        firstFrameUrl: firstFrameUrl || null,
        endFrameUrl: mode === "first_last" ? endFrameUrl : null,
        description,
        duration
      });
      toast("镜头添加成功", "success");
      onSuccess();
    } catch (error: any) {
      toast(error.response?.data?.error || "添加失败", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-lg rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold flex items-center gap-2">
            <Plus className="w-4 h-4 text-emerald-400" />
            添加新镜头
            {afterSortOrder && <span className="text-xs text-zinc-500 font-normal">（在镜头 {afterSortOrder} 后）</span>}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 pt-2">
          {/* 模式选择 */}
          <div className="space-y-2">
            <span className="text-sm font-medium text-white">镜头模式</span>
            <div className="grid grid-cols-2 gap-3">
              <div
                onClick={() => setMode("normal")}
                className={cn(
                  "p-3 rounded-xl border-2 cursor-pointer transition-all",
                  mode === "normal" 
                    ? "border-purple-500 bg-purple-500/10" 
                    : "border-zinc-700 hover:border-zinc-500"
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <ImageIcon className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-medium">图生视频</span>
                </div>
                <p className="text-[10px] text-zinc-500">上传或生成首帧图片，AI生成视频</p>
              </div>
              <div
                onClick={() => setMode("first_last")}
                className={cn(
                  "p-3 rounded-xl border-2 cursor-pointer transition-all",
                  mode === "first_last" 
                    ? "border-amber-500 bg-amber-500/10" 
                    : "border-zinc-700 hover:border-zinc-500"
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Layers className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-medium">首尾帧</span>
                </div>
                <p className="text-[10px] text-zinc-500">上传首帧和尾帧，AI生成过渡视频</p>
              </div>
            </div>
          </div>

          {/* 基本信息 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] text-zinc-500">镜头描述</label>
              <Input
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="h-8 text-xs bg-zinc-900/50 border-zinc-700"
                placeholder="描述这个镜头..."
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-zinc-500">时长（秒）</label>
              <Input
                type="number"
                value={duration}
                onChange={e => setDuration(parseInt(e.target.value) || 5)}
                className="h-8 text-xs bg-zinc-900/50 border-zinc-700"
                min={1}
                max={30}
              />
            </div>
          </div>

          {/* 图片上传 */}
          <div className="space-y-2">
            <span className="text-sm font-medium text-white">
              {mode === "first_last" ? "上传首尾帧图片" : "上传首帧图片（可选）"}
            </span>
            <div className="grid grid-cols-2 gap-3">
              {/* 首帧 */}
              <div className="space-y-1">
                <label className="text-[10px] text-zinc-500">首帧</label>
                <div
                  onClick={() => {
                    const input = document.createElement("input");
                    input.type = "file";
                    input.accept = "image/*";
                    input.onchange = (e: any) => {
                      const file = e.target.files?.[0];
                      if (file) handleUpload("first", file);
                    };
                    input.click();
                  }}
                  className={cn(
                    "aspect-video rounded-xl border-2 border-dashed flex items-center justify-center cursor-pointer transition-all overflow-hidden",
                    firstFrameUrl ? "border-emerald-500" : "border-zinc-700 hover:border-purple-500"
                  )}
                >
                  {uploading === "first" ? (
                    <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
                  ) : firstFrameUrl ? (
                    <img src={toThumbnailUrl(firstFrameUrl)} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-center">
                      <Upload className="w-6 h-6 text-zinc-500 mx-auto mb-1" />
                      <span className="text-[10px] text-zinc-500">点击上传</span>
                    </div>
                  )}
                </div>
              </div>
              
              {/* 尾帧（仅首尾帧模式） */}
              {mode === "first_last" && (
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-500">尾帧</label>
                  <div
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = "image/*";
                      input.onchange = (e: any) => {
                        const file = e.target.files?.[0];
                        if (file) handleUpload("end", file);
                      };
                      input.click();
                    }}
                    className={cn(
                      "aspect-video rounded-xl border-2 border-dashed flex items-center justify-center cursor-pointer transition-all overflow-hidden",
                      endFrameUrl ? "border-emerald-500" : "border-zinc-700 hover:border-purple-500"
                    )}
                  >
                    {uploading === "end" ? (
                      <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
                    ) : endFrameUrl ? (
                      <img src={toThumbnailUrl(endFrameUrl)} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-center">
                        <Upload className="w-6 h-6 text-zinc-500 mx-auto mb-1" />
                        <span className="text-[10px] text-zinc-500">点击上传</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            {mode === "normal" && (
              <p className="text-[10px] text-zinc-500">不上传图片则需要后续生成第一帧</p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-zinc-800">
          <Button variant="outline" onClick={onClose} className="border-zinc-700 rounded-xl">
            取消
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={saving || (mode === "first_last" && (!firstFrameUrl || !endFrameUrl))}
            className="bg-gradient-to-r from-emerald-500 to-teal-500 rounded-xl"
          >
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            添加镜头
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
