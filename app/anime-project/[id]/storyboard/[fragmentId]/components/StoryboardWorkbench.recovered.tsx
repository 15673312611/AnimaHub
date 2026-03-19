"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  ChevronLeft, ChevronRight, Plus, Search, MoreVertical,
  Wand2, Image as ImageIcon, Video, Upload, Play, Eye, X,
  Loader2, Check, Settings2, Users, MapPin, Layers, Download,
  ListChecks, FileText, Sparkles, Box, Trash2, Copy,
  GripVertical, ChevronDown, RefreshCw, Zap, Film, Camera
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast-provider";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { cn, toThumbnailUrl } from "@/lib/utils";
import api from "@/lib/api";
import { aiAgentImageApi } from "@/lib/aiAgentImageApi";
import { useVideoModels } from "@/lib/useVideoModels";
import { useImageModels } from "@/lib/useImageModels";
import type { WorkflowData, ShotData, CharacterData, SceneData } from "../types";

// 子组件

import ShotCard from "./ShotCard";
import RightToolbar from "./RightToolbar";
import DrawerPanel from "./DrawerPanel";
import ImagePreviewModal from "./ImagePreviewModal";
import VideoPreviewModal from "./VideoPreviewModal";
import AiEditModal from "./AiEditModal";

interface Props {
  workflow: WorkflowData;
  projectId: number;
  fragmentId: number;
  onUpdate: () => void;
  onBack: () => void;
}

export type DrawerType =
  | "batchOps"
  | "characters"
  | "scenes"
  | "items"
  | "imageModel"
  | "videoModel"
  | "settings"
  | "inference"
  | "tasks"
  | "export"
  | null;

export type StoryboardVideoModeCode = "img2vid" | "frame2frame" | "fusion";

interface TaskItem {
  id: number;
  workflowId: number;
  taskType: string;
  targetId: number;
  targetName: string;
  status: string; // PROCESSING, COMPLETED, FAILED
  model: string;
  resultUrl?: string;
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
}

function isLikelyMojibake(text: string): boolean {
  if (!text) return false;
  // 使用异常 Unicode 区段判断乱码，避免硬编码乱码字形
  return /[\uFFFD\u02A0-\u02FF\u0370-\u03FF\u0590-\u06FF]/.test(text);
}

