"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Play, Eye, Upload, Wand2, Video, Image as ImageIcon,
  Loader2, MoreVertical, Trash2, Sparkles, X, Film,
  UserCircle2, AlignLeft, Bot, Plus, Palette, Check, MoreHorizontal,
  History, FolderOpen, MapPin, Package, Move, ArrowRightLeft
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast-provider";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn, toThumbnailUrl } from "@/lib/utils";
import api, { apiFetch } from "@/lib/api";
import { aiAgentImageApi } from "@/lib/aiAgentImageApi";
import { uploadToOss } from "@/lib/upload";
import type { ShotData, CharacterData, SceneData, ItemData } from "../types";
import ImageGenerationModal from "./ImageGenerationModal";
import ImageEditorModal from "./ImageEditorModal";
import InferEndFrameModal from "./InferEndFrameModal";
import type { StoryboardVideoModeCode } from "./StoryboardWorkbench";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import {
  AI_AGENT_SHOT_VIDEO_UPDATED_EVENT,
  AI_AGENT_SHOT_IMAGE_UPDATED_EVENT,
  buildPendingVideoSlots,
  readPendingVideoSlots,
  readAndCleanExpiredPendingSlots,
  writePendingVideoSlots,
  readVideoErrorRecords,
  clearVideoErrorRecords,
  markTaskAsCancelled,
  type PendingVideoSlot,
} from "../shotSlotVideoStorage";

// 后端返回的媒体槽位数据结构
interface MediaSlotRecord {
  id: number;
  shotId: number;
  gridType: "image" | "video";
  slotIndex: number;
  imageUrl?: string;
  videoUrl?: string;
  sourceTaskId?: number;
  createdAt: string;
  updatedAt: string;
}

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

interface Props {
  shot: ShotData;
  characters: CharacterData[];
  scenes: SceneData[];
  isSelected: boolean;
  isActive: boolean;
  onSelect: (selected: boolean) => void;
  onClick: () => void;
  onUpdate: () => void;
  onPreviewImage: (url: string) => void;
  onPreviewVideo: (url: string) => void;
  workflowId: number;
  historyImages?: string[]; // 上一步生成的图片历史
  videoModelIdByMode: Record<StoryboardVideoModeCode, number | null>; // 视频模型ID（用于传递给后端）
  videoModelByMode: Record<StoryboardVideoModeCode, string>;          // 视频模型代码（用于前端显示）
  videoModelLabelByMode: Record<StoryboardVideoModeCode, string>;
  img2vidVideoModels: { id: number; value: string; label: string; supportedDurations?: number[] }[];
  frame2frameVideoModels: { id: number; value: string; label: string; supportedDurations?: number[] }[];
  fusionVideoModels: { id: number; value: string; label: string; supportedDurations?: number[] }[];
  defaultDuration: number;
  defaultRatio: string;
  // 任务（用于首帧多图展示）
  workflowTasks: TaskItem[];
  onRefreshTasks: () => void;
  // 新增
  items: ItemData[];
  customStyle: string;
  selectedImageModel: string;
  projectId: number;
  onAddShotAfter: () => void;
  // 视频提示词推理模板
  videoInferenceTemplateCode?: string;
  videoInferenceTemplateType?: 'system' | 'user';
  // 首帧提示词推理模板
  firstFrameInferenceTemplateCode?: string;
  firstFrameInferenceTemplateType?: 'system' | 'user';
}

type GridTab = "image" | "video";

// 图片四宫格槽位（4格）
interface ImageGridSlot {
  id: string;
  status: "empty" | "generating" | "completed" | "error";
  imageUrl?: string;
}

// 视频四宫格槽位（4格，独立于图片四宫格）
interface VideoGridSlot {
  id: string;
  status: "empty" | "generating" | "completed" | "error";
  // 视频封面（生成所用的 source imageUrl，仅用于展示/落位匹配）
  imageUrl?: string;
  videoUrl?: string;
  // 后端任务ID（用于取消/清理生成中占位）
  sourceTaskId?: number;
  errorMessage?: string;
}

/**
 * 四宫格（图片/视频）状态链路（关键约定，后续改动请先读这里）：
 * 1) ShotCard 发起视频生成时，会写入 pendingSlots（shot_${shotId}_pendingVideoSlots）。
 *    - 仅用于前端刷新后恢复“生成中”遮罩/取消占位；不再用于视频完成后的落位。
 * 2) 后端生成完成后，会把结果写入数据库四宫格槽位（media-slots，包含 slotIndex/sourceTaskId）。
 * 3) WebSocket 视频完成/失败消息由分镜页面处理：
 *    - 分镜页仅 dispatch 全局事件 AI_AGENT_SHOT_VIDEO_UPDATED_EVENT
 *    - ShotCard 收到事件后从后端 reload 槽位数据并映射回 gridSlots。
 */

// 槽位视频记录 / pending 队列：
// 统一在 ../shotSlotVideoStorage 中定义与读写，避免和页面的 WebSocket 落位逻辑分叉。

