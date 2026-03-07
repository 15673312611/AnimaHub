"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast-provider";
import { 
  Loader2, Wand2, ChevronLeft, Download, Play, 
  Image as ImageIcon, Video, Check, Sparkles, Box,
  ChevronDown, ChevronUp, Clock, Eye, Edit2, Upload, X, Save
} from "lucide-react";
import { cn, toThumbnailUrl } from "@/lib/utils";
import api from "@/lib/api";
import { uploadToOss } from "@/lib/upload";
import { AiAgentWorkflow, AiAgentShot } from "../page";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useVideoModels } from "@/lib/useVideoModels";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Props {
  workflow: AiAgentWorkflow;
  onUpdate: () => void;
  onBack: () => void;
}

export default function Step4Videos({ workflow, onUpdate, onBack }: Props) {
  const { toast } = useToast();
  const [generating, setGenerating] = useState<Record<number, boolean>>({});
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [previewVideo, setPreviewVideo] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [expandedShot, setExpandedShot] = useState<number | null>(null);
  
  // 视频模型选择 - 从后端获取
  const { models: videoModels, defaultModel, loading: modelsLoading } = useVideoModels("ai-agent");
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);

  // 设置默认模型
  useEffect(() => {
    if (!modelsLoading && defaultModel && !selectedModel) {
      setSelectedModel(defaultModel);
    }
  }, [modelsLoading, defaultModel, selectedModel]);

  // 同步后端生成状态
  useEffect(() => {
    const newGenerating: Record<number, boolean> = {};
    (workflow.shots || []).forEach(shot => {
      if (shot.videoStatus === "GENERATING") {
        newGenerating[shot.id] = true;
      }
    });
    setGenerating(newGenerating);
  }, [workflow]);

  const shots = workflow.shots || [];

  const handleGenerateVideo = async (shotId: number) => {
    setGenerating(prev => ({ ...prev, [shotId]: true }));
    try {
      await api.post(`/ai-agent/shots/${shotId}/generate-video`, { videoModel: selectedModel || defaultModel });
      toast("开始生成视频...", "success");
      onUpdate();
    } catch (error: any) {
      toast(error.response?.data?.error || "生成失败", "error");
      setGenerating(prev => ({ ...prev, [shotId]: false }));
    }
  };

  const handleBatchGenerate = async () => {
    const pendingShots = shots.filter(s => s.firstFrameStatus === "COMPLETED" && (s.videoStatus === "PENDING" || s.videoStatus === "FAILED"));
    if (pendingShots.length === 0) { toast("没有可生成的视频（需要先有第一帧图片）", "info"); return; }
    
    const newGenerating: Record<number, boolean> = {};
    pendingShots.forEach(s => { newGenerating[s.id] = true; });
    setGenerating(prev => ({ ...prev, ...newGenerating }));
    setBatchGenerating(true);
    
    try {
      await api.post(`/ai-agent/workflows/${workflow.id}/generate-all-videos`, { videoModel: selectedModel || defaultModel });
      toast(`开始批量生成 ${pendingShots.length} 个视频...`, "success");
      onUpdate();
    } catch (error: any) {
      toast(error.response?.data?.error || "批量生成失败", "error");
      setGenerating({});
    } finally {
      setBatchGenerating(false);
    }
  };

  const handleDownload = async (shot: AiAgentShot) => {
    if (!shot.videoUrl) return;
    try {
      const response = await fetch(shot.videoUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `镜头${shot.sortOrder}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      toast("下载失败", "error");
    }
  };

  const handleBatchDownload = async () => {
    const completedShots = shots.filter(s => s.videoStatus === "COMPLETED" && s.videoUrl);
    if (completedShots.length === 0) { toast("没有可下载的视频", "info"); return; }
    toast(`开始下载 ${completedShots.length} 个视频...`, "info");
    for (const shot of completedShots) {
      await handleDownload(shot);
      await new Promise(r => setTimeout(r, 500));
    }
    toast("下载完成", "success");
  };

  const totalShots = shots.length;
  const hasFirstFrame = shots.filter(s => s.firstFrameStatus === "COMPLETED").length;
  const completedVideos = shots.filter(s => s.videoStatus === "COMPLETED").length;
  const generatingVideos = shots.filter(s => s.videoStatus === "GENERATING").length;

  return (
    <div className="h-full flex flex-col">
      {/* 顶部工具栏 */}
      <div className="flex-shrink-0 border-b border-white/5 bg-black/10 backdrop-blur-sm px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                <Video className="w-4 h-4 text-white" />
              </div>
              <h3 className="font-semibold text-white">视频生成</h3>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="px-3 py-1 rounded-lg bg-zinc-800/50 text-zinc-400">
                共 <span className="text-white font-medium">{totalShots}</span> 个镜头
              </span>
              <span className="px-3 py-1 rounded-lg bg-blue-500/10 text-blue-400">
                <ImageIcon className="w-3 h-3 inline mr-1" />
                有首图 <span className="font-medium">{hasFirstFrame}</span>
              </span>
              <span className="px-3 py-1 rounded-lg bg-emerald-500/10 text-emerald-400">
                <Check className="w-3 h-3 inline mr-1" />
                已生成 <span className="font-medium">{completedVideos}</span>
              </span>
              {generatingVideos > 0 && (
                <span className="px-3 py-1 rounded-lg bg-purple-500/10 text-purple-400">
                  <Loader2 className="w-3 h-3 inline animate-spin mr-1" />
                  生成中 {generatingVideos}
                </span>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* 视频模型选择器 */}
            <DropdownMenu open={modelDropdownOpen} onOpenChange={setModelDropdownOpen}>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 text-[11px] font-medium text-gray-400 hover:text-white transition-colors bg-white/5 hover:bg-white/10 px-3 py-2 rounded-lg border border-white/5 outline-none">
                  <Box className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="truncate max-w-[120px]">
                    {videoModels.find(m => m.value === selectedModel)?.label || '选择模型'}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-[#1a1a1a] border-white/10 p-2 w-64 backdrop-blur-xl">
                <div className="space-y-1">
                  {videoModels.map(m => (
                    <button
                      key={m.value}
                      onClick={() => { setSelectedModel(m.value); setModelDropdownOpen(false); }}
                      className={`w-full text-left px-3 py-2 rounded-md transition-all ${
                        selectedModel === m.value 
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
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

            <Button variant="outline" onClick={handleBatchDownload} disabled={completedVideos === 0} size="sm" className="border-zinc-700 hover:bg-zinc-800 rounded-lg h-8">
              <Download className="w-3.5 h-3.5 mr-1.5" /> 导出全部
            </Button>
            <Button onClick={handleBatchGenerate} disabled={batchGenerating} size="sm" className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg h-8">
              {batchGenerating ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5 mr-1.5" />}
              一键生成全部
            </Button>
          </div>
        </div>
      </div>

      {/* 镜头列表 */}
      <div className="flex-1 overflow-y-auto p-5">
        <div className="space-y-3">
          {shots.map((shot) => (
            <VideoShotCard
              key={shot.id}
              shot={shot}
              isExpanded={expandedShot === shot.id}
              isGenerating={generating[shot.id] || shot.videoStatus === "GENERATING"}
              selectedModel={selectedModel || defaultModel}
              onToggleExpand={() => setExpandedShot(expandedShot === shot.id ? null : shot.id)}
              onGenerate={() => handleGenerateVideo(shot.id)}
              onDownload={() => handleDownload(shot)}
              onPreviewVideo={setPreviewVideo}
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
          <div className="text-sm">
            {completedVideos === totalShots && totalShots > 0 ? (
              <div className="flex items-center gap-2 text-emerald-400 bg-emerald-500/10 px-4 py-2 rounded-lg">
                <Sparkles className="w-4 h-4" /> 全部视频已生成完成！
              </div>
            ) : (
              <span className="text-zinc-500">
                还有 <span className="text-white font-medium">{totalShots - completedVideos}</span> 个视频待生成
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 视频预览 */}
      {previewVideo && (
        <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-8" onClick={() => setPreviewVideo(null)}>
          <button className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20" onClick={() => setPreviewVideo(null)}>
            <X className="w-6 h-6 text-white" />
          </button>
          <video src={previewVideo} controls autoPlay className="max-w-full max-h-full rounded-xl" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {/* 图片预览 */}
      {previewImage && (
        <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-8" onClick={() => setPreviewImage(null)}>
          <button className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20" onClick={() => setPreviewImage(null)}>
            <X className="w-6 h-6 text-white" />
          </button>
          <img src={previewImage} alt="" className="max-w-full max-h-full object-contain rounded-xl" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}


// 视频镜头卡片组件
function VideoShotCard({ shot, isExpanded, isGenerating, selectedModel, onToggleExpand, onGenerate, onDownload, onPreviewVideo, onPreviewImage, onUpdate }: {
  shot: AiAgentShot;
  isExpanded: boolean;
  isGenerating: boolean;
  selectedModel: string;
  onToggleExpand: () => void;
  onGenerate: () => void;
  onDownload: () => void;
  onPreviewVideo: (url: string) => void;
  onPreviewImage: (url: string) => void;
  onUpdate: () => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editData, setEditData] = useState({
    duration: shot.duration || 5,
    userVideoPrompt: shot.userVideoPrompt || shot.videoPrompt || ""
  });

  const hasFirstFrame = shot.firstFrameStatus === "COMPLETED" && shot.firstFrameUrl;
  const hasVideo = shot.videoStatus === "COMPLETED" && shot.videoUrl;
  const canGenerate = hasFirstFrame && !hasVideo && !isGenerating;
  const videoPrompt = shot.userVideoPrompt || shot.videoPrompt;

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/ai-agent/shots/${shot.id}/video-details`, editData);
      toast("保存成功", "success");
      setEditing(false);
      onUpdate();
    } catch (error: any) {
      toast(error.response?.data?.error || "保存失败", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleUploadFirstFrame = async (file: File) => {
    setUploading(true);
    try {
      const imageUrl = await uploadToOss(file, "ai-agent/first-frames");
      await api.put(`/ai-agent/shots/${shot.id}/first-frame`, { imageUrl });
      toast("首图上传成功", "success");
      onUpdate();
    } catch (error: any) {
      toast(error.response?.data?.error || "上传失败", "error");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={cn(
      "bg-zinc-900/40 rounded-xl border transition-all duration-200",
      isExpanded ? "border-emerald-500/50 shadow-lg shadow-emerald-500/5" : "border-zinc-800/50 hover:border-zinc-700"
    )}>
      {/* 主行 */}
      <div className="flex items-center gap-3 p-3">
        {/* 序号 */}
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center text-sm font-bold text-white border border-zinc-700 flex-shrink-0">
          {shot.sortOrder}
        </div>

        {/* 首图缩略图 */}
        <div className="w-24 h-14 rounded-lg bg-zinc-800 overflow-hidden flex-shrink-0 border border-zinc-700 relative group">
          {hasFirstFrame ? (
            <>
              <img src={toThumbnailUrl(shot.firstFrameUrl!, 200)} alt="" className="w-full h-full object-cover" />
              <div 
                className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                onClick={() => onPreviewImage(shot.firstFrameUrl!)}
              >
                <Eye className="w-5 h-5 text-white" />
              </div>
            </>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600">
              <ImageIcon className="w-5 h-5" />
              <span className="text-[9px] mt-0.5">无首图</span>
            </div>
          )}
        </div>

        {/* 视频缩略图/播放 */}
        <div className="w-24 h-14 rounded-lg bg-zinc-800 overflow-hidden flex-shrink-0 border border-zinc-700 relative group">
          {hasVideo ? (
            <div className="w-full h-full cursor-pointer relative" onClick={() => onPreviewVideo(shot.videoUrl!)}>
              {shot.firstFrameUrl && <img src={toThumbnailUrl(shot.firstFrameUrl, 200)} alt="" className="w-full h-full object-cover" />}
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center group-hover:bg-black/50 transition-colors">
                <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/20">
                  <Play className="w-4 h-4 text-white ml-0.5" />
                </div>
              </div>
              <div className="absolute bottom-1 right-1 px-1 py-0.5 rounded bg-black/60 text-[9px] text-white">
                视频
              </div>
            </div>
          ) : isGenerating ? (
            <div className="w-full h-full flex flex-col items-center justify-center bg-purple-500/10">
              <Loader2 className="w-5 h-5 animate-spin text-purple-500" />
              <span className="text-[9px] text-purple-400 mt-1">生成中</span>
            </div>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600">
              <Video className="w-5 h-5" />
              <span className="text-[9px] mt-0.5">待生成</span>
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
          </div>
          {/* 视频提示词 */}
          {videoPrompt && (
            <div className="text-[10px] text-zinc-500 leading-relaxed line-clamp-2">
              <span className="text-zinc-600">视频提示词：</span>
              {videoPrompt}
            </div>
          )}
        </div>

        {/* 状态 */}
        <div className={cn(
          "px-2 py-1 rounded text-[10px] font-medium flex-shrink-0",
          hasVideo 
            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
            : isGenerating 
              ? "bg-purple-500/10 text-purple-400 border border-purple-500/20" 
              : hasFirstFrame
                ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                : "bg-zinc-800 text-zinc-500"
        )}>
          {hasVideo ? (
            <span className="flex items-center gap-1"><Check className="w-3 h-3" /> 已完成</span>
          ) : isGenerating ? (
            <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> 生成中</span>
          ) : hasFirstFrame ? "待生成" : "无首图"}
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {canGenerate && (
            <button 
              onClick={onGenerate}
              className="text-[10px] text-purple-400 hover:text-purple-300 px-2 py-1 rounded hover:bg-purple-500/10 transition-colors"
            >
              生成视频
            </button>
          )}
          {hasVideo && (
            <>
              <button 
                onClick={() => onPreviewVideo(shot.videoUrl!)}
                className="text-[10px] text-emerald-400 hover:text-emerald-300 px-2 py-1 rounded hover:bg-emerald-500/10 transition-colors"
              >
                播放
              </button>
              <button 
                onClick={onDownload}
                className="text-[10px] text-sky-400 hover:text-sky-300 px-2 py-1 rounded hover:bg-sky-500/10 transition-colors"
              >
                下载
              </button>
              <button 
                onClick={onGenerate}
                className="text-[10px] text-amber-400 hover:text-amber-300 px-2 py-1 rounded hover:bg-amber-500/10 transition-colors"
              >
                重新生成
              </button>
            </>
          )}
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
            <span className="text-xs text-zinc-500">视频详情</span>
            {!editing ? (
              <button 
                onClick={() => setEditing(true)}
                className="text-[10px] text-sky-400 hover:text-sky-300 flex items-center gap-1"
              >
                <Edit2 className="w-3 h-3" /> 编辑
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button onClick={() => setEditing(false)} className="text-[10px] text-zinc-400 hover:text-zinc-300">取消</button>
                <button onClick={handleSave} disabled={saving} className="text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1">
                  {saving && <Loader2 className="w-3 h-3 animate-spin" />} 保存
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* 左侧：首图和视频预览 */}
            <div className="space-y-3">
              {/* 首图 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-zinc-500">第一帧图片</span>
                  <label className="text-[10px] text-sky-400 hover:text-sky-300 cursor-pointer flex items-center gap-1">
                    <Upload className="w-3 h-3" />
                    {uploading ? "上传中..." : "更换首图"}
                    <input type="file" accept="image/*" className="hidden" onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) handleUploadFirstFrame(file);
                    }} />
                  </label>
                </div>
                <div className="aspect-video rounded-lg bg-zinc-800 overflow-hidden border border-zinc-700">
                  {hasFirstFrame ? (
                    <img 
                      src={toThumbnailUrl(shot.firstFrameUrl!, 800)} 
                      alt="" 
                      className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => onPreviewImage(shot.firstFrameUrl!)}
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600">
                      <ImageIcon className="w-8 h-8 mb-2" />
                      <span className="text-xs">暂无首图</span>
                      <span className="text-[10px] text-zinc-500 mt-1">请在第三步生成或上传</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 视频预览 */}
              {hasVideo && (
                <div>
                  <span className="text-[10px] text-zinc-500 mb-2 block">生成的视频</span>
                  <div className="aspect-video rounded-lg bg-zinc-800 overflow-hidden border border-zinc-700 relative group cursor-pointer" onClick={() => onPreviewVideo(shot.videoUrl!)}>
                    {shot.firstFrameUrl && <img src={toThumbnailUrl(shot.firstFrameUrl, 800)} alt="" className="w-full h-full object-cover" />}
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center group-hover:bg-black/50 transition-colors">
                      <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/20 group-hover:scale-110 transition-transform">
                        <Play className="w-7 h-7 text-white ml-1" />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 右侧：提示词编辑 */}
            <div className="space-y-3">
              {editing ? (
                <>
                  <div>
                    <label className="text-[10px] text-zinc-500 mb-1 block">视频时长（秒）</label>
                    <Input
                      type="number"
                      value={editData.duration}
                      onChange={e => setEditData(prev => ({ ...prev, duration: parseInt(e.target.value) || 5 }))}
                      className="h-8 text-xs bg-zinc-900/50 border-zinc-700"
                      min={1}
                      max={30}
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
                      className="min-h-[160px] text-xs bg-zinc-900/50 border-zinc-700 resize-none"
                      placeholder="描述镜头运动、人物动作、对白等..."
                    />
                    <p className="text-[10px] text-zinc-600 mt-1">
                      提示：视频提示词可以包含对白、动作描述、镜头运动等
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="p-3 rounded-lg bg-zinc-900/50 border border-zinc-800">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="w-3.5 h-3.5 text-zinc-500" />
                      <span className="text-[10px] text-zinc-400">视频时长</span>
                    </div>
                    <span className="text-sm text-white font-medium">{shot.duration || 5} 秒</span>
                  </div>
                  
                  <div className="p-3 rounded-lg bg-zinc-900/50 border border-zinc-800">
                    <div className="flex items-center gap-2 mb-2">
                      <Video className="w-3.5 h-3.5 text-zinc-500" />
                      <span className="text-[10px] text-zinc-400">视频运动提示词</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">✅ 可含对白</span>
                    </div>
                    <p className="text-[11px] text-zinc-300 leading-relaxed max-h-32 overflow-y-auto">
                      {videoPrompt || <span className="text-zinc-600 italic">暂无视频提示词</span>}
                    </p>
                  </div>

                  {shot.dialogue && (
                    <div className="p-3 rounded-lg bg-zinc-900/50 border border-zinc-800">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] text-zinc-400">💬 对白</span>
                      </div>
                      <p className="text-[11px] text-amber-300 leading-relaxed">"{shot.dialogue}"</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