export default function StoryboardWorkbench({
  workflow, projectId, fragmentId, onUpdate, onBack
}: Props) {
  const { toast } = useToast();
  const confirm = useConfirm();

  // 状态
  const [selectedShotIds, setSelectedShotIds] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [drawerType, setDrawerType] = useState<DrawerType>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewVideo, setPreviewVideo] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"edit" | "image" | "video">("image");
  const [aiEditModalOpen, setAiEditModalOpen] = useState(false);

  // 批量操作状态
  const [batchGenerating, setBatchGenerating] = useState<string | null>(null);

  // 工作流任务（用于首帧多图展示/生成中恢复）
  const [workflowTasks, setWorkflowTasks] = useState<TaskItem[]>([]);
  
  // 视频提示词推理模板（选中的模板，传给 ShotCard）
  const [selectedVideoInferenceTemplate, setSelectedVideoInferenceTemplate] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("storyboard_videoInferenceTemplate") || "";
  });
  const [selectedVideoInferenceTemplateType, setSelectedVideoInferenceTemplateType] = useState<'system' | 'user'>(() => {
    if (typeof window === "undefined") return "system";
    return (localStorage.getItem("storyboard_videoInferenceTemplateType") as 'system' | 'user') || "system";
  });
  
  // 首帧提示词推理模板（选中的模板，传给 ShotCard）
  const [selectedFirstFrameInferenceTemplate, setSelectedFirstFrameInferenceTemplate] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("storyboard_firstFrameInferenceTemplate") || "";
  });
  const [selectedFirstFrameInferenceTemplateType, setSelectedFirstFrameInferenceTemplateType] = useState<'system' | 'user'>(() => {
    if (typeof window === "undefined") return "system";
    return (localStorage.getItem("storyboard_firstFrameInferenceTemplateType") as 'system' | 'user') || "system";
  });
  
  // 更新视频推理模板选择
  const handleChangeVideoInferenceTemplate = (templateCode: string, templateType?: 'system' | 'user') => {
    setSelectedVideoInferenceTemplate(templateCode);
    if (templateType) {
      setSelectedVideoInferenceTemplateType(templateType);
    }
  };
  
  // 更新首帧推理模板选择
  const handleChangeFirstFrameInferenceTemplate = (templateCode: string, templateType?: 'system' | 'user') => {
    setSelectedFirstFrameInferenceTemplate(templateCode);
    if (templateType) {
      setSelectedFirstFrameInferenceTemplateType(templateType);
    }
  };

  const loadWorkflowTasks = useCallback(async () => {
    if (!workflow?.id) return;
    try {
      const res = await api.get(`/ai-agent/workflows/${workflow.id}/tasks`, {
        params: { limit: 200 }
      });
      setWorkflowTasks(res.data || []);
    } catch (error) {
      // 不阻断主流程：任务只是辅助数据
      console.error("加载工作流任务失败", error);
    }
  }, [workflow?.id]);

  // 当 workflow 数据更新时（WebSocket 推送后会触发 fetchWorkflow），同步刷新任务列表
  // 这样 ShotCard 的四宫格才能根据任务结果同步更新
  useEffect(() => {
    // 检查是否有镜头处于生成中状态，或者已有任务在进行中
    const hasGenerating = workflow.shots?.some(
      s => s.firstFrameStatus === "GENERATING" || s.videoStatus === "GENERATING"
    );
    if (hasGenerating || workflowTasks.some(t => t.status === "PROCESSING")) {
      loadWorkflowTasks();
    }
  }, [workflow, loadWorkflowTasks]);

  // 当存在进行中任务时定时刷新（WebSocket 有丢消息时的兖底）
  useEffect(() => {
    if (workflowTasks.some(t => t.status === "PROCESSING")) {
      const interval = setInterval(loadWorkflowTasks, 3000);
      return () => clearInterval(interval);
    }
  }, [workflowTasks, loadWorkflowTasks]);

  // 持久化视频推理模板选择
  useEffect(() => {
    if (typeof window !== "undefined" && selectedVideoInferenceTemplate) {
      localStorage.setItem("storyboard_videoInferenceTemplate", selectedVideoInferenceTemplate);
    }
  }, [selectedVideoInferenceTemplate]);
  
  useEffect(() => {
    if (typeof window !== "undefined" && selectedVideoInferenceTemplateType) {
      localStorage.setItem("storyboard_videoInferenceTemplateType", selectedVideoInferenceTemplateType);
    }
  }, [selectedVideoInferenceTemplateType]);
  
  // 持久化首帧推理模板选择
  useEffect(() => {
    if (typeof window !== "undefined" && selectedFirstFrameInferenceTemplate) {
      localStorage.setItem("storyboard_firstFrameInferenceTemplate", selectedFirstFrameInferenceTemplate);
    }
  }, [selectedFirstFrameInferenceTemplate]);
  
  useEffect(() => {
    if (typeof window !== "undefined" && selectedFirstFrameInferenceTemplateType) {
      localStorage.setItem("storyboard_firstFrameInferenceTemplateType", selectedFirstFrameInferenceTemplateType);
    }
  }, [selectedFirstFrameInferenceTemplateType]);

  // 图片模型
  const { models: imageModels, defaultModel: defaultImageModel } = useImageModels("project");

  // 视频模型（按生成模式分别配置）
  const { models: img2vidVideoModels, defaultModel: defaultImg2vidVideoModel, defaultModelId: defaultImg2vidVideoModelId } = useVideoModels("img2vid");
  const { models: frame2frameVideoModels, defaultModel: defaultFrame2frameVideoModel, defaultModelId: defaultFrame2frameVideoModelId } = useVideoModels("frame2frame");
  const { models: fusionVideoModels, defaultModel: defaultFusionVideoModel, defaultModelId: defaultFusionVideoModelId } = useVideoModels("fusion");

  // 图片模型ID选择（从 localStorage 恢复）
  const [selectedImageModelId, setSelectedImageModelId] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const saved = localStorage.getItem("storyboard_selectedImageModelId");
    return saved ? Number(saved) : null;
  });

  // 当前选中的图片模型（model code，用于传给生图弹窗/后端）
  const selectedImageModel = useMemo(() => {
    const byId = imageModels.find((m) => m.id === selectedImageModelId);
    return byId?.value || defaultImageModel || imageModels[0]?.value || "";
  }, [imageModels, selectedImageModelId, defaultImageModel]);

  // 持久化图片模型ID到 localStorage
  useEffect(() => {
    if (typeof window !== "undefined" && selectedImageModelId !== null) {
      localStorage.setItem("storyboard_selectedImageModelId", String(selectedImageModelId));
    }
  }, [selectedImageModelId]);

  // 初始化默认图片模型（仅在未选择时写入）
  useEffect(() => {
    if (imageModels.length > 0 && selectedImageModelId === null) {
      // 找默认模型的ID
      const defaultModelObj = imageModels.find(m => m.value === defaultImageModel) || imageModels[0];
      if (defaultModelObj) {
        setSelectedImageModelId(defaultModelObj.id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageModels, defaultImageModel]);

  // 校验 localStorage 中的模型ID是否有效，无效则回退到默认值
  useEffect(() => {
    if (imageModels.length === 0 || selectedImageModelId === null) return;
    const modelExists = imageModels.some(m => m.id === selectedImageModelId);
    if (!modelExists) {
      const fallback = imageModels.find(m => m.value === defaultImageModel) || imageModels[0];
      if (fallback) {
        console.warn(`图片模型ID ${selectedImageModelId} 无效，回退到 ${fallback.id}`);
        setSelectedImageModelId(fallback.id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageModels, selectedImageModelId]);

  const handleChangeImageModel = (modelId: number) => {
    setSelectedImageModelId(modelId);
  };

  // 从 localStorage 恢复上次选择（存储模型 ID 而不是模型代码）
  const [videoModelIdByMode, setVideoModelIdByMode] = useState<Record<StoryboardVideoModeCode, number | null>>(() => {
    if (typeof window === "undefined") return { img2vid: null, frame2frame: null, fusion: null };
    const saved = localStorage.getItem("storyboard_videoModelIdByMode");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {}
    }
    return { img2vid: null, frame2frame: null, fusion: null };
  });

  // 持久化到 localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("storyboard_videoModelIdByMode", JSON.stringify(videoModelIdByMode));
    }
  }, [videoModelIdByMode]);

  // 初始化默认模型ID（仅在未选择时写入，只执行一次）
  useEffect(() => {
    const needInit = (
      (defaultImg2vidVideoModelId && videoModelIdByMode.img2vid === null) ||
      (defaultFrame2frameVideoModelId && videoModelIdByMode.frame2frame === null) ||
      (defaultFusionVideoModelId && videoModelIdByMode.fusion === null)
    );
    if (needInit) {
      setVideoModelIdByMode((prev) => ({
        img2vid: prev.img2vid ?? defaultImg2vidVideoModelId ?? null,
        frame2frame: prev.frame2frame ?? defaultFrame2frameVideoModelId ?? null,
        fusion: prev.fusion ?? defaultFusionVideoModelId ?? null,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultImg2vidVideoModelId, defaultFrame2frameVideoModelId, defaultFusionVideoModelId]);

  // 校验 localStorage 中的模型 ID 是否有效，无效则回退到默认值
  useEffect(() => {
    const checkAndFix = (mode: StoryboardVideoModeCode, models: { id: number }[], defaultId: number | null) => {
      const currentId = videoModelIdByMode[mode];
      if (currentId !== null && models.length > 0 && !models.some(m => m.id === currentId)) {
        console.warn(`视频模型ID ${currentId} (模式 ${mode}) 无效，回退到 ${defaultId}`);
        setVideoModelIdByMode(prev => ({ ...prev, [mode]: defaultId }));
      }
    };
    checkAndFix("img2vid", img2vidVideoModels, defaultImg2vidVideoModelId);
    checkAndFix("frame2frame", frame2frameVideoModels, defaultFrame2frameVideoModelId);
    checkAndFix("fusion", fusionVideoModels, defaultFusionVideoModelId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img2vidVideoModels, frame2frameVideoModels, fusionVideoModels]);

  // 根据 ID 查找模型代码（用于显示/传递给子组件）
  const videoModelByMode = useMemo<Record<StoryboardVideoModeCode, string>>(() => {
    const findModelCode = (models: { id: number; value: string }[], modelId: number | null) => {
      if (modelId === null || models.length === 0) return "";
      return models.find(m => m.id === modelId)?.value || "";
    };
    return {
      img2vid: findModelCode(img2vidVideoModels, videoModelIdByMode.img2vid),
      frame2frame: findModelCode(frame2frameVideoModels, videoModelIdByMode.frame2frame),
      fusion: findModelCode(fusionVideoModels, videoModelIdByMode.fusion),
    };
  }, [img2vidVideoModels, frame2frameVideoModels, fusionVideoModels, videoModelIdByMode]);

  const videoModelLabelByMode = useMemo(() => {
    const findLabel = (models: { id: number; label: string }[], modelId: number | null) => {
      if (modelId === null) return "";
      return models.find((m) => m.id === modelId)?.label || "";
    };
    return {
      img2vid: findLabel(img2vidVideoModels, videoModelIdByMode.img2vid),
      frame2frame: findLabel(frame2frameVideoModels, videoModelIdByMode.frame2frame),
      fusion: findLabel(fusionVideoModels, videoModelIdByMode.fusion),
    };
  }, [img2vidVideoModels, frame2frameVideoModels, fusionVideoModels, videoModelIdByMode]);

  const handleChangeVideoModel = (mode: StoryboardVideoModeCode, modelId: number) => {
    setVideoModelIdByMode((prev) => ({ ...prev, [mode]: modelId }));
  };

  // 全局默认时长/比例（也持久化）
  const [defaultRatio, setDefaultRatio] = useState<string>(() => {
    if (typeof window === "undefined") return "16:9";
    const saved = localStorage.getItem("storyboard_defaultRatio");
    return saved || "16:9";
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("storyboard_defaultRatio", defaultRatio);
    }
  }, [defaultRatio]);

  const shots = workflow.shots || [];
  const characters = workflow.characters || [];
  const scenes = workflow.scenes || [];

  // 默认选中第一个镜头
  useEffect(() => {
    if (shots.length > 0 && selectedShotIds.length === 0) {
      setSelectedShotIds([shots[0].id]);
    }
  }, [shots]);

  // 过滤镜头（匹配台词、描述、第一帧提示词、视频提示词）
  const filteredShots = shots.filter(shot => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      shot.description?.toLowerCase().includes(query) ||
      shot.dialogue?.toLowerCase().includes(query) ||
      shot.sortOrder.toString().includes(query) ||
      shot.firstFramePrompt?.toLowerCase().includes(query) ||
      shot.userFirstFramePrompt?.toLowerCase().includes(query) ||
      shot.videoPrompt?.toLowerCase().includes(query) ||
      shot.userVideoPrompt?.toLowerCase().includes(query)
    );
  });

  const safeWorkflowTitle = useMemo(() => {
    const title = (workflow.title || "").trim();
    if (!title) return "项目";
    if (isLikelyMojibake(title)) return "AI Agent 工作流";
    return title;
  }, [workflow.title]);

  // 全选/取消全选
  const handleSelectAll = () => {
    if (selectedShotIds.length === filteredShots.length) {
      setSelectedShotIds([]);
    } else {
      setSelectedShotIds(filteredShots.map(s => s.id));
    }
  };

  // 单选镜头（点击行）
  const handleClickShot = (shotId: number) => {
    setSelectedShotIds([shotId]);
  };

  // 多选（checkbox）
  const handleToggleShot = (shotId: number, selected: boolean) => {
    if (selected) {
      setSelectedShotIds(prev => [...prev, shotId]);
    } else {
      setSelectedShotIds(prev => prev.filter(id => id !== shotId));
    }
  };

  // 添加镜头弹窗状态
  const [addShotModalOpen, setAddShotModalOpen] = useState(false);
  const [addShotPositionMode, setAddShotPositionMode] = useState<"end" | "start" | "after">("end");
  const [addShotTargetShotId, setAddShotTargetShotId] = useState<string>("");

  // 执行添加镜头（API调用）
  const executeAddShot = async (afterSortOrder?: number | null) => {
    try {
      await api.post(`/ai-agent/workflows/${workflow.id}/shots`, {
        afterSortOrder: afterSortOrder !== undefined ? afterSortOrder : null
      });
      toast("镜头已添加", "success");
      onUpdate();
      setAddShotModalOpen(false);
    } catch (error: any) {
      toast(error.response?.data?.error || "添加失败", "error");
    }
  };

  // 点击顶部添加按钮 -> 打开弹窗
  const handleAddShotClick = () => {
    setAddShotPositionMode("end");
    setAddShotTargetShotId("");
    setAddShotModalOpen(true);
  };

  // 弹窗确认
  const handleConfirmAddShot = () => {
    if (addShotPositionMode === "end") {
      executeAddShot(null);
    } else if (addShotPositionMode === "start") {
      executeAddShot(0);
    } else if (addShotPositionMode === "after") {
      if (!addShotTargetShotId) {
        toast("请选择参考镜头", "error");
        return;
      }
      const targetShot = shots.find(s => s.id.toString() === addShotTargetShotId);
      if (targetShot) {
        executeAddShot(targetShot.sortOrder);
      } else {
        executeAddShot(null);
      }
    }
  };

  // 批量生成提示词
  const handleBatchGeneratePrompts = async () => {
    if (selectedShotIds.length === 0) {
      toast("请先选择镜头", "error");
      return;
    }
    setBatchGenerating("prompts");
    try {
      await api.post(`/ai-agent/workflows/${workflow.id}/batch-generate-prompts`, {
        shotIds: selectedShotIds
      });
      toast("开始批量生成提示词...", "success");
      onUpdate();
    } catch (error: any) {
      toast(error.response?.data?.error || "批量生成失败", "error");
    } finally {
      setBatchGenerating(null);
    }
  };

  // 批量生成首帧
  const handleBatchGenerateImages = async () => {
    if (selectedShotIds.length === 0) {
      toast("请先选择镜头", "error");
      return;
    }
    setBatchGenerating("images");
    try {
      await aiAgentImageApi.batchGenerateImages(workflow.id, {
        shotIds: selectedShotIds
      });
      toast("开始批量生成首帧...", "success");
      onUpdate();
    } catch (error: any) {
      toast(error.response?.data?.error || "批量生成失败", "error");
    } finally {
      setBatchGenerating(null);
    }
  };

  // 批量生成视频
  const handleBatchGenerateVideos = async () => {
    if (selectedShotIds.length === 0) {
      toast("请先选择镜头", "error");
      return;
    }
    setBatchGenerating("videos");
    try {
      await api.post(`/ai-agent/workflows/${workflow.id}/batch-generate-videos`, {
        shotIds: selectedShotIds
      });
      toast("开始批量生成视频...", "success");
      onUpdate();
    } catch (error: any) {
      toast(error.response?.data?.error || "批量生成失败", "error");
    } finally {
      setBatchGenerating(null);
    }
  };

  // 批量删除
  const handleBatchDelete = async () => {
    if (selectedShotIds.length === 0) {
      toast("请先选择镜头", "error");
      return;
    }
    const confirmed = await confirm({
      title: "批量删除",
      description: `确定要删除选中的 ${selectedShotIds.length} 个镜头吗？此操作不可恢复。`,
      confirmText: "删除",
      variant: "danger"
    });
    if (!confirmed) return;

    try {
      await api.post(`/ai-agent/workflows/${workflow.id}/batch-delete-shots`, {
        shotIds: selectedShotIds
      });
      toast("删除成功", "success");
      setSelectedShotIds([]);
      onUpdate();
    } catch (error: any) {
      toast(error.response?.data?.error || "删除失败", "error");
    }
  };

  // 切换抽屉
  const toggleDrawer = (type: DrawerType) => {
    setDrawerType(drawerType === type ? null : type);
  };

  // 统计信息
  const stats = {
    total: shots.length,
    withImage: shots.filter(s => s.firstFrameStatus === "COMPLETED").length,
    withVideo: shots.filter(s => s.videoStatus === "COMPLETED").length,
    generating: shots.filter(s =>
      s.firstFrameStatus === "GENERATING" || s.videoStatus === "GENERATING"
    ).length
  };

  // 收集所有已生成的图片作为历史图片（全局）
  // const historyImages = shots
  //   .filter(s => s.firstFrameUrl && s.firstFrameStatus === "COMPLETED")
  //   .map(s => s.firstFrameUrl!)
  //   .slice(0, 20); // 最多20张

  // 当前选中的单个镜头（用于左侧面板编辑）
  const currentEditShotId = selectedShotIds.length === 1 ? selectedShotIds[0] : null;

  return (
    <div className="h-screen w-full bg-[#0f0f0f] text-white flex overflow-hidden">


      {/* 中央区域 - 镜头列表 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 顶部工具栏 */}
        <header className="h-12 border-b border-zinc-800/50 bg-gradient-to-r from-[#1a1a1a] to-[#161616] px-5 flex items-center justify-between flex-shrink-0">
          {/* 左侧：面包屑导航 */}
          <div className="flex items-center gap-2 text-sm">
            <button onClick={onBack} className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors group">
              <div className="w-7 h-7 rounded-lg bg-zinc-800/50 group-hover:bg-zinc-700 flex items-center justify-center transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </div>
              <span className="text-xs">{safeWorkflowTitle}</span>
            </button>
            <ChevronRight className="w-3.5 h-3.5 text-zinc-700" />
            <span className="text-zinc-500 text-xs">第1集</span>
            <ChevronRight className="w-3.5 h-3.5 text-zinc-700" />
            <span className="text-white font-medium text-xs flex items-center gap-1.5">
              <Film className="w-3.5 h-3.5 text-emerald-400" />
              分镜工作台
            </span>
          </div>

          {/* 右侧：主要操作按钮 */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white h-8 px-4 text-xs font-medium shadow-lg shadow-emerald-900/30"
              onClick={handleAddShotClick}
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              添加镜头
            </Button>
            <div className="h-5 w-px bg-zinc-700/50" />
            <Button 
              size="sm" 
              variant="ghost" 
              className="text-zinc-400 hover:text-white hover:bg-zinc-800/50 h-8 px-3 text-xs"
              onClick={() => setAiEditModalOpen(true)}
            >
              <Wand2 className="w-3.5 h-3.5 mr-1.5" />
              AI编辑
            </Button>
          </div>
        </header>

        {/* 次级工具栏 - 统计信息和搜索 */}
        <div className="h-10 border-b border-zinc-800/30 bg-[#161616] px-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* 统计标签 */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-zinc-800/50">
                <Layers className="w-3 h-3 text-zinc-400" />
                <span className="text-xs text-zinc-300">{stats.total}</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-500/10">
                <ImageIcon className="w-3 h-3 text-emerald-400" />
                <span className="text-xs text-emerald-300">{stats.withImage}</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-blue-500/10">
                <Video className="w-3 h-3 text-blue-400" />
                <span className="text-xs text-blue-300">{stats.withVideo}</span>
              </div>
              {stats.generating > 0 && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-500/10">
                  <Loader2 className="w-3 h-3 text-amber-400 animate-spin" />
                  <span className="text-xs text-amber-300">{stats.generating}</span>
                </div>
              )}
            </div>
            {selectedShotIds.length > 0 && (
              <>
                <div className="h-4 w-px bg-zinc-700/50" />
                <span className="text-[10px] text-zinc-500">已选 {selectedShotIds.length} 项</span>
              </>
            )}
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <Input
              placeholder="搜索镜头..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="h-7 w-36 pl-8 bg-zinc-900/50 border-zinc-800/50 text-xs placeholder:text-zinc-600 focus:border-emerald-500/50 focus:ring-emerald-500/20 rounded-md"
            />
          </div>
        </div>

        {/* 镜头列表表头 */}
        {/* 镜头列表表头 */}
        <div className="h-10 border-b border-zinc-800/50 bg-[#161616] flex items-center text-xs text-zinc-500 font-medium tracking-wide">
          <div className="w-10 flex items-center justify-center border-r border-zinc-800/30">
            <span className="text-[10px]">#</span>
          </div>
          <div className="w-[380px] pl-4 border-r border-zinc-800/30">画面 & 生成</div>
          <div className="w-28 flex items-center justify-center border-r border-zinc-800/30">操作</div>
          <div className="flex-1 pl-4 border-r border-zinc-800/30">提示词 & 参数</div>
          <div className="w-[320px] pl-4">台词 & 配音</div>
        </div>

        {/* 镜头列表 */}
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#121212]">
          {filteredShots.map((shot) => {
            // 为每个镜头计算其专属的历史图片（从任务记录中筛选）
            const shotHistoryImages = workflowTasks
              .filter(t => 
                t.targetId === shot.id && 
                t.taskType === "SHOT_FIRST_FRAME" && 
                t.status === "COMPLETED" && 
                t.resultUrl
              )
              .map(t => t.resultUrl!)
              .slice(0, 20); // 最多20张

            return (
              <ShotCard
                key={shot.id}
                shot={shot}
                characters={characters}
                scenes={scenes}
                isSelected={selectedShotIds.includes(shot.id)}
                isActive={currentEditShotId === shot.id}
                onSelect={(selected) => handleToggleShot(shot.id, selected)}
                onClick={() => handleClickShot(shot.id)}
                onUpdate={onUpdate}
                onPreviewImage={setPreviewImage}
                onPreviewVideo={setPreviewVideo}
                workflowId={workflow.id}
                historyImages={shotHistoryImages}
                videoModelIdByMode={videoModelIdByMode}
                videoModelByMode={videoModelByMode}
                videoModelLabelByMode={videoModelLabelByMode}
                defaultRatio={defaultRatio}
                // 任务（首帧多图展示）
                workflowTasks={workflowTasks}
                onRefreshTasks={loadWorkflowTasks}
                // 新增 props
                items={workflow.items || []}
                customStyle={workflow.customStyle || ""}
                selectedImageModel={selectedImageModel}
                projectId={projectId}
                onAddShotAfter={() => executeAddShot(shot.sortOrder)}
                // 视频提示词推理模板
                videoInferenceTemplateCode={selectedVideoInferenceTemplate}
                videoInferenceTemplateType={selectedVideoInferenceTemplateType}
                // 首帧提示词推理模板
                firstFrameInferenceTemplateCode={selectedFirstFrameInferenceTemplate}
                firstFrameInferenceTemplateType={selectedFirstFrameInferenceTemplateType}
              />
            );
          })}

          {filteredShots.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 text-zinc-500">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-zinc-800/50 to-zinc-900/50 flex items-center justify-center mb-5 border border-zinc-800/50">
                <Film className="w-10 h-10 opacity-30" />
              </div>
              <p className="text-sm font-medium mb-1 text-zinc-400">暂无镜头</p>
              <p className="text-xs text-zinc-600 mb-4">点击下方按钮添加第一个镜头</p>
              <Button
                className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white h-9 px-5 text-xs font-medium shadow-lg shadow-emerald-900/30"
                onClick={handleAddShotClick}
              >
                <Plus className="w-4 h-4 mr-1.5" />
                添加第一个镜头
              </Button>
            </div>
          )}
        </div>


      </div>

      {/* 右侧工具栏 */}
      <RightToolbar
        activeDrawer={drawerType}
        onToggleDrawer={toggleDrawer}
        stats={stats}
      />

      {/* 抽屉面板 */}
      <DrawerPanel
        type={drawerType}
        workflow={workflow}
        characters={characters}
        scenes={scenes}
        items={workflow.items || []}
        onClose={() => setDrawerType(null)}
        onUpdate={onUpdate}
        onSwitchType={setDrawerType}
        selectedImageModelId={selectedImageModelId}
        onChangeImageModel={handleChangeImageModel}
        videoModelIdByMode={videoModelIdByMode}
        onChangeVideoModel={handleChangeVideoModel}
        defaultRatio={defaultRatio}
        onChangeRatio={setDefaultRatio}
        selectedVideoInferenceTemplate={selectedVideoInferenceTemplate}
        selectedVideoInferenceTemplateType={selectedVideoInferenceTemplateType}
        onChangeVideoInferenceTemplate={handleChangeVideoInferenceTemplate}
        selectedFirstFrameInferenceTemplate={selectedFirstFrameInferenceTemplate}
        selectedFirstFrameInferenceTemplateType={selectedFirstFrameInferenceTemplateType}
        onChangeFirstFrameInferenceTemplate={handleChangeFirstFrameInferenceTemplate}
      />

      {/* 图片预览 */}
      {
        previewImage && (
          <ImagePreviewModal
            imageUrl={previewImage}
            onClose={() => setPreviewImage(null)}
          />
        )
      }

      {/* 视频预览 */}
      {
        previewVideo && (
          <VideoPreviewModal
            videoUrl={previewVideo}
            onClose={() => setPreviewVideo(null)}
          />
        )
      }

      {/* AI 编辑弹窗 */}
      <AiEditModal
        open={aiEditModalOpen}
        onOpenChange={setAiEditModalOpen}
        workflow={workflow}
      />

      {/* 添加镜头位置选择弹窗 */}
      <Dialog open={addShotModalOpen} onOpenChange={setAddShotModalOpen}>
        <DialogContent className="bg-[#14141a] border-zinc-800 text-white sm:max-w-[425px] p-0 overflow-hidden shadow-2xl shadow-black/50">
          <DialogHeader className="px-6 py-4 border-b border-zinc-800 bg-zinc-900/50">
            <DialogTitle className="flex items-center gap-2 text-base font-medium">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                <Film className="w-4 h-4 text-emerald-500" />
              </div>
              添加新镜头
            </DialogTitle>
          </DialogHeader>
          
          <div className="px-6 py-6 space-y-5">
            <div className="space-y-2">
              <Label className="text-xs font-medium text-zinc-400 ml-1">插入位置</Label>
              <div className="col-span-3">
                <Select
                  value={addShotPositionMode}
                  onValueChange={(v: "end" | "start" | "after") => setAddShotPositionMode(v)}
                >
                  <SelectTrigger className="w-full h-10 bg-zinc-900/50 border-zinc-800 hover:bg-zinc-900 focus:ring-emerald-500/20 transition-all text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1a20] border-zinc-800 text-zinc-200">
                    <SelectItem value="end" className="focus:bg-zinc-800 focus:text-white cursor-pointer py-2.5">
                      <span className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        添加到末尾 <span className="text-zinc-500 text-xs ml-auto">(默认)</span>
                      </span>
                    </SelectItem>
                    <SelectItem value="start" className="focus:bg-zinc-800 focus:text-white cursor-pointer py-2.5">
                      <span className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                        添加到开头
                      </span>
                    </SelectItem>
                    <SelectItem value="after" className="focus:bg-zinc-800 focus:text-white cursor-pointer py-2.5">
                      <span className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                        插入到指定镜头之后
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {addShotPositionMode === "after" && (
              <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                <Label className="text-xs font-medium text-zinc-400 ml-1">选择参考镜头</Label>
                <div className="col-span-3">
                  <Select
                    value={addShotTargetShotId}
                    onValueChange={setAddShotTargetShotId}
                  >
                    <SelectTrigger className="w-full h-10 bg-zinc-900/50 border-zinc-800 hover:bg-zinc-900 focus:ring-emerald-500/20 transition-all text-sm">
                      <SelectValue placeholder="请选择一个镜头..." />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a1a20] border-zinc-800 text-zinc-200 max-h-[240px]">
                      {shots.map((s, index) => (
                        <SelectItem key={s.id} value={s.id.toString()} className="focus:bg-zinc-800 focus:text-white cursor-pointer py-2">
                          <span className="flex items-center gap-2">
                            <span className="flex-shrink-0 w-5 h-5 rounded bg-zinc-800 flex items-center justify-center text-[10px] text-zinc-500">
                              {index + 1}
                            </span>
                            <span className="truncate max-w-[240px]">
                              {s.description ? (s.description.length > 20 ? s.description.substring(0, 20) + "..." : s.description) : "未命名镜头"}
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-zinc-500 ml-1 mt-1.5">
                    新镜头将插入到所选镜头之后，后续镜头的序号会自动顺延。
                  </p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="px-6 py-4 border-t border-zinc-800 bg-zinc-900/30 gap-2">
            <Button 
              variant="ghost" 
              onClick={() => setAddShotModalOpen(false)} 
              className="h-9 px-4 text-zinc-400 hover:text-white hover:bg-zinc-800"
            >
              取消
            </Button>
            <Button 
              onClick={handleConfirmAddShot} 
              className="h-9 px-6 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-900/20"
            >
              确认添加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 自定义滚动条样式 */}
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </div >
  );
}