// 视频生成模式
type VideoMode = "image2video" | "firstLast" | "fusion";
export default function ShotCard({
  shot,
  characters,
  scenes: _scenes,
  isSelected,
  isActive,
  onSelect,
  onClick,
  onUpdate,
  onPreviewImage,
  onPreviewVideo,
  workflowId: _workflowId,
  historyImages = [],
  videoModelIdByMode,
  videoModelByMode,
  videoModelLabelByMode,
  img2vidVideoModels,
  frame2frameVideoModels,
  fusionVideoModels,
  defaultDuration,
  defaultRatio,
  workflowTasks,
  onRefreshTasks,
  items,
  customStyle,
  selectedImageModel,
  projectId,
  onAddShotAfter,
  videoInferenceTemplateCode,
  videoInferenceTemplateType = 'system',
  firstFrameInferenceTemplateCode,
  firstFrameInferenceTemplateType = 'system'
}: Props) {
  const { toast } = useToast();
  const confirm = useConfirm();

  // 保留未使用变量以备将来使用
  void _scenes;
  const workflowId = _workflowId;
  
  // 模式切换
  const [mode, setMode] = useState<"image" | "video">("image");
  const [videoMode, setVideoMode] = useState<VideoMode>("image2video");

  const toVideoModeCode = (m: VideoMode): StoryboardVideoModeCode => {
    if (m === "image2video") return "img2vid";
    if (m === "firstLast") return "frame2frame";
    return "fusion";
  };

  const currentVideoModeCode = toVideoModeCode(videoMode);
  const currentVideoModel = videoModelByMode[currentVideoModeCode];
  const currentVideoModelLabel =
    videoModelLabelByMode[currentVideoModeCode] || currentVideoModel || "";

  // 当前模式的模型列表
  const currentModels = {
    img2vid: img2vidVideoModels,
    frame2frame: frame2frameVideoModels,
    fusion: fusionVideoModels,
  }[currentVideoModeCode] || [];

  // 当前模型的配置
  const currentModelConfig = currentModels.find((m) => m.value === currentVideoModel);
  const supportedDurations = currentModelConfig?.supportedDurations || [];

  // 时长/比例状态（使用全局默认值初始化）
  const [selectedDuration, setSelectedDuration] = useState<number>(defaultDuration);
  const [selectedRatio, setSelectedRatio] = useState<string>(defaultRatio);
  // 视频生成数量
  const [videoBatchCount, setVideoBatchCount] = useState<number>(1);

  // 当全局默认值变化时同步
  useEffect(() => {
    setSelectedDuration(defaultDuration);
  }, [defaultDuration]);

  useEffect(() => {
    setSelectedRatio(defaultRatio);
  }, [defaultRatio]);

  // 四宫格视图切换：图片/视频（两套独立 2x2）
  const [gridTab, setGridTab] = useState<GridTab>("image");

  // 图片四宫格状态（4格）- 初始为空，从后端加载
  const [imageSlots, setImageSlots] = useState<ImageGridSlot[]>(() =>
    new Array(4).fill(null).map((_, i) => ({ id: `img-slot-${i}`, status: "empty" }))
  );

  // 视频四宫格状态（4格，独立于图片）- 初始为空，从后端加载
  const [videoSlots, setVideoSlots] = useState<VideoGridSlot[]>(() =>
    new Array(4).fill(null).map((_, i) => ({ id: `vid-slot-${i}`, status: "empty" }))
  );

  // 标记是否已从后端加载数据（避免兜底逻辑覆盖后端数据）
  const [slotsLoadedFromBackend, setSlotsLoadedFromBackend] = useState(false);

  const [activeGridIndex, setActiveGridIndex] = useState<number | null>(null);
  const [promptValue, setPromptValue] = useState(shot.userFirstFramePrompt || shot.firstFramePrompt || "");
  const [videoPromptValue, setVideoPromptValue] = useState(shot.userVideoPrompt || shot.videoPrompt || "");
  // 台词输入框受控状态
  const [dialogueValue, setDialogueValue] = useState(shot.dialogue || "");
  
  // 画风编辑状态
  const [styleEditorOpen, setStyleEditorOpen] = useState(false);
  const [styleDraft, setStyleDraft] = useState("");
  // 角色弹窗状态（超出4个时点击...显示）
  const [charsModalOpen, setCharsModalOpen] = useState(false);
  const [savingStyle, setSavingStyle] = useState(false);
  
  // 图片选择弹窗
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const [pickerTargetIndex, setPickerTargetIndex] = useState<number>(0);
  const [uploading, setUploading] = useState(false);
  // 图片选择弹窗标签页: upload, assets, history
  const [imagePickerTab, setImagePickerTab] = useState<"upload" | "assets" | "history">("upload");
  // 素材库子标签: character, scene, item
  const [assetSubTab, setAssetSubTab] = useState<"character" | "scene" | "item">("character");
  // 当前分镜的历史生成图片
  const [shotImageHistory, setShotImageHistory] = useState<string[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  // 生成配置弹窗
  const [generationModalOpen, setGenerationModalOpen] = useState(false);
  
  // 图片编辑器状态
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<{ index: number; url: string } | null>(null);
  
  // AI优化提示词状态
  const [optimizeModalOpen, setOptimizeModalOpen] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizedPrompt, setOptimizedPrompt] = useState("");
  const [optimizeError, setOptimizeError] = useState<string | null>(null);
  
  // 视频提示词推理状态
  const [inferring, setInferring] = useState(false);
  
  // 首尾帧提示词推理状态
  const [inferringFramePrompts, setInferringFramePrompts] = useState(false);
  
  // 尾帧提示词状态
  const [lastFramePromptValue, setLastFramePromptValue] = useState(shot.lastFramePrompt || "");
  
  // 推理尾帧弹窗状态
  const [inferEndFrameModalOpen, setInferEndFrameModalOpen] = useState(false);

  // 图片槽位移动状态
  const [movingSlotIndex, setMovingSlotIndex] = useState<number | null>(null);

  // pending 视频槽位操作
  const loadPendingSlots = (): PendingVideoSlot[] => readPendingVideoSlots(shot.id);
  const savePendingSlots = (records: PendingVideoSlot[]) => {
    writePendingVideoSlots(shot.id, records);
  };

  // 从后端加载四宫格数据
  const loadSlotsFromBackend = async () => {
    try {
      const res = await api.get<MediaSlotRecord[]>(`/ai-agent/shots/${shot.id}/media-slots`);
      const records = res.data || [];

      // 重置四宫格为空
      const newImageSlots: ImageGridSlot[] = new Array(4).fill(null).map((_, i) => ({
        id: `img-slot-${i}`,
        status: "empty" as const,
      }));
      const newVideoSlots: VideoGridSlot[] = new Array(4).fill(null).map((_, i) => ({
        id: `vid-slot-${i}`,
        status: "empty" as const,
      }));

      // 填充后端数据
      for (const rec of records) {
        if (rec.slotIndex < 0 || rec.slotIndex > 3) continue;
        if (rec.gridType === "image") {
          if (rec.imageUrl) {
            newImageSlots[rec.slotIndex] = {
              ...newImageSlots[rec.slotIndex],
              status: "completed",
              imageUrl: rec.imageUrl,
            };
          } else if (rec.sourceTaskId) {
            newImageSlots[rec.slotIndex] = {
              ...newImageSlots[rec.slotIndex],
              status: "generating",
            };
          }
        } else if (rec.gridType === "video") {
          if (rec.videoUrl) {
            newVideoSlots[rec.slotIndex] = {
              ...newVideoSlots[rec.slotIndex],
              status: "completed",
              imageUrl: rec.imageUrl,
              videoUrl: rec.videoUrl,
              sourceTaskId: rec.sourceTaskId,
            };
          } else if (rec.sourceTaskId) {
            newVideoSlots[rec.slotIndex] = {
              ...newVideoSlots[rec.slotIndex],
              status: "generating",
              imageUrl: rec.imageUrl, // 视频生成时通常有封面图
              sourceTaskId: rec.sourceTaskId,
            };
          }
        }
      }

      // 应用本地错误记录（错误记录优先于后端的 generating 状态）
      const errorRecords = readVideoErrorRecords(shot.id);
      const errorMap = new Map(errorRecords.map((r) => [r.slotIndex, r]));

      // 若该槽位已完成视频，则清理对应错误记录
      const completedIndices = newVideoSlots
        .map((s, idx) => (s.status === "completed" && s.videoUrl ? idx : -1))
        .filter((idx) => idx !== -1);
      if (completedIndices.length > 0) {
        clearVideoErrorRecords(shot.id, completedIndices);
      }

      for (const [idx, err] of errorMap.entries()) {
        if (idx < 0 || idx > 3) continue;
        const current = newVideoSlots[idx];
        // 跳过已完成的槽位（有 videoUrl）
        if (current?.videoUrl) continue;
        // 错误记录优先于后端的 generating 状态
        // 因为后端可能仍保留着任务记录（sourceTaskId），但任务实际已失败
        newVideoSlots[idx] = {
          ...current,
          status: "error",
          imageUrl: current?.imageUrl || err.imageUrl,
          videoUrl: undefined,
          sourceTaskId: undefined,
          errorMessage: err.errorMessage,
        };
      }

      // 应用 pending 槽位（恢复"生成中"状态）
      // 必须在此处处理，否则 WebSocket 触发重新加载时 pending 恢复 useEffect 不会重新运行
      const rawPendingSlots = readAndCleanExpiredPendingSlots(shot.id);
      const completedIndexSet = new Set(completedIndices);
      const pendingSlots = rawPendingSlots.filter((p) => !completedIndexSet.has(p.slotIndex));
      if (pendingSlots.length !== rawPendingSlots.length) {
        savePendingSlots(pendingSlots);
      }
      for (const p of pendingSlots) {
        if (typeof p?.slotIndex !== "number" || p.slotIndex < 0 || p.slotIndex > 3) continue;
        if (!p?.imageUrl) continue;
        const current = newVideoSlots[p.slotIndex];
        // 若该槽位已完成视频，则不覆盖
        if (current?.videoUrl) continue;
        // 若该槽位已是错误状态，则不覆盖（错误记录优先）
        if (current?.status === "error") continue;
        newVideoSlots[p.slotIndex] = {
          ...current,
          status: "generating",
          imageUrl: current?.imageUrl || p.imageUrl,
          videoUrl: undefined,
        };
      }

      setImageSlots(newImageSlots);
      setVideoSlots(newVideoSlots);
      setSlotsLoadedFromBackend(true);
    } catch (error) {
      console.error("加载四宫格数据失败:", error);
      setSlotsLoadedFromBackend(true); // 即使失败也标记为已加载，避免无限重试
    }
  };

  // 保存媒体槽位到后端
  const saveMediaSlotToBackend = async (
    gridType: "image" | "video",
    slotIndex: number,
    imageUrl?: string,
    videoUrl?: string,
    sourceTaskId?: number
  ) => {
    try {
      await api.post(`/ai-agent/shots/${shot.id}/media-slots`, {
        gridType,
        slotIndex,
        imageUrl,
        videoUrl,
        sourceTaskId,
      });
    } catch (error) {
      console.error("保存媒体槽位失败:", error);
    }
  };

  // 组件挂载时从后端加载数据
  useEffect(() => {
    loadSlotsFromBackend();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shot.id]);

  const refChars = characters.filter((c) => shot.refCharacterIds?.includes(c.id));

  const completedImageSlots = imageSlots.filter(
    (s) => s.status === "completed" && !!s.imageUrl
  );
  const completedVideoSlots = videoSlots.filter(
    (s) => s.status === "completed" && !!s.videoUrl
  );

  const isVideoGenerating = videoSlots.some((s) => s.status === "generating");

  useEffect(() => {
    if (mode === "image") {
      setPromptValue(shot.userFirstFramePrompt || shot.firstFramePrompt || "");
    } else {
      setVideoPromptValue(shot.userVideoPrompt || shot.videoPrompt || "");
    }
  }, [mode, shot]);

  // 同步尾帧提示词（用于展示/编辑）
  useEffect(() => {
    setLastFramePromptValue(shot.lastFramePrompt || "");
  }, [shot.lastFramePrompt]);
  
  // 同步台词内容
  useEffect(() => {
    setDialogueValue(shot.dialogue || "");
  }, [shot.dialogue]);
  /**
   * 同步首帧生成状态到【图片四宫格】
   * 
   * 重要设计说明：
   * - shot.firstFrameStatus 是「分镜级别」的整体状态，不代表单个槽位的状态
   * - 四宫格槽位状态主要由 loadSlotsFromBackend() + workflowTasks 来维护
   * - 此 useEffect 只在没有任何槽位显示“生成中”时，根据 shot.firstFrameStatus 补充一个占位
   * - 「不」应该在 shot.firstFrameStatus === "FAILED" 时清空所有 generating 槽位
   *   （因为一个任务失败不应影响其他正在进行的任务）
   * - 失败的槽位由 workflowTasks 同步逻辑来处理
   */
  useEffect(() => {
    // 等待后端数据加载完成
    if (!slotsLoadedFromBackend) return;

    // 注意：不在 shot.firstFrameStatus === "FAILED" 时清空所有 generating 槽位
    // 这是因为一个任务失败不应该影响其他正在进行的任务
    // 失败的槽位由 workflowTasks 同步逻辑来处理（见下方的 useEffect）

    // 首帧生成中：若没有任何 generating，占用一个空位显示“生成中”
    if (shot.firstFrameStatus === "GENERATING") {
      setImageSlots((prev) => {
        const hasGen = prev.some((s) => s.status === "generating");
        if (hasGen) return prev;

        let idx = -1;
        if (prev[0]?.status === "empty") idx = 0;
        if (idx === -1) idx = prev.findIndex((s) => s.status === "empty");
        if (idx === -1) return prev;

        const next = [...prev];
        next[idx] = { ...next[idx], status: "generating" };
        return next;
      });
    }
  }, [shot.firstFrameStatus, slotsLoadedFromBackend]);

  /**
   * 同步视频生成状态到【视频四宫格】
   * 
   * 重要设计说明：
   * - shot.videoStatus 是「分镜级别」的整体状态，不代表单个槽位的状态
   * - 四宫格槽位状态主要由 loadSlotsFromBackend() + pending 槽位来维护
   * - 此 useEffect 只在没有任何槽位显示“生成中”时，根据 shot.videoStatus 补充一个占位
   * - 「不」应该在 shot.videoStatus === "FAILED" 时清空所有 generating 槽位
   *   （因为一个任务失败不应影响其他正在进行的任务）
   * - 失败的槽位由 WebSocket 推送的失败事件 + 本地错误记录来处理
   */
  useEffect(() => {
    // 只处理 GENERATING 状态：补充占位符
    if (shot.videoStatus === "GENERATING") {
      setVideoSlots((prev) => {
        // 如果已经有 generating 或 error 状态的槽位，不再添加新的 generating
        const hasGenOrError = prev.some((s) => s.status === "generating" || s.status === "error");
        if (hasGenOrError) return prev;

        const pending = loadPendingSlots();
        if (pending.length > 0) return prev; // 有 pending 的话会由 pending 恢复逻辑处理

        const idx = prev.findIndex((s) => s.status === "empty");
        if (idx === -1) return prev;

        const next = [...prev];
        next[idx] = {
          ...next[idx],
          status: "generating",
          imageUrl: next[idx].imageUrl || shot.firstFrameUrl || undefined,
          videoUrl: undefined,
          sourceTaskId: undefined,
        };
        return next;
      });
    }
    
    // 注意：不在 shot.videoStatus === "FAILED" 时清空所有 generating 槽位
    // 这是因为一个任务失败不应该影响其他正在进行的任务
    // 失败的槽位由 WebSocket 事件处理（见 shotSlotVideoStorage.ts 中的错误记录逻辑）
  }, [shot.videoStatus, shot.firstFrameUrl]);

  // 移除了 shot.videoUrl 兆底逻辑，四宫格数据完全依赖后端数据库
  // pending 槽位的恢复已移至 loadSlotsFromBackend 内部

  // 监听全局事件：当 WebSocket 完成视频后，重新从后端加载数据
  useEffect(() => {
    const handler = (e: any) => {
      const sid = e?.detail?.shotId;
      if (!sid || Number(sid) !== shot.id) return;
      // 重新从后端加载数据
      loadSlotsFromBackend();
    };
    window.addEventListener(AI_AGENT_SHOT_VIDEO_UPDATED_EVENT, handler);
    return () => window.removeEventListener(AI_AGENT_SHOT_VIDEO_UPDATED_EVENT, handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shot.id]);

  // 监听全局事件：当 WebSocket 完成图片后，重新从后端加载数据
  useEffect(() => {
    const handler = (e: any) => {
      const sid = e?.detail?.shotId;
      if (!sid || Number(sid) !== shot.id) return;
      // 重新从后端加载数据
      loadSlotsFromBackend();
    };
    window.addEventListener(AI_AGENT_SHOT_IMAGE_UPDATED_EVENT, handler);
    return () => window.removeEventListener(AI_AGENT_SHOT_IMAGE_UPDATED_EVENT, handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shot.id]);

  /**
   * 同步首帧任务状态到【图片四宫格】
   * 
   * 重要设计说明：
   * - 此 useEffect 根据 workflowTasks 中的任务数量来维护「生成中」占位符的数量
   * - 绝不从任务列表恢复已完成图片（避免复活已删除的图片）
   * - 任务完成后，通过 loadSlotsFromBackend() 从数据库加载最新状态
   * 
   * 关于“一个任务失败影响其他任务”的处理：
   * - 当一个任务失败时，processingCount 会减少
   * - 如果 UI 上的 generating 数量 > processingCount，会触发 loadSlotsFromBackend()
   * - loadSlotsFromBackend() 会从后端重新加载槽位数据，正确恢复所有槽位状态
   * - 这样就不会导致“一个失败清空所有”的问题
   */
  useEffect(() => {
    if (!workflowTasks) return;

    const shotTasks = workflowTasks.filter(
      (t) => t.taskType === "SHOT_FIRST_FRAME" && t.targetId === shot.id
    );
    // 如果没有任何相关任务，直接返回（不清理现有槽位）
    if (shotTasks.length === 0) return;

    // 计算当前正在进行的任务数
    const processingCount = shotTasks.filter((t) => t.status === "PROCESSING").length;

    setImageSlots((prev) => {
      const currentGeneratingCount = prev.filter((s) => s.status === "generating").length;
      
      // “完成/失败检测”：如果 UI 上的 generating 数量 > processingCount，说明有任务完成或失败了
      // 此时触发后端数据加载，以获取最新的槽位状态（包括哪个槽位完成了、哪个失败了）
      // 重要：这里不直接清理 generating，而是让 loadSlotsFromBackend() 来处理
      if (currentGeneratingCount > processingCount) {
        setTimeout(() => loadSlotsFromBackend(), 0);
        // 注意：返回 prev 不做任何修改，等待 loadSlotsFromBackend() 来更新状态
        // 这样可以避免“先清空再恢复”导致的闪烁问题
        return prev;
      }

      let next = [...prev];

      // 「补充占位」：根据 processingCount 补充占位符 (只占用 empty 槽位)
      let needToAdd = processingCount - currentGeneratingCount;
      if (needToAdd > 0) {
        for (let i = 0; i < next.length && needToAdd > 0; i++) {
          if (next[i].status === "empty") {
            next[i] = { ...next[i], status: "generating" };
            needToAdd--;
          }
        }
      }

      // 「清理占位」：只有当所有任务都结束且没有触发 loadSlotsFromBackend 时才清理
      // 这种情况发生在：processingCount === 0 且 currentGeneratingCount === 0
      // 即没有任何任务在进行，也没有任何占位符，这时不需要做任何事
      // 如果 processingCount === 0 但 currentGeneratingCount > 0，上面已经触发了 loadSlotsFromBackend

      return next;
    });
  }, [workflowTasks, shot.id]);

  // 点击图片格子 - 打开图片选择器或处理移动
  const handleImageSlotClick = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setGridTab("image");
    setActiveGridIndex(index);

    // 如果当前在移动模式，则执行移动操作
    if (movingSlotIndex !== null) {
      handleMoveSlot(index, e);
      return;
    }

    const slot = imageSlots[index];
    if (slot.status !== "empty") return;

    // 首尾帧模式下，如果已有2张图片，直接提示
    if (mode === "video" && videoMode === "firstLast" && completedImageSlots.length >= 2) {
      toast("首尾帧模式只能使用2张图片，请先删除多余的图片", "error");
      return;
    }

    setPickerTargetIndex(index);
    // 重置到默认标签页
    setImagePickerTab("upload");
    setAssetSubTab("character");
    // 加载当前分镜的历史生成图片
    loadShotImageHistory();
    setImagePickerOpen(true);
  };

  // 点击视频格子：视频四宫格只用于展示（空槽不支持添加）
  const handleVideoSlotClick = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setGridTab("video");
    setActiveGridIndex(index);

    const slot = videoSlots[index];
    if (slot.status === "completed" && slot.videoUrl) {
      onPreviewVideo(slot.videoUrl);
    }
  };

  // 删除图片槽位：只影响【图片四宫格】（不删除视频四宫格）
  const handleDeleteImageSlot = async (index: number, e: React.MouseEvent) => {
    e.stopPropagation();

    // 立即更新 UI
    setImageSlots((prev) =>
      prev.map((s, i) => (i === index ? { ...s, status: "empty", imageUrl: undefined } : s))
    );

    // 调用后端 API 删除槽位
    try {
      await api.delete(`/ai-agent/shots/${shot.id}/media-slots`, {
        params: { gridType: "image", slotIndex: index }
      });
    } catch (error) {
      console.error("删除图片槽位失败:", error);
      // 不影响前端体验，静默失败
    }
  };

  // 删除视频槽位：只影响【视频四宫格】（不删除图片四宫格）
  const handleDeleteVideoSlot = async (index: number, e: React.MouseEvent) => {
    e.stopPropagation();

    // 获取要删除的槽位的 imageUrl，用于标记任务已取消
    const slotToDelete = videoSlots[index];
    if (slotToDelete?.imageUrl && slotToDelete.status === "generating") {
      // 标记该任务已取消，后续的 WebSocket 结果将被忽略
      markTaskAsCancelled(shot.id, slotToDelete.imageUrl, index);
    }

    // 清理 pending（避免刷新后又恢复“生成中”）
    const pendingRest = loadPendingSlots().filter((p) => p?.slotIndex !== index);
    savePendingSlots(pendingRest);
    clearVideoErrorRecords(shot.id, [index]);

    // 同步清掉 UI
    setVideoSlots((prev) =>
      prev.map((s, i) =>
        i === index
          ? { ...s, status: "empty", imageUrl: undefined, videoUrl: undefined, sourceTaskId: undefined, errorMessage: undefined }
          : s
      )
    );

    // 调用后端 API 删除槽位
    try {
      await api.delete(`/ai-agent/shots/${shot.id}/media-slots`, {
        params: { gridType: "video", slotIndex: index }
      });
    } catch (error) {
      console.error("删除视频槽位失败:", error);
      toast("删除失败，已为你刷新槽位状态", "error");
      // 失败时从后端回滚到真实状态
      loadSlotsFromBackend();
    }
  };

  // 开始移动图片槽位
  const handleStartMoveSlot = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setMovingSlotIndex(index);
    toast("请点击空槽位或其他图片位置进行交换", "info");
  };

  // 取消移动模式
  const handleCancelMove = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setMovingSlotIndex(null);
  };

  // 执行移动/交换图片槽位
  const handleMoveSlot = async (targetIndex: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (movingSlotIndex === null || movingSlotIndex === targetIndex) {
      setMovingSlotIndex(null);
      return;
    }

    const sourceSlot = imageSlots[movingSlotIndex];
    const targetSlot = imageSlots[targetIndex];

    // 源槽位必须是已完成的图片
    if (sourceSlot.status !== "completed" || !sourceSlot.imageUrl) {
      setMovingSlotIndex(null);
      return;
    }

    // 立即更新 UI（交换两个槽位）
    setImageSlots((prev) =>
      prev.map((s, i) => {
        if (i === movingSlotIndex) {
          // 源槽位变为目标槽位的状态
          return targetSlot.status === "completed" && targetSlot.imageUrl
            ? { ...s, status: "completed", imageUrl: targetSlot.imageUrl }
            : { ...s, status: "empty", imageUrl: undefined };
        }
        if (i === targetIndex) {
          // 目标槽位变为源槽位的状态
          return { ...s, status: "completed", imageUrl: sourceSlot.imageUrl };
        }
        return s;
      })
    );

    setMovingSlotIndex(null);

    // 同步到后端
    try {
      // 先删除原来的槽位记录
      await api.delete(`/ai-agent/shots/${shot.id}/media-slots`, {
        params: { gridType: "image", slotIndex: movingSlotIndex }
      });
      if (targetSlot.status === "completed" && targetSlot.imageUrl) {
        await api.delete(`/ai-agent/shots/${shot.id}/media-slots`, {
          params: { gridType: "image", slotIndex: targetIndex }
        });
      }

      // 重新保存新位置
      await saveMediaSlotToBackend("image", targetIndex, sourceSlot.imageUrl);
      if (targetSlot.status === "completed" && targetSlot.imageUrl) {
        await saveMediaSlotToBackend("image", movingSlotIndex, targetSlot.imageUrl);
      }

      toast("移动成功", "success");
    } catch (error) {
      console.error("移动槽位失败:", error);
      toast("移动失败，已为你刷新槽位状态", "error");
      loadSlotsFromBackend();
    }
  };

  // 取消生成中的槽位（图片 or 视频）
  const handleCancelGenerating = async (tab: GridTab, index: number, e: React.MouseEvent) => {
    e.stopPropagation();

    // 捕获当前槽位对应的后端任务ID（用于精确取消）
    const slotTaskId =
      tab === "video" && typeof videoSlots[index]?.sourceTaskId === "number"
        ? videoSlots[index]?.sourceTaskId
        : undefined;

    // 对于视频槽位，标记任务已取消，后续的 WebSocket 结果将被忽略
    if (tab === "video") {
      const slotToCancel = videoSlots[index];
      if (slotToCancel?.imageUrl) {
        markTaskAsCancelled(shot.id, slotToCancel.imageUrl, index);
      }
    }

    // 先清理前端占位，避免被后续 useEffect 恢复
    if (tab === "image") {
      setImageSlots((prev) =>
        prev.map((s, i) => {
          if (i !== index || s.status !== "generating") return s;
          return { ...s, status: "empty" };
        })
      );
    } else {
      setVideoSlots((prev) =>
        prev.map((s, i) => {
          if (i !== index || s.status !== "generating") return s;
          return { ...s, status: "empty", imageUrl: undefined, videoUrl: undefined, sourceTaskId: undefined, errorMessage: undefined };
        })
      );
      // 视频取消：清理 pending
      const rest = loadPendingSlots().filter((p) => p.slotIndex !== index);
      savePendingSlots(rest);
      clearVideoErrorRecords(shot.id, [index]);
    }

    try {
      let taskIdToCancel: number | undefined = slotTaskId;

      // 如果当前槽位没有 taskId，则尝试从后端槽位记录中获取（sourceTaskId）
      if (!taskIdToCancel && tab === "video") {
        try {
          const res = await api.get<MediaSlotRecord[]>(`/ai-agent/shots/${shot.id}/media-slots`, {
            params: { gridType: "video" },
          });
          const rec = (res.data || []).find(
            (r) => r.gridType === "video" && r.slotIndex === index && !!r.sourceTaskId && !r.videoUrl
          );
          if (rec?.sourceTaskId) taskIdToCancel = rec.sourceTaskId;
        } catch (e) {
          // ignore
        }
      }

      // 兜底：从任务列表里找一个进行中的任务（不保证精确）
      if (!taskIdToCancel) {
        const tasks = workflowTasks.filter((t) => t.targetId === shot.id && t.status === "PROCESSING");
        const candidate =
          tab === "video"
            ? tasks.find((t) => t.taskType !== "SHOT_FIRST_FRAME")
            : tasks.find((t) => t.taskType === "SHOT_FIRST_FRAME");
        taskIdToCancel = candidate?.id;
      }

      if (taskIdToCancel) {
        await api.post(`/ai-agent/tasks/${taskIdToCancel}/cancel`);
      }

      // 删掉该位置的占位槽位（避免刷新复活）
      try {
        await api.delete(`/ai-agent/shots/${shot.id}/media-slots`, {
          params: { gridType: tab, slotIndex: index },
        });
      } catch (e) {
        // ignore
      }

      toast(taskIdToCancel ? "已取消生成" : "已清理槽位", "success");
      await new Promise((r) => setTimeout(r, 300));
      onRefreshTasks();
      loadSlotsFromBackend();
      onUpdate();
    } catch (error) {
      console.error("取消任务失败:", error);
      toast("取消失败，已为你刷新槽位状态", "error");
      loadSlotsFromBackend();
    }
  };

  // 加载当前分镜的历史生成图片
  const loadShotImageHistory = async () => {
    setLoadingHistory(true);
    try {
      interface ImageHistoryItem {
        id: number;
        shotId: number;
        slotIndex: number;
        imageUrl: string;
        actionType: string;
        status: string;
        prompt?: string;
        taskId?: number;
        createdAt: string;
      }
      const res = await api.get<ImageHistoryItem[]>(`/ai-agent/shots/${shot.id}/image-history`);
      // 提取 imageUrl，过滤空值和已完成的记录
      const urls = (res.data || [])
        .filter(item => item.imageUrl && item.status === "COMPLETED")
        .map(item => item.imageUrl);
      setShotImageHistory(urls);
    } catch (error) {
      console.error("加载历史图片失败:", error);
      setShotImageHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  // 从历史图片选择
  const handleSelectHistoryImage = async (imageUrl: string) => {
    setGridTab("image");

    // 更新前端状态
    setImageSlots((prev) =>
      prev.map((s, i) => (i === pickerTargetIndex ? { ...s, status: "completed", imageUrl } : s))
    );
    setImagePickerOpen(false);

    // 保存到后端
    await saveMediaSlotToBackend("image", pickerTargetIndex, imageUrl);
  };

  // 上传本地图片
  const handleUploadImage = async (file: File) => {
    setUploading(true);
    try {
      const imageUrl = await uploadToOss(file, "ai-agent/shots");

      setGridTab("image");

      // 更新前端状态
      setImageSlots((prev) =>
        prev.map((s, i) => (i === pickerTargetIndex ? { ...s, status: "completed", imageUrl } : s))
      );
      setImagePickerOpen(false);
      toast("上传成功", "success");

      // 保存到后端
      await saveMediaSlotToBackend("image", pickerTargetIndex, imageUrl);
    } catch (error) {
      toast("上传失败", "error");
    } finally {
      setUploading(false);
    }
  };

  // 推理尾帧 - 打开弹窗
  const handleInferEndFrame = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    
    // 检查是否有首帧图片
    const firstFrameSlot = imageSlots[0];
    if (firstFrameSlot.status !== "completed" || !firstFrameSlot.imageUrl) {
      toast("请先生成或上传首帧图片（四宫格第一格）", "error");
      return;
    }
    
    // 检查是否有视频提示词
    const currentVideoPrompt = videoPromptValue || shot.userVideoPrompt || shot.videoPrompt || "";
    if (!currentVideoPrompt.trim()) {
      toast("请先输入视频提示词", "error");
      return;
    }
    
    setInferEndFrameModalOpen(true);
  };
  
  // 执行尾帧生成（从推理尾帧弹窗触发）
  const handleExecuteEndFrameGenerate = async (data: {
    model: string;
    prompt: string;
    ratio: string;
    batchCount: number;
    targetSlotIndex: number;
    refImages: { type: string; url: string }[];
  }) => {
    setGridTab("image");

    const targetIndex = data.targetSlotIndex; // 尾帧固定放在第二格（索引 1）
    const slot = imageSlots[targetIndex];

    // 检查目标槽位是否已有图片
    if (slot.status === "completed" && slot.imageUrl) {
      const ok = await confirm({
        title: "覆盖尾帧图片",
        description: "第二格已有图片，是否覆盖？",
        confirmText: "覆盖",
        variant: "info"
      });
      if (!ok) return false;
    }

    // 设置目标槽位为生成中
    setImageSlots((prev) =>
      prev.map((s, idx) => (idx === targetIndex ? { ...s, status: "generating" } : s))
    );

    const customRefImages = data.refImages.map(r => r.url).filter(Boolean);

    try {
      await aiAgentImageApi.advancedGenerateShot(shot.id, {
        model: data.model,
        ratio: data.ratio,
        customPrompt: data.prompt,
        customRefImages,
        batchCount: 1,
        slotIndices: [targetIndex], // 指定尾帧槽位
        skipSavePrompt: true, // 尾帧推理的提示词是一次性的，不覆盖首帧提示词
      });
      toast("开始生成尾帧图片...", "success");

      onRefreshTasks();
      onUpdate();
      return true;
    } catch (error: any) {
      toast(error?.response?.data?.error || "尾帧生成失败", "error");
      // 回退状态
      setImageSlots((prev) =>
        prev.map((s, idx) =>
          idx === targetIndex && s.status === "generating" && !s.imageUrl
            ? { ...s, status: slot.imageUrl ? "completed" : "empty", imageUrl: slot.imageUrl }
            : s
        )
      );
      return false;
    }
  };

  // 图片生成 - 打开弹窗
  const handleImageGenerate = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setGridTab("image");

    const emptyCount = imageSlots.filter((s) => s.status === "empty").length;
    if (emptyCount === 0) {
      toast("图片四宫格已满，请先删除一些图片", "error");
      return;
    }
    setGenerationModalOpen(true);
  };

  // 执行图片生成
  const handleExecuteImageGenerate = async (data: {
    model: string;
    prompt: string;
    ratio: string;
    batchCount: number;
    refImages: { type: string; url: string }[];
  }) => {
    setGridTab("image");

    const emptySlots = imageSlots.filter((s) => s.status === "empty");
    if (emptySlots.length === 0) return false;

    // 检查空位是否足够
    if (data.batchCount > emptySlots.length) {
      toast(`剩余空位不足（仅剩 ${emptySlots.length} 个），无法生成 ${data.batchCount} 张图片。请先删除一些图片或减少生成数量。`, "error");
      return false;
    }

    const countToGenerate = data.batchCount;

    // 设置空槽位为生成中，并记录分配的槽位索引
    let assigned = 0;
    const targetSlotIndices: number[] = [];

    setImageSlots((prev) =>
      prev.map((s, idx) => {
        if (s.status === "empty" && assigned < countToGenerate) {
          assigned++;
          targetSlotIndices.push(idx);
          return { ...s, status: "generating" };
        }
        return s;
      })
    );

    const stripLeadingStylePrefix = (rawPrompt: string, style: string) => {
      const p = (rawPrompt || "").trimStart();
      const s = (style || "").trim();
      if (!s) return rawPrompt;
      if (!p.startsWith(s)) return rawPrompt;
      const rest = p.slice(s.length).replace(/^[\s,，:：\-]+/, "");
      return rest;
    };

    // 后端会自动拼接画风前缀：这里把前端展示的画风前缀剥离掉，避免重复
    const customPrompt = stripLeadingStylePrefix(data.prompt, customStyle);
    const customRefImages = data.refImages.map(r => r.url).filter(Boolean);

    try {
      await aiAgentImageApi.advancedGenerateShot(shot.id, {
        model: data.model,
        ratio: data.ratio,
        customPrompt,
        customRefImages,
        batchCount: countToGenerate,
        slotIndices: targetSlotIndices, // 传入预分配的槽位
      });
      toast("开始生成图片...", "success");

      // 立即刷新任务列表，让四宫格能按 task 结果逐张填充
      onRefreshTasks();

      // 主动刷新一次，让 shot 状态/数据同步（兜底）
      onUpdate();
      return true;
    } catch (error: any) {
      toast(error?.response?.data?.error || "生成失败", "error");
      // 回退状态（只回退占位的 generating）
      setImageSlots((prev) =>
        prev.map((s) =>
          s.status === "generating" && !s.imageUrl ? { ...s, status: "empty" } : s
        )
      );
      return false;
    }
  };

  // 打开编辑器
  const handleEditImage = (index: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const slot = imageSlots[index];
    if (slot.status !== "completed" || !slot.imageUrl) {
      toast("请先选择一张图片", "error");
      return;
    }
    setEditingSlot({ index, url: slot.imageUrl });
    setEditorOpen(true);
  };

  // 全局 AI 编辑按钮（编辑当前选中或第一张图）
  const handleGlobalAiEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setGridTab("image");
    
    // 优先编辑当前选中的格子
    if (activeGridIndex !== null) {
      const slot = imageSlots[activeGridIndex];
      if (slot.status === "completed" && slot.imageUrl) {
        handleEditImage(activeGridIndex);
        return;
      }
    }
    
    // 否则找第一张图
    const firstValid = imageSlots.findIndex(s => s.status === "completed" && s.imageUrl);
    if (firstValid !== -1) {
      handleEditImage(firstValid);
    } else {
      toast("没有可编辑的图片，请先生成或上传", "error");
    }
  };

  // 视频生成
  const handleVideoGenerate = async () => {
    if (videoMode === "image2video") {
      // 图生视频模式
      if (completedImageSlots.length === 0) {
        toast("没有可用图片（已有视频的图片会被忽略，请先叉掉视频或添加新图）", "error");
        return;
      }
      if (completedImageSlots.length === 1) {
        // 单图批量生成：对同一张图片生成多个视频
        await generateVideos(completedImageSlots.map(s => s.imageUrl!), "image2video", videoBatchCount);
      } else {
        // 多图批量：对每张图片各生成一个视频
        const ok = await confirm({
          title: "批量生成视频",
          description: `检测到 ${completedImageSlots.length} 张图片，是否为每张图片各生成一个视频？`,
          confirmText: "批量生成",
          variant: "info"
        });
        if (!ok) return;
        // 多图：默认每张图生成 1 个视频（批量数量 UI 不展示）
        await generateVideos(completedImageSlots.map(s => s.imageUrl!), "image2video", 1);
      }
      
    } else if (videoMode === "firstLast") {
      // 首尾帧模式
      if (completedImageSlots.length < 2) {
        toast("首尾帧模式需要至少2张可用图片（已有视频的图片会被忽略，请先叉掉视频或添加新图）", "error");
        return;
      }
      if (completedImageSlots.length > 2) {
        toast("首尾帧模式只能使用2张图片，请删除多余的图片", "error");
        return;
      }
      await generateVideos([completedImageSlots[0].imageUrl!, completedImageSlots[1].imageUrl!], "firstLast", videoBatchCount);
      
    } else if (videoMode === "fusion") {
      // 融合生视频
      if (completedImageSlots.length === 0) {
        toast("没有可用图片（已有视频的图片会被忽略，请先叉掉视频或添加新图）", "error");
        return;
      }
      await generateVideos(completedImageSlots.map(s => s.imageUrl!), "fusion", videoBatchCount);
    }
  };

  const generateVideos = async (
    imageUrls: string[],
    genMode: VideoMode,
    batchCount: number = 1
  ) => {
    setGridTab("video");
    const prevPending = loadPendingSlots();
    const prevVideoSlotsSnapshot = videoSlots.map((s) => ({ ...s }));
    let pendingWritten = false;

    try {
      const modeCode = toVideoModeCode(genMode);
      const videoModelId = videoModelIdByMode[modeCode];
      const now = Date.now();

      // 计算空槽位数量
      const emptyVideoSlotCount = videoSlots.filter(s => s.status === "empty" && !s.videoUrl).length;

      const pickTargets = (count: number) => {
        const need = Math.min(Math.max(count, 0), 4);
        const targets: number[] = [];

        // 只填空位，不覆盖已有视频
        for (let i = 0; i < 4 && targets.length < need; i++) {
          const s = videoSlots[i];
          if (s?.status === "empty" && !s.videoUrl) targets.push(i);
        }

        return targets;
      };

      // 0) 参数校验
      if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
        toast("请先在图片四宫格里添加图片", "error");
        return;
      }

      // 1) 单图多视频
      if (genMode === "image2video" && imageUrls.length === 1 && batchCount > 1) {
        const sourceImageUrl = imageUrls[0];
        
        // 检查空位是否足够
        if (emptyVideoSlotCount === 0) {
          toast("视频四宫格已满，请先删除一些视频", "error");
          return;
        }
        if (emptyVideoSlotCount < batchCount) {
          toast(`空位不足：您要生成 ${batchCount} 个视频，但只有 ${emptyVideoSlotCount} 个空位。请先删除一些视频或减少生成数量。`, "error");
          return;
        }
        
        const finalTargets = pickTargets(batchCount);
        if (finalTargets.length === 0) {
          toast("视频四宫格已满，请先删除一些视频", "error");
          return;
        }

        // 写入 pending 队列（由 WebSocket 完成时按顺序落位）
        savePendingSlots(
          buildPendingVideoSlots({ slotIndices: finalTargets, imageUrl: sourceImageUrl, createdAt: now })
        );
        pendingWritten = true;

        // 标记 generating
        clearVideoErrorRecords(shot.id, finalTargets);
        setVideoSlots((prev) =>
          prev.map((s, idx) =>
            finalTargets.includes(idx)
              ? {
                  ...s,
                  status: "generating",
                  imageUrl: sourceImageUrl,
                  videoUrl: undefined,
                  sourceTaskId: undefined,
                  errorMessage: undefined,
                }
              : s
          )
        );

        await api.post(`/ai-agent/shots/${shot.id}/generate-video`, {
          prompt: videoPromptValue,
          imageUrls: [sourceImageUrl],
          mode: genMode,
          batchCount: finalTargets.length,
          ...(videoModelId !== null ? { videoModelId } : {}),
          duration: selectedDuration,
          ratio: selectedRatio,
          slotIndices: finalTargets, // 传入预分配的槽位
        });

        toast(`开始生成 ${finalTargets.length} 个视频...`, "success");
        return;
      }

      // 2) 图生视频：多图时，每张图生成 1 个视频
      if (genMode === "image2video" && imageUrls.length > 1) {
        // 从当前 videoSlots state 获取已有视频的图片 URL
        const usedImageUrls = new Set(
          videoSlots.filter((s) => s.status === "completed" && s.videoUrl && s.imageUrl).map((s) => s.imageUrl!)
        );
        const sources = imageUrls.filter((u) => !usedImageUrls.has(u));
        if (sources.length === 0) {
          toast("没有可生成的视频图片（已有视频的图片会被忽略）", "info");
          return;
        }

        // 检查空位是否足够
        if (emptyVideoSlotCount === 0) {
          toast("视频四宫格已满，请先删除一些视频", "error");
          return;
        }
        if (emptyVideoSlotCount < sources.length) {
          toast(`空位不足：您有 ${sources.length} 张图片要生成视频，但只有 ${emptyVideoSlotCount} 个空位。请先删除一些视频。`, "error");
          return;
        }

        const targets = pickTargets(sources.length);
        if (targets.length === 0) {
          toast("视频四宫格已满，请先删除一些视频", "error");
          return;
        }

        const sourcesUsed = sources.slice(0, targets.length);

        const pending: PendingVideoSlot[] = targets.map((slotIndex, i) => ({
          slotIndex,
          imageUrl: sourcesUsed[i],
          createdAt: now,
        }));
        savePendingSlots(pending);
        pendingWritten = true;

        // 标记对应槽位为 generating
        clearVideoErrorRecords(shot.id, targets);
        setVideoSlots((prev) =>
          prev.map((s, idx) => {
            const i = targets.indexOf(idx);
            if (i === -1) return s;
            return {
              ...s,
              status: "generating",
              imageUrl: sourcesUsed[i],
              videoUrl: undefined,
              sourceTaskId: undefined,
              errorMessage: undefined,
            };
          })
        );

        await api.post(`/ai-agent/shots/${shot.id}/generate-video`, {
          prompt: videoPromptValue,
          imageUrls: sourcesUsed,
          mode: genMode,
          batchCount: 1,
          ...(videoModelId !== null ? { videoModelId } : {}),
          duration: selectedDuration,
          ratio: selectedRatio,
          slotIndices: targets, // 传入预分配的槽位
        });

        toast(`开始生成 ${targets.length} 个视频...`, "success");
        return;
      }

      // 3) 首尾帧 / 融合：batchCount 表示生成多个视频变体
      if (genMode === "firstLast" || genMode === "fusion") {
        const coverImageUrl = imageUrls[0];
        
        // 检查空位是否足够
        if (emptyVideoSlotCount === 0) {
          toast("视频四宫格已满，请先删除一些视频", "error");
          return;
        }
        if (emptyVideoSlotCount < batchCount) {
          toast(`空位不足：您要生成 ${batchCount} 个视频，但只有 ${emptyVideoSlotCount} 个空位。请先删除一些视频或减少生成数量。`, "error");
          return;
        }
        
        const finalTargets = pickTargets(batchCount);
        if (finalTargets.length === 0) {
          toast("视频四宫格已满，请先删除一些视频", "error");
          return;
        }

        // 标记 generating
        clearVideoErrorRecords(shot.id, finalTargets);
        setVideoSlots((prev) =>
          prev.map((s, idx) =>
            finalTargets.includes(idx)
              ? {
                  ...s,
                  status: "generating",
                  imageUrl: coverImageUrl,
                  videoUrl: undefined,
                  sourceTaskId: undefined,
                  errorMessage: undefined,
                }
              : s
          )
        );

        savePendingSlots(
          buildPendingVideoSlots({ slotIndices: finalTargets, imageUrl: coverImageUrl, createdAt: now })
        );
        pendingWritten = true;

        await api.post(`/ai-agent/shots/${shot.id}/generate-video`, {
          prompt: videoPromptValue,
          imageUrls,
          mode: genMode,
          batchCount: finalTargets.length,
          ...(videoModelId !== null ? { videoModelId } : {}),
          duration: selectedDuration,
          ratio: selectedRatio,
          slotIndices: finalTargets, // 传入预分配的槽位
        });

        toast(`开始生成 ${finalTargets.length} 个视频...`, "success");
        return;
      }

      // 4) 图生视频：单图单视频（允许同一张图片生成多次）
      const sourceImageUrl = imageUrls[0];
      const finalTargets = pickTargets(1);
      if (finalTargets.length === 0) {
        toast("视频四宫格已满，请先删除一些视频", "error");
        return;
      }

      const slotIndex = finalTargets[0];

      // 写入 pending
      savePendingSlots([{ slotIndex, imageUrl: sourceImageUrl, createdAt: now }]);
      pendingWritten = true;

      // 标记 generating
      clearVideoErrorRecords(shot.id, [slotIndex]);
      setVideoSlots((prev) =>
        prev.map((s, i) =>
          i === slotIndex
            ? {
                ...s,
                status: "generating",
                imageUrl: sourceImageUrl,
                videoUrl: undefined,
                sourceTaskId: undefined,
                errorMessage: undefined,
              }
            : s
        )
      );

      await api.post(`/ai-agent/shots/${shot.id}/generate-video`, {
        prompt: videoPromptValue,
        imageUrls: [sourceImageUrl],
        mode: genMode,
        batchCount: 1,
        ...(videoModelId !== null ? { videoModelId } : {}),
        duration: selectedDuration,
        ratio: selectedRatio,
        slotIndices: [slotIndex], // 传入预分配的槽位
      });

      toast("开始生成视频...", "success");
    } catch (error) {
      if (pendingWritten) {
        savePendingSlots(prevPending);
      }
      setVideoSlots(prevVideoSlotsSnapshot);
      const msg = (error as any)?.response?.data?.error || "生成视频失败";
      toast(msg, "error");
    }
  };

  // Debounce 延迟保存（避免每次按键都请求）
  const promptSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const videoPromptSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastFramePromptSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const dialogueSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  // 跟踪是否是首次渲染（避免初始化时触发保存）
  const isFirstRenderRef = useRef({ prompt: true, videoPrompt: true, lastFramePrompt: true, dialogue: true });
  
  // 保存图片提示词
  const saveImagePrompt = useCallback(async (value: string) => {
    try {
      await api.put(`/ai-agent/shots/${shot.id}/details`, { userFirstFramePrompt: value });
    } catch (e) { }
  }, [shot.id]);
  
  // 保存尾帧提示词
  const saveLastFramePrompt = useCallback(async (value: string) => {
    try {
      await api.put(`/ai-agent/shots/${shot.id}/details`, { lastFramePrompt: value });
    } catch (e) { }
  }, [shot.id]);
  
  // 保存视频提示词
  const saveVideoPrompt = useCallback(async (value: string) => {
    try {
      await api.put(`/ai-agent/shots/${shot.id}/details`, { userVideoPrompt: value });
    } catch (e) { }
  }, [shot.id]);
  
  // 保存台词
  const saveDialogue = useCallback(async (value: string) => {
    try {
      await api.put(`/ai-agent/shots/${shot.id}/details`, { dialogue: value });
    } catch (e) { }
  }, [shot.id]);

  // 图片提示词变化时自动保存（debounce 500ms）
  useEffect(() => {
    // 跳过首次渲染
    if (isFirstRenderRef.current.prompt) {
      isFirstRenderRef.current.prompt = false;
      return;
    }
    if (promptSaveTimerRef.current) {
      clearTimeout(promptSaveTimerRef.current);
    }
    promptSaveTimerRef.current = setTimeout(() => {
      saveImagePrompt(promptValue);
    }, 500);
    return () => {
      if (promptSaveTimerRef.current) {
        clearTimeout(promptSaveTimerRef.current);
      }
    };
  }, [promptValue, saveImagePrompt]);

  // 视频提示词变化时自动保存（debounce 500ms）
  useEffect(() => {
    // 跳过首次渲染
    if (isFirstRenderRef.current.videoPrompt) {
      isFirstRenderRef.current.videoPrompt = false;
      return;
    }
    if (videoPromptSaveTimerRef.current) {
      clearTimeout(videoPromptSaveTimerRef.current);
    }
    videoPromptSaveTimerRef.current = setTimeout(() => {
      saveVideoPrompt(videoPromptValue);
    }, 500);
    return () => {
      if (videoPromptSaveTimerRef.current) {
        clearTimeout(videoPromptSaveTimerRef.current);
      }
    };
  }, [videoPromptValue, saveVideoPrompt]);

  // 尾帧提示词变化时自动保存（debounce 500ms）
  useEffect(() => {
    // 跳过首次渲染
    if (isFirstRenderRef.current.lastFramePrompt) {
      isFirstRenderRef.current.lastFramePrompt = false;
      return;
    }
    // 避免同步 shot -> state 时重复写回
    if ((shot.lastFramePrompt || "") === lastFramePromptValue) {
      return;
    }
    if (lastFramePromptSaveTimerRef.current) {
      clearTimeout(lastFramePromptSaveTimerRef.current);
    }
    lastFramePromptSaveTimerRef.current = setTimeout(() => {
      saveLastFramePrompt(lastFramePromptValue);
    }, 500);
    return () => {
      if (lastFramePromptSaveTimerRef.current) {
        clearTimeout(lastFramePromptSaveTimerRef.current);
      }
    };
  }, [lastFramePromptValue, saveLastFramePrompt, shot.lastFramePrompt]);

  // 台词变化时自动保存（debounce 500ms）
  useEffect(() => {
    // 跳过首次渲染
    if (isFirstRenderRef.current.dialogue) {
      isFirstRenderRef.current.dialogue = false;
      return;
    }
    if (dialogueSaveTimerRef.current) {
      clearTimeout(dialogueSaveTimerRef.current);
    }
    dialogueSaveTimerRef.current = setTimeout(() => {
      saveDialogue(dialogueValue);
    }, 500);
    return () => {
      if (dialogueSaveTimerRef.current) {
        clearTimeout(dialogueSaveTimerRef.current);
      }
    };
  }, [dialogueValue, saveDialogue]);

  // 台词脚本推理视频提示词（流式输出）
  const handleInferVideoPrompt = async () => {
    setInferring(true);
    // 切换到视频模式显示结果
    setMode("video");
    // 清空当前视频提示词，准备流式填充
    setVideoPromptValue("");
    
    try {
      const response = await apiFetch(`/ai-agent/shots/${shot.id}/infer-video-prompt-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          templateType: videoInferenceTemplateType,
          templateId: videoInferenceTemplateType === 'user' ? videoInferenceTemplateCode : undefined,
          templateCode: videoInferenceTemplateType === 'system' ? videoInferenceTemplateCode : undefined
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
            parsed?.videoPrompt ||
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
                setVideoPromptValue(accumulated);
              }
            } else if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
              const text = extractText(trimmed);
              if (text) {
                accumulated += text;
                setVideoPromptValue(accumulated);
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
          setVideoPromptValue(fallback);
          accumulated = fallback;
        } else {
          toast("推理结果为空", "error");
        }
      }

      if (accumulated.trim()) {
        toast("推理完成", "success");
        // 刷新数据
        onUpdate();
      }
    } catch (error: any) {
      const msg = error?.message || "推理失败";
      toast(msg, "error");
    } finally {
      setInferring(false);
    }
  };

  // 台词和视频提示词推理首尾帧提示词
  // 后端返回 JSON 格式: { "firstFramePrompt": "...", "lastFramePrompt": "..." }
  const handleInferFramePrompts = async () => {
    setInferringFramePrompts(true);
    // 切换到图片模式显示结果
    setMode("image");
    
    try {
      const response = await apiFetch(`/ai-agent/shots/${shot.id}/infer-frame-prompts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // 模板配置
          templateType: firstFrameInferenceTemplateType,
          templateId: firstFrameInferenceTemplateType === 'user' ? firstFrameInferenceTemplateCode : undefined,
          templateCode: firstFrameInferenceTemplateType === 'system' ? firstFrameInferenceTemplateCode : undefined,
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData?.error || errData?.message || "推理失败");
      }

      const data = await response.json();
      
      // 解析返回的 JSON
      // 期望格式: { firstFramePrompt: "...", lastFramePrompt: "..." }
      const firstPrompt = data?.firstFramePrompt || data?.first_frame_prompt || "";
      const lastPrompt = data?.lastFramePrompt || data?.last_frame_prompt || "";
      
      if (!firstPrompt && !lastPrompt) {
        toast("推理结果为空", "error");
        return;
      }
      
      // 更新首帧和尾帧提示词
      if (firstPrompt) {
        setPromptValue(firstPrompt);
      }
      if (lastPrompt) {
        setLastFramePromptValue(lastPrompt);
      }
      
      toast("首尾帧提示词推理完成", "success");
      // 刷新数据
      onUpdate();
    } catch (error: any) {
      const msg = error?.message || "推理失败";
      toast(msg, "error");
    } finally {
      setInferringFramePrompts(false);
    }
  };

  // AI优化提示词（流式输出）
  const handleOptimizePrompt = async () => {
    const currentPrompt = mode === "image" ? promptValue : videoPromptValue;
    if (!currentPrompt.trim()) {
      toast("请先输入提示词", "error");
      return;
    }
    setOptimizing(true);
    setOptimizedPrompt("");
    setOptimizeError(null);
    setOptimizeModalOpen(true);
    
    try {
      const response = await apiFetch(`/ai-agent/optimize-image-prompt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: currentPrompt,
          videoPrompt: shot.videoPrompt || shot.userVideoPrompt || ""
        })
      });
      
      const extractText = (payload: string): string => {
        const raw = (payload || "").trim();
        if (!raw) return "";
        try {
          const parsed = JSON.parse(raw);
          if (typeof parsed === "string") return parsed;
          return (
            parsed?.optimizedPrompt ||
            parsed?.content ||
            parsed?.prompt ||
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
        throw new Error(errText || "AI优化失败");
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
                setOptimizedPrompt(accumulated);
              }
            } else if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
              const text = extractText(trimmed);
              if (text) {
                accumulated += text;
                setOptimizedPrompt(accumulated);
              }
            }
          }
        }
      } else {
        rawText = await response.text();
      }

      if (!accumulated.trim()) {
        const fallback = extractText(rawText);
        if (fallback) {
          setOptimizedPrompt(fallback);
        } else {
          setOptimizeError("优化失败，请重试");
        }
      }

      setOptimizing(false);
    } catch (error: any) {
      const msg = error?.message || "AI优化失败";
      toast(msg, "error");
      setOptimizeError(msg);
      setOptimizing(false);
    }
  };

  // 应用优化后的提示词
  const handleApplyOptimizedPrompt = async () => {
    if (mode === "image") {
      setPromptValue(optimizedPrompt);
      try {
        await api.put(`/ai-agent/shots/${shot.id}/details`, { userFirstFramePrompt: optimizedPrompt });
      } catch (e) { }
    } else {
      setVideoPromptValue(optimizedPrompt);
      try {
        await api.put(`/ai-agent/shots/${shot.id}/details`, { userVideoPrompt: optimizedPrompt });
      } catch (e) { }
    }
    setOptimizeModalOpen(false);
    toast("已应用优化结果", "success");
  };

  const handleDeleteShot = async () => {
    const ok = await confirm({ title: "删除镜头", description: "不可恢复", confirmText: "删除", variant: "danger" });
    if (ok) {
      try { await api.delete(`/ai-agent/shots/${shot.id}`); onUpdate(); } catch (e) { }
    }
  };

  // 获取首尾帧模式下的标签
  const getSlotLabel = (index: number) => {
    if (mode === "video" && videoMode === "firstLast") {
      if (index === 0) return "首帧";
      if (index === 1) return "尾帧";
      return "多余";
    }
    return null;
  };

  return (
    <>
      <div
        className={cn(
          "flex bg-[#161618] border-b border-zinc-800/80 hover:bg-[#1a1a1c] transition-colors group",
          isSelected && "bg-[#1c1c1f]",
          isActive && "ring-1 ring-inset ring-purple-500/40"
        )}
        style={{ height: '320px' }}
        onClick={onClick}
      >
        {/* Col 0: Index */}
        <div className="w-10 flex flex-col items-center pt-6 border-r border-zinc-800/50 bg-[#121212] flex-shrink-0">
          <span className="text-zinc-500 font-mono text-sm font-medium">{shot.sortOrder}</span>
          <div className="mt-2">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={e => { e.stopPropagation(); onSelect(e.target.checked); }}
              className="w-3.5 h-3.5 rounded-sm border-zinc-600 bg-zinc-800 text-purple-500 focus:ring-purple-500/20"
            />
          </div>
        </div>

        {/* Col 1: 四宫格（图片/视频 两套独立 2x2） */}
        <div className="w-[380px] flex flex-col p-3 border-r border-zinc-800/50 flex-shrink-0 gap-2">
          <div className="grid grid-cols-2 grid-rows-2 gap-1.5 bg-[#0a0a0a] rounded-lg p-1.5 border border-zinc-800/50" style={{ height: '260px' }}>
            {gridTab === "image"
              ? imageSlots.map((slot, i) => {
                  const label = getSlotLabel(i);
                  const isExcess =
                    mode === "video" &&
                    videoMode === "firstLast" &&
                    i >= 2 &&
                    slot.status === "completed";
                  const isMovingSource = movingSlotIndex === i;
                  const isMovingTarget = movingSlotIndex !== null && movingSlotIndex !== i;

                  return (
                    <div
                      key={i}
                      className={cn(
                        "relative rounded bg-zinc-800/20 overflow-hidden group/slot border border-transparent hover:border-zinc-700/50 transition-all cursor-pointer flex items-center justify-center",
                        activeGridIndex === i && "ring-1 ring-purple-500 border-transparent",
                        slot.status === "empty" && "hover:bg-zinc-800/40",
                        isExcess && "ring-2 ring-red-500/50",
                        isMovingSource && "ring-2 ring-amber-500",
                        isMovingTarget && "ring-2 ring-dashed ring-amber-500/50 hover:ring-amber-400"
                      )}
                      onClick={(e) => handleImageSlotClick(i, e)}
                    >
                      {/* 标签（首尾帧模式下） */}
                      {label && slot.status === "completed" && !isMovingSource && (
                        <div
                          className={cn(
                            "absolute top-1 left-1 z-10 px-1.5 py-0.5 rounded text-[9px] font-medium",
                            label === "首帧" && "bg-emerald-500/80 text-white",
                            label === "尾帧" && "bg-blue-500/80 text-white",
                            label === "多余" && "bg-red-500/80 text-white"
                          )}
                        >
                          {label}
                        </div>
                      )}

                      {/* 移动源标签 */}
                      {isMovingSource && (
                        <div className="absolute top-1 left-1 z-10 px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-500 text-white">
                          移动中
                        </div>
                      )}

                      {/* 空状态（可添加） */}
                      {slot.status === "empty" && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-600">
                          {isMovingTarget ? (
                            <>
                              <Move className="w-5 h-5 mb-1 text-amber-400" />
                              <span className="text-[9px] text-amber-400">点击移动到此</span>
                            </>
                          ) : (
                            <>
                              <ImageIcon className="w-5 h-5 mb-1" />
                              <span className="text-[9px]">点击添加</span>
                            </>
                          )}
                        </div>
                      )}

                      {/* 生成中（图片） */}
                      {slot.status === "generating" && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900/80">
                          <Loader2 className="w-5 h-5 text-indigo-500 animate-spin mb-1" />
                          <span className="text-[9px] text-zinc-500">生成中...</span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="absolute top-1 right-1 h-5 w-5 rounded-full text-zinc-400 hover:bg-red-500/30 hover:text-red-300 bg-zinc-800/50 transition-colors"
                            onClick={(e) => handleCancelGenerating("image", i, e)}
                            title="取消生成"
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      )}

                      {/* 已完成（图片） */}
                      {slot.status === "completed" && slot.imageUrl && (
                        <>
                          <img
                            src={toThumbnailUrl(slot.imageUrl, 800)}
                            className="w-full h-full object-contain"
                          />

                          {/* 移动目标指示 */}
                          {isMovingTarget && (
                            <div className="absolute inset-0 bg-amber-500/20 flex flex-col items-center justify-center">
                              <ArrowRightLeft className="w-6 h-6 text-amber-400" />
                              <span className="text-[10px] text-amber-300 mt-1">点击交换</span>
                            </div>
                          )}

                          {/* Hover 操作（非移动模式下才显示） */}
                          {!isMovingSource && !isMovingTarget && (
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/slot:opacity-100 transition-all duration-200 flex flex-col items-center justify-center gap-3 backdrop-blur-[2px]">
                              <div className="flex items-center gap-2">
                                <Button
                                  size="icon"
                                  className="h-8 w-8 rounded-full bg-black/50 hover:bg-black/70 text-white border border-white/10 backdrop-blur-md transition-all hover:scale-110"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onPreviewImage(slot.imageUrl!);
                                  }}
                                  title="预览大图"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  size="icon"
                                  className="h-8 w-8 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-400 hover:to-violet-400 text-white border border-white/10 shadow-lg shadow-indigo-500/20 backdrop-blur-md transition-all hover:scale-110"
                                  onClick={(e) => handleEditImage(i, e)}
                                  title="编辑图片"
                                >
                                  <Wand2 className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  size="icon"
                                  className="h-8 w-8 rounded-full bg-amber-500/80 hover:bg-amber-500 text-white border border-white/10 backdrop-blur-md transition-all hover:scale-110"
                                  onClick={(e) => handleStartMoveSlot(i, e)}
                                  title="移动位置"
                                >
                                  <Move className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 rounded-full text-white/70 hover:text-red-400 hover:bg-red-500/20 transition-all absolute top-1.5 right-1.5"
                                onClick={(e) => handleDeleteImageSlot(i, e)}
                                title="删除图片"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          )}

                          {/* 移动源的取消按钮 */}
                          {isMovingSource && (
                            <div className="absolute inset-0 bg-amber-500/10">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="absolute top-1 right-1 h-5 w-5 rounded-full text-amber-400 hover:bg-amber-500/30 hover:text-amber-300 bg-zinc-900/70 transition-colors"
                                onClick={(e) => handleCancelMove(e)}
                                title="取消移动"
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })
              : videoSlots.map((slot, i) => {
                  const clickable = slot.status === "completed" && !!slot.videoUrl;

                  return (
                    <div
                      key={i}
                      className={cn(
                        "relative rounded bg-zinc-800/20 overflow-hidden group/slot border border-transparent hover:border-zinc-700/50 transition-all flex items-center justify-center",
                        clickable ? "cursor-pointer" : "cursor-default",
                        activeGridIndex === i && "ring-1 ring-purple-500 border-transparent",
                        slot.status === "empty" && "hover:bg-zinc-800/30"
                      )}
                      onClick={(e) => handleVideoSlotClick(i, e)}
                    >
                      {/* 空状态（仅展示，不可添加） */}
                      {slot.status === "empty" && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-600">
                          <Film className="w-5 h-5 mb-1" />
                          <span className="text-[9px]">暂无视频</span>
                        </div>
                      )}

                      {/* 生成中（视频） */}
                      {slot.status === "generating" && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900/80">
                          <Loader2 className="w-5 h-5 text-indigo-500 animate-spin mb-1" />
                          <span className="text-[9px] text-zinc-500">视频生成中...</span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="absolute top-1 right-1 h-5 w-5 rounded-full text-zinc-400 hover:bg-red-500/30 hover:text-red-300 bg-zinc-800/50 transition-colors"
                            onClick={(e) => handleCancelGenerating("video", i, e)}
                            title="取消生成"
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                      {/* 生成失败（视频） */}
                      {slot.status === "error" && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-950/30 border border-red-500/30">
                          {slot.imageUrl && (
                            <img
                              src={toThumbnailUrl(slot.imageUrl, 800)}
                              className="absolute inset-0 w-full h-full object-contain opacity-20"
                            />
                          )}
                          <div className="relative z-10 px-2 text-center space-y-1">
                            <span className="text-[9px] text-red-300 font-medium">生成失败</span>
                            <div className="text-[9px] text-red-200 leading-snug break-words max-h-[70px] overflow-hidden">
                              {slot.errorMessage || "视频生成失败"}
                            </div>
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="absolute top-1 right-1 h-5 w-5 rounded-full text-red-300 hover:bg-red-500/30 hover:text-red-200 bg-zinc-900/60 transition-colors"
                            onClick={(e) => handleDeleteVideoSlot(i, e)}
                            title="清除错误"
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      )}

                      {/* 已完成（视频） */}
                      {slot.status === "completed" && slot.videoUrl && (
                        <>
                          {slot.imageUrl ? (
                            <img
                              src={toThumbnailUrl(slot.imageUrl, 800)}
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-600">
                              <Film className="w-5 h-5 mb-1" />
                              <span className="text-[9px]">视频</span>
                            </div>
                          )}

                          <div className="absolute inset-0 bg-black/10 flex items-center justify-center group-hover/slot:hidden">
                            <Play className="w-4 h-4 text-white/90 drop-shadow-md" />
                          </div>

                          {/* Hover 操作 */}
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/slot:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5 backdrop-blur-[1px]">
                            <div className="flex gap-2">
                              {slot.imageUrl && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 rounded-full bg-white/10 hover:bg-white/20 text-white"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onPreviewImage(slot.imageUrl!);
                                  }}
                                >
                                  <Eye className="w-3 h-3" />
                                </Button>
                              )}
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 rounded-full bg-indigo-500/80 hover:bg-indigo-500 text-white"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onPreviewVideo(slot.videoUrl!);
                                }}
                              >
                                <Play className="w-3 h-3" />
                              </Button>
                            </div>

                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-5 w-5 rounded-full text-red-400 hover:bg-red-500/20 hover:text-red-300 absolute top-1 right-1"
                              onClick={(e) => handleDeleteVideoSlot(i, e)}
                              title="删除视频"
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
          </div>

          {/* 底部信息 + 切换 */}
          <div className="flex items-center justify-between text-[10px] text-zinc-500 px-1 h-6 flex-shrink-0">
            <div className="flex items-center gap-1.5">
              <div
                className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  (gridTab === "image" ? completedImageSlots.length : completedVideoSlots.length) > 0
                    ? "bg-emerald-500"
                    : "bg-zinc-600"
                )}
              />
              <span>
                {gridTab === "image"
                  ? `${completedImageSlots.length}/4 张`
                  : `${completedVideoSlots.length}/4 个`}
              </span>
              {/* 角色图片 */}
              {refChars.length > 0 && (
                <div className="flex items-center gap-1.5 ml-3">
                  {refChars.slice(0, 4).map(c => (
                    <div
                      key={c.id}
                      className="w-6 h-6 rounded bg-zinc-800 overflow-hidden border border-zinc-700/50 cursor-pointer hover:border-purple-500/50 hover:scale-110 transition-all"
                      title={c.name}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (c.imageUrl) onPreviewImage(c.imageUrl);
                      }}
                    >
                      {c.imageUrl ? (
                        <img src={toThumbnailUrl(c.imageUrl, 48)} className="w-full h-full object-cover" alt={c.name} />
                      ) : (
                        <UserCircle2 className="w-full h-full p-0.5 text-zinc-500" />
                      )}
                    </div>
                  ))}
                  {refChars.length > 4 && (
                    <button
                      className="w-6 h-6 rounded bg-zinc-800 border border-zinc-700/50 flex items-center justify-center text-zinc-400 hover:text-zinc-200 hover:border-purple-500/50 hover:scale-110 transition-all"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCharsModalOpen(true);
                      }}
                      title={`查看全部 ${refChars.length} 个角色`}
                    >
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {gridTab === "image" && mode === "video" && videoMode === "firstLast" && (
                <span className="text-amber-400">首尾帧模式</span>
              )}

              <div className="flex items-center bg-zinc-900/50 border border-zinc-800 rounded-md p-0.5">
                <button
                  type="button"
                  className={cn(
                    "px-2 py-1 rounded text-[10px] transition-colors",
                    gridTab === "image"
                      ? "bg-zinc-800 text-white"
                      : "text-zinc-500 hover:text-zinc-300"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    setGridTab("image");
                  }}
                >
                  图
                </button>
                <button
                  type="button"
                  className={cn(
                    "px-2 py-1 rounded text-[10px] transition-colors",
                    gridTab === "video"
                      ? "bg-zinc-800 text-white"
                      : "text-zinc-500 hover:text-zinc-300"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    setGridTab("video");
                  }}
                >
                  视频
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Col 2: 操作栏 */}
        <div className="w-28 flex flex-col items-center py-4 border-r border-zinc-800/50 bg-[#121212] gap-3 flex-shrink-0">
          <div className="flex flex-col items-center gap-2 w-full px-2">
            {mode === "image" ? (
              <>
                <Button
                  size="sm"
                  className="w-full h-9 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-lg shadow-indigo-900/20 text-xs font-medium border border-indigo-500/20"
                  onClick={(e) => { e.stopPropagation(); handleImageGenerate(); }}
                >
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                  图片生成
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  className="w-full h-9 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white shadow-lg shadow-purple-900/20 text-xs font-medium border border-purple-500/20"
                  onClick={(e) => { e.stopPropagation(); handleVideoGenerate(); }}
                >
                  <Film className="w-3.5 h-3.5 mr-1.5" />视频生成
                </Button>
                
                {/* 视频模式选择 */}
                <div className="w-full flex flex-col gap-1 mt-1">
                  {[
                    { value: "image2video", label: "图生视频" },
                    { value: "firstLast", label: "首尾帧" },
                    { value: "fusion", label: "融合生成" }
                  ].map(item => (
                    <button
                      key={item.value}
                      onClick={(e) => { e.stopPropagation(); setVideoMode(item.value as VideoMode); }}
                      className={cn(
                        "w-full h-6 rounded text-[10px] transition-all",
                        videoMode === item.value 
                          ? "bg-purple-500/20 text-purple-400 border border-purple-500/30" 
                          : "bg-zinc-800/50 text-zinc-500 hover:text-zinc-300 border border-transparent"
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                {/* 首尾帧工具 - 推理尾帧按钮（只在首帧已生成时显示） */}
                {videoMode === "firstLast" && imageSlots[0]?.status === "completed" && imageSlots[0]?.imageUrl && (
                  <div className="w-full mt-2">
                    <button
                      className="w-full h-7 rounded-md bg-violet-500/15 hover:bg-violet-500/25 text-violet-300 hover:text-violet-200 text-[10px] font-medium flex items-center justify-center gap-1.5 border border-violet-500/30 hover:border-violet-500/50 transition-all"
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        handleInferEndFrame();
                      }}
                    >
                      <Wand2 className="w-3 h-3" />
                      AI推理尾帧
                    </button>
                  </div>
                )}

                {/* 生成数量选择 - 图生视频单图、首尾帧、融合模式显示 */}
{((videoMode === "image2video" && completedImageSlots.length === 1) || videoMode === "firstLast" || videoMode === "fusion") && (
                  <div className="w-full mt-2 px-1">
                    <div className="text-[9px] text-zinc-500 mb-1">生成数量</div>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4].map(num => (
                        <button
                          key={num}
                          onClick={(e) => { e.stopPropagation(); setVideoBatchCount(num); }}
                          className={cn(
                            "flex-1 h-6 rounded text-[10px] transition-all",
                            videoBatchCount === num
                              ? "bg-purple-500/20 text-purple-400 border border-purple-500/30 font-medium"
                              : "bg-zinc-800/50 text-zinc-500 hover:text-zinc-300 border border-transparent"
                          )}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 当前视频模型（由右侧“视频模型”抽屉决定） */}
                <div className="w-full mt-1 px-1 text-[9px] text-zinc-500">
                  模型: <span className="text-zinc-300">{currentVideoModelLabel || "未设置"}</span>
                </div>

              </>
            )}
          </div>

        </div>

        {/* Col 3: 提示词 */}
        <div className="flex-1 flex flex-col p-3 border-r border-zinc-800/50 min-w-0 bg-[#161618]">
          {/* 顶部工具栏 - 加高版 */}
          <div className="flex items-start justify-between mb-2 min-h-[56px] gap-2">
            <div className="flex flex-col gap-2 min-w-0 flex-1">
              {/* 模式切换 */}
              <div className="flex bg-zinc-950/50 rounded-lg p-0.5 border border-zinc-800 w-fit">
                <button
                  onClick={(e) => { e.stopPropagation(); setMode("image"); }}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-medium transition-all",
                    mode === "image" ? "bg-zinc-800 text-indigo-400 shadow-sm" : "text-zinc-500 hover:text-zinc-300"
                  )}
                >
                  <ImageIcon className="w-3 h-3" />
                  <span>生图</span>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setMode("video"); }}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-medium transition-all",
                    mode === "video" ? "bg-zinc-800 text-purple-400 shadow-sm" : "text-zinc-500 hover:text-zinc-300"
                  )}
                >
                  <Video className="w-3 h-3" />
                  <span>视频</span>
                </button>
              </div>

              {/* 画风选择器 - 仅在图片模式显示 */}
              {mode === "image" && (
                <button
                  onClick={(e) => { e.stopPropagation(); setStyleEditorOpen(true); }}
                  className="px-2 py-1 rounded-lg bg-zinc-900/50 border border-zinc-800/50 hover:border-zinc-700 transition-all group flex items-center gap-1.5 max-w-full overflow-hidden"
                >
                  <Palette className="w-3 h-3 text-pink-400 flex-shrink-0" />
                  <span className="text-[10px] text-zinc-300 truncate">
                    {customStyle ? customStyle : '设置画风'}
                  </span>
                </button>
              )}
            </div>

            {/* 2x2 工具按钮网格 */}
            <div className="grid grid-cols-2 gap-1">
              <Button 
                variant="ghost" 
                size="icon" 
                className={cn(
                  "w-7 h-7 rounded-lg transition-colors border border-zinc-800/50",
                  optimizing 
                    ? "text-purple-400 bg-purple-500/10 animate-pulse" 
                    : "text-zinc-500 hover:text-purple-400 hover:bg-purple-500/10 hover:border-purple-500/30"
                )}
                onClick={(e) => { e.stopPropagation(); handleOptimizePrompt(); }}
                disabled={optimizing}
                title="AI优化提示词"
              >
                {optimizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="w-7 h-7 rounded-lg text-zinc-600 border border-zinc-800/50 cursor-not-allowed opacity-50"
                disabled
                title="功能开发中..."
              >
                <Bot className="w-3.5 h-3.5" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="w-7 h-7 rounded-lg text-zinc-600 border border-zinc-800/50 cursor-not-allowed opacity-50"
                disabled
                title="功能开发中..."
              >
                <Sparkles className="w-3.5 h-3.5" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="w-7 h-7 rounded-lg text-zinc-600 border border-zinc-800/50 cursor-not-allowed opacity-50"
                disabled
                title="功能开发中..."
              >
                <ImageIcon className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {mode === "image" ? (
            <div className="flex-1 flex flex-col gap-2">
              {/* 仅显示首帧提示词 */}
              <div className="flex flex-col min-h-0 flex-1">
                <div className="text-[10px] text-zinc-500 mb-1">图片提示词</div>
                <Textarea
                  value={promptValue}
                  onChange={(e) => setPromptValue(e.target.value)}
                  placeholder="描述画面内容..."
                  className="flex-1 bg-[#0a0a0a] border-zinc-800 resize-none text-xs leading-relaxed p-3 focus:border-indigo-500/30 min-h-0"
                />
              </div>
            </div>
          ) : (
            <Textarea
              value={videoPromptValue}
              onChange={(e) => setVideoPromptValue(e.target.value)}
              placeholder="描述镜头运动..."
              className="flex-1 bg-[#0a0a0a] border-zinc-800 resize-none text-xs leading-relaxed p-3 focus:border-indigo-500/30"
            />
          )}
        </div>

        {/* Col 4: 台词 */}
        <div className="w-[300px] flex flex-col bg-[#131315] p-3 flex-shrink-0">
          <div className="flex items-center justify-between mb-3 text-xs font-medium text-zinc-400">
            <div className="flex items-center gap-2">
              <AlignLeft className="w-3.5 h-3.5" />
              <span>台词脚本</span>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-500"><MoreVertical className="w-3.5 h-3.5" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={onAddShotAfter} className="text-xs">
                  <Plus className="w-3.5 h-3.5 mr-2" /> 在此后插入镜头
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={handleDeleteShot} className="text-red-400 text-xs">
                  <Trash2 className="w-3.5 h-3.5 mr-2" /> 删除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex-1 bg-[#0a0a0a] border border-zinc-800 p-2 rounded mb-2">
            <textarea
              className="w-full h-full bg-transparent border-none resize-none text-xs text-zinc-300 placeholder:text-zinc-700 focus:ring-0 focus:outline-none"
              placeholder="输入台词..."
              value={dialogueValue}
              onChange={(e) => setDialogueValue(e.target.value)}
            />
          </div>
          
          {/* 台词推理按钮 */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "flex-1 h-7 text-xs border-zinc-700 transition-all",
                inferring
                  ? "text-cyan-400 bg-cyan-500/10 border-cyan-500/30 animate-pulse"
                  : "text-zinc-400 hover:text-cyan-400 hover:bg-cyan-500/10 hover:border-cyan-500/30"
              )}
              onClick={(e) => { e.stopPropagation(); handleInferVideoPrompt(); }}
              disabled={inferring || !dialogueValue.trim()}
              title="根据台词推理生成视频运动提示词"
            >
              {inferring ? (
                <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
              ) : (
                <Sparkles className="w-3 h-3 mr-1.5" />
              )}
              {inferring ? "推理中..." : "推理视频提示词"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "flex-1 h-7 text-xs border-zinc-700 transition-all",
                inferringFramePrompts
                  ? "text-pink-400 bg-pink-500/10 border-pink-500/30 animate-pulse"
                  : "text-zinc-400 hover:text-pink-400 hover:bg-pink-500/10 hover:border-pink-500/30"
              )}
              onClick={(e) => { e.stopPropagation(); handleInferFramePrompts(); }}
              disabled={inferringFramePrompts || !dialogueValue.trim()}
              title="根据台词和视频提示词推理生成首帧和尾帧画面提示词"
            >
              {inferringFramePrompts ? (
                <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
              ) : (
                <ImageIcon className="w-3 h-3 mr-1.5" />
              )}
              {inferringFramePrompts ? "推理中..." : "推理首尾帧提示词"}
            </Button>
          </div>
        </div>
      </div>

      {/* 画风编辑弹窗 */}
      <Dialog open={styleEditorOpen} onOpenChange={(open) => { setStyleEditorOpen(open); if (open) setStyleDraft(customStyle || ""); }}>
        <DialogContent className="max-w-xl bg-[#14141a] border-zinc-800 text-white">
          <VisuallyHidden>
            <DialogTitle>画风设置</DialogTitle>
          </VisuallyHidden>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pink-500/20 to-purple-500/20 flex items-center justify-center">
                <Palette className="w-4 h-4 text-pink-400" />
              </div>
              <div>
                <h3 className="font-semibold">画风与设置</h3>
                <p className="text-xs text-zinc-500">仅在“生图”时生效，生成时将自动拼接到提示词前缀</p>
              </div>
            </div>

            <div>
              <label className="text-xs text-zinc-500 mb-2 block">自定义画风描述</label>
              <textarea
                value={styleDraft}
                onChange={(e) => setStyleDraft(e.target.value)}
                placeholder="例如：二维动漫风格 --sref https://... --sw 400"
                className="w-full min-h-[120px] bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-sm focus:border-pink-500/50"
              />
              <p className="text-[10px] text-zinc-600 mt-1">支持 --sref / --sw 参考图语法。建议把画风从提示词里移除，避免重复。</p>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" className="border-zinc-700" onClick={() => setStyleEditorOpen(false)}>取消</Button>
              <Button
                onClick={async () => {
                  setSavingStyle(true);
                  try {
                    await api.put(`/ai-agent/workflows/${workflowId}/step1`, { styleType: "custom", customStyle: (styleDraft || "").trim() });
                    setStyleEditorOpen(false);
                    setSavingStyle(false);
                    onUpdate();
                  } catch (e) {
                    setSavingStyle(false);
                  }
                }}
                disabled={savingStyle}
                className="bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500"
              >
                {savingStyle ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}保存全局画风
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 图片选择弹窗 - 增强版：支持上传、素材库、历史图片 */}
      <Dialog open={imagePickerOpen} onOpenChange={setImagePickerOpen}>
        <DialogContent className="max-w-3xl bg-[#14141a] border-zinc-800 text-white p-0 [&>button]:hidden">
          <DialogTitle className="sr-only">选择图片</DialogTitle>
          <div className="p-5 border-b border-zinc-800">
            <h3 className="font-bold text-lg">选择图片</h3>
            <p className="text-sm text-zinc-500 mt-1">上传本地图片、从素材库选择或查看历史生成图片</p>
          </div>
          
          {/* 标签页切换 */}
          <div className="flex border-b border-zinc-800">
            <button
              onClick={() => setImagePickerTab("upload")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors",
                imagePickerTab === "upload"
                  ? "text-indigo-400 border-b-2 border-indigo-500 bg-indigo-500/5"
                  : "text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800/50"
              )}
            >
              <Upload className="w-4 h-4" />
              上传图片
            </button>
            <button
              onClick={() => setImagePickerTab("assets")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors",
                imagePickerTab === "assets"
                  ? "text-emerald-400 border-b-2 border-emerald-500 bg-emerald-500/5"
                  : "text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800/50"
              )}
            >
              <FolderOpen className="w-4 h-4" />
              素材库
            </button>
            <button
              onClick={() => setImagePickerTab("history")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors",
                imagePickerTab === "history"
                  ? "text-amber-400 border-b-2 border-amber-500 bg-amber-500/5"
                  : "text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800/50"
              )}
            >
              <History className="w-4 h-4" />
              历史图片
            </button>
          </div>
          
          <div className="p-5 min-h-[300px] max-h-[450px] overflow-y-auto">
            {/* 上传图片标签页 */}
            {imagePickerTab === "upload" && (
              <div>
                <label className="flex flex-col items-center justify-center h-48 border-2 border-dashed border-zinc-700 rounded-xl cursor-pointer hover:border-indigo-500 hover:bg-indigo-500/5 transition-all">
                  {uploading ? (
                    <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                  ) : (
                    <>
                      <Upload className="w-10 h-10 text-zinc-500 mb-3" />
                      <span className="text-sm text-zinc-400">点击或拖拽上传图片</span>
                      <span className="text-xs text-zinc-600 mt-1">支持 JPG、PNG 格式</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUploadImage(file);
                    }}
                  />
                </label>
              </div>
            )}

            {/* 素材库标签页 */}
            {imagePickerTab === "assets" && (
              <div className="space-y-4">
                {/* 素材类型子标签 */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setAssetSubTab("character")}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                      assetSubTab === "character"
                        ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                        : "bg-zinc-800/50 text-zinc-400 border border-zinc-700/50 hover:text-zinc-300"
                    )}
                  >
                    <UserCircle2 className="w-3.5 h-3.5" />
                    角色 ({characters.filter(c => c.imageUrl).length})
                  </button>
                  <button
                    onClick={() => setAssetSubTab("scene")}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                      assetSubTab === "scene"
                        ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                        : "bg-zinc-800/50 text-zinc-400 border border-zinc-700/50 hover:text-zinc-300"
                    )}
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    场景 ({_scenes.filter(s => s.imageUrl).length})
                  </button>
                  <button
                    onClick={() => setAssetSubTab("item")}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                      assetSubTab === "item"
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                        : "bg-zinc-800/50 text-zinc-400 border border-zinc-700/50 hover:text-zinc-300"
                    )}
                  >
                    <Package className="w-3.5 h-3.5" />
                    物品 ({items.filter(it => it.imageUrl).length})
                  </button>
                </div>

                {/* 角色素材 */}
                {assetSubTab === "character" && (
                  <div>
                    {characters.filter(c => c.imageUrl).length > 0 ? (
                      <div className="grid grid-cols-5 gap-3">
                        {characters.filter(c => c.imageUrl).map((c) => (
                          <div
                            key={c.id}
                            onClick={() => handleSelectHistoryImage(c.imageUrl!)}
                            className="group relative aspect-square rounded-xl overflow-hidden border-2 border-zinc-700 hover:border-purple-500 cursor-pointer transition-all hover:scale-105 hover:shadow-lg hover:shadow-purple-500/20"
                          >
                            <img src={toThumbnailUrl(c.imageUrl!, 200)} className="w-full h-full object-cover" />
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                              <span className="text-[10px] text-white truncate block">{c.name}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-40 text-zinc-500">
                        <UserCircle2 className="w-8 h-8 mb-2 opacity-50" />
                        <span className="text-sm">暂无角色图片</span>
                        <span className="text-xs text-zinc-600 mt-1">请先在右侧面板中为角色生成图片</span>
                      </div>
                    )}
                  </div>
                )}

                {/* 场景素材 */}
                {assetSubTab === "scene" && (
                  <div>
                    {_scenes.filter(s => s.imageUrl).length > 0 ? (
                      <div className="grid grid-cols-5 gap-3">
                        {_scenes.filter(s => s.imageUrl).map((s) => (
                          <div
                            key={s.id}
                            onClick={() => handleSelectHistoryImage(s.imageUrl!)}
                            className="group relative aspect-square rounded-xl overflow-hidden border-2 border-zinc-700 hover:border-blue-500 cursor-pointer transition-all hover:scale-105 hover:shadow-lg hover:shadow-blue-500/20"
                          >
                            <img src={toThumbnailUrl(s.imageUrl!, 200)} className="w-full h-full object-cover" />
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                              <span className="text-[10px] text-white truncate block">{s.name}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-40 text-zinc-500">
                        <MapPin className="w-8 h-8 mb-2 opacity-50" />
                        <span className="text-sm">暂无场景图片</span>
                        <span className="text-xs text-zinc-600 mt-1">请先在右侧面板中为场景生成图片</span>
                      </div>
                    )}
                  </div>
                )}

                {/* 物品素材 */}
                {assetSubTab === "item" && (
                  <div>
                    {items.filter(it => it.imageUrl).length > 0 ? (
                      <div className="grid grid-cols-5 gap-3">
                        {items.filter(it => it.imageUrl).map((it) => (
                          <div
                            key={it.id}
                            onClick={() => handleSelectHistoryImage(it.imageUrl!)}
                            className="group relative aspect-square rounded-xl overflow-hidden border-2 border-zinc-700 hover:border-amber-500 cursor-pointer transition-all hover:scale-105 hover:shadow-lg hover:shadow-amber-500/20"
                          >
                            <img src={toThumbnailUrl(it.imageUrl!, 200)} className="w-full h-full object-cover" />
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                              <span className="text-[10px] text-white truncate block">{it.name}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-40 text-zinc-500">
                        <Package className="w-8 h-8 mb-2 opacity-50" />
                        <span className="text-sm">暂无物品图片</span>
                        <span className="text-xs text-zinc-600 mt-1">请先在右侧面板中为物品生成图片</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 历史图片标签页 */}
            {imagePickerTab === "history" && (
              <div>
                {loadingHistory ? (
                  <div className="flex flex-col items-center justify-center h-40">
                    <Loader2 className="w-6 h-6 text-amber-500 animate-spin mb-2" />
                    <span className="text-sm text-zinc-500">加载中...</span>
                  </div>
                ) : shotImageHistory.length > 0 ? (
                  <div className="grid grid-cols-5 gap-3">
                    {shotImageHistory.map((url, i) => (
                      <div
                        key={i}
                        onClick={() => handleSelectHistoryImage(url)}
                        className="aspect-square rounded-xl overflow-hidden border-2 border-zinc-700 hover:border-amber-500 cursor-pointer transition-all hover:scale-105 hover:shadow-lg hover:shadow-amber-500/20"
                      >
                        <img src={toThumbnailUrl(url, 200)} className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-40 text-zinc-500">
                    <History className="w-8 h-8 mb-2 opacity-50" />
                    <span className="text-sm">暂无历史生成图片</span>
                    <span className="text-xs text-zinc-600 mt-1">当前分镜尚未生成过图片</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="p-4 border-t border-zinc-800 flex justify-end">
            <Button variant="outline" className="border-zinc-700" onClick={() => setImagePickerOpen(false)}>取消</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 生成配置弹窗 */}
      <ImageGenerationModal
        open={generationModalOpen}
        onOpenChange={setGenerationModalOpen}
        shot={shot}
        initialPrompt={promptValue}
        customStyle={customStyle}
        defaultModel={selectedImageModel}
        characters={characters}
        scenes={_scenes}
        items={items}
        projectId={projectId}
        onGenerate={handleExecuteImageGenerate}
      />
      {/* 图片编辑器 */}
      <ImageEditorModal
        open={editorOpen && editingSlot !== null}
        onOpenChange={(open) => {
          setEditorOpen(open);
          if (!open) setEditingSlot(null);
        }}
        imageUrl={editingSlot?.url || ""}
        shotId={shot.id}
        slotIndex={editingSlot?.index ?? 0}
        onSave={(newUrl) => {
          if (!editingSlot) return;
          // 更新本地状态
          setImageSlots(prev => prev.map((s, i) => 
            i === editingSlot.index ? { ...s, imageUrl: newUrl, status: "completed" } : s
          ));
          setEditingSlot(null);
        }}
      />
      
      {/* 推理尾帧弹窗 */}
      <InferEndFrameModal
        open={inferEndFrameModalOpen}
        onOpenChange={setInferEndFrameModalOpen}
        shot={shot}
        firstFrameUrl={imageSlots[0]?.imageUrl || ""}
        videoPrompt={videoPromptValue || shot.userVideoPrompt || shot.videoPrompt || ""}
        defaultModel={selectedImageModel}
        customStyle={customStyle}
        lastFramePrompt={lastFramePromptValue || shot.lastFramePrompt}
        characters={characters}
        scenes={_scenes}
        items={items}
        projectId={projectId}
        onGenerate={handleExecuteEndFrameGenerate}
        endFrameInferenceTemplateCode={firstFrameInferenceTemplateCode}
        endFrameInferenceTemplateType={firstFrameInferenceTemplateType}
        onUpdate={onUpdate}
      />

      {/* 角色展示弹窗 */}
      <Dialog open={charsModalOpen} onOpenChange={setCharsModalOpen}>
        <DialogContent className="max-w-md bg-[#14141a] border-zinc-800 text-white">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                <UserCircle2 className="w-4 h-4 text-purple-400" />
              </div>
              <div>
                <h3 className="font-semibold">关联角色</h3>
                <p className="text-xs text-zinc-500">共 {refChars.length} 个角色</p>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-3">
              {refChars.map(c => (
                <div
                  key={c.id}
                  className="flex flex-col items-center gap-1.5 p-2 rounded-lg bg-zinc-900/50 border border-zinc-800/50 hover:border-zinc-700 transition-colors cursor-pointer"
                  onClick={() => {
                    if (c.imageUrl) {
                      onPreviewImage(c.imageUrl);
                    }
                  }}
                >
                  <div className="w-12 h-12 rounded-lg bg-zinc-800 overflow-hidden border border-zinc-700/50">
                    {c.imageUrl ? (
                      <img src={toThumbnailUrl(c.imageUrl, 80)} className="w-full h-full object-cover" alt={c.name} />
                    ) : (
                      <UserCircle2 className="w-full h-full p-2 text-zinc-500" />
                    )}
                  </div>
                  <span className="text-[10px] text-zinc-400 truncate max-w-full">{c.name}</span>
                </div>
              ))}
            </div>

            <div className="flex justify-end">
              <Button variant="outline" className="border-zinc-700" onClick={() => setCharsModalOpen(false)}>关闭</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* AI优化提示词弹窗 */}
      <Dialog open={optimizeModalOpen} onOpenChange={setOptimizeModalOpen}>
        <DialogContent className="max-w-2xl bg-[#14141a] border-zinc-800 text-white">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500/20 to-indigo-500/20 flex items-center justify-center">
                <Wand2 className="w-4 h-4 text-purple-400" />
              </div>
              <div>
                <h3 className="font-semibold">AI 优化提示词</h3>
                <p className="text-xs text-zinc-500">将提示词优化为更专业的第一帧画面描述</p>
              </div>
            </div>

            {/* 原始提示词 */}
            <div>
              <label className="text-xs text-zinc-500 mb-2 block">原始提示词</label>
              <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-sm text-zinc-400 max-h-[100px] overflow-y-auto">
                {mode === "image" ? promptValue : videoPromptValue}
              </div>
            </div>

            {/* 优化结果 */}
            <div>
              <label className="text-xs text-zinc-500 mb-2 block flex items-center gap-2">
                <Sparkles className="w-3 h-3 text-purple-400" />
                优化结果
              </label>
              {optimizing ? (
                <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-6 flex flex-col items-center justify-center min-h-[150px]">
                  <Loader2 className="w-8 h-8 text-purple-500 animate-spin mb-3" />
                  <span className="text-sm text-zinc-500">AI 正在优化提示词...</span>
                </div>
              ) : optimizedPrompt ? (
                <textarea
                  value={optimizedPrompt}
                  onChange={(e) => setOptimizedPrompt(e.target.value)}
                  className="w-full min-h-[150px] bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-sm text-zinc-200 focus:border-purple-500/50 resize-none"
                />
              ) : (
                <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-6 flex items-center justify-center min-h-[150px]">
                  <span className="text-sm text-zinc-600">{optimizeError || "优化失败，请重试"}</span>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button 
                variant="outline" 
                className="border-zinc-700" 
                onClick={() => setOptimizeModalOpen(false)}
              >
                取消
              </Button>
              <Button
                onClick={handleApplyOptimizedPrompt}
                disabled={optimizing || !optimizedPrompt}
                className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500"
              >
                <Check className="w-4 h-4 mr-2" />
                应用优化结果
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
