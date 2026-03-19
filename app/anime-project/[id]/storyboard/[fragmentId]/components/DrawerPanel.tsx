"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { 
  X, Plus, Upload, Wand2, Loader2, Check, Trash2,
  Users, MapPin, Image as ImageIcon, Video, Settings2,
  ListChecks, Download, Sparkles, Box,
  Palette, Link2, ImagePlus, Eye, Pencil, LayoutGrid, FileText
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast-provider";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn, toThumbnailUrl } from "@/lib/utils";
import api, { apiFetch } from "@/lib/api";
import { aiAgentImageApi } from "@/lib/aiAgentImageApi";
import { uploadToOss } from "@/lib/upload";
import type { WorkflowData, CharacterData, SceneData, ItemData } from "../types";
import type { DrawerType, StoryboardVideoModeCode } from "./StoryboardWorkbench";
import { useImageModels } from "@/lib/useImageModels";
import { useVideoModels } from "@/lib/useVideoModels";
import { useStylePresets } from "@/lib/useStylePresets";
import { useAiAgentWebSocket } from "@/lib/useWebSocket";
import ImagePreviewModal from "./ImagePreviewModal";
import VideoPreviewModal from "./VideoPreviewModal";
import CharacterStyleModal from "./CharacterStyleModal";
import { AI_AGENT_SHOT_IMAGE_UPDATED_EVENT } from "../shotSlotVideoStorage";
import JSZip from "jszip";
import { saveAs } from "file-saver";

interface Props {
  type: DrawerType;
  workflow: WorkflowData;
  characters: CharacterData[];
  scenes: SceneData[];
  items: ItemData[];
  onClose: () => void;
  onUpdate: () => void;
  onSwitchType?: (type: DrawerType) => void;
  selectedImageModelId: number | null;
  onChangeImageModel: (modelId: number) => void;
  videoModelIdByMode: Record<StoryboardVideoModeCode, number | null>;
  onChangeVideoModel: (mode: StoryboardVideoModeCode, modelId: number) => void;
  defaultRatio: string;
  onChangeRatio: (ratio: string) => void;
  // 视频提示词推理模板
  selectedVideoInferenceTemplate?: string;
  selectedVideoInferenceTemplateType?: 'system' | 'user';
  onChangeVideoInferenceTemplate?: (templateCode: string, templateType?: 'system' | 'user') => void;
  // 首帧提示词推理模板
  selectedFirstFrameInferenceTemplate?: string;
  selectedFirstFrameInferenceTemplateType?: 'system' | 'user';
  onChangeFirstFrameInferenceTemplate?: (templateCode: string, templateType?: 'system' | 'user') => void;
}

// 任务项类型
interface TaskItem {
  id: number;
  workflowId: number;
  taskType: string;
  targetId: number;
  targetName: string;
  status: string;
  model: string;
  resultUrl?: string;
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
}

export default function DrawerPanel({
  type,
  workflow,
  characters,
  scenes,
  items,
  onClose,
  onUpdate,
  onSwitchType,
  selectedImageModelId,
  onChangeImageModel,
  videoModelIdByMode,
  onChangeVideoModel,
  defaultRatio,
  onChangeRatio,
  selectedVideoInferenceTemplate = "",
  selectedVideoInferenceTemplateType = 'system',
  onChangeVideoInferenceTemplate,
  selectedFirstFrameInferenceTemplate = "",
  selectedFirstFrameInferenceTemplateType = 'system',
  onChangeFirstFrameInferenceTemplate,
}: Props) {
  const { toast } = useToast();
  // 提取状态超时计时器，防止 WS 丢失时按钮卡在"提取中"
  const extractingCharTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const extractingSceneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const extractingItemTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startExtracting = (
    setter: (v: boolean) => void,
    timerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
    label: string
  ) => {
    setter(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    // 60 秒兜底，避免 WS 未达导致卡死
    timerRef.current = setTimeout(() => {
      setter(false);
      toast(`${label}提取状态已自动结束，请刷新确认`, "info");
    }, 60_000);
  };

  const stopExtracting = (
    setter: (v: boolean) => void,
    timerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
  ) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setter(false);
  };

  // 提取状态：后端异步执行，按钮"提取中"需等 WS 返回后再结束
  const [extractingCharacters, setExtractingCharacters] = useState(false);
  const [extractingScenes, setExtractingScenes] = useState(false);
  const [extractingItems, setExtractingItems] = useState(false);
  // 便捷方法传给子组件
  const startExtractingCharacters = () => startExtracting(setExtractingCharacters, extractingCharTimer, "人物");
  const startExtractingScenes = () => startExtracting(setExtractingScenes, extractingSceneTimer, "场景");
  const startExtractingItems = () => startExtracting(setExtractingItems, extractingItemTimer, "物品");
  const stopExtractingCharacters = () => stopExtracting(setExtractingCharacters, extractingCharTimer);
  const stopExtractingScenes = () => stopExtracting(setExtractingScenes, extractingSceneTimer);
  const stopExtractingItems = () => stopExtracting(setExtractingItems, extractingItemTimer);

  // 拉取进行中任务：用于刷新后恢复"生成中"状态（以任务表为准，防止重复提交）
  const [processingTasks, setProcessingTasks] = useState<TaskItem[]>([]);

  const loadProcessingTasks = useCallback(async () => {
    if (!workflow?.id) return;
    try {
      const res = await api.get(`/ai-agent/workflows/${workflow.id}/tasks`, {
        params: { status: "PROCESSING", limit: 200 },
        timeout: 15_000,
      });
      setProcessingTasks(res.data || []);
    } catch (error) {
      // 不打断主流程，任务列表只是辅助判断
      console.error("加载进行中任务失败", error);
    }
  }, [workflow?.id]);

  const hasProcessingTask = useCallback((taskType: string, targetId: number) => {
    return processingTasks.some(t => t.taskType === taskType && t.targetId === targetId);
  }, [processingTasks]);

  // 监听 WebSocket 消息
  useAiAgentWebSocket(
    workflow?.id || null,
    (message) => {
      console.log("DrawerPanel received WebSocket message:", message);
      
      const finish = (
        setter: (v: boolean) => void,
        timerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
        msg: string
      ) => {
        // 给按钮的"提取中"状态留出可见时间（尤其是任务很快完成的情况）
        setTimeout(() => {
          stopExtracting(setter, timerRef);
          toast(msg, "success");
        }, 150);
      };
      // 失败消息弹出提示（视频失败由 ShotCard 专门展示，不在此弹 toast）
      if (message.type.endsWith("_FAILED") && !message.type.includes("SHOT_VIDEO")) {
        // 提取失败：结束"提取中"
        if (message.type === "AI_AGENT_EXTRACT_FAILED") {
          stopExtracting(setExtractingCharacters, extractingCharTimer);
          stopExtracting(setExtractingScenes, extractingSceneTimer);
          stopExtracting(setExtractingItems, extractingItemTimer);
        }

        toast(message.error || "任务执行失败", "error");
      }
      // 提取类任务完成提示（后端是异步执行，HTTP 只代表"已开始"）
      else if (message.type === "AI_AGENT_CHARACTERS_EXTRACTED") {
        finish(setExtractingCharacters, extractingCharTimer, "人物提取完成");
      } else if (message.type === "AI_AGENT_SCENES_EXTRACTED") {
        finish(setExtractingScenes, extractingSceneTimer, "场景提取完成");
      } else if (message.type === "AI_AGENT_ITEMS_EXTRACTED") {
        finish(setExtractingItems, extractingItemTimer, "物品提取完成");
      }
      // 成功消息弹出提示（可选，因为界面会有变化）
      else if (message.type.endsWith("_COMPLETED")) {
        // toast("任务完成", "success");
      }

      // 刷新任务与数据
      loadProcessingTasks();
      onUpdate();
    }
  );

  // 抽屉打开时拉取一次任务（用于刷新后恢复生成状态）
  useEffect(() => {
    if (!type) return;
    if (type === "characters" || type === "scenes" || type === "items") {
      loadProcessingTasks();
    }
  }, [type, loadProcessingTasks]);

  // 轮询任务与数据：当存在进行中任务时（WebSocket 异常时的兜底）
  useEffect(() => {
    if (!type) return;
    if (type !== "characters" && type !== "scenes" && type !== "items") return;
    if (processingTasks.length === 0) return;

    const interval = setInterval(() => {
      loadProcessingTasks();
      onUpdate();
    }, 5000);

    return () => clearInterval(interval);
  }, [type, processingTasks.length, loadProcessingTasks, onUpdate]);

  // 当前画风展示（用于角色/场景/物品抽屉顶部）
  const currentStyleText = useMemo(() => {
    const styleType = workflow?.styleType;
    const custom = (workflow?.customStyle || "").trim();
    if (custom) return custom;
    if (styleType === "2d_anime") return "二维动漫风格";
    if (styleType === "3d_anime") return "三维动漫风格";
    if (styleType === "realistic") return "写实电影风格";
    return "动漫风格";

    return styleType === "2d_anime"
      ? "二维动漫风格"
      : styleType === "3d_anime"
        ? "三维动漫风格"
        : styleType === "realistic"
          ? "写实电影风格"
          : "动漫风格";
  }, [workflow?.styleType, workflow?.customStyle]);

  const openStyleSettings = useCallback(() => {
    onSwitchType?.("settings");
  }, [onSwitchType]);

  const getDrawerTitle = () => {
    if (type === "batchOps") return "批量操作";
    if (type === "characters") return "角色配置";
    if (type === "scenes") return "场景配置";
    if (type === "items") return "物品配置";
    if (type === "imageModel") return "图片模型";
    if (type === "videoModel") return "视频模型";
    if (type === "settings") return "画风与设置";
    if (type === "inference") return "推理设置";
    if (type === "tasks") return "任务队列";
    if (type === "export") return "导出";
    return "";
  };

  const getDrawerDescription = () => {
    if (type === "batchOps") return "批量拼图、批量生成等操作";
    if (type === "characters") return "管理角色信息与形象";
    if (type === "scenes") return "管理场景信息与背景";
    if (type === "items") return "管理道具物品与素材";
    if (type === "imageModel") return "选择首帧生成模型";
    if (type === "videoModel") return "选择视频生成模型";
    if (type === "settings") return "配置画风与生成参数";
    if (type === "inference") return "配置视频/首帧提示词推理模板";
    if (type === "tasks") return "查看进行中的任务";
    if (type === "export") return "导出项目资源";
    return "";
  };

  // 图片预览
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  if (!type) return null;

  // 根据类型设置不同宽度 - 加大宽度
  const drawerWidth = (type === "characters" || type === "scenes" || type === "items" || type === "batchOps") 
    ? "w-[680px]" 
    : "w-[420px]";

  return (
    <div className={cn(
      "fixed inset-y-0 right-14 z-40 flex flex-col border-l border-zinc-700/80 bg-gradient-to-b from-[#191c22] via-[#141720] to-[#10131a] shadow-[0_0_40px_rgba(0,0,0,0.45)] backdrop-blur-sm animate-in slide-in-from-right duration-200",
      drawerWidth
    )}>
      {/* 头部 */}
      <div className="h-16 border-b border-zinc-800/80 px-6 flex items-center justify-between flex-shrink-0 bg-gradient-to-r from-[#202431] via-[#1a1f2b] to-[#171b26]">
        <div className="flex items-center gap-4">
          <div className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center",
            type === "batchOps" && "bg-slate-500/20 border border-slate-400/25",
            type === "characters" && "bg-purple-500/15",
            type === "scenes" && "bg-blue-500/15",
            type === "items" && "bg-orange-500/15",
            type === "imageModel" && "bg-amber-500/15",
            type === "videoModel" && "bg-emerald-500/15",
            type === "settings" && "bg-zinc-500/15",
            type === "inference" && "bg-cyan-500/15",
            type === "tasks" && "bg-indigo-500/15",
            type === "export" && "bg-pink-500/15"
          )}>
            {type === "batchOps" && <LayoutGrid className="w-5 h-5 text-slate-300" />}
            {type === "characters" && <Users className="w-5 h-5 text-purple-400" />}
            {type === "scenes" && <MapPin className="w-5 h-5 text-blue-400" />}
            {type === "items" && <Box className="w-5 h-5 text-orange-400" />}
            {type === "imageModel" && <ImageIcon className="w-5 h-5 text-amber-400" />}
            {type === "videoModel" && <Video className="w-5 h-5 text-emerald-400" />}
            {type === "settings" && <Settings2 className="w-5 h-5 text-zinc-400" />}
            {type === "inference" && <Sparkles className="w-5 h-5 text-cyan-400" />}
            {type === "tasks" && <ListChecks className="w-5 h-5 text-indigo-400" />}
            {type === "export" && <Download className="w-5 h-5 text-pink-400" />}
          </div>
          <div>
            <h3 className="font-semibold text-base">{getDrawerTitle()}</h3>
            <p className="text-xs text-zinc-500">{getDrawerDescription()}</p>
            <h3 className="hidden">
              {type === "batchOps" && "批量操作"}
              {type === "characters" && "角色配置"}
              {type === "scenes" && "场景配置"}
              {type === "items" && "物品配置"}
              {type === "imageModel" && "图片模型"}
              {type === "videoModel" && "视频模型"}
              {type === "settings" && "画风与设置"}
              {type === "inference" && "推理设置"}
              {type === "tasks" && "任务队列"}
              {type === "export" && "导出"}
            </h3>
            <p className="hidden">
              {type === "batchOps" && "批量拼图、生成等操作"}
              {type === "characters" && "管理角色信息与形象"}
              {type === "scenes" && "管理场景信息与背景"}
              {type === "items" && "管理道具物品与素材"}
              {type === "imageModel" && "选择首帧生成模型"}
              {type === "videoModel" && "选择视频生成模型"}
              {type === "settings" && "配置画风与生成参数"}
              {type === "inference" && "配置视频/首帧提示词推理模板"}
              {type === "tasks" && "查看进行中的任务"}
              {type === "export" && "导出项目资源"}
            </p>
          </div>
        </div>
        <button onClick={onClose} className="p-2.5 hover:bg-zinc-800/80 rounded-xl border border-transparent hover:border-zinc-700 transition-all">
          <X className="w-5 h-5 text-zinc-400" />
        </button>
      </div>

      {/* 内容 - 添加自定义滚动条样式 */}
      <div className="flex-1 overflow-y-auto drawer-scrollbar">
        {type === "batchOps" && (
          <BatchOpsPanel
            workflow={workflow}
            characters={characters}
            onUpdate={onUpdate}
            videoInferenceTemplateCode={selectedVideoInferenceTemplate}
            videoInferenceTemplateType={selectedVideoInferenceTemplateType}
            firstFrameInferenceTemplateCode={selectedFirstFrameInferenceTemplate}
            firstFrameInferenceTemplateType={selectedFirstFrameInferenceTemplateType}
          />
        )}
        {type === "characters" && (
          <CharactersPanel 
            workflow={workflow}
            projectId={workflow.projectId}
            characters={characters} 
            onUpdate={onUpdate}
            onPreviewImage={setPreviewImage}
            extracting={extractingCharacters}
            startExtracting={startExtractingCharacters}
            stopExtracting={stopExtractingCharacters}
            selectedImageModelId={selectedImageModelId}
          />
        )}
        {type === "scenes" && (
          <ScenesPanel 
            workflowId={workflow.id}
            projectId={workflow.projectId}
            scenes={scenes} 
            onUpdate={onUpdate}
            currentStyleText={workflow.customStyle || workflow.styleType || "未设置"}
            onOpenStyleSettings={() => onSwitchType?.("settings")}
            onPreviewImage={setPreviewImage}
            extracting={extractingScenes}
            startExtracting={startExtractingScenes}
            stopExtracting={stopExtractingScenes}
            selectedImageModelId={selectedImageModelId}
            sceneStyleTemplateId={workflow.sceneStyleTemplateId || null}
          />
        )}
        {type === "items" && (
          <ItemsPanel 
            workflowId={workflow.id}
            projectId={workflow.projectId}
            items={items} 
            onUpdate={onUpdate}
            currentStyleText={workflow.customStyle || workflow.styleType || "未设置"}
            onOpenStyleSettings={() => onSwitchType?.("settings")}
            onPreviewImage={setPreviewImage}
            extracting={extractingItems}
            startExtracting={startExtractingItems}
            stopExtracting={stopExtractingItems}
            selectedImageModelId={selectedImageModelId}
            itemStyleTemplateId={workflow.itemStyleTemplateId || null}
          />
        )}
        {type === "imageModel" && (
          <ImageModelPanel
            selectedModelId={selectedImageModelId}
            onChangeModel={onChangeImageModel}
          />
        )}
        {type === "videoModel" && (
          <VideoModelPanel
            videoModelIdByMode={videoModelIdByMode}
            onChangeVideoModel={onChangeVideoModel}
            defaultRatio={defaultRatio}
            onChangeRatio={onChangeRatio}
          />
        )}
        {type === "settings" && <SettingsPanel workflow={workflow} onUpdate={onUpdate} />}
        {type === "inference" && (
          <InferencePanel
            selectedVideoInferenceTemplate={selectedVideoInferenceTemplate}
            onChangeVideoInferenceTemplate={onChangeVideoInferenceTemplate}
            selectedFirstFrameInferenceTemplate={selectedFirstFrameInferenceTemplate}
            onChangeFirstFrameInferenceTemplate={onChangeFirstFrameInferenceTemplate}
          />
        )}
        {type === "tasks" && <TasksPanel workflow={workflow} />}
        {type === "export" && <ExportPanel workflow={workflow} />}
      </div>

      {/* 自定义滚动条样式 */}
      <style jsx global>{`
        .drawer-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .drawer-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .drawer-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 3px;
        }
        .drawer-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
        
        /* 提示词输入框滚动条 */
        .prompt-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .prompt-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .prompt-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 2px;
        }
        .prompt-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>

      {/* 图片预览 */}
      {previewImage && (
        <ImagePreviewModal
          imageUrl={previewImage}
          onClose={() => setPreviewImage(null)}
        />
      )}
    </div>
  );
}

// 角色配置面板 - 直接可编辑，无需编辑按钮
interface ImportCharacterItem {
  id: number;
  name: string;
  identity?: string | null;
  prompt?: string | null;
  imageUrl?: string | null;
}

function CharactersPanel({ workflow, projectId, characters, onUpdate, onPreviewImage, extracting, startExtracting, stopExtracting, selectedImageModelId }: { 
  workflow: WorkflowData;
  projectId: number;
  characters: CharacterData[]; 
  onUpdate: () => void;
  onPreviewImage: (url: string) => void;
  extracting: boolean;
  startExtracting: () => void;
  stopExtracting: () => void;
  selectedImageModelId: number | null;
}) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addTab, setAddTab] = useState<"manual" | "import">("manual");
  const [newName, setNewName] = useState("");
  const [newIdentity, setNewIdentity] = useState("");
  const [newPrompt, setNewPrompt] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importQuery, setImportQuery] = useState("");
  const [importCandidates, setImportCandidates] = useState<ImportCharacterItem[]>([]);
  const [selectedImportIds, setSelectedImportIds] = useState<Set<number>>(() => new Set());
  const [generating, setGenerating] = useState<number | null>(null);
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [assetModalOpen, setAssetModalOpen] = useState(false);
  const [selectedCharForAsset, setSelectedCharForAsset] = useState<number | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  // 生成比例（默认 16:9）
  const [generateRatio, setGenerateRatio] = useState("16:9");
  
  // 全局风格弹窗状态
  const [styleModalOpen, setStyleModalOpen] = useState(false);
  
  // 每个角色的编辑数据
  const [editData, setEditData] = useState<Record<number, { prompt: string }>>({});
  
  // 初始化编辑数据
  useEffect(() => {
    const data: Record<number, { prompt: string }> = {};
    characters.forEach(char => {
      if (!editData[char.id]) {
        data[char.id] = {
          prompt: char.prompt || ""
        };
      }
    });
    if (Object.keys(data).length > 0) {
      setEditData(prev => ({ ...prev, ...data }));
    }
  }, [characters]);

  const normalizeName = (value?: string | null) => (value || "").trim().toLowerCase();

  const existingNameSet = useMemo(() => {
    const set = new Set<string>();
    characters.forEach(char => {
      const normalized = normalizeName(char.name);
      if (normalized) {
        set.add(normalized);
      }
    });
    return set;
  }, [characters]);

  const loadImportCandidates = useCallback(async () => {
    if (!projectId) return;
    setImportLoading(true);
    try {
      const res = await api.get(`/ai-agent/projects/${projectId}/assets`, {
        params: { category: "character" },
        timeout: 15000
      });
      const list = Array.isArray(res.data?.characters) ? res.data.characters : [];
      const pickBetter = (current: ImportCharacterItem, next: ImportCharacterItem) => {
        const currentPrompt = (current.prompt || "").trim();
        const nextPrompt = (next.prompt || "").trim();
        if (!currentPrompt && nextPrompt) return next;
        if (currentPrompt && !nextPrompt) return current;

        const currentIdentity = (current.identity || "").trim();
        const nextIdentity = (next.identity || "").trim();
        if (!currentIdentity && nextIdentity) return next;
        if (currentIdentity && !nextIdentity) return current;

        const currentImage = (current.imageUrl || "").trim();
        const nextImage = (next.imageUrl || "").trim();
        if (!currentImage && nextImage) return next;
        if (currentImage && !nextImage) return current;

        return current;
      };

      const byName = new Map<string, ImportCharacterItem>();
      list.forEach((item: ImportCharacterItem) => {
        const key = normalizeName(item.name);
        if (!key) return;
        const existing = byName.get(key);
        if (!existing) {
          byName.set(key, item);
          return;
        }
        byName.set(key, pickBetter(existing, item));
      });

      setImportCandidates(Array.from(byName.values()));
    } catch (error: any) {
      console.error("加载可导入角色失败:", error);
      toast(error.response?.data?.error || "加载可导入角色失败", "error");
      setImportCandidates([]);
    } finally {
      setImportLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => {
    if (!addModalOpen) return;
    setSelectedImportIds(new Set());
    setImportQuery("");
    setAddTab("manual");
    void loadImportCandidates();
  }, [addModalOpen, loadImportCandidates]);

  const closeAddModal = () => {
    setAddModalOpen(false);
    setAddTab("manual");
    setNewName("");
    setNewIdentity("");
    setNewPrompt("");
    setSelectedImportIds(new Set());
    setImportQuery("");
  };


  // 提取角色
  const handleExtractCharacters = async () => {
    startExtracting();
    try {
      await api.post(`/ai-agent/workflows/${workflow.id}/extract-characters`);
      toast("已开始提取人物，等待完成通知...", "info");
    } catch (error: any) {
      stopExtracting();
      toast(error.response?.data?.error || "提取失败", "error");
    }
  };

  const handleAdd = async () => {
    if (!newName.trim()) {
      toast("请输入角色名称", "error");
      return;
    }
    try {
      await api.post(`/ai-agent/workflows/${workflow.id}/characters`, {
        name: newName,
        identity: newIdentity,
        prompt: newPrompt
      });
      toast("角色已添加", "success");
      closeAddModal();
      onUpdate();
    } catch (error: any) {
      toast(error.response?.data?.error || "添加失败", "error");
    }
  };

  const filteredImportCandidates = useMemo(() => {
    const query = importQuery.trim().toLowerCase();
    return importCandidates.filter((item) => {
      const name = (item.name || "").trim();
      if (!name) return false;
      if (!query) return true;
      return name.toLowerCase().includes(query);
    });
  }, [importCandidates, importQuery]);

  const selectableImportIds = useMemo(() => {
    return filteredImportCandidates
      .filter(item => !existingNameSet.has(normalizeName(item.name)))
      .map(item => item.id);
  }, [filteredImportCandidates, existingNameSet]);

  const toggleImportSelection = (id: number) => {
    setSelectedImportIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    setSelectedImportIds(prev => {
      const allSelected =
        selectableImportIds.length > 0 && selectableImportIds.every(id => prev.has(id));
      return new Set(allSelected ? [] : selectableImportIds);
    });
  };

  const handleImportSelected = async () => {
    const selected = importCandidates.filter(
      item => selectedImportIds.has(item.id) && !existingNameSet.has(normalizeName(item.name))
    );
    if (selected.length === 0) {
      toast("请先选择角色", "info");
      return;
    }
    setImporting(true);
    try {
      await api.post(`/ai-agent/workflows/${workflow.id}/characters/import`, {
        characters: selected.map(item => ({
          sourceId: item.id,
          name: item.name,
          identity: item.identity,
          prompt: item.prompt,
          imageUrl: item.imageUrl
        }))
      });
      toast(`已导入${selected.length}个角色`, "success");
      closeAddModal();
      onUpdate();
    } catch (error: any) {
      toast(error.response?.data?.error || "导入失败", "error");
    } finally {
      setImporting(false);
    }
  };

  const handleGenerateImage = async (charId: number) => {
    console.log("🟢 点击生成角色图: charId=", charId, "modelId=", selectedImageModelId, "ratio=", generateRatio);
    setGenerating(charId);
    try {
      await aiAgentImageApi.generateCharacterImage(charId, {
        modelId: selectedImageModelId ?? undefined,
        ratio: generateRatio
      });
      toast("开始生成角色图...", "success");
      // 等待一下让后端事务提交，然后刷新数据
      await new Promise(resolve => setTimeout(resolve, 300));
      await onUpdate();
      // 不要立即清除 generating 状态，UI 会通过 imageStatus === "GENERATING" 显示生成中
      setGenerating(null);
    } catch (error: any) {
      console.error("❌ 生成失败:", error);
      toast(error.response?.data?.error || "生成失败", "error");
      setGenerating(null);
    }
  };

  // 批量生成角色图片
  const handleBatchGenerate = async () => {
    const toGenerate = characters.filter(c => !c.imageUrl && c.imageStatus !== "GENERATING");
    if (toGenerate.length === 0) {
      toast("没有需要生成图片的角色", "info");
      return;
    }
    setBatchGenerating(true);
    toast(`开始批量生成 ${toGenerate.length} 个角色图片...`, "info");
    console.log(`🟣 批量生成角色图片: 待生成 ${toGenerate.length} 个`, toGenerate.map(c => ({ id: c.id, name: c.name })));
    
    // 串行发送所有请求，每个请求后等待后端事务提交再发下一个
    for (let i = 0; i < toGenerate.length; i++) {
      const char = toGenerate[i];
      console.log(`🟣 [批量生成 ${i + 1}/${toGenerate.length}] 发送请求: ${char.name} (id=${char.id})`);
      try {
        const response = await aiAgentImageApi.generateCharacterImage(char.id, {
          modelId: selectedImageModelId ?? undefined,
          ratio: generateRatio
        });
        console.log(`🟢 [批量生成 ${i + 1}/${toGenerate.length}] 请求成功: ${char.name}`, response.data);
        // 等待后端事务提交
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (error) {
        console.error(`❌ [批量生成 ${i + 1}/${toGenerate.length}] 请求失败: ${char.name}`, error);
      }
    }
    // 所有请求发送完毕后刷新数据
    console.log(`🟣 批量生成完成，开始刷新数据...`);
    await onUpdate();
    setBatchGenerating(false);
    toast("批量生成任务已提交", "success");
  };

  const handleDelete = async (charId: number, name: string) => {
    const confirmed = await confirm({
      title: "删除角色",
      description: `确定要删除角色「${name}」吗？`,
      confirmText: "删除",
      variant: "danger"
    });
    if (!confirmed) return;
    
    try {
      await api.delete(`/ai-agent/characters/${charId}`);
      toast("删除成功", "success");
      onUpdate();
    } catch (error: any) {
      toast(error.response?.data?.error || "删除失败", "error");
    }
  };

  // 自动保存（失焦时）
  const handleAutoSave = async (charId: number) => {
    const data = editData[charId];
    if (!data) return;
    
    const char = characters.find(c => c.id === charId);
    if (!char) return;
    
    // 检查是否有变化
    if (data.prompt === (char.prompt || "")) {
      return;
    }
    
    setSavingId(charId);
    try {
      await api.put(`/ai-agent/characters/${charId}`, {
        prompt: data.prompt
      });
      onUpdate();
    } catch (error: any) {
      toast(error.response?.data?.error || "保存失败", "error");
    } finally {
      setSavingId(null);
    }
  };

  // 打开素材库选择
  const openAssetModal = (charId: number) => {
    setSelectedCharForAsset(charId);
    setAssetModalOpen(true);
  };

  // 选择素材后更新图片
  const handleSelectAsset = async (imageUrl: string) => {
    if (!selectedCharForAsset) return;
    try {
      await api.put(`/ai-agent/characters/${selectedCharForAsset}`, {
        imageUrl
      });
      toast("图片已更新", "success");
      setAssetModalOpen(false);
      setSelectedCharForAsset(null);
      onUpdate();
    } catch (error: any) {
      toast(error.response?.data?.error || "更新失败", "error");
    }
  };

  // 是否已设置风格模板
  const hasCharacterStyle = !!workflow.characterStyleTemplateId;

  return (
    <div className="p-5 space-y-4">
      {/* 生成比例 */}
      <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-zinc-900/50 border border-zinc-800/50">
        <div className="min-w-0 flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-zinc-400" />
          <span className="text-xs text-zinc-500">生成比例</span>
        </div>
        <div className="flex gap-1.5">
          {["16:9", "9:16", "1:1"].map((ratio) => (
            <button
              key={ratio}
              type="button"
              onClick={() => setGenerateRatio(ratio)}
              className={cn(
                "px-2.5 py-1 rounded-md text-xs font-medium transition-all border",
                generateRatio === ratio
                  ? "bg-purple-500/20 border-purple-500/40 text-purple-300"
                  : "bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300"
              )}
            >
              {ratio}
            </button>
          ))}
        </div>
      </div>

      {/* 人物风格 */}
      <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-zinc-900/50 border border-zinc-800/50">
        <div className="min-w-0 flex items-center gap-2">
          <Palette className="w-4 h-4 text-zinc-400" />
          <span className="text-xs text-zinc-500">人物风格</span>
          {hasCharacterStyle && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">已设置</span>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-3 text-xs border-zinc-700 hover:bg-purple-500/10 hover:border-purple-500/30 hover:text-purple-400"
          onClick={() => setStyleModalOpen(true)}
        >
          {hasCharacterStyle ? "修改风格" : "设置风格"}
        </Button>
      </div>

      {/* 操作按钮组 */}
      <div className="flex gap-3">
        <Button 
          className="flex-1 bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 shadow-lg shadow-purple-900/20"
          onClick={() => setAddModalOpen(true)}
          disabled={addModalOpen}
        >
          <Plus className="w-4 h-4 mr-2" />
          添加角色
        </Button>
        <Button 
          variant="outline"
          className="flex-1 border-purple-500/30 text-purple-400 hover:bg-purple-500/10 hover:text-purple-300"
          onClick={handleExtractCharacters}
          disabled={extracting}
        >
          {extracting ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4 mr-2" />
          )}
          {extracting ? "提取中..." : "AI提取角色"}
        </Button>
      </div>

      {/* 批量生成按钮 */}
      {characters.length > 0 && (
        <Button
          variant="outline"
          className="w-full border-purple-500/30 text-purple-400 hover:bg-purple-500/10 hover:text-purple-300"
          onClick={handleBatchGenerate}
          disabled={batchGenerating || characters.every(c => c.imageUrl || c.imageStatus === "GENERATING")}
        >
          {batchGenerating ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Wand2 className="w-4 h-4 mr-2" />
          )}
          {batchGenerating ? "批量生成中..." : `批量生成角色图 (${characters.filter(c => !c.imageUrl && c.imageStatus !== "GENERATING").length})`}
        </Button>
      )}

      {/* 提示信息 */}
      {characters.length === 0 && !addModalOpen && (
        <div className="bg-purple-500/5 border border-purple-500/20 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-500/15 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-4 h-4 text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-purple-300 font-medium">智能提取角色</p>
              <p className="text-xs text-zinc-500 mt-1">
                点击「AI提取角色」按钮，系统将根据分镜内容自动识别并提取出现的角色信息
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 添加表单 */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-[880px] max-h-[85vh] bg-[#1a1a1e] rounded-2xl border border-zinc-800 shadow-2xl flex flex-col overflow-hidden">
            {/* 澶撮儴 */}
            <div className="h-16 border-b border-zinc-800 px-6 flex items-center justify-between flex-shrink-0 bg-gradient-to-r from-[#1f2230] to-[#1a1a1e]">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-purple-500/15 flex items-center justify-center">
                  <Users className="w-5 h-5 text-purple-400" />
                </div>
                {/*
                <div>
                  <h3 className="font-semibold text-base">娣诲姞瑙掅壊</h3>
                  <p className="text-xs text-zinc-500">鎵姩娣诲姞鎴栦粠椤圭洰鍘嗗彶鍙鍏�</p>
                </div>
                */}
                <div>
                  <h3 className="font-semibold text-base">添加角色</h3>
                  <p className="text-xs text-zinc-500">支持手动添加与批量导入历史角色</p>
                </div>
              </div>
              <button onClick={closeAddModal} className="p-2.5 hover:bg-zinc-800 rounded-xl transition-colors">
                <X className="w-5 h-5 text-zinc-400" />
              </button>
            </div>

            {/* 鍐呭 */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-1 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setAddTab("manual")}
                  className={cn(
                    "flex-1 h-9 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all",
                    addTab === "manual"
                      ? "bg-gradient-to-r from-purple-600 to-violet-600 text-white shadow shadow-purple-900/20"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80"
                  )}
                >
                  <Plus className="w-4 h-4" />
                  手动添加
                </button>
                <button
                  type="button"
                  onClick={() => setAddTab("import")}
                  className={cn(
                    "flex-1 h-9 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all",
                    addTab === "import"
                      ? "bg-gradient-to-r from-purple-600 to-violet-600 text-white shadow shadow-purple-900/20"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80"
                  )}
                >
                  <Download className="w-4 h-4" />
                  历史角色
                  {importCandidates.length > 0 && (
                    <span
                      className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded-full",
                        addTab === "import"
                          ? "bg-white/20 text-white"
                          : "bg-zinc-800/80 text-zinc-400"
                      )}
                    >
                      {importCandidates.length}
                    </span>
                  )}
                </button>
              </div>
              {/* 鎵姩娣诲姞 */}
              {addTab === "manual" && (
              <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-4 space-y-3">
                {/*
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-sm font-semibold text-zinc-100">鎵姩娣诲姞</h4>
                  <Button
                    size="sm"
                    className="bg-purple-600 hover:bg-purple-500"
                    onClick={handleAdd}
                    disabled={!newName.trim()}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    纭娣诲姞
                  </Button>
                </div>
                */}
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-sm font-semibold text-zinc-100">手动添加</h4>
                  <Button
                    size="sm"
                    className="bg-purple-600 hover:bg-purple-500"
                    onClick={handleAdd}
                    disabled={!newName.trim()}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    确认添加
                  </Button>
                </div>
          <Input
            placeholder="角色名称"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            className="bg-zinc-800 border-zinc-700"
          />
          <Input
            placeholder="角色身份（如：男主角、女配角，选填）"
            value={newIdentity}
            onChange={e => setNewIdentity(e.target.value)}
            className="bg-zinc-800 border-zinc-700"
          />
          <Textarea
            placeholder="生成提示词（用于AI生成角色形象）"
            value={newPrompt}
            onChange={e => setNewPrompt(e.target.value)}
            className="bg-zinc-800 border-zinc-700 min-h-[80px] prompt-scrollbar"
          />
          <div className="hidden">
            <Button className="flex-1 bg-purple-600 hover:bg-purple-500" onClick={handleAdd}>
              确认添加
            </Button>
            <Button variant="outline" className="border-zinc-700" onClick={closeAddModal}>
              取消
            </Button>
          </div>
        </div>
              )}

              {addTab === "import" && (
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-zinc-100">从项目历史角色导入</h4>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="border-zinc-700"
                onClick={handleToggleSelectAll}
                disabled={selectableImportIds.length === 0}
              >
                {selectableImportIds.length > 0 && selectableImportIds.every(id => selectedImportIds.has(id))
                  ? "清空选择"
                  : "全选"}
              </Button>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-500"
                onClick={handleImportSelected}
                disabled={importing || selectedImportIds.size === 0}
              >
                {importing ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Download className="w-4 h-4 mr-1" />
                )}
                导入选中 ({selectedImportIds.size})
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Input
              placeholder="搜索角色"
              value={importQuery}
              onChange={e => setImportQuery(e.target.value)}
              className="bg-zinc-800 border-zinc-700"
            />
            <Button
              variant="outline"
              className="border-zinc-700"
              onClick={loadImportCandidates}
              disabled={importLoading}
            >
              刷新
            </Button>
          </div>

          {importLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
            </div>
          ) : filteredImportCandidates.length === 0 ? (
            <div className="text-center py-10 text-zinc-500">
              <Users className="w-10 h-10 mx-auto mb-2 opacity-20" />
              <p className="text-sm">暂无可导入角色</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 max-h-[360px] overflow-y-auto pr-1">
              {filteredImportCandidates.map(item => {
                const normalized = normalizeName(item.name);
                const exists = existingNameSet.has(normalized);
                const selected = selectedImportIds.has(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => !exists && toggleImportSelection(item.id)}
                    disabled={exists}
                    className={cn(
                      "rounded-xl border text-left overflow-hidden transition-all",
                      exists
                        ? "border-zinc-800/60 bg-zinc-900/40 opacity-50 cursor-not-allowed"
                        : selected
                          ? "border-emerald-500/70 bg-emerald-500/10"
                          : "border-zinc-800/80 bg-zinc-900/40 hover:border-zinc-700/80"
                    )}
                  >
                    <div className="relative aspect-square bg-zinc-800/80">
                      {item.imageUrl ? (
                        <img
                          src={toThumbnailUrl(item.imageUrl, 200)}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-600">
                          <ImageIcon className="w-8 h-8" />
                        </div>
                      )}
                      {selected && !exists && (
                        <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
                          <Check className="w-4 h-4 text-white" />
                        </div>
                      )}
                      {exists && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                          <span className="text-xs text-white">已存在</span>
                        </div>
                      )}
                    </div>
                    <div className="p-2">
                      <p className="text-sm font-medium text-zinc-100 truncate">{item.name}</p>
                      {item.identity && (
                        <p className="text-[11px] text-zinc-500 truncate">{item.identity}</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
              )}
      </div>

      <div className="h-16 border-t border-zinc-800 px-6 flex items-center justify-end bg-[#161618]">
        <Button variant="outline" className="border-zinc-700 hover:bg-zinc-800" onClick={closeAddModal}>
          关闭
        </Button>
      </div>
    </div>
  </div>
      )}

      {/* 角色列表 - 优化布局 */}
      <div className="space-y-3">
        {characters.map(char => {
          console.log(`🟣 角色 ${char.name}: imageStatus=${char.imageStatus}, generating=${generating}, charId=${char.id}`);
          return (
          <div key={char.id} className="p-4 bg-zinc-900/50 rounded-xl border border-zinc-800/50 hover:border-zinc-700/50 transition-colors">
            {/* 顶部：头像 + 名称 + 操作 */}
            <div className="flex items-center gap-4 mb-3">
              {/* 头像 - 可点击选择素材 */}
              <div 
                className="w-16 h-16 rounded-xl bg-zinc-800 overflow-hidden flex-shrink-0 relative group border-2 border-zinc-700/50"
              >
                {char.imageUrl ? (
                  <>
                    <img src={toThumbnailUrl(char.imageUrl, 200)} alt="" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); onPreviewImage(char.imageUrl!); }}
                        className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                        title="查看大图"
                      >
                        <Eye className="w-3.5 h-3.5 text-white" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); openAssetModal(char.id); }}
                        className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                        title="更换图片"
                      >
                        <Upload className="w-3.5 h-3.5 text-white" />
                      </button>
                    </div>
                  </>
                ) : (generating === char.id || char.imageStatus === "GENERATING") ? (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-500/10 to-violet-500/10">
                    <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
                  </div>
                ) : (
                  <div 
                    className="w-full h-full flex flex-col items-center justify-center text-zinc-600 hover:text-purple-400 transition-colors cursor-pointer"
                    onClick={() => openAssetModal(char.id)}
                  >
                    <Upload className="w-5 h-5" />
                  </div>
                )}
              </div>
              
              {/* 名称和身份 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-base">{char.name}</span>
                  {char.identity && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400">
                      {char.identity}
                    </span>
                  )}
                </div>
                {savingId === char.id && (
                  <span className="text-xs text-zinc-500 flex items-center gap-1 mt-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    保存中...
                  </span>
                )}
              </div>

              {/* 操作按钮 */}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-3 text-xs border-zinc-700 hover:bg-purple-500/10 hover:border-purple-500/30 hover:text-purple-400"
                  onClick={() => handleGenerateImage(char.id)}
                  disabled={generating === char.id || char.imageStatus === "GENERATING"}
                >
                  {generating === char.id || char.imageStatus === "GENERATING" ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  ) : (
                    <Wand2 className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  {generating === char.id || char.imageStatus === "GENERATING" ? "生成中" : "生成角色"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 w-8 p-0 border-zinc-700 text-red-400 hover:text-red-300 hover:border-red-500/30 hover:bg-red-500/10"
                  onClick={() => handleDelete(char.id, char.name)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
            
            {/* 生成提示词 - 直接可编辑 */}
            <div>
              <label className="text-xs text-zinc-500 mb-1.5 block">生成提示词</label>
              <Textarea
                value={editData[char.id]?.prompt || ""}
                onChange={e => setEditData(prev => ({
                  ...prev,
                  [char.id]: { prompt: e.target.value }
                }))}
                onBlur={() => handleAutoSave(char.id)}
                placeholder="输入用于AI生成角色形象的提示词..."
                className="bg-zinc-800/50 border-zinc-700/50 text-sm min-h-[100px] resize-none focus:border-purple-500/50 prompt-scrollbar"
              />
            </div>
          </div>
          );
        })}
      </div>

      {/* 素材库弹窗 */}
      {assetModalOpen && (
        <AssetLibraryModal
          type="character"
          projectId={projectId}
          onSelect={handleSelectAsset}
          onClose={() => {
            setAssetModalOpen(false);
            setSelectedCharForAsset(null);
          }}
        />
      )}

      {/* 人物风格弹窗 */}
      <CharacterStyleModal
        open={styleModalOpen}
        onOpenChange={setStyleModalOpen}
        workflowId={workflow.id}
        assetType="character"
        currentTemplateId={workflow.characterStyleTemplateId || null}
        onSaved={onUpdate}
      />
    </div>
  );
}

// 场景配置面板 - 直接可编辑，无需编辑按钮
function ScenesPanel({ workflowId, projectId, scenes, onUpdate, currentStyleText, onOpenStyleSettings, onPreviewImage, extracting, startExtracting, stopExtracting, selectedImageModelId, sceneStyleTemplateId }: { 
  workflowId: number;
  projectId: number;
  scenes: SceneData[]; 
  onUpdate: () => void;
  currentStyleText: string;
  onOpenStyleSettings: () => void;
  onPreviewImage: (url: string) => void;
  extracting: boolean;
  startExtracting: () => void;
  stopExtracting: () => void;
  selectedImageModelId: number | null;
  sceneStyleTemplateId: number | null;
}) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("");
  const [newPrompt, setNewPrompt] = useState("");
  const [generating, setGenerating] = useState<number | null>(null);
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [assetModalOpen, setAssetModalOpen] = useState(false);
  const [selectedSceneForAsset, setSelectedSceneForAsset] = useState<number | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  
  // 全局风格弹窗状态
  const [styleModalOpen, setStyleModalOpen] = useState(false);
  
  // 每个场景的编辑数据
  const [editData, setEditData] = useState<Record<number, { prompt: string }>>({});
  
  // 初始化编辑数据
  useEffect(() => {
    const data: Record<number, { prompt: string }> = {};
    scenes.forEach(scene => {
      if (!editData[scene.id]) {
        data[scene.id] = {
          prompt: scene.prompt || ""
        };
      }
    });
    if (Object.keys(data).length > 0) {
      setEditData(prev => ({ ...prev, ...data }));
    }
  }, [scenes]);


  // 提取场景
  const handleExtractScenes = async () => {
    startExtracting();
    try {
      await api.post(`/ai-agent/workflows/${workflowId}/extract-scenes`);
      toast("已开始提取场景，等待完成通知...", "info");
    } catch (error: any) {
      stopExtracting();
      toast(error.response?.data?.error || "提取失败", "error");
    }
  };

  const handleAdd = async () => {
    if (!newName.trim()) {
      toast("请输入场景名称", "error");
      return;
    }
    try {
      await api.post(`/ai-agent/workflows/${workflowId}/scenes`, {
        name: newName,
        type: newType,
        prompt: newPrompt
      });
      toast("场景已添加", "success");
      setAdding(false);
      setNewName("");
      setNewType("");
      setNewPrompt("");
      onUpdate();
    } catch (error: any) {
      toast(error.response?.data?.error || "添加失败", "error");
    }
  };

  const handleGenerateImage = async (sceneId: number) => {
    setGenerating(sceneId);
    try {
      await aiAgentImageApi.generateSceneImage(sceneId, {
        modelId: selectedImageModelId ?? undefined,
        ratio: "16:9"
      });
      toast("开始生成场景图...", "success");
      // 等待一下让后端事务提交
      await new Promise(resolve => setTimeout(resolve, 300));
      await onUpdate();
      setGenerating(null);
    } catch (error: any) {
      toast(error.response?.data?.error || "生成失败", "error");
      setGenerating(null);
    }
  };

  // 批量生成场景图片
  const handleBatchGenerate = async () => {
    const toGenerate = scenes.filter(s => !s.imageUrl && s.imageStatus !== "GENERATING");
    if (toGenerate.length === 0) {
      toast("没有需要生成图片的场景", "info");
      return;
    }
    setBatchGenerating(true);
    toast(`开始批量生成 ${toGenerate.length} 个场景图片...`, "info");
    
    for (const scene of toGenerate) {
      try {
        await aiAgentImageApi.generateSceneImage(scene.id, {
          modelId: selectedImageModelId ?? undefined,
          ratio: "16:9"
        });
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (error) {
        console.error(`场景 ${scene.name} 生成失败:`, error);
      }
    }
    await onUpdate();
    setBatchGenerating(false);
    toast("批量生成任务已提交", "success");
  };

  const handleDelete = async (sceneId: number, name: string) => {
    const confirmed = await confirm({
      title: "删除场景",
      description: `确定要删除场景「${name}」吗？`,
      confirmText: "删除",
      variant: "danger"
    });
    if (!confirmed) return;
    
    try {
      await api.delete(`/ai-agent/scenes/${sceneId}`);
      toast("删除成功", "success");
      onUpdate();
    } catch (error: any) {
      toast(error.response?.data?.error || "删除失败", "error");
    }
  };

  // 自动保存（失焦时）
  const handleAutoSave = async (sceneId: number) => {
    const data = editData[sceneId];
    if (!data) return;
    
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene) return;
    
    // 检查是否有变化
    if (data.prompt === (scene.prompt || "")) {
      return;
    }
    
    setSavingId(sceneId);
    try {
      await api.put(`/ai-agent/scenes/${sceneId}`, {
        prompt: data.prompt
      });
      onUpdate();
    } catch (error: any) {
      toast(error.response?.data?.error || "保存失败", "error");
    } finally {
      setSavingId(null);
    }
  };

  // 打开素材库选择
  const openAssetModal = (sceneId: number) => {
    setSelectedSceneForAsset(sceneId);
    setAssetModalOpen(true);
  };

  // 选择素材后更新图片
  const handleSelectAsset = async (imageUrl: string) => {
    if (!selectedSceneForAsset) return;
    try {
      await api.put(`/ai-agent/scenes/${selectedSceneForAsset}`, {
        imageUrl
      });
      toast("图片已更新", "success");
      setAssetModalOpen(false);
      setSelectedSceneForAsset(null);
      onUpdate();
    } catch (error: any) {
      toast(error.response?.data?.error || "更新失败", "error");
    }
  };

  // 是否已设置风格模板
  const hasSceneStyle = !!sceneStyleTemplateId;

  return (
    <div className="p-5 space-y-4">
      {/* 场景风格 */}
      <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-zinc-900/50 border border-zinc-800/50">
        <div className="min-w-0 flex items-center gap-2">
          <Palette className="w-4 h-4 text-zinc-400" />
          <span className="text-xs text-zinc-500">场景风格</span>
          {hasSceneStyle && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300">已设置</span>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-3 text-xs border-zinc-700 hover:bg-blue-500/10 hover:border-blue-500/30 hover:text-blue-400"
          onClick={() => setStyleModalOpen(true)}
        >
          {hasSceneStyle ? "修改风格" : "设置风格"}
        </Button>
      </div>

      {/* 操作按钮组 */}
      <div className="flex gap-3">
        <Button 
          className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 shadow-lg shadow-blue-900/20"
          onClick={() => setAdding(true)}
          disabled={adding}
        >
          <Plus className="w-4 h-4 mr-2" />
          添加场景
        </Button>
        <Button 
          variant="outline"
          className="flex-1 border-blue-500/30 text-blue-400 hover:bg-blue-500/10 hover:text-blue-300"
          onClick={handleExtractScenes}
          disabled={extracting}
        >
          {extracting ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4 mr-2" />
          )}
          {extracting ? "提取中..." : "AI提取场景"}
        </Button>
      </div>

      {/* 批量生成按钮 */}
      {scenes.length > 0 && (
        <Button
          variant="outline"
          className="w-full border-blue-500/30 text-blue-400 hover:bg-blue-500/10 hover:text-blue-300"
          onClick={handleBatchGenerate}
          disabled={batchGenerating || scenes.every(s => s.imageUrl || s.imageStatus === "GENERATING")}
        >
          {batchGenerating ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Wand2 className="w-4 h-4 mr-2" />
          )}
          {batchGenerating ? "批量生成中..." : `批量生成场景图 (${scenes.filter(s => !s.imageUrl && s.imageStatus !== "GENERATING").length})`}
        </Button>
      )}

      {/* 提示信息 */}
      {scenes.length === 0 && !adding && (
        <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-blue-300 font-medium">智能提取场景</p>
              <p className="text-xs text-zinc-500 mt-1">
                点击「AI提取场景」按钮，系统将根据分镜内容自动识别并提取出现的场景信息
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 添加表单 */}
      {adding && (
        <div className="p-4 bg-zinc-900/80 rounded-xl space-y-3 border border-zinc-800">
          <Input
            placeholder="场景名称"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            className="bg-zinc-800 border-zinc-700"
          />
          <Input
            placeholder="场景类型（如：室内、室外、山巅，选填）"
            value={newType}
            onChange={e => setNewType(e.target.value)}
            className="bg-zinc-800 border-zinc-700"
          />
          <Textarea
            placeholder="生成提示词（用于AI生成场景背景）"
            value={newPrompt}
            onChange={e => setNewPrompt(e.target.value)}
            className="bg-zinc-800 border-zinc-700 min-h-[80px] prompt-scrollbar"
          />
          <div className="flex gap-2">
            <Button className="flex-1 bg-blue-600 hover:bg-blue-500" onClick={handleAdd}>
              确认添加
            </Button>
            <Button variant="outline" className="border-zinc-700" onClick={() => setAdding(false)}>
              取消
            </Button>
          </div>
        </div>
      )}

      {/* 场景列表 - 优化布局 */}
      <div className="space-y-3">
        {scenes.map(scene => (
          <div key={scene.id} className="p-4 bg-zinc-900/50 rounded-xl border border-zinc-800/50 hover:border-zinc-700/50 transition-colors">
            {/* 顶部：场景图 + 名称 + 操作 */}
            <div className="flex items-center gap-4 mb-3">
              {/* 场景图 - 可点击选择素材 */}
              <div 
                className="w-24 h-16 rounded-xl bg-zinc-800 overflow-hidden flex-shrink-0 relative group border-2 border-zinc-700/50"
              >
                {scene.imageUrl ? (
                  <>
                    <img src={toThumbnailUrl(scene.imageUrl, 200)} alt="" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); onPreviewImage(scene.imageUrl!); }}
                        className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                        title="查看大图"
                      >
                        <Eye className="w-3.5 h-3.5 text-white" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); openAssetModal(scene.id); }}
                        className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                        title="更换图片"
                      >
                        <Upload className="w-3.5 h-3.5 text-white" />
                      </button>
                    </div>
                  </>
                ) : (generating === scene.id || scene.imageStatus === "GENERATING") ? (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-500/10 to-cyan-500/10">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                  </div>
                ) : (
                  <div 
                    className="w-full h-full flex flex-col items-center justify-center text-zinc-600 hover:text-blue-400 transition-colors cursor-pointer"
                    onClick={() => openAssetModal(scene.id)}
                  >
                    <Upload className="w-5 h-5" />
                  </div>
                )}
              </div>
              
              {/* 名称和类型 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-base">{scene.name}</span>
                  {scene.type && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">
                      {scene.type}
                    </span>
                  )}
                </div>
                {savingId === scene.id && (
                  <span className="text-xs text-zinc-500 flex items-center gap-1 mt-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    保存中...
                  </span>
                )}
              </div>

              {/* 操作按钮 */}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-3 text-xs border-zinc-700 hover:bg-blue-500/10 hover:border-blue-500/30 hover:text-blue-400"
                  onClick={() => handleGenerateImage(scene.id)}
                  disabled={generating === scene.id || scene.imageStatus === "GENERATING"}
                >
                  {generating === scene.id || scene.imageStatus === "GENERATING" ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  ) : (
                    <Wand2 className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  {generating === scene.id || scene.imageStatus === "GENERATING" ? "生成中" : "生成场景"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 w-8 p-0 border-zinc-700 text-red-400 hover:text-red-300 hover:border-red-500/30 hover:bg-red-500/10"
                  onClick={() => handleDelete(scene.id, scene.name)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
            
            {/* 生成提示词 - 直接可编辑 */}
            <div>
              <label className="text-xs text-zinc-500 mb-1.5 block">生成提示词</label>
              <Textarea
                value={editData[scene.id]?.prompt || ""}
                onChange={e => setEditData(prev => ({
                  ...prev,
                  [scene.id]: { prompt: e.target.value }
                }))}
                onBlur={() => handleAutoSave(scene.id)}
                placeholder="输入用于AI生成场景背景的提示词..."
                className="bg-zinc-800/50 border-zinc-700/50 text-sm min-h-[100px] resize-none focus:border-blue-500/50 prompt-scrollbar"
              />
            </div>
          </div>
        ))}
      </div>

      {/* 素材库弹窗 */}
      {assetModalOpen && (
        <AssetLibraryModal
          type="scene"
          projectId={projectId}
          onSelect={handleSelectAsset}
          onClose={() => {
            setAssetModalOpen(false);
            setSelectedSceneForAsset(null);
          }}
        />
      )}

      {/* 场景风格弹窗 */}
      <CharacterStyleModal
        open={styleModalOpen}
        onOpenChange={setStyleModalOpen}
        workflowId={workflowId}
        assetType="scene"
        currentTemplateId={sceneStyleTemplateId}
        onSaved={onUpdate}
      />
    </div>
  );
}

// 物品配置面板
function ItemsPanel({ workflowId, projectId, items, onUpdate, currentStyleText, onOpenStyleSettings, onPreviewImage, extracting, startExtracting, stopExtracting, selectedImageModelId, itemStyleTemplateId }: { 
  workflowId: number;
  projectId: number;
  items: ItemData[]; 
  onUpdate: () => void;
  currentStyleText: string;
  onOpenStyleSettings: () => void;
  onPreviewImage: (url: string) => void;
  extracting: boolean;
  startExtracting: () => void;
  stopExtracting: () => void;
  selectedImageModelId: number | null;
  itemStyleTemplateId: number | null;
}) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("");
  const [newPrompt, setNewPrompt] = useState("");
  const [generating, setGenerating] = useState<number | null>(null);
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [assetModalOpen, setAssetModalOpen] = useState(false);
  const [selectedItemForAsset, setSelectedItemForAsset] = useState<number | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  
  // 全局风格弹窗状态
  const [styleModalOpen, setStyleModalOpen] = useState(false);
  
  // 每个物品的编辑数据
  const [editData, setEditData] = useState<Record<number, { prompt: string }>>({});
  
  // 初始化编辑数据
  useEffect(() => {
    const data: Record<number, { prompt: string }> = {};
    items.forEach(item => {
      if (!editData[item.id]) {
        data[item.id] = {
          prompt: item.prompt || ""
        };
      }
    });
    if (Object.keys(data).length > 0) {
      setEditData(prev => ({ ...prev, ...data }));
    }
  }, [items]);


  // 提取物品
  const handleExtractItems = async () => {
    startExtracting();
    try {
      await api.post(`/ai-agent/workflows/${workflowId}/extract-items`);
      toast("已开始提取物品，等待完成通知...", "info");
    } catch (error: any) {
      stopExtracting();
      toast(error.response?.data?.error || "提取失败", "error");
    }
  };

  const handleAdd = async () => {
    if (!newName.trim()) {
      toast("请输入物品名称", "error");
      return;
    }
    try {
      await api.post(`/ai-agent/workflows/${workflowId}/items`, {
        name: newName,
        type: newType,
        prompt: newPrompt
      });
      toast("物品已添加", "success");
      setAdding(false);
      setNewName("");
      setNewType("");
      setNewPrompt("");
      onUpdate();
    } catch (error: any) {
      toast(error.response?.data?.error || "添加失败", "error");
    }
  };

  const handleGenerateImage = async (itemId: number) => {
    setGenerating(itemId);
    try {
      await aiAgentImageApi.generateItemImage(itemId, {
        modelId: selectedImageModelId ?? undefined,
        ratio: "1:1"
      });
      toast("开始生成物品图...", "success");
      // 等待一下让后端事务提交
      await new Promise(resolve => setTimeout(resolve, 300));
      await onUpdate();
      setGenerating(null);
    } catch (error: any) {
      toast(error.response?.data?.error || "生成失败", "error");
      setGenerating(null);
    }
  };

  // 批量生成物品图片
  const handleBatchGenerate = async () => {
    const toGenerate = items.filter(i => !i.imageUrl && i.imageStatus !== "GENERATING");
    if (toGenerate.length === 0) {
      toast("没有需要生成图片的物品", "info");
      return;
    }
    setBatchGenerating(true);
    toast(`开始批量生成 ${toGenerate.length} 个物品图片...`, "info");
    
    for (const item of toGenerate) {
      try {
        await aiAgentImageApi.generateItemImage(item.id, {
          modelId: selectedImageModelId ?? undefined,
          ratio: "1:1"
        });
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (error) {
        console.error(`物品 ${item.name} 生成失败:`, error);
      }
    }
    await onUpdate();
    setBatchGenerating(false);
    toast("批量生成任务已提交", "success");
  };

  const handleDelete = async (itemId: number, name: string) => {
    const confirmed = await confirm({
      title: "删除物品",
      description: `确定要删除物品「${name}」吗？`,
      confirmText: "删除",
      variant: "danger"
    });
    if (!confirmed) return;
    
    try {
      await api.delete(`/ai-agent/items/${itemId}`);
      toast("删除成功", "success");
      onUpdate();
    } catch (error: any) {
      toast(error.response?.data?.error || "删除失败", "error");
    }
  };

  // 自动保存（失焦时）
  const handleAutoSave = async (itemId: number) => {
    const data = editData[itemId];
    if (!data) return;
    
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    
    // 检查是否有变化
    if (data.prompt === (item.prompt || "")) {
      return;
    }
    
    setSavingId(itemId);
    try {
      await api.put(`/ai-agent/items/${itemId}`, {
        prompt: data.prompt
      });
      onUpdate();
    } catch (error: any) {
      toast(error.response?.data?.error || "保存失败", "error");
    } finally {
      setSavingId(null);
    }
  };

  // 打开素材库选择
  const openAssetModal = (itemId: number) => {
    setSelectedItemForAsset(itemId);
    setAssetModalOpen(true);
  };

  // 选择素材后更新图片
  const handleSelectAsset = async (imageUrl: string) => {
    if (!selectedItemForAsset) return;
    try {
      await api.put(`/ai-agent/items/${selectedItemForAsset}`, {
        imageUrl
      });
      toast("图片已更新", "success");
      setAssetModalOpen(false);
      setSelectedItemForAsset(null);
      onUpdate();
    } catch (error: any) {
      toast(error.response?.data?.error || "更新失败", "error");
    }
  };

  // 是否已设置风格模板
  const hasItemStyle = !!itemStyleTemplateId;

  return (
    <div className="p-5 space-y-4">
      {/* 道具风格 */}
      <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-zinc-900/50 border border-zinc-800/50">
        <div className="min-w-0 flex items-center gap-2">
          <Palette className="w-4 h-4 text-zinc-400" />
          <span className="text-xs text-zinc-500">道具风格</span>
          {hasItemStyle && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300">已设置</span>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-3 text-xs border-zinc-700 hover:bg-orange-500/10 hover:border-orange-500/30 hover:text-orange-400"
          onClick={() => setStyleModalOpen(true)}
        >
          {hasItemStyle ? "修改风格" : "设置风格"}
        </Button>
      </div>

      {/* 操作按钮组 */}
      <div className="flex gap-3">
        <Button 
          className="flex-1 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 shadow-lg shadow-orange-900/20"
          onClick={() => setAdding(true)}
          disabled={adding}
        >
          <Plus className="w-4 h-4 mr-2" />
          添加物品
        </Button>
        <Button 
          variant="outline"
          className="flex-1 border-orange-500/30 text-orange-400 hover:bg-orange-500/10 hover:text-orange-300"
          onClick={handleExtractItems}
          disabled={extracting}
        >
          {extracting ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4 mr-2" />
          )}
          {extracting ? "提取中..." : "AI提取物品"}
        </Button>
      </div>

      {/* 批量生成按钮 */}
      {items.length > 0 && (
        <Button
          variant="outline"
          className="w-full border-orange-500/30 text-orange-400 hover:bg-orange-500/10 hover:text-orange-300"
          onClick={handleBatchGenerate}
          disabled={batchGenerating || items.every(i => i.imageUrl || i.imageStatus === "GENERATING")}
        >
          {batchGenerating ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Wand2 className="w-4 h-4 mr-2" />
          )}
          {batchGenerating ? "批量生成中..." : `批量生成物品图 (${items.filter(i => !i.imageUrl && i.imageStatus !== "GENERATING").length})`}
        </Button>
      )}

      {/* 提示信息 */}
      {items.length === 0 && !adding && (
        <div className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-orange-500/15 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-4 h-4 text-orange-400" />
            </div>
            <div>
              <p className="text-sm text-orange-300 font-medium">智能提取物品</p>
              <p className="text-xs text-zinc-500 mt-1">
                点击「AI提取物品」按钮，系统将根据分镜内容自动识别并提取出现的物品信息
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 添加表单 */}
      {adding && (
        <div className="p-4 bg-zinc-900/80 rounded-xl space-y-3 border border-zinc-800">
          <Input
            placeholder="物品名称"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            className="bg-zinc-800 border-zinc-700"
          />
          <Input
            placeholder="物品类型（如：武器、法器、道具，选填）"
            value={newType}
            onChange={e => setNewType(e.target.value)}
            className="bg-zinc-800 border-zinc-700"
          />
          <Textarea
            placeholder="生成提示词（用于AI生成物品图片）"
            value={newPrompt}
            onChange={e => setNewPrompt(e.target.value)}
            className="bg-zinc-800 border-zinc-700 min-h-[80px] prompt-scrollbar"
          />
          <div className="flex gap-2">
            <Button className="flex-1 bg-orange-600 hover:bg-orange-500" onClick={handleAdd}>
              确认添加
            </Button>
            <Button variant="outline" className="border-zinc-700" onClick={() => setAdding(false)}>
              取消
            </Button>
          </div>
        </div>
      )}

      {/* 物品列表 - 优化布局 */}
      <div className="space-y-3">
        {items.map(item => (
          <div key={item.id} className="p-4 bg-zinc-900/50 rounded-xl border border-zinc-800/50 hover:border-zinc-700/50 transition-colors">
            {/* 顶部：物品图 + 名称 + 操作 */}
            <div className="flex items-center gap-4 mb-3">
              {/* 物品图 - 可点击选择素材 */}
              <div 
                className="w-16 h-16 rounded-xl bg-zinc-800 overflow-hidden flex-shrink-0 relative group border-2 border-zinc-700/50"
              >
                {item.imageUrl ? (
                  <>
                    <img src={toThumbnailUrl(item.imageUrl, 200)} alt="" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); onPreviewImage(item.imageUrl!); }}
                        className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                        title="查看大图"
                      >
                        <Eye className="w-3.5 h-3.5 text-white" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); openAssetModal(item.id); }}
                        className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                        title="更换图片"
                      >
                        <Upload className="w-3.5 h-3.5 text-white" />
                      </button>
                    </div>
                  </>
                ) : (generating === item.id || item.imageStatus === "GENERATING") ? (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-orange-500/10 to-amber-500/10">
                    <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
                  </div>
                ) : (
                  <div 
                    className="w-full h-full flex flex-col items-center justify-center text-zinc-600 hover:text-orange-400 transition-colors cursor-pointer"
                    onClick={() => openAssetModal(item.id)}
                  >
                    <Upload className="w-5 h-5" />
                  </div>
                )}
              </div>
              
              {/* 名称和类型 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-base">{item.name}</span>
                  {item.type && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400">
                      {item.type}
                    </span>
                  )}
                </div>
                {savingId === item.id && (
                  <span className="text-xs text-zinc-500 flex items-center gap-1 mt-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    保存中...
                  </span>
                )}
              </div>

              {/* 操作按钮 */}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-3 text-xs border-zinc-700 hover:bg-orange-500/10 hover:border-orange-500/30 hover:text-orange-400"
                  onClick={() => handleGenerateImage(item.id)}
                  disabled={generating === item.id || item.imageStatus === "GENERATING"}
                >
                  {generating === item.id || item.imageStatus === "GENERATING" ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  ) : (
                    <Wand2 className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  {generating === item.id || item.imageStatus === "GENERATING" ? "生成中" : "生成物品"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 w-8 p-0 border-zinc-700 text-red-400 hover:text-red-300 hover:border-red-500/30 hover:bg-red-500/10"
                  onClick={() => handleDelete(item.id, item.name)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
            
            {/* 生成提示词 - 直接可编辑 */}
            <div>
              <label className="text-xs text-zinc-500 mb-1.5 block">生成提示词</label>
              <Textarea
                value={editData[item.id]?.prompt || ""}
                onChange={e => setEditData(prev => ({
                  ...prev,
                  [item.id]: { prompt: e.target.value }
                }))}
                onBlur={() => handleAutoSave(item.id)}
                placeholder="输入用于AI生成物品图片的提示词..."
                className="bg-zinc-800/50 border-zinc-700/50 text-sm min-h-[100px] resize-none focus:border-orange-500/50 prompt-scrollbar"
              />
            </div>
          </div>
        ))}
      </div>

      {/* 素材库弹窗 */}
      {assetModalOpen && (
        <AssetLibraryModal
          type="item"
          projectId={projectId}
          onSelect={handleSelectAsset}
          onClose={() => {
            setAssetModalOpen(false);
            setSelectedItemForAsset(null);
          }}
        />
      )}

      {/* 道具风格弹窗 */}
      <CharacterStyleModal
        open={styleModalOpen}
        onOpenChange={setStyleModalOpen}
        workflowId={workflowId}
        assetType="item"
        currentTemplateId={itemStyleTemplateId}
        onSaved={onUpdate}
      />
    </div>
  );
}

// 图片模型面板
function ImageModelPanel({
  selectedModelId,
  onChangeModel,
}: {
  selectedModelId: number | null;
  onChangeModel: (modelId: number) => void;
}) {
  const { models, loading } = useImageModels("project");

  // 根据 ID 找到选中的模型
  const selectedModelInfo = models.find(m => m.id === selectedModelId);

  // 初始化：如果未选择且有模型列表，选中第一个
  useEffect(() => {
    if (models.length > 0 && selectedModelId === null) {
      onChangeModel(models[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models]);

  // 如果当前选中ID不在模型列表里，自动回退
  useEffect(() => {
    if (loading || models.length === 0 || selectedModelId === null) return;
    
    const modelExists = models.some((m) => m.id === selectedModelId);
    if (!modelExists && models.length > 0) {
      console.warn(`模型ID ${selectedModelId} 不存在，回退到 ${models[0].id}`);
      onChangeModel(models[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models, loading, selectedModelId]);

  return (
    <div className="p-5 space-y-4">
      {/* 当前选中模型 */}
      {selectedModelInfo && (
        <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
              <ImageIcon className="w-5 h-5 text-amber-400" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-zinc-500">当前使用</p>
              <p className="font-medium text-amber-400">{selectedModelInfo.label}</p>
            </div>
            <Check className="w-5 h-5 text-amber-400" />
          </div>
        </div>
      )}

      <p className="text-xs text-zinc-500">选择用于生成首帧图片的AI模型</p>
      
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
        </div>
      ) : (
        <div className="space-y-2">
          {models.map(model => (
            <button
              key={model.id}
              onClick={() => onChangeModel(model.id)}
              className={cn(
                "w-full p-4 rounded-xl text-left transition-all border",
                selectedModelId === model.id 
                  ? "bg-amber-500/10 border-amber-500/30" 
                  : "bg-zinc-900/50 border-zinc-800/50 hover:border-zinc-700"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{model.label}</span>
                {selectedModelId === model.id && (
                  <Check className="w-4 h-4 text-amber-400" />
                )}
              </div>
              <p className="text-xs text-zinc-500 mt-1">{model.desc}</p>
              {model.maxRef && (
                <div className="flex items-center gap-3 mt-2 text-[10px] text-zinc-600">
                  <span>最多 {model.maxRef} 张参考图</span>
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// 视频模型面板（按模式：图生 / 首尾帧 / 融合）
function VideoModelPanel({
  videoModelIdByMode,
  onChangeVideoModel,
  defaultRatio,
  onChangeRatio,
}: {
  videoModelIdByMode: Record<StoryboardVideoModeCode, number | null>;
  onChangeVideoModel: (mode: StoryboardVideoModeCode, modelId: number) => void;
  defaultRatio: string;
  onChangeRatio: (ratio: string) => void;
}) {
  const [modeTab, setModeTab] = useState<StoryboardVideoModeCode>("img2vid");
  const { models, defaultModelId, loading } = useVideoModels(modeTab);

  const selectedId = videoModelIdByMode[modeTab] ?? defaultModelId;

  // 初始化：仅当前模式未选且有后端默认模型时，设置一次
  useEffect(() => {
    if (defaultModelId && videoModelIdByMode[modeTab] === null) {
      onChangeVideoModel(modeTab, defaultModelId);
    }
    // 只在 defaultModelId 或 modeTab 变化时检查，不要把 videoModelIdByMode 放入 deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultModelId, modeTab]);

  // 如果当前选择不在模型列表里，自动回退（仅当模型列表加载完成且确实不存在时）
  useEffect(() => {
    if (loading || models.length === 0 || selectedId === null) return;
    
    const modelExists = models.some((m) => m.id === selectedId);
    if (!modelExists) {
      const fallbackId = defaultModelId || models[0]?.id;
      if (fallbackId) {
        console.warn(`模型ID ${selectedId} 不存在，回退到 ${fallbackId}`);
        onChangeVideoModel(modeTab, fallbackId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models, loading]);

  const selectedModelInfo = models.find((m) => m.id === selectedId);

  const modeTabs = [
    { value: "img2vid" as const, label: "图生视频" },
    { value: "frame2frame" as const, label: "首尾帧" },
    { value: "fusion" as const, label: "融合生成" },
  ];

  return (
    <div className="p-5 space-y-4">
      <p className="text-xs text-zinc-500">按模式选择视频模型（首尾帧模式只显示支持尾帧的模型）</p>

      {/* 模式切换 */}
      <div className="flex gap-2">
        {modeTabs.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setModeTab(t.value)}
            className={cn(
              "flex-1 h-8 rounded-lg text-[11px] font-medium border transition-colors",
              modeTab === t.value
                ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                : "bg-zinc-900/50 border-zinc-800/50 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 当前选中模型 */}
      {selectedModelInfo && (
        <div className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <Video className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-zinc-500">
                当前使用（{modeTabs.find((x) => x.value === modeTab)?.label}）
              </p>
              <p className="font-medium text-emerald-400">{selectedModelInfo.label}</p>
            </div>
            <Check className="w-5 h-5 text-emerald-400" />
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
        </div>
      ) : (
        <div className="space-y-2">
          {models.map((model) => (
            <button
              key={model.id}
              type="button"
              onClick={() => onChangeVideoModel(modeTab, model.id)}
              className={cn(
                "w-full p-4 rounded-xl text-left transition-all border",
                selectedId === model.id
                  ? "bg-emerald-500/10 border-emerald-500/30"
                  : "bg-zinc-900/50 border-zinc-800/50 hover:border-zinc-700"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{model.label}</span>
                {selectedId === model.id && <Check className="w-4 h-4 text-emerald-400" />}
              </div>
              <p className="text-xs text-zinc-500 mt-1">{model.desc}</p>

              {(model.maxDuration || model.supportedDurations?.length || model.supportsEndFrame) && (
                <div className="flex flex-wrap items-center gap-3 mt-2 text-[10px] text-zinc-600">
                  {model.supportedDurations?.length ? (
                    <span>时长: {model.supportedDurations.join("/")}s</span>
                  ) : model.maxDuration ? (
                    <span>最长 {model.maxDuration}s</span>
                  ) : null}
                  {model.supportsEndFrame && <span>支持尾帧</span>}
                </div>
              )}
            </button>
          ))}

          {models.length === 0 && (
            <div className="py-8 text-center text-xs text-zinc-500">当前模式暂无可用模型配置</div>
          )}
        </div>
      )}

      {/* 全局默认配置：比例 */}
      <div className="mt-6 p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl space-y-4">
        <div className="flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-zinc-400" />
          <span className="text-sm font-medium text-zinc-300">默认生成参数</span>
        </div>
        <p className="text-[10px] text-zinc-500">所有视频生成默认使用这个配置，在左侧镜头卡片中可单独调整</p>

        {/* 比例选择器 */}
        <div className="space-y-2">
          <label className="text-xs text-zinc-400">画面比例</label>
          <div className="flex gap-2">
            {["16:9", "9:16"].map((ratio) => (
              <button
                key={ratio}
                type="button"
                onClick={() => onChangeRatio(ratio)}
                className={cn(
                  "flex-1 h-9 rounded-lg text-xs font-medium transition-all border",
                  defaultRatio === ratio
                    ? "bg-teal-500/20 border-teal-500/40 text-teal-300"
                    : "bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300"
                )}
              >
                {ratio === "16:9" ? "📺 横屏" : "📱 竖屏"} {ratio}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// 设置面板 - 画风与生成设置
function SettingsPanel({ workflow, onUpdate }: { workflow: WorkflowData; onUpdate: () => void }) {
  const { toast } = useToast();
  const [customStyle, setCustomStyle] = useState(workflow.customStyle || "");
  const [styleRefUrl, setStyleRefUrl] = useState("");
  const [styleRefWeight, setStyleRefWeight] = useState(400);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const { presets: backendPresets, defaultPreset, loading: loadingPresets } = useStylePresets();

  // 预设画风选项（后台配置）
  const presetColors = [
    "from-pink-500 to-rose-500",
    "from-blue-500 to-cyan-500",
    "from-amber-500 to-orange-500",
    "from-teal-500 to-emerald-500",
    "from-purple-500 to-violet-500",
    "from-zinc-500 to-slate-500",
  ];

  const stylePresets = (backendPresets || []).map((p, idx) => ({
    value: p.visualPromptSnippet,
    label: p.name,
    color: presetColors[idx % presetColors.length],
  }));

  // 如果当前没有设置画风，则优先显示默认画风
  useEffect(() => {
    if (customStyle.trim()) return;
    if (workflow.customStyle && workflow.customStyle.trim()) return;
    if (defaultPreset?.visualPromptSnippet) {
      setCustomStyle(defaultPreset.visualPromptSnippet);
    }
  }, [defaultPreset?.visualPromptSnippet, customStyle, workflow.customStyle]);

  const extractSrefSuffix = (text: string) => {
    const idx = text.indexOf(" --sref ");
    return idx >= 0 ? text.slice(idx) : "";
  };

  // 选择预设画风
  const handleSelectPreset = (value: string) => {
    const suffix = extractSrefSuffix(customStyle);
    const next = suffix && !value.endsWith(" ") ? `${value}${suffix}` : `${value}${suffix}`;
    setCustomStyle(next);
  };

  // 上传参考图
  const handleUploadStyleRef = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploading(true);
    try {
      const url = await uploadToOss(file, "style-ref");
      // 生成 Midjourney 格式的参考图链接
      const srefParam = ` --sref ${url} --sw ${styleRefWeight}`;
      setCustomStyle(prev => prev + srefParam);
      toast("参考图已添加", "success");
    } catch (error: any) {
      toast("上传失败", "error");
    } finally {
      setUploading(false);
    }
  };

  // 添加参考图链接
  const handleAddStyleRefUrl = () => {
    if (!styleRefUrl.trim()) {
      toast("请输入参考图链接", "error");
      return;
    }
    const srefParam = ` --sref ${styleRefUrl.trim()} --sw ${styleRefWeight}`;
    setCustomStyle(prev => prev + srefParam);
    setStyleRefUrl("");
    toast("参考图链接已添加", "success");
  };

  // 保存设置
  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/ai-agent/workflows/${workflow.id}/step1`, {
        styleType: "custom",
        customStyle: customStyle.trim()
      });
      toast("画风设置已保存", "success");
      onUpdate();
    } catch (error: any) {
      toast(error.response?.data?.error || "保存失败", "error");
    } finally {
      setSaving(false);
    }
  };
  /*

  const currentCategoryLabel = inferenceCategory === 'video' ? '视频提示词' : '首帧提示词';
  const currentCategoryHint = inferenceCategory === 'video'
    ? '根据台词推理镜头运动和动作描述。'
    : '根据台词和视频提示词推理首帧画面描述。';

  const currentCategoryLabel = inferenceCategory === 'video' ? '视频提示词' : '首帧提示词';
  const currentCategoryHint = inferenceCategory === 'video'
    ? '根据台词推理镜头运动和动作描述。'
    : '根据台词和视频提示词推理首帧画面描述。';

  return (
    <div className="p-4 space-y-4">
      <div className="rounded-2xl border border-zinc-800/80 bg-gradient-to-br from-zinc-900/80 via-zinc-900/50 to-zinc-950/60 p-4 flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center flex-shrink-0 border border-emerald-500/20">
          <Wand2 className="w-4.5 h-4.5 text-emerald-400" />
        </div>
        <div>
          <h3 className="text-sm font-medium text-zinc-100">AI 推理设置</h3>
          <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
            配置视频提示词和首帧提示词的推理模板。
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/[0.10] via-cyan-500/[0.04] to-zinc-900/70 p-3 space-y-2 shadow-[0_10px_24px_rgba(8,145,178,0.10)]">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-xs font-semibold text-cyan-200">推理模型</div>
            <div className="text-[10px] text-zinc-400 mt-0.5">与设置中心同步，影响当前账号大模型推理调用。</div>
          </div>
          {savingModelConfig ? <Loader2 className="w-4 h-4 animate-spin text-cyan-300 flex-shrink-0" /> : null}
        </div>

        {loadingModelConfig ? (
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            正在加载模型配置...
          </div>
        ) : !modelConfig ? (
          <div className="space-y-2">
            <div className="text-xs text-red-300">{modelConfigError || "获取推理模型配置失败，请稍后重试。"}</div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 border-zinc-700 bg-zinc-900/60 text-zinc-200 hover:bg-zinc-800"
              onClick={loadInferenceModelConfig}
              disabled={savingModelConfig}
            >
              重新加载
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Select
              value={selectedModelValue}
              onValueChange={handleChangeInferenceModel}
              disabled={savingModelConfig}
            >
              <SelectTrigger className="h-9 border-zinc-700 bg-zinc-950/70 text-zinc-100">
                <SelectValue placeholder="请选择模型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SYSTEM_DEFAULT_MODEL_VALUE}>
                  跟随系统默认（{systemDefaultModelName}）
                </SelectItem>
                {(modelConfig.models || []).map((model) => (
                  <SelectItem key={model.id} value={model.modelCode}>
                    {model.modelName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-zinc-400">
              <span>生效模型：{effectiveModel ? effectiveModel.modelName : selectedModelName}</span>
              {effectiveModel?.pricePerThousandTokens != null && (
                <span>{effectiveModel.pricePerThousandTokens} 漫币 / 1K tokens</span>
              )}
            </div>

            {!!modelConfig.savedModel && modelConfig.savedModel !== modelConfig.selectedModel && (
              <div className="text-[10px] text-amber-200">
                已保存模型不可用，当前已自动回退到可用模型：{selectedModelName}
              </div>
            )}

            {modelConfigError ? <div className="text-[10px] text-red-300">{modelConfigError}</div> : null}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex p-1 rounded-lg bg-zinc-900/80 border border-zinc-800">
          <button
            onClick={() => setInferenceCategory('video')}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-all",
              inferenceCategory === 'video'
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
            )}
          >
            <Video className="w-3.5 h-3.5" />
            视频提示词
          </button>
          <button
            onClick={() => setInferenceCategory('firstFrame')}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-all",
              inferenceCategory === 'firstFrame'
                ? "bg-violet-500/20 text-violet-300 border border-violet-500/30"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
            )}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            首帧提示词
          </button>
        </div>
        <p className="text-[10px] text-zinc-500 px-1">
          当前类型：{currentCategoryLabel}。{currentCategoryHint}
        </p>
      </div>

      <div className="space-y-3 pt-2">
        <div className="flex p-1 rounded-lg bg-zinc-900 border border-zinc-800">
          <button
            onClick={() => setActiveTab('system')}
            className={cn(
              "flex-1 px-3 py-2.5 rounded-md text-xs font-medium transition-all",
              activeTab === 'system'
                ? "bg-zinc-800 text-zinc-100 shadow-sm"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
            )}
          >
            官方预设
          </button>
          <button
            onClick={() => setActiveTab('user')}
            className={cn(
              "flex-1 px-3 py-2.5 rounded-md text-xs font-medium transition-all",
              activeTab === 'user'
                ? "bg-zinc-800 text-zinc-100 shadow-sm"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
            )}
          >
            个人预设
          </button>
        </div>

        <div className="space-y-2">
        {activeTab === 'system' ? (
          <div className="space-y-2">
            {!loadingSystem && systemTemplates.length > 0 && (
              <div className="flex items-center justify-between px-1 mb-1">
                <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">系统预设</span>
                <span className="text-[10px] text-zinc-600">{systemTemplates.length}</span>
              </div>
            )}

            {loadingSystem ? (
              <div className="flex flex-col items-center justify-center py-10 text-zinc-500">
                <Loader2 className="w-5 h-5 animate-spin mb-2" />
                <span className="text-xs">加载中...</span>
              </div>
            ) : errorSystem ? (
              <div className="p-4 rounded-lg bg-red-500/5 border border-red-500/10 text-center">
                <p className="text-xs text-red-400">{errorSystem}</p>
              </div>
            ) : systemTemplates.length === 0 ? (
              <div className="p-8 text-center text-zinc-500">
                <p className="text-xs">暂无系统模板</p>
              </div>
            ) : (
              <div className="space-y-2">
                {systemTemplates.map((template) => {
                  const isSelected = selectedType === 'system' && selectedId === template.templateCode;
                  return (
                    <button
                      key={template.templateCode}
                      onClick={() => handleSelectTemplate('system', template.templateCode)}
                      className={cn(
                        "w-full p-3 rounded-xl text-left transition-all border group relative overflow-hidden",
                        isSelected
                          ? "bg-blue-500/10 border-blue-500/30 ring-1 ring-blue-500/20"
                          : "bg-transparent border-transparent hover:bg-zinc-900/50 border-zinc-900"
                      )}
                    >
                      {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500" />}
                      <div className="flex items-start gap-3 pl-1">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "text-sm font-medium transition-colors",
                              isSelected ? "text-blue-300" : "text-zinc-300 group-hover:text-zinc-200"
                            )}>
                              {template.templateName}
                            </span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-blue-500 ml-auto" />}
                          </div>
                          {template.description && (
                            <p className="text-xs text-zinc-500 mt-1 line-clamp-2 leading-relaxed">
                              {template.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1 mb-1">
              <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">自定义</span>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800"
                onClick={handleOpenCreate}
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                新建
              </Button>
            </div>

            {loadingUser ? (
              <div className="flex flex-col items-center justify-center py-10 text-zinc-500">
                <Loader2 className="w-5 h-5 animate-spin mb-2" />
                <span className="text-xs">加载中...</span>
              </div>
            ) : errorUser ? (
              <div className="p-4 rounded-lg bg-red-500/5 border border-red-500/10 text-center">
                <p className="text-xs text-red-400">{errorUser}</p>
                <Button size="sm" variant="ghost" className="mt-2 text-xs h-7" onClick={loadUserTemplates}>
                  重试
                </Button>
              </div>
            ) : userTemplates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 rounded-xl border border-dashed border-zinc-800 bg-zinc-900/30">
                <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center mb-3">
                  <Sparkles className="w-5 h-5 text-zinc-600" />
                </div>
                <p className="text-xs text-zinc-500 mb-3">还没有自定义模板</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                  onClick={handleOpenCreate}
                >
                  创建第一个模板
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {userTemplates.map((template) => {
                  const isSelected = selectedType === 'user' && selectedId === String(template.id);
                  return (
                    <div
                      key={template.id}
                      className={cn(
                        "w-full p-3 rounded-xl text-left transition-all border group relative overflow-hidden",
                        isSelected
                          ? "bg-zinc-800/80 border-violet-500/30 ring-1 ring-violet-500/20"
                          : "bg-transparent border-transparent hover:bg-zinc-900 border-zinc-900"
                      )}
                    >
                      {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-violet-500" />}
                      <div className="flex items-start gap-3 pl-1">
                        <button
                          className="flex-1 min-w-0 text-left"
                          onClick={() => handleSelectTemplate('user', String(template.id))}
                        >
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "text-sm font-medium transition-colors",
                              isSelected ? "text-violet-400" : "text-zinc-300 group-hover:text-zinc-200"
                            )}>
                              {template.templateName}
                            </span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-violet-500 ml-auto" />}
                          </div>
                          {template.description && (
                            <p className="text-xs text-zinc-500 mt-1 line-clamp-2 leading-relaxed">
                              {template.description}
                            </p>
                          )}
                        </button>

                        <div className="flex gap-1 pl-2 border-l border-zinc-800 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleOpenEdit(template); }}
                            className="p-1.5 rounded-md hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300"
                            title="编辑"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(template); }}
                            className="p-1.5 rounded-md hover:bg-red-500/20 text-zinc-500 hover:text-red-400"
                            title="删除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {editModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-zinc-900 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-100">
                {editingTemplate ? '编辑模板' : '新建模板'}
              </h3>
              <button
                onClick={() => setEditModalOpen(false)}
                className="text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400">模板名称</label>
                  <Input
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    placeholder="例如：动作片风格"
                    className="bg-zinc-900 border-zinc-800 focus:ring-zinc-700 focus:border-zinc-700"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400">描述（可选）</label>
                  <Input
                    value={formDesc}
                    onChange={e => setFormDesc(e.target.value)}
                    placeholder="简要描述这个模板的用途"
                    className="bg-zinc-900 border-zinc-800 focus:ring-zinc-700 focus:border-zinc-700"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400">推理提示词</label>
                  <Textarea
                    value={formPrompt}
                    onChange={e => setFormPrompt(e.target.value)}
                    placeholder="输入 AI 推理时使用的系统提示词..."
                    className="bg-zinc-900 border-zinc-800 min-h-[180px] resize-none focus:ring-zinc-700 focus:border-zinc-700 font-mono text-xs leading-relaxed"
                  />
                  <p className="text-[10px] text-zinc-500">
                    AI 将根据此提示词分析台词并生成视频运动或首帧描述。
                  </p>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-zinc-900/50 border-t border-zinc-900 flex justify-end gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditModalOpen(false)}
                disabled={saving}
                className="text-zinc-400 hover:text-zinc-200"
              >
                取消
              </Button>
              <Button
                size="sm"
                className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
                onClick={handleSaveTemplate}
                disabled={saving}
              >
                {saving && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
                {editingTemplate ? '保存修改' : '创建模板'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="p-4 space-y-4">
      <div className="rounded-2xl border border-zinc-800/80 bg-gradient-to-br from-zinc-900/80 via-zinc-900/50 to-zinc-950/60 p-4 flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center flex-shrink-0 border border-emerald-500/20">
          <Wand2 className="w-4.5 h-4.5 text-emerald-400" />
        </div>
        <div>
          <h3 className="text-sm font-medium text-zinc-100">AI 推理设置</h3>
          <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
            配置视频提示词和首帧提示词的推理模板。
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/[0.10] via-cyan-500/[0.04] to-zinc-900/70 p-3 space-y-2 shadow-[0_10px_24px_rgba(8,145,178,0.10)]">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-xs font-semibold text-cyan-200">推理模型</div>
            <div className="text-[10px] text-zinc-400 mt-0.5">与设置中心同步，影响当前账号大模型推理调用。</div>
          </div>
          {savingModelConfig ? <Loader2 className="w-4 h-4 animate-spin text-cyan-300 flex-shrink-0" /> : null}
        </div>

        {loadingModelConfig ? (
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            正在加载模型配置...
          </div>
        ) : !modelConfig ? (
          <div className="space-y-2">
            <div className="text-xs text-red-300">{modelConfigError || "获取推理模型配置失败，请稍后重试。"}</div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 border-zinc-700 bg-zinc-900/60 text-zinc-200 hover:bg-zinc-800"
              onClick={loadInferenceModelConfig}
              disabled={savingModelConfig}
            >
              重新加载
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Select
              value={selectedModelValue}
              onValueChange={handleChangeInferenceModel}
              disabled={savingModelConfig}
            >
              <SelectTrigger className="h-9 border-zinc-700 bg-zinc-950/70 text-zinc-100">
                <SelectValue placeholder="请选择模型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SYSTEM_DEFAULT_MODEL_VALUE}>
                  跟随系统默认（{systemDefaultModelName}）
                </SelectItem>
                {(modelConfig.models || []).map((model) => (
                  <SelectItem key={model.id} value={model.modelCode}>
                    {model.modelName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-zinc-400">
              <span>生效模型：{effectiveModel ? effectiveModel.modelName : selectedModelName}</span>
              {effectiveModel?.pricePerThousandTokens != null && (
                <span>{effectiveModel.pricePerThousandTokens} 漫币 / 1K tokens</span>
              )}
            </div>

            {!!modelConfig.savedModel && modelConfig.savedModel !== modelConfig.selectedModel && (
              <div className="text-[10px] text-amber-200">
                已保存模型不可用，当前已自动回退到可用模型：{selectedModelName}
              </div>
            )}

            {modelConfigError ? <div className="text-[10px] text-red-300">{modelConfigError}</div> : null}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex p-1 rounded-lg bg-zinc-900/80 border border-zinc-800">
          <button
            onClick={() => setInferenceCategory('video')}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-all",
              inferenceCategory === 'video'
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
            )}
          >
            <Video className="w-3.5 h-3.5" />
            视频提示词
          </button>
          <button
            onClick={() => setInferenceCategory('firstFrame')}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-all",
              inferenceCategory === 'firstFrame'
                ? "bg-violet-500/20 text-violet-300 border border-violet-500/30"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
            )}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            首帧提示词
          </button>
        </div>
        <p className="text-[10px] text-zinc-500 px-1">
          当前类型：{currentCategoryLabel}。{currentCategoryHint}
        </p>
      </div>

      <div className="space-y-3 pt-2">
        <div className="flex p-1 rounded-lg bg-zinc-900 border border-zinc-800">
          <button
            onClick={() => setActiveTab('system')}
            className={cn(
              "flex-1 px-3 py-2.5 rounded-md text-xs font-medium transition-all",
              activeTab === 'system'
                ? "bg-zinc-800 text-zinc-100 shadow-sm"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
            )}
          >
            官方预设
          </button>
          <button
            onClick={() => setActiveTab('user')}
            className={cn(
              "flex-1 px-3 py-2.5 rounded-md text-xs font-medium transition-all",
              activeTab === 'user'
                ? "bg-zinc-800 text-zinc-100 shadow-sm"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
            )}
          >
            个人预设
          </button>
        </div>

        <div className="space-y-2">
        {activeTab === 'system' ? (
          <div className="space-y-2">
            {!loadingSystem && systemTemplates.length > 0 && (
              <div className="flex items-center justify-between px-1 mb-1">
                <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">系统预设</span>
                <span className="text-[10px] text-zinc-600">{systemTemplates.length}</span>
              </div>
            )}

            {loadingSystem ? (
              <div className="flex flex-col items-center justify-center py-10 text-zinc-500">
                <Loader2 className="w-5 h-5 animate-spin mb-2" />
                <span className="text-xs">加载中...</span>
              </div>
            ) : errorSystem ? (
              <div className="p-4 rounded-lg bg-red-500/5 border border-red-500/10 text-center">
                <p className="text-xs text-red-400">{errorSystem}</p>
              </div>
            ) : systemTemplates.length === 0 ? (
              <div className="p-8 text-center text-zinc-500">
                <p className="text-xs">暂无系统模板</p>
              </div>
            ) : (
              <div className="space-y-2">
                {systemTemplates.map((template) => {
                  const isSelected = selectedType === 'system' && selectedId === template.templateCode;
                  return (
                    <button
                      key={template.templateCode}
                      onClick={() => handleSelectTemplate('system', template.templateCode)}
                      className={cn(
                        "w-full p-3 rounded-xl text-left transition-all border group relative overflow-hidden",
                        isSelected
                          ? "bg-blue-500/10 border-blue-500/30 ring-1 ring-blue-500/20"
                          : "bg-transparent border-transparent hover:bg-zinc-900/50 border-zinc-900"
                      )}
                    >
                      {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500" />}
                      <div className="flex items-start gap-3 pl-1">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "text-sm font-medium transition-colors",
                              isSelected ? "text-blue-300" : "text-zinc-300 group-hover:text-zinc-200"
                            )}>
                              {template.templateName}
                            </span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-blue-500 ml-auto" />}
                          </div>
                          {template.description && (
                            <p className="text-xs text-zinc-500 mt-1 line-clamp-2 leading-relaxed">
                              {template.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1 mb-1">
              <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">自定义</span>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800"
                onClick={handleOpenCreate}
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                新建
              </Button>
            </div>

            {loadingUser ? (
              <div className="flex flex-col items-center justify-center py-10 text-zinc-500">
                <Loader2 className="w-5 h-5 animate-spin mb-2" />
                <span className="text-xs">加载中...</span>
              </div>
            ) : errorUser ? (
              <div className="p-4 rounded-lg bg-red-500/5 border border-red-500/10 text-center">
                <p className="text-xs text-red-400">{errorUser}</p>
                <Button size="sm" variant="ghost" className="mt-2 text-xs h-7" onClick={loadUserTemplates}>
                  重试
                </Button>
              </div>
            ) : userTemplates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 rounded-xl border border-dashed border-zinc-800 bg-zinc-900/30">
                <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center mb-3">
                  <Sparkles className="w-5 h-5 text-zinc-600" />
                </div>
                <p className="text-xs text-zinc-500 mb-3">还没有自定义模板</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                  onClick={handleOpenCreate}
                >
                  创建第一个模板
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {userTemplates.map((template) => {
                  const isSelected = selectedType === 'user' && selectedId === String(template.id);
                  return (
                    <div
                      key={template.id}
                      className={cn(
                        "w-full p-3 rounded-xl text-left transition-all border group relative overflow-hidden",
                        isSelected
                          ? "bg-zinc-800/80 border-violet-500/30 ring-1 ring-violet-500/20"
                          : "bg-transparent border-transparent hover:bg-zinc-900 border-zinc-900"
                      )}
                    >
                      {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-violet-500" />}
                      <div className="flex items-start gap-3 pl-1">
                        <button
                          className="flex-1 min-w-0 text-left"
                          onClick={() => handleSelectTemplate('user', String(template.id))}
                        >
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "text-sm font-medium transition-colors",
                              isSelected ? "text-violet-400" : "text-zinc-300 group-hover:text-zinc-200"
                            )}>
                              {template.templateName}
                            </span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-violet-500 ml-auto" />}
                          </div>
                          {template.description && (
                            <p className="text-xs text-zinc-500 mt-1 line-clamp-2 leading-relaxed">
                              {template.description}
                            </p>
                          )}
                        </button>

                        <div className="flex gap-1 pl-2 border-l border-zinc-800 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleOpenEdit(template); }}
                            className="p-1.5 rounded-md hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300"
                            title="编辑"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(template); }}
                            className="p-1.5 rounded-md hover:bg-red-500/20 text-zinc-500 hover:text-red-400"
                            title="删除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
      {editModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-zinc-900 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-100">
                {editingTemplate ? '编辑模板' : '新建模板'}
              </h3>
              <button
                onClick={() => setEditModalOpen(false)}
                className="text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400">模板名称</label>
                  <Input
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    placeholder="例如：动作片风格"
                    className="bg-zinc-900 border-zinc-800 focus:ring-zinc-700 focus:border-zinc-700"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400">描述（可选）</label>
                  <Input
                    value={formDesc}
                    onChange={e => setFormDesc(e.target.value)}
                    placeholder="简要描述这个模板的用途"
                    className="bg-zinc-900 border-zinc-800 focus:ring-zinc-700 focus:border-zinc-700"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400">推理提示词</label>
                  <Textarea
                    value={formPrompt}
                    onChange={e => setFormPrompt(e.target.value)}
                    placeholder="输入 AI 推理时使用的系统提示词..."
                    className="bg-zinc-900 border-zinc-800 min-h-[180px] resize-none focus:ring-zinc-700 focus:border-zinc-700 font-mono text-xs leading-relaxed"
                  />
                  <p className="text-[10px] text-zinc-500">
                    AI 将根据此提示词分析台词并生成视频运动或首帧描述。
                  </p>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-zinc-900/50 border-t border-zinc-900 flex justify-end gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditModalOpen(false)}
                disabled={saving}
                className="text-zinc-400 hover:text-zinc-200"
              >
                取消
              </Button>
              <Button
                size="sm"
                className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
                onClick={handleSaveTemplate}
                disabled={saving}
              >
                {saving && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
                {editingTemplate ? '保存修改' : '创建模板'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  */
  return (
    <div className="p-5 space-y-6">
      {/* 画风配置 */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-pink-500/20 to-purple-500/20 flex items-center justify-center">
            <Palette className="w-3.5 h-3.5 text-pink-400" />
          </div>
          <span className="text-sm font-medium">画风配置</span>
        </div>
        
        <p className="text-xs text-zinc-500">
          选择预设画风或自定义，生成首帧时会自动拼接到提示词开头
        </p>

        {/* 预设画风 */}
        <div className="grid grid-cols-3 gap-2">
          {loadingPresets ? (
            <div className="col-span-3 text-xs text-zinc-500">画风预设加载中...</div>
          ) : stylePresets.length === 0 ? (
            <div className="col-span-3 text-xs text-zinc-500">暂无画风预设，请先在后台配置</div>
          ) : (
            stylePresets.map(preset => (
              <button
                key={preset.value}
                onClick={() => handleSelectPreset(preset.value)}
                className={cn(
                  "p-3 rounded-xl text-xs font-medium transition-all border",
                  customStyle.includes(preset.value)
                    ? `bg-gradient-to-r ${preset.color} text-white border-transparent shadow-lg`
                    : "bg-zinc-900/50 border-zinc-800/50 hover:border-zinc-700 text-zinc-400 hover:text-white"
                )}
              >
                {preset.label}
              </button>
            ))
          )}
        </div>

        {/* 自定义画风输入 */}
        <div className="space-y-2">
          <label className="text-xs text-zinc-500">自定义画风描述</label>
          <Textarea
            value={customStyle}
            onChange={e => setCustomStyle(e.target.value)}
            placeholder="例如：二维动漫风格 --sref https://s.mj.run/xxx --sw 400"
            className="min-h-[100px] bg-zinc-900/50 border-zinc-800 text-sm resize-none rounded-xl focus:border-pink-500/50 focus:ring-pink-500/20"
          />
          <p className="text-[10px] text-zinc-600">
            支持 Midjourney 参考图语法：--sref [图片链接] --sw [权重0-1000]
          </p>
        </div>
      </div>

      {/* 参考图画风 */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500/20 to-purple-500/20 flex items-center justify-center">
            <ImagePlus className="w-3.5 h-3.5 text-violet-400" />
          </div>
          <span className="text-sm font-medium">参考图画风</span>
        </div>

        <p className="text-xs text-zinc-500">
          上传参考图或输入链接，AI生图时会参考图片风格
        </p>

        {/* 权重设置 */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">风格权重</span>
          <Input
            type="number"
            min={0}
            max={1000}
            step={50}
            value={styleRefWeight}
            onChange={e => setStyleRefWeight(Number(e.target.value))}
            className="w-20 h-8 bg-zinc-900/50 border-zinc-800 text-sm text-center"
          />
          <span className="text-[10px] text-zinc-600">0-1000，越大越接近参考图风格</span>
        </div>

        {/* 上传参考图 */}
        <div className="flex gap-2">
          <label className="flex-1">
            <input
              type="file"
              accept="image/*"
              onChange={handleUploadStyleRef}
              className="hidden"
              disabled={uploading}
            />
            <div className={cn(
              "h-10 rounded-xl border-2 border-dashed flex items-center justify-center gap-2 cursor-pointer transition-colors",
              uploading 
                ? "border-zinc-700 bg-zinc-900/50 cursor-not-allowed" 
                : "border-zinc-700 hover:border-violet-500/50 hover:bg-violet-500/5"
            )}>
              {uploading ? (
                <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
              ) : (
                <>
                  <Upload className="w-4 h-4 text-zinc-500" />
                  <span className="text-xs text-zinc-500">上传参考图</span>
                </>
              )}
            </div>
          </label>
        </div>

        {/* 输入参考图链接 */}
        <div className="flex gap-2">
          <Input
            value={styleRefUrl}
            onChange={e => setStyleRefUrl(e.target.value)}
            placeholder="输入参考图链接..."
            className="flex-1 h-10 bg-zinc-900/50 border-zinc-800 text-sm"
          />
          <Button
            variant="outline"
            className="h-10 px-4 border-zinc-700 hover:bg-violet-500/10 hover:border-violet-500/30 hover:text-violet-400"
            onClick={handleAddStyleRefUrl}
          >
            <Link2 className="w-4 h-4 mr-1.5" />
            添加
          </Button>
        </div>
      </div>

      {/* 保存按钮 */}
      <Button 
        className="w-full bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 shadow-lg shadow-pink-900/20" 
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <Check className="w-4 h-4 mr-2" />
        )}
        保存画风设置
      </Button>
    </div>
  );
}

// 推理设置面板 - 支持视频提示词推理和首帧提示词推理两种类型的模板配置
type InferenceCategory = 'video' | 'firstFrame';
const SYSTEM_DEFAULT_MODEL_VALUE = "__SYSTEM_DEFAULT__";

interface UserInferenceTemplate {
  id: number;
  templateName: string;
  description?: string;
  systemPrompt: string;
  isDefault?: boolean;
  category?: string; // VIDEO_INFERENCE | FIRST_FRAME_INFERENCE
}

interface InferenceModelOption {
  id: number;
  modelCode: string;
  modelName: string;
  pricePerThousandTokens?: number;
  isDefault?: boolean;
}

interface InferenceModelConfigResponse {
  models: InferenceModelOption[];
  savedModel?: string | null;
  selectedModel: string;
  systemDefaultModel: string;
}

function InferencePanel({
  selectedVideoInferenceTemplate = "",
  onChangeVideoInferenceTemplate,
  selectedFirstFrameInferenceTemplate = "",
  onChangeFirstFrameInferenceTemplate
}: {
  selectedVideoInferenceTemplate?: string;
  onChangeVideoInferenceTemplate?: (templateCode: string, templateType?: 'system' | 'user') => void;
  selectedFirstFrameInferenceTemplate?: string;
  onChangeFirstFrameInferenceTemplate?: (templateCode: string, templateType?: 'system' | 'user') => void;
}) {
  const { toast } = useToast();
  const confirm = useConfirm();
  
  // 推理类别: video (视频提示词) | firstFrame (首帧提示词)
  const [inferenceCategory, setInferenceCategory] = useState<InferenceCategory>('video');
  
  // Tab: system | user
  const [activeTab, setActiveTab] = useState<'system' | 'user'>('system');
  
  // === 视频推理模板状态 ===
  const [videoSystemTemplates, setVideoSystemTemplates] = useState<{ templateCode: string; templateName: string; description?: string }[]>([]);
  const [loadingVideoSystem, setLoadingVideoSystem] = useState(true);
  const [errorVideoSystem, setErrorVideoSystem] = useState<string | null>(null);
  const [videoUserTemplates, setVideoUserTemplates] = useState<UserInferenceTemplate[]>([]);
  const [loadingVideoUser, setLoadingVideoUser] = useState(false);
  const [errorVideoUser, setErrorVideoUser] = useState<string | null>(null);
  const [selectedVideoType, setSelectedVideoType] = useState<'system' | 'user'>('system');
  const [selectedVideoId, setSelectedVideoId] = useState<string>(selectedVideoInferenceTemplate);
  
  // === 首帧推理模板状态 ===
  const [firstFrameSystemTemplates, setFirstFrameSystemTemplates] = useState<{ templateCode: string; templateName: string; description?: string }[]>([]);
  const [loadingFirstFrameSystem, setLoadingFirstFrameSystem] = useState(true);
  const [errorFirstFrameSystem, setErrorFirstFrameSystem] = useState<string | null>(null);
  const [firstFrameUserTemplates, setFirstFrameUserTemplates] = useState<UserInferenceTemplate[]>([]);
  const [loadingFirstFrameUser, setLoadingFirstFrameUser] = useState(false);
  const [errorFirstFrameUser, setErrorFirstFrameUser] = useState<string | null>(null);
  const [selectedFirstFrameType, setSelectedFirstFrameType] = useState<'system' | 'user'>('system');
  const [selectedFirstFrameId, setSelectedFirstFrameId] = useState<string>(selectedFirstFrameInferenceTemplate);

  const [modelConfig, setModelConfig] = useState<InferenceModelConfigResponse | null>(null);
  const [selectedModelValue, setSelectedModelValue] = useState<string>(SYSTEM_DEFAULT_MODEL_VALUE);
  const [loadingModelConfig, setLoadingModelConfig] = useState(true);
  const [savingModelConfig, setSavingModelConfig] = useState(false);
  const [modelConfigError, setModelConfigError] = useState<string | null>(null);
  
  // 新建/编辑弹窗
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<UserInferenceTemplate | null>(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formPrompt, setFormPrompt] = useState('');
  const [saving, setSaving] = useState(false);
  
  // 根据当前类别获取对应状态
  const systemTemplates = inferenceCategory === 'video' ? videoSystemTemplates : firstFrameSystemTemplates;
  const loadingSystem = inferenceCategory === 'video' ? loadingVideoSystem : loadingFirstFrameSystem;
  const errorSystem = inferenceCategory === 'video' ? errorVideoSystem : errorFirstFrameSystem;
  const userTemplates = inferenceCategory === 'video' ? videoUserTemplates : firstFrameUserTemplates;
  const loadingUser = inferenceCategory === 'video' ? loadingVideoUser : loadingFirstFrameUser;
  const errorUser = inferenceCategory === 'video' ? errorVideoUser : errorFirstFrameUser;
  const selectedType = inferenceCategory === 'video' ? selectedVideoType : selectedFirstFrameType;
  const selectedId = inferenceCategory === 'video' ? selectedVideoId : selectedFirstFrameId;

  const effectiveModel = useMemo<any>(() => {
    if (!modelConfig) return null;
    return modelConfig.models.find((model) => model.modelCode === modelConfig.selectedModel) ?? null;
  }, [modelConfig]);

  const modelNameByCode = useMemo(() => {
    const map = new Map<string, string>();
    (modelConfig?.models || []).forEach((item) => {
      map.set(item.modelCode, item.modelName);
    });
    return map;
  }, [modelConfig]);

  const systemDefaultModelName = useMemo(() => {
    if (!modelConfig?.systemDefaultModel) return "未配置";
    return modelNameByCode.get(modelConfig.systemDefaultModel) || "未知模型";
  }, [modelConfig, modelNameByCode]);

  const selectedModelName = useMemo(() => {
    if (!modelConfig?.selectedModel) return "未配置";
    return modelNameByCode.get(modelConfig.selectedModel) || "未知模型";
  }, [modelConfig, modelNameByCode]);

  const loadInferenceModelConfig = useCallback(async () => {
    try {
      setLoadingModelConfig(true);
      setModelConfigError(null);
      const response = await api.get<InferenceModelConfigResponse>("/user/inference-model-config");
      const data = response.data;
      setModelConfig(data);
      setSelectedModelValue(data.savedModel || SYSTEM_DEFAULT_MODEL_VALUE);
    } catch (error: any) {
      const backendMessage = error?.response?.data?.error || error?.message;
      setModelConfigError(
        backendMessage
          ? `获取推理模型配置失败：${backendMessage}`
          : "获取推理模型配置失败，请刷新后重试。"
      );
    } finally {
      setLoadingModelConfig(false);
    }
  }, []);

  useEffect(() => {
    loadInferenceModelConfig();
  }, [loadInferenceModelConfig]);
  
  // 加载视频推理系统模板
  useEffect(() => {
    const loadSystemTemplates = async () => {
      setLoadingVideoSystem(true);
      setErrorVideoSystem(null);
      try {
        const res = await api.get<{ templateCode: string; templateName: string; description?: string }[]>('/ai-agent/inference-templates');
        setVideoSystemTemplates(res.data || []);
        if (!selectedVideoInferenceTemplate && res.data?.length > 0) {
          setSelectedVideoType('system');
          setSelectedVideoId(res.data[0].templateCode);
          onChangeVideoInferenceTemplate?.(res.data[0].templateCode, 'system');
        }
      } catch (e) {
        console.error('加载视频推理系统模板失败', e);
        setErrorVideoSystem('加载失败');
      } finally {
        setLoadingVideoSystem(false);
      }
    };
    loadSystemTemplates();
  }, []);
  
  // 加载首帧推理系统模板
  useEffect(() => {
    const loadSystemTemplates = async () => {
      setLoadingFirstFrameSystem(true);
      setErrorFirstFrameSystem(null);
      try {
        const res = await api.get<{ templateCode: string; templateName: string; description?: string }[]>('/ai-agent/inference-templates?category=FIRST_FRAME_INFERENCE');
        setFirstFrameSystemTemplates(res.data || []);
        if (!selectedFirstFrameInferenceTemplate && res.data?.length > 0) {
          setSelectedFirstFrameType('system');
          setSelectedFirstFrameId(res.data[0].templateCode);
          onChangeFirstFrameInferenceTemplate?.(res.data[0].templateCode, 'system');
        }
      } catch (e) {
        console.error('加载首帧推理系统模板失败', e);
        setErrorFirstFrameSystem('加载失败');
      } finally {
        setLoadingFirstFrameSystem(false);
      }
    };
    loadSystemTemplates();
  }, []);
  
  // 加载视频推理用户模板
  const loadVideoUserTemplates = async () => {
    setLoadingVideoUser(true);
    setErrorVideoUser(null);
    try {
      const res = await api.get<UserInferenceTemplate[]>('/ai-agent/user-inference-templates?category=VIDEO_INFERENCE');
      setVideoUserTemplates(res.data || []);
    } catch (e) {
      console.error('加载视频推理用户模板失败', e);
      setErrorVideoUser('加载失败');
    } finally {
      setLoadingVideoUser(false);
    }
  };
  
  // 加载首帧推理用户模板
  const loadFirstFrameUserTemplates = async () => {
    setLoadingFirstFrameUser(true);
    setErrorFirstFrameUser(null);
    try {
      const res = await api.get<UserInferenceTemplate[]>('/ai-agent/user-inference-templates?category=FIRST_FRAME_INFERENCE');
      setFirstFrameUserTemplates(res.data || []);
    } catch (e) {
      console.error('加载首帧推理用户模板失败', e);
      setErrorFirstFrameUser('加载失败');
    } finally {
      setLoadingFirstFrameUser(false);
    }
  };
  
  // 加载用户模板的统一方法
  const loadUserTemplates = () => {
    if (inferenceCategory === 'video') {
      loadVideoUserTemplates();
    } else {
      loadFirstFrameUserTemplates();
    }
  };

  const handleChangeInferenceModel = async (value: string) => {
    const previousValue = selectedModelValue;
    setSelectedModelValue(value);
    setSavingModelConfig(true);
    setModelConfigError(null);

    try {
      await api.put("/user/inference-model-config", {
        modelCode: value === SYSTEM_DEFAULT_MODEL_VALUE ? "" : value,
      });
      await loadInferenceModelConfig();
      toast("推理模型已保存", "success");
    } catch (error: any) {
      const message = error?.response?.data?.error || "保存推理模型失败，请稍后再试。";
      setSelectedModelValue(previousValue);
      setModelConfigError(message);
      toast(message, "error");
    } finally {
      setSavingModelConfig(false);
    }
  };
  
  // 切换到用户模板 tab 时加载
  useEffect(() => {
    if (activeTab === 'user') {
      if (inferenceCategory === 'video' && videoUserTemplates.length === 0 && !loadingVideoUser) {
        loadVideoUserTemplates();
      } else if (inferenceCategory === 'firstFrame' && firstFrameUserTemplates.length === 0 && !loadingFirstFrameUser) {
        loadFirstFrameUserTemplates();
      }
    }
  }, [activeTab, inferenceCategory]);
  
  // 选择模板
  const handleSelectTemplate = (type: 'system' | 'user', id: string) => {
    if (inferenceCategory === 'video') {
      setSelectedVideoType(type);
      setSelectedVideoId(id);
      onChangeVideoInferenceTemplate?.(id, type);
    } else {
      setSelectedFirstFrameType(type);
      setSelectedFirstFrameId(id);
      onChangeFirstFrameInferenceTemplate?.(id, type);
    }
  };
  
  // 打开新建弹窗
  const handleOpenCreate = () => {
    setEditingTemplate(null);
    setFormName('');
    setFormDesc('');
    if (inferenceCategory === 'video') {
      setFormPrompt('根据台词和镜头描述生成视频运动提示词。要求：\n1. 描述角色动作和表情变化\n2. 包含镜头运动（推/拉/摇/移等）\n3. 体现台词的情感\n4. 直接输出提示词，不要解释');
    } else {
      setFormPrompt('根据台词和视频提示词，生成首帧画面描述。要求：\n1. 描述画面构图和场景\n2. 描述角色姿态和表情\n3. 包含光影和氛围\n4. 直接输出提示词，不要解释');
    }
    // 覆盖默认提示词，修复历史乱码文案
    if (inferenceCategory === "video") {
      setFormPrompt(
        "根据台词和镜头描述生成视频运动提示词。要求：\n1. 描述角色动作和表情变化\n2. 包含镜头运动（推/拉/摇/移等）\n3. 体现台词情绪\n4. 直接输出提示词，不要解释"
      );
    } else {
      setFormPrompt(
        "根据台词和视频提示词生成首帧画面描述。要求：\n1. 描述画面构图和场景\n2. 描述角色姿态和表情\n3. 包含光影和氛围\n4. 直接输出提示词，不要解释"
      );
    }
    setEditModalOpen(true);
  };
  
  // 打开编辑弹窗
  const handleOpenEdit = (template: UserInferenceTemplate) => {
    setEditingTemplate(template);
    setFormName(template.templateName);
    setFormDesc(template.description || '');
    setFormPrompt(template.systemPrompt);
    setEditModalOpen(true);
  };
  
  // 保存模板
  const handleSaveTemplate = async () => {
    if (!formName.trim()) {
      toast('请输入模板名称', 'error');
      return;
    }
    if (!formPrompt.trim()) {
      toast('请输入提示词内容', 'error');
      return;
    }
    
    const categoryCode = inferenceCategory === 'video' ? 'VIDEO_INFERENCE' : 'FIRST_FRAME_INFERENCE';
    
    setSaving(true);
    try {
      if (editingTemplate) {
        // 更新
        await api.put(`/ai-agent/user-inference-templates/${editingTemplate.id}`, {
          templateName: formName.trim(),
          description: formDesc.trim() || null,
          systemPrompt: formPrompt.trim(),
          category: categoryCode
        });
        toast('模板已更新', 'success');
      } else {
        // 新建
        await api.post('/ai-agent/user-inference-templates', {
          templateName: formName.trim(),
          description: formDesc.trim() || null,
          systemPrompt: formPrompt.trim(),
          category: categoryCode
        });
        toast('模板已创建', 'success');
      }
      setEditModalOpen(false);
      if (inferenceCategory === 'video') {
        loadVideoUserTemplates();
      } else {
        loadFirstFrameUserTemplates();
      }
    } catch (e: any) {
      toast(e.response?.data?.error || '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };
  
  // 删除模板
  const handleDeleteTemplate = async (template: UserInferenceTemplate) => {
    const confirmed = await confirm({
      title: '删除模板',
      description: `确定要删除「${template.templateName}」吗？`,
      confirmText: '删除',
      variant: 'danger'
    });
    if (!confirmed) return;
    
    try {
      await api.delete(`/ai-agent/user-inference-templates/${template.id}`);
      toast('已删除', 'success');
      if (inferenceCategory === 'video') {
        loadVideoUserTemplates();
        // 如果删除的是当前选中的，切换到系统模板
        if (selectedVideoType === 'user' && selectedVideoId === String(template.id)) {
          if (videoSystemTemplates.length > 0) {
            handleSelectTemplate('system', videoSystemTemplates[0].templateCode);
          }
        }
      } else {
        loadFirstFrameUserTemplates();
        if (selectedFirstFrameType === 'user' && selectedFirstFrameId === String(template.id)) {
          if (firstFrameSystemTemplates.length > 0) {
            handleSelectTemplate('system', firstFrameSystemTemplates[0].templateCode);
          }
        }
      }
    } catch (e: any) {
      toast(e.response?.data?.error || '删除失败', 'error');
    }
  };
  
  const compactCategoryLabel = inferenceCategory === "video" ? "视频提示词" : "首帧提示词";
  const compactCategoryHint = inferenceCategory === "video"
    ? "根据台词推理镜头运动和动作描述。"
    : "根据台词和视频提示词推理首帧画面描述。";

  return (
    <div className="p-4 space-y-4">
      <div className="rounded-2xl border border-zinc-800/80 bg-gradient-to-br from-zinc-900/80 via-zinc-900/50 to-zinc-950/60 p-4 flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center flex-shrink-0 border border-emerald-500/20">
          <Wand2 className="w-4.5 h-4.5 text-emerald-400" />
        </div>
        <div>
          <h3 className="text-sm font-medium text-zinc-100">AI 推理设置</h3>
          <p className="text-xs text-zinc-500 mt-1 leading-relaxed">配置视频提示词和首帧提示词的推理模板。</p>
        </div>
      </div>

      <div className="rounded-xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/[0.10] via-cyan-500/[0.04] to-zinc-900/70 p-3 space-y-2 shadow-[0_10px_24px_rgba(8,145,178,0.10)]">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-xs font-semibold text-cyan-200">推理模型</div>
            <div className="text-[10px] text-zinc-400 mt-0.5">与设置中心同步，影响当前账号大模型推理调用。</div>
          </div>
          {savingModelConfig ? <Loader2 className="w-4 h-4 animate-spin text-cyan-300 flex-shrink-0" /> : null}
        </div>

        {loadingModelConfig ? (
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            正在加载模型配置...
          </div>
        ) : !modelConfig ? (
          <div className="space-y-2">
            <div className="text-xs text-red-300">{modelConfigError || "获取推理模型配置失败，请稍后重试。"}</div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 border-zinc-700 bg-zinc-900/60 text-zinc-200 hover:bg-zinc-800"
              onClick={loadInferenceModelConfig}
              disabled={savingModelConfig}
            >
              重新加载
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Select
              value={selectedModelValue}
              onValueChange={handleChangeInferenceModel}
              disabled={savingModelConfig}
            >
              <SelectTrigger className="h-9 border-zinc-700 bg-zinc-950/70 text-zinc-100">
                <SelectValue placeholder="请选择模型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SYSTEM_DEFAULT_MODEL_VALUE}>
                  跟随系统默认（{systemDefaultModelName}）
                </SelectItem>
                {(modelConfig.models || []).map((model) => (
                  <SelectItem key={model.id} value={model.modelCode}>
                    {model.modelName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-zinc-400">
              <span>生效模型：{effectiveModel ? effectiveModel.modelName : selectedModelName}</span>
              {effectiveModel?.pricePerThousandTokens != null && <span>{effectiveModel.pricePerThousandTokens} 漫币 / 1K tokens</span>}
            </div>
            {!!modelConfig.savedModel && modelConfig.savedModel !== modelConfig.selectedModel && (
              <div className="text-[10px] text-amber-200">已保存模型不可用，当前已自动回退到可用模型：{selectedModelName}</div>
            )}
            {modelConfigError ? <div className="text-[10px] text-red-300">{modelConfigError}</div> : null}
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex p-1 rounded-lg bg-zinc-900/80 border border-zinc-800">
          <button
            onClick={() => setInferenceCategory("video")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-all",
              inferenceCategory === "video"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
            )}
          >
            <Video className="w-3.5 h-3.5" />
            视频提示词
          </button>
          <button
            onClick={() => setInferenceCategory("firstFrame")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-all",
              inferenceCategory === "firstFrame"
                ? "bg-violet-500/20 text-violet-300 border border-violet-500/30"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
            )}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            首帧提示词
          </button>
        </div>
        <p className="text-[10px] text-zinc-500">
          当前类型：{compactCategoryLabel}。{compactCategoryHint}
        </p>
      </div>

      <div className="flex p-1 rounded-lg bg-zinc-900 border border-zinc-800">
        <button
          onClick={() => setActiveTab("system")}
          className={cn(
            "flex-1 px-3 py-2 rounded-md text-xs font-medium transition-all",
            activeTab === "system"
              ? "bg-zinc-800 text-zinc-100 shadow-sm"
              : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
          )}
        >
          系统模板
        </button>
        <button
          onClick={() => setActiveTab("user")}
          className={cn(
            "flex-1 px-3 py-2 rounded-md text-xs font-medium transition-all",
            activeTab === "user"
              ? "bg-zinc-800 text-zinc-100 shadow-sm"
              : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
          )}
        >
          我的模板
        </button>
      </div>

      <div className="min-h-[200px]">
        {activeTab === "system" ? (
          <div className="space-y-2">
            {!loadingSystem && systemTemplates.length > 0 && (
              <div className="flex items-center justify-between px-1 mb-1">
                <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">系统预设</span>
                <span className="text-[10px] text-zinc-600">{systemTemplates.length}</span>
              </div>
            )}
            {loadingSystem ? (
              <div className="flex flex-col items-center justify-center py-10 text-zinc-500">
                <Loader2 className="w-5 h-5 animate-spin mb-2" />
                <span className="text-xs">加载中...</span>
              </div>
            ) : errorSystem ? (
              <div className="p-4 rounded-lg bg-red-500/5 border border-red-500/10 text-center">
                <p className="text-xs text-red-400">{errorSystem}</p>
              </div>
            ) : systemTemplates.length === 0 ? (
              <div className="p-8 text-center text-zinc-500">
                <p className="text-xs">暂无系统模板</p>
              </div>
            ) : (
              <div className="space-y-2">
                {systemTemplates.map((template) => {
                  const isSelected = selectedType === "system" && selectedId === template.templateCode;
                  return (
                    <button
                      key={template.templateCode}
                      onClick={() => handleSelectTemplate("system", template.templateCode)}
                      className={cn(
                        "w-full p-3 rounded-xl text-left transition-all border group relative overflow-hidden",
                        isSelected
                          ? "bg-blue-500/10 border-blue-500/30 ring-1 ring-blue-500/20"
                          : "bg-transparent border-transparent hover:bg-zinc-900/50 border-zinc-900"
                      )}
                    >
                      {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500" />}
                      <div className="flex items-start gap-3 pl-1">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "text-sm font-medium transition-colors",
                              isSelected ? "text-blue-300" : "text-zinc-300 group-hover:text-zinc-200"
                            )}>
                              {template.templateName}
                            </span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-blue-500 ml-auto" />}
                          </div>
                          {template.description && (
                            <p className="text-xs text-zinc-500 mt-1 line-clamp-2 leading-relaxed">{template.description}</p>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1 mb-1">
              <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">自定义</span>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800"
                onClick={handleOpenCreate}
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                新建
              </Button>
            </div>
            {loadingUser ? (
              <div className="flex flex-col items-center justify-center py-10 text-zinc-500">
                <Loader2 className="w-5 h-5 animate-spin mb-2" />
                <span className="text-xs">加载中...</span>
              </div>
            ) : errorUser ? (
              <div className="p-4 rounded-lg bg-red-500/5 border border-red-500/10 text-center">
                <p className="text-xs text-red-400">{errorUser}</p>
                <Button size="sm" variant="ghost" className="mt-2 text-xs h-7" onClick={loadUserTemplates}>
                  重试
                </Button>
              </div>
            ) : userTemplates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 rounded-xl border border-dashed border-zinc-800 bg-zinc-900/30">
                <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center mb-3">
                  <Sparkles className="w-5 h-5 text-zinc-600" />
                </div>
                <p className="text-xs text-zinc-500 mb-3">还没有自定义模板</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                  onClick={handleOpenCreate}
                >
                  创建第一个模板
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {userTemplates.map((template) => {
                  const isSelected = selectedType === "user" && selectedId === String(template.id);
                  return (
                    <div
                      key={template.id}
                      className={cn(
                        "w-full p-3 rounded-xl text-left transition-all border group relative overflow-hidden",
                        isSelected
                          ? "bg-zinc-800/80 border-violet-500/30 ring-1 ring-violet-500/20"
                          : "bg-transparent border-transparent hover:bg-zinc-900 border-zinc-900"
                      )}
                    >
                      {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-violet-500" />}
                      <div className="flex items-start gap-3 pl-1">
                        <button className="flex-1 min-w-0 text-left" onClick={() => handleSelectTemplate("user", String(template.id))}>
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "text-sm font-medium transition-colors",
                              isSelected ? "text-violet-400" : "text-zinc-300 group-hover:text-zinc-200"
                            )}>
                              {template.templateName}
                            </span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-violet-500 ml-auto" />}
                          </div>
                          {template.description && (
                            <p className="text-xs text-zinc-500 mt-1 line-clamp-2 leading-relaxed">{template.description}</p>
                          )}
                        </button>
                        <div className="flex gap-1 pl-2 border-l border-zinc-800 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleOpenEdit(template); }}
                            className="p-1.5 rounded-md hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300"
                            title="编辑"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(template); }}
                            className="p-1.5 rounded-md hover:bg-red-500/20 text-zinc-500 hover:text-red-400"
                            title="删除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {editModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-zinc-900 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-100">{editingTemplate ? "编辑模板" : "新建模板"}</h3>
              <button onClick={() => setEditModalOpen(false)} className="text-zinc-500 hover:text-zinc-300 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400">模板名称</label>
                  <Input
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    placeholder="例如：动作片风格"
                    className="bg-zinc-900 border-zinc-800 focus:ring-zinc-700 focus:border-zinc-700"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400">描述（可选）</label>
                  <Input
                    value={formDesc}
                    onChange={e => setFormDesc(e.target.value)}
                    placeholder="简要描述这个模板的用途"
                    className="bg-zinc-900 border-zinc-800 focus:ring-zinc-700 focus:border-zinc-700"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400">推理提示词</label>
                  <Textarea
                    value={formPrompt}
                    onChange={e => setFormPrompt(e.target.value)}
                    placeholder="输入 AI 推理时使用的系统提示词..."
                    className="bg-zinc-900 border-zinc-800 min-h-[180px] resize-none focus:ring-zinc-700 focus:border-zinc-700 font-mono text-xs leading-relaxed"
                  />
                  <p className="text-[10px] text-zinc-500">AI 将根据此提示词分析台词并生成视频运动或首帧描述。</p>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 bg-zinc-900/50 border-t border-zinc-900 flex justify-end gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditModalOpen(false)}
                disabled={saving}
                className="text-zinc-400 hover:text-zinc-200"
              >
                取消
              </Button>
              <Button
                size="sm"
                className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
                onClick={handleSaveTemplate}
                disabled={saving}
              >
                {saving && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
                {editingTemplate ? "保存修改" : "创建模板"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="p-5 space-y-6">
      {/* 顶部功能说明 - 极简风格 */}
      <div className="rounded-2xl border border-zinc-800/80 bg-gradient-to-br from-zinc-900/80 via-zinc-900/50 to-zinc-950/60 p-4 flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center flex-shrink-0 border border-emerald-500/20">
          <Wand2 className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <h3 className="text-sm font-medium text-zinc-100">AI 推理设置</h3>
          <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
            配置视频提示词和首尾帧提示词的推理模板
          </p>
        </div>
      </div>
      
      {/* 推理类别切换 */}
      <div className="space-y-2">
        <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">推理类型</label>
        <div className="flex p-1 rounded-lg bg-zinc-900/80 border border-zinc-800">
          <button
            onClick={() => setInferenceCategory('video')}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-all",
              inferenceCategory === 'video'
                ? "bg-cyan-500/20 text-cyan-400 shadow-sm border border-cyan-500/30"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
            )}
          >
            <Video className="w-3.5 h-3.5" />
            视频提示词
          </button>
          <button
            onClick={() => setInferenceCategory('firstFrame')}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-all",
              inferenceCategory === 'firstFrame'
                ? "bg-violet-500/20 text-violet-400 shadow-sm border border-violet-500/30"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
            )}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            首尾帧提示词
          </button>
        </div>
        <p className="text-[10px] text-zinc-600">
          {inferenceCategory === 'video' 
            ? '根据台词推理镜头运动和动作描述' 
            : '根据台词和视频提示词推理首尾帧画面'}
        </p>
      </div>

      {/* 推理模型配置（与设置中心同步） */}
      <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/[0.10] via-cyan-500/[0.04] to-zinc-900/70 p-4 space-y-3 shadow-[0_12px_32px_rgba(8,145,178,0.10)]">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-xs font-semibold text-cyan-200">推理模型</div>
            <div className="text-[11px] text-zinc-400 mt-1">与设置中心同步，影响当前账号的大模型推理调用。</div>
          </div>
          {savingModelConfig ? <Loader2 className="w-4 h-4 animate-spin text-cyan-300 flex-shrink-0" /> : null}
        </div>

        {loadingModelConfig ? (
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            加载中...
          </div>
        ) : !modelConfig ? (
          <div className="space-y-2">
            <div className="text-xs text-red-300">{modelConfigError || "获取推理模型配置失败，请稍后重试。"}</div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 border-zinc-700 bg-zinc-900/60 text-zinc-200 hover:bg-zinc-800"
              onClick={loadInferenceModelConfig}
              disabled={savingModelConfig}
            >
              重新加载
            </Button>
          </div>
        ) : (
          <>
            <Select
              value={selectedModelValue}
              onValueChange={handleChangeInferenceModel}
              disabled={savingModelConfig}
            >
              <SelectTrigger className="h-10 border-zinc-700 bg-zinc-950/70 text-zinc-100">
                <SelectValue placeholder="请选择模型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SYSTEM_DEFAULT_MODEL_VALUE}>
                  跟随系统默认（{systemDefaultModelName}）
                </SelectItem>
                {(modelConfig?.models || []).map((model) => (
                  <SelectItem key={model.id} value={model.modelCode}>
                    {model.modelName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
              <div className="text-[10px] uppercase tracking-wide text-zinc-500">当前生效模型</div>
              <div className="mt-1 text-xs text-zinc-200">
                {effectiveModel ? effectiveModel.modelName : selectedModelName}
              </div>
              {effectiveModel?.pricePerThousandTokens != null && (
                <div className="mt-1 text-[10px] text-zinc-500">
                  价格：{effectiveModel.pricePerThousandTokens} 漫币 / 1K tokens
                </div>
              )}
              {!!modelConfig?.savedModel && modelConfig?.savedModel !== modelConfig?.selectedModel && (
                <div className="mt-1 text-[10px] text-amber-200">
                  已保存模型不可用，已自动回退到可用模型：{selectedModelName}
                </div>
              )}
            </div>

            {modelConfigError ? <div className="text-[10px] text-red-300">{modelConfigError}</div> : null}
          </>
        )}
      </div>

      {/* Tab 切换 - 朴素风格 */}
      <div className="flex p-1 rounded-lg bg-zinc-900 border border-zinc-800">
        <button
          onClick={() => setActiveTab('system')}
          className={cn(
            "flex-1 px-3 py-2 rounded-md text-xs font-medium transition-all",
            activeTab === 'system'
              ? "bg-zinc-800 text-zinc-100 shadow-sm"
              : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
          )}
        >
          系统模板
        </button>
        <button
          onClick={() => setActiveTab('user')}
          className={cn(
            "flex-1 px-3 py-2 rounded-md text-xs font-medium transition-all",
            activeTab === 'user'
              ? "bg-zinc-800 text-zinc-100 shadow-sm"
              : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
          )}
        >
          我的模板
        </button>
      </div>

      {/* 模板列表 */}
      <div className="min-h-[200px]">
        {activeTab === 'system' ? (
          // 系统模板列表
          <div className="space-y-3">
            {!loadingSystem && systemTemplates.length > 0 && (
               <div className="flex items-center justify-between px-1 mb-2">
                 <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">系统预设</span>
                 <span className="text-[10px] text-zinc-600">{systemTemplates.length}</span>
               </div>
            )}
            
            {loadingSystem ? (
              <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
                <Loader2 className="w-5 h-5 animate-spin mb-2" />
                <span className="text-xs">加载中...</span>
              </div>
            ) : errorSystem ? (
              <div className="p-4 rounded-lg bg-red-500/5 border border-red-500/10 text-center">
                <p className="text-xs text-red-400">{errorSystem}</p>
              </div>
            ) : systemTemplates.length === 0 ? (
              <div className="p-8 text-center text-zinc-500">
                <p className="text-xs">暂无系统模板</p>
              </div>
            ) : (
              <div className="space-y-2">
                {systemTemplates.map((template) => {
                  const isSelected = selectedType === 'system' && selectedId === template.templateCode;
                  
                  return (
                    <button
                      key={template.templateCode}
                      onClick={() => handleSelectTemplate('system', template.templateCode)}
                      className={cn(
                        "w-full p-3 rounded-xl text-left transition-all border group relative overflow-hidden",
                        isSelected
                          ? "bg-blue-500/10 border-blue-500/30 ring-1 ring-blue-500/20"
                          : "bg-transparent border-transparent hover:bg-zinc-900/50 border-zinc-900"
                      )}
                    >
                      {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500" />}
                      <div className="flex items-start gap-3 pl-1">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "text-sm font-medium transition-colors",
                              isSelected ? "text-blue-300" : "text-zinc-300 group-hover:text-zinc-200"
                            )}>
                              {template.templateName}
                            </span>
                            {isSelected && (
                              <Check className="w-3.5 h-3.5 text-emerald-500 ml-auto" />
                            )}
                          </div>
                          {template.description && (
                            <p className="text-xs text-zinc-500 mt-1 line-clamp-2 leading-relaxed">
                              {template.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          // 用户模板列表
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1 mb-2">
              <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">自定义</span>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800"
                onClick={handleOpenCreate}
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                新建
              </Button>
            </div>
            
            {loadingUser ? (
              <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
                <Loader2 className="w-5 h-5 animate-spin mb-2" />
                <span className="text-xs">加载中...</span>
              </div>
            ) : errorUser ? (
              <div className="p-4 rounded-lg bg-red-500/5 border border-red-500/10 text-center">
                <p className="text-xs text-red-400">{errorUser}</p>
                <Button size="sm" variant="ghost" className="mt-2 text-xs h-7" onClick={loadUserTemplates}>
                  重试
                </Button>
              </div>
            ) : userTemplates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 rounded-xl border border-dashed border-zinc-800 bg-zinc-900/30">
                <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center mb-3">
                  <Sparkles className="w-5 h-5 text-zinc-600" />
                </div>
                <p className="text-xs text-zinc-500 mb-4">还没有自定义模板</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                  onClick={handleOpenCreate}
                >
                  创建第一个模板
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {userTemplates.map((template) => {
                  const isSelected = selectedType === 'user' && selectedId === String(template.id);
                  
                  return (
                    <div
                      key={template.id}
                      className={cn(
                        "w-full p-3 rounded-xl text-left transition-all border group relative overflow-hidden",
                        isSelected
                          ? "bg-zinc-800/80 border-violet-500/30 ring-1 ring-violet-500/20"
                          : "bg-transparent border-transparent hover:bg-zinc-900 border-zinc-900"
                      )}
                    >
                      {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-violet-500" />}
                      <div className="flex items-start gap-3 pl-1">
                        <button
                          className="flex-1 min-w-0 text-left"
                          onClick={() => handleSelectTemplate('user', String(template.id))}
                        >
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "text-sm font-medium transition-colors",
                              isSelected ? "text-violet-400" : "text-zinc-300 group-hover:text-zinc-200"
                            )}>
                              {template.templateName}
                            </span>
                            {isSelected && (
                              <Check className="w-3.5 h-3.5 text-violet-500 ml-auto" />
                            )}
                          </div>
                          {template.description && (
                            <p className="text-xs text-zinc-500 mt-1 line-clamp-2 leading-relaxed">
                              {template.description}
                            </p>
                          )}
                        </button>
                        
                        {/* 操作区 */}
                        <div className="flex gap-1 pl-2 border-l border-zinc-800 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleOpenEdit(template); }}
                            className="p-1.5 rounded-md hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300"
                            title="编辑"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(template); }}
                            className="p-1.5 rounded-md hover:bg-red-500/20 text-zinc-500 hover:text-red-400"
                            title="删除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* 新建/编辑模板弹窗 - 简化版 */}
      {editModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* 弹窗头部 */}
            <div className="px-6 py-4 border-b border-zinc-900 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-100">
                {editingTemplate ? '编辑模板' : '新建模板'}
              </h3>
              <button
                onClick={() => setEditModalOpen(false)}
                className="text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            {/* 弹窗内容 */}
            <div className="p-6 space-y-5">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400">模板名称</label>
                  <Input
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    placeholder="例如：动作片风格"
                    className="bg-zinc-900 border-zinc-800 focus:ring-zinc-700 focus:border-zinc-700"
                  />
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400">描述（可选）</label>
                  <Input
                    value={formDesc}
                    onChange={e => setFormDesc(e.target.value)}
                    placeholder="简要描述这个模板的用途"
                    className="bg-zinc-900 border-zinc-800 focus:ring-zinc-700 focus:border-zinc-700"
                  />
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400">推理提示词</label>
                  <Textarea
                    value={formPrompt}
                    onChange={e => setFormPrompt(e.target.value)}
                    placeholder="输入 AI 推理时使用的系统提示词..."
                    className="bg-zinc-900 border-zinc-800 min-h-[200px] resize-none focus:ring-zinc-700 focus:border-zinc-700 font-mono text-xs leading-relaxed"
                  />
                  <p className="text-[10px] text-zinc-500">
                    AI 将根据此提示词分析台词并生成视频运动提示词
                  </p>
                </div>
              </div>
            </div>
            
            {/* 弹窗底部 */}
            <div className="px-6 py-4 bg-zinc-900/50 border-t border-zinc-900 flex justify-end gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditModalOpen(false)}
                disabled={saving}
                className="text-zinc-400 hover:text-zinc-200"
              >
                取消
              </Button>
              <Button
                size="sm"
                className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
                onClick={handleSaveTemplate}
                disabled={saving}
              >
                {saving && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
                {editingTemplate ? '保存更改' : '创建模板'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 任务类型中文映射
const TASK_TYPE_MAP: Record<string, { label: string; color: string }> = {
  CHARACTER_IMAGE: { label: "角色图片", color: "text-purple-400" },
  SCENE_IMAGE: { label: "场景图片", color: "text-blue-400" },
  ITEM_IMAGE: { label: "物品图片", color: "text-orange-400" },
  SHOT_FIRST_FRAME: { label: "首帧图片", color: "text-emerald-400" },
  SHOT_VIDEO: { label: "视频生成", color: "text-cyan-400" },
  SCRIPT_ANALYSIS: { label: "剧本分析", color: "text-pink-400" },
};

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

// 任务队列面板
function TasksPanel({ workflow }: { workflow: WorkflowData }) {
  const { toast } = useToast();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "processing" | "completed" | "failed">("all");
  
  // 预览状态
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewVideo, setPreviewVideo] = useState<string | null>(null);

  // 判断任务是否为视频类型
  const isVideoTask = (taskType: string) => taskType === "SHOT_VIDEO";

  // 点击结果预览
  const handlePreviewClick = (task: TaskItem) => {
    if (!task.resultUrl) return;
    if (isVideoTask(task.taskType)) {
      setPreviewVideo(task.resultUrl);
    } else {
      setPreviewImage(task.resultUrl);
    }
  };

  // 下载结果
  const handleDownload = async (task: TaskItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!task.resultUrl) return;
    
    try {
      const response = await fetch(task.resultUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ext = isVideoTask(task.taskType) ? "mp4" : "png";
      const filename = `${task.targetName || "result"}-${Date.now()}.${ext}`;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("下载失败:", error);
      // 回退到新窗口打开
      window.open(task.resultUrl, "_blank");
      toast("已在新窗口打开，请右键保存", "info");
    }
  };

  // 加载任务列表
  const loadTasks = async () => {
    try {
      setLoadError(null);
      const statusParam = activeTab === "all" ? "" : activeTab === "processing" ? "PROCESSING" : activeTab === "completed" ? "COMPLETED" : "FAILED";
      const res = await api.get(`/ai-agent/workflows/${workflow.id}/tasks`, {
        params: { status: statusParam || undefined, limit: 50 },
        // 防止后端卡住/网络挂起导致界面一直"加载中"
        timeout: 15_000,
      });
      setTasks(res.data || []);
    } catch (error) {
      console.error("加载任务列表失败", error);
      const msg = error instanceof Error ? error.message : "未知错误";
      setLoadError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, [workflow.id, activeTab]);

  // 定时刷新（当有进行中任务时）
  useEffect(() => {
    const processingTasks = tasks.filter(t => t.status === "PROCESSING");
    if (processingTasks.length > 0) {
      const interval = setInterval(loadTasks, 5000);
      return () => clearInterval(interval);
    }
  }, [tasks]);

  const processingCount = tasks.filter(t => t.status === "PROCESSING").length;
  const completedCount = tasks.filter(t => t.status === "COMPLETED").length;
  const failedCount = tasks.filter(t => t.status === "FAILED").length;

  const filteredTasks = activeTab === "all" ? tasks : tasks.filter(t => {
    if (activeTab === "processing") return t.status === "PROCESSING";
    if (activeTab === "completed") return t.status === "COMPLETED";
    if (activeTab === "failed") return t.status === "FAILED";
    return true;
  });

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="p-4 space-y-4">
      {/* 状态统计 */}
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => setActiveTab("processing")}
          className={cn(
            "p-2 rounded-lg text-center transition-colors",
            activeTab === "processing" ? "bg-amber-500/20 border border-amber-500/30" : "bg-zinc-900 hover:bg-zinc-800"
          )}
        >
          <div className="text-lg font-bold text-amber-400">{processingCount}</div>
          <div className="text-xs text-zinc-500">进行中</div>
        </button>
        <button
          onClick={() => setActiveTab("completed")}
          className={cn(
            "p-2 rounded-lg text-center transition-colors",
            activeTab === "completed" ? "bg-emerald-500/20 border border-emerald-500/30" : "bg-zinc-900 hover:bg-zinc-800"
          )}
        >
          <div className="text-lg font-bold text-emerald-400">{completedCount}</div>
          <div className="text-xs text-zinc-500">已完成</div>
        </button>
        <button
          onClick={() => setActiveTab("failed")}
          className={cn(
            "p-2 rounded-lg text-center transition-colors",
            activeTab === "failed" ? "bg-red-500/20 border border-red-500/30" : "bg-zinc-900 hover:bg-zinc-800"
          )}
        >
          <div className="text-lg font-bold text-red-400">{failedCount}</div>
          <div className="text-xs text-zinc-500">失败</div>
        </button>
      </div>

      {/* 全部按钮 */}
      <button
        onClick={() => setActiveTab("all")}
        className={cn(
          "w-full py-2 rounded-lg text-sm transition-colors",
          activeTab === "all" ? "bg-zinc-700 text-white" : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800"
        )}
      >
        查看全部任务
      </button>

      {/* 任务列表 */}
      {loading ? (
        <div className="text-center py-8">
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-zinc-500" />
        </div>
      ) : loadError ? (
        <div className="text-center py-8 text-zinc-500 space-y-3">
          <ListChecks className="w-10 h-10 mx-auto opacity-30" />
          <div>
            <p className="text-sm text-red-400">任务列表加载失败</p>
            <p className="text-xs mt-1 break-all">{loadError}</p>
          </div>
          <Button
            variant="outline"
            className="border-zinc-700"
            onClick={() => {
              setLoading(true);
              loadTasks();
            }}
          >
            重试
          </Button>
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="text-center py-8 text-zinc-500">
          <ListChecks className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">暂无任务记录</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredTasks.map(task => {
            const typeInfo = TASK_TYPE_MAP[task.taskType] || { label: task.taskType, color: "text-zinc-400" };
            
            return (
              <div 
                key={task.id} 
                className={cn(
                  "p-3 rounded-lg flex items-center gap-3",
                  task.status === "PROCESSING" && "bg-amber-500/10 border border-amber-500/20",
                  task.status === "COMPLETED" && "bg-zinc-900",
                  task.status === "FAILED" && "bg-red-500/10 border border-red-500/20"
                )}
              >
                {/* 状态图标 */}
                {task.status === "PROCESSING" && (
                  <Loader2 className="w-5 h-5 animate-spin text-amber-400 flex-shrink-0" />
                )}
                {task.status === "COMPLETED" && (
                  <Check className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                )}
                {task.status === "FAILED" && (
                  <X className="w-5 h-5 text-red-400 flex-shrink-0" />
                )}

                {/* 任务信息 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn("text-sm font-medium", typeInfo.color)}>{typeInfo.label}</span>
                    {task.model && <span className="text-xs px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-500">{task.model}</span>}
                  </div>
                  <p className="text-xs text-zinc-500 truncate">{task.targetName}</p>
                  {task.status === "FAILED" && task.errorMessage && (
                    <p className="text-xs text-red-400 truncate mt-1" title={task.errorMessage}>
                      {task.errorMessage}
                    </p>
                  )}
                </div>

                {/* 时间 */}
                <div className="text-xs text-zinc-600 flex-shrink-0">
                  {formatTime(task.createdAt)}
                </div>

                {/* 结果预览 */}
                {task.status === "COMPLETED" && task.resultUrl && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* 缩略图/视频预览 */}
                    {isVideoTask(task.taskType) ? (
                      // 视频任务：显示视频图标占位符
                      <div 
                        className="w-10 h-10 rounded overflow-hidden cursor-pointer hover:ring-2 hover:ring-cyan-500/50 transition-all bg-gradient-to-br from-cyan-900/50 to-cyan-700/30 flex items-center justify-center group"
                        onClick={() => handlePreviewClick(task)}
                        title="点击播放视频"
                      >
                        <Video className="w-5 h-5 text-cyan-400 group-hover:scale-110 transition-transform" />
                      </div>
                    ) : (
                      // 图片任务：显示缩略图
                      <div 
                        className="w-10 h-10 rounded overflow-hidden cursor-pointer hover:ring-2 hover:ring-emerald-500/50 transition-all"
                        onClick={() => handlePreviewClick(task)}
                        title="点击查看大图"
                      >
                        <img 
                          src={toThumbnailUrl(task.resultUrl)} 
                          alt="" 
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    {/* 下载按钮 */}
                    <button
                      onClick={(e) => handleDownload(task, e)}
                      className="p-1.5 rounded hover:bg-zinc-700 transition-colors text-zinc-500 hover:text-zinc-300"
                      title="下载"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 图片预览模态框 */}
      {previewImage && (
        <ImagePreviewModal
          imageUrl={previewImage}
          onClose={() => setPreviewImage(null)}
        />
      )}

      {/* 视频预览模态框 */}
      {previewVideo && (
        <VideoPreviewModal
          videoUrl={previewVideo}
          onClose={() => setPreviewVideo(null)}
        />
      )}
    </div>
  );
}

// 导出面板
// 批量操作面板
function BatchOpsPanel({
  workflow,
  characters,
  onUpdate,
  videoInferenceTemplateCode = "",
  videoInferenceTemplateType = "system",
  firstFrameInferenceTemplateCode = "",
  firstFrameInferenceTemplateType = "system",
}: {
  workflow: WorkflowData;
  characters: CharacterData[];
  onUpdate: () => void;
  videoInferenceTemplateCode?: string;
  videoInferenceTemplateType?: "system" | "user";
  firstFrameInferenceTemplateCode?: string;
  firstFrameInferenceTemplateType?: "system" | "user";
}) {
  const { toast } = useToast();

  const shots = workflow.shots || [];

  // ===== 批量推理：视频/首尾帧提示词 =====
  const [inferringVideoPrompts, setInferringVideoPrompts] = useState(false);
  const [inferringFramePrompts, setInferringFramePrompts] = useState(false);
  const inferCancelRef = useRef(false);

  const [skipExistingVideoPrompts, setSkipExistingVideoPrompts] = useState(true);
  const [skipExistingFramePrompts, setSkipExistingFramePrompts] = useState(true);
  const [videoSystemTemplates, setVideoSystemTemplates] = useState<{ templateCode: string; templateName: string }[]>([]);
  const [firstFrameSystemTemplates, setFirstFrameSystemTemplates] = useState<{ templateCode: string; templateName: string }[]>([]);
  const [videoUserTemplates, setVideoUserTemplates] = useState<{ id: number; templateName: string }[]>([]);
  const [firstFrameUserTemplates, setFirstFrameUserTemplates] = useState<{ id: number; templateName: string }[]>([]);

  const [inferProgress, setInferProgress] = useState({
    stage: "",
    current: 0,
    total: 0,
    success: 0,
    failed: 0,
  });

  useEffect(() => {
    let cancelled = false;

    const loadTemplateNames = async () => {
      try {
        const [videoSystemRes, firstFrameSystemRes, videoUserRes, firstFrameUserRes] = await Promise.all([
          api.get<{ templateCode: string; templateName: string }[]>("/ai-agent/inference-templates"),
          api.get<{ templateCode: string; templateName: string }[]>("/ai-agent/inference-templates?category=FIRST_FRAME_INFERENCE"),
          api.get<{ id: number; templateName: string }[]>("/ai-agent/user-inference-templates?category=VIDEO_INFERENCE"),
          api.get<{ id: number; templateName: string }[]>("/ai-agent/user-inference-templates?category=FIRST_FRAME_INFERENCE"),
        ]);

        if (cancelled) return;
        setVideoSystemTemplates(videoSystemRes.data || []);
        setFirstFrameSystemTemplates(firstFrameSystemRes.data || []);
        setVideoUserTemplates(videoUserRes.data || []);
        setFirstFrameUserTemplates(firstFrameUserRes.data || []);
      } catch (error) {
        console.error("加载模板名称失败:", error);
      }
    };

    loadTemplateNames();

    return () => {
      cancelled = true;
    };
  }, []);

  const resolveTemplateName = useCallback(
    (
      templateType: "system" | "user",
      selectedTemplateValue: string,
      systemTemplates: { templateCode: string; templateName: string }[],
      userTemplates: { id: number; templateName: string }[]
    ) => {
      if (!selectedTemplateValue) return "未设置";

      if (templateType === "system") {
        const matchedSystemTemplate = systemTemplates.find((template) => template.templateCode === selectedTemplateValue);
        return matchedSystemTemplate?.templateName || "系统模板";
      }

      const matchedUserTemplate = userTemplates.find((template) => String(template.id) === String(selectedTemplateValue));
      return matchedUserTemplate?.templateName || "自定义模板";
    },
    []
  );

  const currentVideoTemplateName = useMemo(
    () =>
      resolveTemplateName(
        videoInferenceTemplateType,
        videoInferenceTemplateCode,
        videoSystemTemplates,
        videoUserTemplates
      ),
    [videoInferenceTemplateType, videoInferenceTemplateCode, videoSystemTemplates, videoUserTemplates, resolveTemplateName]
  );

  const currentFirstFrameTemplateName = useMemo(
    () =>
      resolveTemplateName(
        firstFrameInferenceTemplateType,
        firstFrameInferenceTemplateCode,
        firstFrameSystemTemplates,
        firstFrameUserTemplates
      ),
    [
      firstFrameInferenceTemplateType,
      firstFrameInferenceTemplateCode,
      firstFrameSystemTemplates,
      firstFrameUserTemplates,
      resolveTemplateName,
    ]
  );

  const extractStreamingText = (payload: string): string => {
    const raw = (payload || "").trim();
    if (!raw) return "";
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "string") return parsed;
      return parsed?.videoPrompt || parsed?.content || parsed?.text || parsed?.data || "";
    } catch {
      return raw;
    }
  };

  const inferVideoPromptStream = async (shotId: number): Promise<string> => {
    const response = await apiFetch(`/ai-agent/shots/${shotId}/infer-video-prompt-stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        templateType: videoInferenceTemplateType,
        templateId: videoInferenceTemplateType === "user" ? videoInferenceTemplateCode : undefined,
        templateCode: videoInferenceTemplateType === "system" ? videoInferenceTemplateCode : undefined,
      }),
    });

    const readText = async () => {
      const t = await response.text().catch(() => "");
      return extractStreamingText(t) || t;
    };

    if (!response.ok) {
      throw new Error((await readText()) || "推理失败");
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
            const text = extractStreamingText(payload);
            if (text) accumulated += text;
          } else if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
            const text = extractStreamingText(trimmed);
            if (text) accumulated += text;
          }
        }
      }
    } else {
      rawText = await response.text().catch(() => "");
    }

    if (!accumulated.trim()) {
      const fallback = extractStreamingText(rawText);
      if (fallback) accumulated = fallback;
    }

    return accumulated;
  };

  const inferFramePrompts = async (shotId: number): Promise<{ firstPrompt: string; lastPrompt: string }> => {
    const response = await apiFetch(`/ai-agent/shots/${shotId}/infer-frame-prompts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        templateType: firstFrameInferenceTemplateType,
        templateId: firstFrameInferenceTemplateType === "user" ? firstFrameInferenceTemplateCode : undefined,
        templateCode: firstFrameInferenceTemplateType === "system" ? firstFrameInferenceTemplateCode : undefined,
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData?.error || errData?.message || "推理失败");
    }

    const data = await response.json().catch(() => ({}));
    const firstPrompt = data?.firstFramePrompt || data?.first_frame_prompt || "";
    const lastPrompt = data?.lastFramePrompt || data?.last_frame_prompt || "";
    return { firstPrompt, lastPrompt };
  };

  const handleCancelInference = () => {
    inferCancelRef.current = true;
    toast("正在取消批量推理...", "info");
  };

  const handleBatchInferVideoPrompts = async () => {
    if (!shots.length) {
      toast("暂无分镜数据", "error");
      return;
    }
    if (!videoInferenceTemplateCode) {
      toast("请先在「推理设置」选择视频提示词推理模板", "error");
      return;
    }

    const targets = skipExistingVideoPrompts
      ? shots.filter((s) => !(s.userVideoPrompt || "").trim())
      : shots;

    if (targets.length === 0) {
      toast("没有需要推理的视频提示词（已全部有值）", "info");
      return;
    }

    setInferringVideoPrompts(true);
    inferCancelRef.current = false;
    setInferProgress({ stage: "视频提示词", current: 0, total: targets.length, success: 0, failed: 0 });

    let success = 0;
    let failed = 0;

    try {
      for (let i = 0; i < targets.length; i++) {
        if (inferCancelRef.current) break;
        const shot = targets[i];
        const shotId = Number(shot.id);

        try {
          const prompt = await inferVideoPromptStream(shotId);
          if (prompt.trim()) {
            await api.put(`/ai-agent/shots/${shotId}/details`, { userVideoPrompt: prompt });
            success++;
          } else {
            failed++;
          }
        } catch (e) {
          failed++;
        }

        setInferProgress({ stage: "视频提示词", current: i + 1, total: targets.length, success, failed });
      }

      onUpdate();
      if (inferCancelRef.current) {
        toast(`已取消：成功 ${success}，失败 ${failed}`, "info");
      } else {
        toast(`视频提示词推理完成：成功 ${success}，失败 ${failed}`, success > 0 ? "success" : "error");
      }
    } finally {
      setInferringVideoPrompts(false);
    }
  };

  const handleBatchInferFramePrompts = async () => {
    if (!shots.length) {
      toast("暂无分镜数据", "error");
      return;
    }
    if (!firstFrameInferenceTemplateCode) {
      toast("请先在「推理设置」选择首尾帧提示词推理模板", "error");
      return;
    }

    const targets = skipExistingFramePrompts
      ? shots.filter((s) => {
          const hasFirst = !!(s.userFirstFramePrompt || "").trim();
          const hasLast = !!(s.lastFramePrompt || "").trim();
          return !(hasFirst && hasLast);
        })
      : shots;

    if (targets.length === 0) {
      toast("没有需要推理的首尾帧提示词（已全部有值）", "info");
      return;
    }

    setInferringFramePrompts(true);
    inferCancelRef.current = false;
    setInferProgress({ stage: "首尾帧提示词", current: 0, total: targets.length, success: 0, failed: 0 });

    let success = 0;
    let failed = 0;

    try {
      for (let i = 0; i < targets.length; i++) {
        if (inferCancelRef.current) break;
        const shot = targets[i];
        const shotId = Number(shot.id);

        try {
          const { firstPrompt, lastPrompt } = await inferFramePrompts(shotId);
          if (firstPrompt || lastPrompt) {
            await api.put(`/ai-agent/shots/${shotId}/details`, {
              ...(firstPrompt ? { userFirstFramePrompt: firstPrompt } : {}),
              ...(lastPrompt ? { lastFramePrompt: lastPrompt } : {}),
            });
            success++;
          } else {
            failed++;
          }
        } catch (e) {
          failed++;
        }

        setInferProgress({ stage: "首尾帧提示词", current: i + 1, total: targets.length, success, failed });
      }

      onUpdate();
      if (inferCancelRef.current) {
        toast(`已取消：成功 ${success}，失败 ${failed}`, "info");
      } else {
        toast(`首尾帧提示词推理完成：成功 ${success}，失败 ${failed}`, success > 0 ? "success" : "error");
      }
    } finally {
      setInferringFramePrompts(false);
    }
  };

  // 拼图生成状态
  const [puzzleGenerating, setPuzzleGenerating] = useState(false);
  const [puzzleProgress, setPuzzleProgress] = useState({ current: 0, total: 0 });
  // 拼图比例
  const [puzzleRatio, setPuzzleRatio] = useState("16:9");
  
  // 加载图片辅助函数
  const loadImage = (url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      if (!url.startsWith("blob:")) {
        img.crossOrigin = "anonymous";
      }
      img.onload = () => resolve(img);
      img.onerror = (e) => {
        console.error("图片加载失败:", url, e);
        reject(e);
      };
      img.src = url.startsWith("blob:") ? url : `/api/proxy-image?url=${encodeURIComponent(url)}`;
    });
  };

  // 智能布局：根据图片数量和画布比例计算最佳布局
  // 返回每张图片的位置和尺寸，保证图片不变形
  const calculateSmartLayout = (
    imageCount: number,
    canvasWidth: number,
    canvasHeight: number,
    spacing: number
  ): { positions: { x: number; y: number; w: number; h: number }[]; bgColor: string } => {
    const canvasRatio = canvasWidth / canvasHeight;
    const positions: { x: number; y: number; w: number; h: number }[] = [];
    
    // 16:9 画布布局策略
    if (canvasRatio > 1.5) {
      // 16:9 横向画布
      if (imageCount === 1) {
        // 单图居中
        positions.push({ x: 0, y: 0, w: canvasWidth, h: canvasHeight });
      } else if (imageCount === 2) {
        // 2张图：使用四宫格的上排位置（位置1-2），下排留空
        // 这样图片不会被拉伸得太长，避免内容被裁切
        const cellW = (canvasWidth - spacing) / 2;
        const cellH = (canvasHeight - spacing) / 2;
        positions.push({ x: 0, y: 0, w: cellW, h: cellH });
        positions.push({ x: cellW + spacing, y: 0, w: cellW, h: cellH });
      } else if (imageCount === 3) {
        // 3张图：上面2个，下面1个居中
        const cellW = (canvasWidth - spacing) / 2;
        const cellH = (canvasHeight - spacing) / 2;
        positions.push({ x: 0, y: 0, w: cellW, h: cellH });
        positions.push({ x: cellW + spacing, y: 0, w: cellW, h: cellH });
        // 下面1个居中
        positions.push({ x: (canvasWidth - cellW) / 2, y: cellH + spacing, w: cellW, h: cellH });
      } else if (imageCount === 4) {
        // 4张图：标准2×2四宫格
        const cellW = (canvasWidth - spacing) / 2;
        const cellH = (canvasHeight - spacing) / 2;
        positions.push({ x: 0, y: 0, w: cellW, h: cellH });
        positions.push({ x: cellW + spacing, y: 0, w: cellW, h: cellH });
        positions.push({ x: 0, y: cellH + spacing, w: cellW, h: cellH });
        positions.push({ x: cellW + spacing, y: cellH + spacing, w: cellW, h: cellH });
      } else if (imageCount === 5) {
        // 5张图：上面3个，下面2个居中
        const cellW = (canvasWidth - spacing * 2) / 3;
        const cellH = (canvasHeight - spacing) / 2;
        // 上面3个
        positions.push({ x: 0, y: 0, w: cellW, h: cellH });
        positions.push({ x: cellW + spacing, y: 0, w: cellW, h: cellH });
        positions.push({ x: (cellW + spacing) * 2, y: 0, w: cellW, h: cellH });
        // 下面2个居中
        const bottomStartX = (canvasWidth - (cellW * 2 + spacing)) / 2;
        positions.push({ x: bottomStartX, y: cellH + spacing, w: cellW, h: cellH });
        positions.push({ x: bottomStartX + cellW + spacing, y: cellH + spacing, w: cellW, h: cellH });
      } else if (imageCount === 6) {
        // 6张图：标准3×2
        const cellW = (canvasWidth - spacing * 2) / 3;
        const cellH = (canvasHeight - spacing) / 2;
        for (let row = 0; row < 2; row++) {
          for (let col = 0; col < 3; col++) {
            positions.push({
              x: col * (cellW + spacing),
              y: row * (cellH + spacing),
              w: cellW,
              h: cellH
            });
          }
        }
      } else if (imageCount === 7) {
        // 7张图：上面3个，中间3个，下面1个居中
        const cellW = (canvasWidth - spacing * 2) / 3;
        const cellH = (canvasHeight - spacing * 2) / 3;
        // 上面3个
        for (let col = 0; col < 3; col++) {
          positions.push({ x: col * (cellW + spacing), y: 0, w: cellW, h: cellH });
        }
        // 中间3个
        for (let col = 0; col < 3; col++) {
          positions.push({ x: col * (cellW + spacing), y: cellH + spacing, w: cellW, h: cellH });
        }
        // 下面1个居中
        positions.push({ x: (canvasWidth - cellW) / 2, y: (cellH + spacing) * 2, w: cellW, h: cellH });
      } else if (imageCount === 8) {
        // 8张图：上面3个，中间3个，下面2个居中
        const cellW = (canvasWidth - spacing * 2) / 3;
        const cellH = (canvasHeight - spacing * 2) / 3;
        // 上面3个
        for (let col = 0; col < 3; col++) {
          positions.push({ x: col * (cellW + spacing), y: 0, w: cellW, h: cellH });
        }
        // 中间3个
        for (let col = 0; col < 3; col++) {
          positions.push({ x: col * (cellW + spacing), y: cellH + spacing, w: cellW, h: cellH });
        }
        // 下面2个居中
        const bottomStartX = (canvasWidth - (cellW * 2 + spacing)) / 2;
        positions.push({ x: bottomStartX, y: (cellH + spacing) * 2, w: cellW, h: cellH });
        positions.push({ x: bottomStartX + cellW + spacing, y: (cellH + spacing) * 2, w: cellW, h: cellH });
      } else {
        // 9张及以上：标准3×3九宫格
        const cellW = (canvasWidth - spacing * 2) / 3;
        const cellH = (canvasHeight - spacing * 2) / 3;
        for (let row = 0; row < 3; row++) {
          for (let col = 0; col < 3; col++) {
            positions.push({
              x: col * (cellW + spacing),
              y: row * (cellH + spacing),
              w: cellW,
              h: cellH
            });
          }
        }
      }
    } else if (canvasRatio < 0.7) {
      // 9:16 竖向画布
      if (imageCount === 1) {
        positions.push({ x: 0, y: 0, w: canvasWidth, h: canvasHeight });
      } else if (imageCount === 2) {
        // 上下排列，每个格子是正方形
        const cellSize = canvasWidth;
        const totalHeight = cellSize * 2 + spacing;
        const startY = (canvasHeight - totalHeight) / 2;
        positions.push({ x: 0, y: startY, w: cellSize, h: cellSize });
        positions.push({ x: 0, y: startY + cellSize + spacing, w: cellSize, h: cellSize });
      } else if (imageCount === 3) {
        // 竖向3个
        const cellH = (canvasHeight - spacing * 2) / 3;
        const cellW = canvasWidth;
        for (let i = 0; i < 3; i++) {
          positions.push({ x: 0, y: i * (cellH + spacing), w: cellW, h: cellH });
        }
      } else if (imageCount === 4) {
        // 2×2
        const cellW = (canvasWidth - spacing) / 2;
        const cellH = (canvasHeight - spacing) / 2;
        positions.push({ x: 0, y: 0, w: cellW, h: cellH });
        positions.push({ x: cellW + spacing, y: 0, w: cellW, h: cellH });
        positions.push({ x: 0, y: cellH + spacing, w: cellW, h: cellH });
        positions.push({ x: cellW + spacing, y: cellH + spacing, w: cellW, h: cellH });
      } else {
        // 2×3 或更多
        const cols = 2;
        const rows = Math.ceil(imageCount / cols);
        const cellW = (canvasWidth - spacing * (cols - 1)) / cols;
        const cellH = (canvasHeight - spacing * (rows - 1)) / rows;
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            if (positions.length < imageCount) {
              positions.push({
                x: col * (cellW + spacing),
                y: row * (cellH + spacing),
                w: cellW,
                h: cellH
              });
            }
          }
        }
      }
    } else {
      // 1:1 正方形画布
      if (imageCount === 1) {
        positions.push({ x: 0, y: 0, w: canvasWidth, h: canvasHeight });
      } else if (imageCount === 2) {
        // 左右排列
        const cellW = (canvasWidth - spacing) / 2;
        positions.push({ x: 0, y: 0, w: cellW, h: canvasHeight });
        positions.push({ x: cellW + spacing, y: 0, w: cellW, h: canvasHeight });
      } else if (imageCount === 3) {
        // 上面2个，下面1个居中
        const cellW = (canvasWidth - spacing) / 2;
        const cellH = (canvasHeight - spacing) / 2;
        positions.push({ x: 0, y: 0, w: cellW, h: cellH });
        positions.push({ x: cellW + spacing, y: 0, w: cellW, h: cellH });
        positions.push({ x: (canvasWidth - cellW) / 2, y: cellH + spacing, w: cellW, h: cellH });
      } else if (imageCount === 4) {
        // 2×2
        const cellW = (canvasWidth - spacing) / 2;
        const cellH = (canvasHeight - spacing) / 2;
        positions.push({ x: 0, y: 0, w: cellW, h: cellH });
        positions.push({ x: cellW + spacing, y: 0, w: cellW, h: cellH });
        positions.push({ x: 0, y: cellH + spacing, w: cellW, h: cellH });
        positions.push({ x: cellW + spacing, y: cellH + spacing, w: cellW, h: cellH });
      } else {
        // 3×3 或更多
        const cols = 3;
        const rows = Math.ceil(imageCount / cols);
        const cellW = (canvasWidth - spacing * (cols - 1)) / cols;
        const cellH = (canvasHeight - spacing * (rows - 1)) / rows;
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            if (positions.length < imageCount) {
              positions.push({
                x: col * (cellW + spacing),
                y: row * (cellH + spacing),
                w: cellW,
                h: cellH
              });
            }
          }
        }
      }
    }
    
    return { positions, bgColor: "#ffffff" };
  };

  // 生成单个拼图
  const generatePuzzleForCharacters = async (charIds: number[]): Promise<string | null> => {
    const charImages = charIds
      .map(id => characters.find(c => c.id === id))
      .filter(c => c?.imageUrl)
      .map(c => c!.imageUrl!);
    
    if (charImages.length === 0) return null;
    
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      
      let width = 2048;
      let height = 2048;
      if (puzzleRatio === "16:9") {
        height = Math.round(width * 9 / 16);
      } else if (puzzleRatio === "9:16") {
        height = 3640;
        width = 2048;
      }
      
      canvas.width = width;
      canvas.height = height;
      
      const spacing = Math.round(10 * (width / 520));
      const { positions, bgColor } = calculateSmartLayout(charImages.length, width, height, spacing);
      
      // 填充背景
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, width, height);
      
      // 加载所有图片
      const loadedImages = await Promise.all(
        charImages.slice(0, positions.length).map(async (url, idx) => {
          try {
            const img = await loadImage(url);
            return { idx, img };
          } catch {
            return { idx, img: null };
          }
        })
      );
      
      // 绘制每张图片（等比缩放，居中裁剪）
      for (const { idx, img } of loadedImages) {
        if (!img || idx >= positions.length) continue;
        const { x, y, w, h } = positions[idx];
        
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
        
        // 计算等比缩放（cover模式，保证填满格子不留白）
        const scale = Math.max(w / img.width, h / img.height);
        const drawW = img.width * scale;
        const drawH = img.height * scale;
        const dx = x + (w - drawW) / 2;
        const dy = y + (h - drawH) / 2;
        
        ctx.drawImage(img, 0, 0, img.width, img.height, dx, dy, drawW, drawH);
        ctx.restore();
      }
      
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), "image/png", 0.9);
      });
      
      if (!blob) return null;
      
      const file = new File([blob], `char_puzzle_${Date.now()}.png`, { type: "image/png" });
      const ossUrl = await uploadToOss(file, "character-puzzle");
      
      return ossUrl;
    } catch (e) {
      console.error("生成拼图失败:", e);
      return null;
    }
  };

  // 查询分镜已有的图片槽位
  const getShotImageSlots = async (shotId: number): Promise<number[]> => {
    try {
      const res = await api.get(`/ai-agent/shots/${shotId}/media-slots`);
      const slots = res.data || [];
      // 返回已被占用的图片槽位索引
      return slots
        .filter((s: { gridType: string; imageUrl?: string }) => s.gridType === "image" && s.imageUrl)
        .map((s: { slotIndex: number }) => s.slotIndex);
    } catch {
      return [];
    }
  };

  // 一键生成所有分镜的人物拼图
  const handleGenerateCharacterPuzzles = async () => {
    const shots = workflow.shots || [];
    if (shots.length === 0) {
      toast("暂无分镜数据", "error");
      return;
    }
    
    // 检查所有角色是否都有图片
    if (characters.length === 0) {
      toast("暂无角色数据，请先提取角色", "error");
      return;
    }
    
    const charsWithoutImages = characters.filter(c => !c.imageUrl);
    if (charsWithoutImages.length > 0) {
      toast(`还有 ${charsWithoutImages.length} 个角色没有图片，请先生成所有角色图片`, "error");
      return;
    }
    
    // 筛选有角色关联的分镜
    const shotsWithChars = shots.filter(s => (s.refCharacterIds || []).length > 0);
    if (shotsWithChars.length === 0) {
      toast("没有可生成拼图的分镜（分镜需要关联角色）", "info");
      return;
    }
    
    setPuzzleGenerating(true);
    setPuzzleProgress({ current: 0, total: shotsWithChars.length });
    
    toast(`开始处理 ${shotsWithChars.length} 个分镜的拼图...`, "info");
    
    // 缓存已生成的拼图 URL（key = 角色ID排序后拼接）
    const puzzleCache = new Map<string, string>();
    
    let successCount = 0;
    let skippedCount = 0;
    
    // 并行处理（每批最多5个）
    const batchSize = 5;
    for (let i = 0; i < shotsWithChars.length; i += batchSize) {
      const batch = shotsWithChars.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (shot, batchIdx) => {
        const globalIdx = i + batchIdx + 1;
        setPuzzleProgress({ current: globalIdx, total: shotsWithChars.length });
        
        try {
          // 1. 查询该分镜已有的图片槽位
          const occupiedSlots = await getShotImageSlots(shot.id);
          
          // 2. 找空槽位（0-3）
          const emptySlot = [0, 1, 2, 3].find(idx => !occupiedSlots.includes(idx));
          if (emptySlot === undefined) {
            // 四宫格已满，跳过
            skippedCount++;
            return;
          }
          
          // 3. 生成或复用拼图
          const charIds = (shot.refCharacterIds || []).sort((a, b) => a - b);
          const cacheKey = charIds.join(",");
          
          let puzzleUrl: string | null | undefined = puzzleCache.get(cacheKey);
          if (!puzzleUrl) {
            puzzleUrl = await generatePuzzleForCharacters(charIds);
            if (puzzleUrl) {
              puzzleCache.set(cacheKey, puzzleUrl);
            }
          }
          
          if (!puzzleUrl) return;
          
          // 4. 保存到空槽位
          await api.post(`/ai-agent/shots/${shot.id}/media-slots`, {
            gridType: "image",
            slotIndex: emptySlot,
            imageUrl: puzzleUrl
          });
          
          // 5. 触发事件通知 ShotCard 刷新
          window.dispatchEvent(new CustomEvent(AI_AGENT_SHOT_IMAGE_UPDATED_EVENT, {
            detail: { shotId: shot.id }
          }));
          
          successCount++;
        } catch (e) {
          console.error(`处理分镜 ${shot.id} 失败:`, e);
        }
      }));
    }
    
    setPuzzleGenerating(false);
    setPuzzleProgress({ current: 0, total: 0 });
    
    let message = "";
    if (successCount > 0) {
      message = `成功填充 ${successCount} 个分镜的拼图`;
    }
    if (skippedCount > 0) {
      message += message ? `，${skippedCount} 个分镜四宫格已满跳过` : `${skippedCount} 个分镜四宫格已满跳过`;
    }
    
    if (successCount > 0) {
      toast(message, "success");
      onUpdate();
    } else if (skippedCount > 0) {
      toast(message, "info");
    } else {
      toast("拼图生成失败", "error");
    }
  };

  // 统计信息
  const charsWithImages = characters.filter(c => c.imageUrl).length;
  const totalChars = characters.length;
  const allCharsHaveImages = totalChars > 0 && charsWithImages === totalChars;
  const characterImageProgress = totalChars > 0 ? Math.round((charsWithImages / totalChars) * 100) : 0;

  return (
    <div className="p-5 space-y-5">
      {/* 批量推理提示词 */}
      <div className="rounded-2xl border border-zinc-700/70 bg-gradient-to-br from-zinc-900/95 via-zinc-900/90 to-slate-950/80 p-5 shadow-[0_8px_30px_rgba(0,0,0,0.25)] space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl border border-slate-400/30 bg-slate-500/15 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-slate-300" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-semibold tracking-wide text-zinc-100">批量推理提示词</h4>
            <p className="text-xs text-zinc-400">先批量生成，再按分镜统一检查和微调。</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-zinc-700/60 bg-zinc-900/60 px-3 py-2">
            <p className="text-[11px] text-zinc-500">镜头数量</p>
            <p className="mt-1 text-sm font-medium text-zinc-100">{shots.length}</p>
          </div>
          <div className="rounded-lg border border-zinc-700/60 bg-zinc-900/60 px-3 py-2">
            <p className="text-[11px] text-zinc-500">当前模板</p>
            <p className="mt-1 truncate text-[11px] text-zinc-300">
              视频：{currentVideoTemplateName}
            </p>
            <p className="truncate text-[11px] text-zinc-400">
              首尾帧：{currentFirstFrameTemplateName}
            </p>
          </div>
        </div>

        <div className="space-y-2 rounded-lg border border-zinc-700/60 bg-zinc-900/55 p-3">
          <label className="flex items-center gap-2 text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={skipExistingVideoPrompts}
              onChange={(e) => setSkipExistingVideoPrompts(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-zinc-500 bg-zinc-900 text-slate-300 focus:ring-slate-400"
            />
            跳过已有「视频提示词」
          </label>
          <label className="flex items-center gap-2 text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={skipExistingFramePrompts}
              onChange={(e) => setSkipExistingFramePrompts(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-zinc-500 bg-zinc-900 text-slate-300 focus:ring-slate-400"
            />
            跳过已有「首尾帧提示词」
          </label>
        </div>

        {inferProgress.total > 0 && (inferringVideoPrompts || inferringFramePrompts) && (
          <div className="text-xs text-zinc-300 bg-slate-500/10 border border-slate-400/20 rounded-lg px-3 py-2">
            {inferProgress.stage}：{inferProgress.current}/{inferProgress.total} · 成功 {inferProgress.success} · 失败 {inferProgress.failed}
          </div>
        )}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button
            variant="outline"
            className="border-slate-500/35 bg-slate-500/5 text-zinc-100 hover:bg-slate-500/10 hover:text-white"
            onClick={handleBatchInferVideoPrompts}
            disabled={inferringVideoPrompts || inferringFramePrompts || shots.length === 0}
          >
            {inferringVideoPrompts ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Video className="w-4 h-4 mr-2" />
            )}
            视频提示词
          </Button>

          <Button
            variant="outline"
            className="border-zinc-500/35 bg-zinc-800/45 text-zinc-100 hover:bg-zinc-700/60 hover:text-white"
            onClick={handleBatchInferFramePrompts}
            disabled={inferringVideoPrompts || inferringFramePrompts || shots.length === 0}
          >
            {inferringFramePrompts ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <ImageIcon className="w-4 h-4 mr-2" />
            )}
            首尾帧提示词
          </Button>
        </div>

        {(inferringVideoPrompts || inferringFramePrompts) && (
          <Button
            variant="outline"
            className="w-full border-zinc-600 text-zinc-200 hover:bg-zinc-800/80"
            onClick={handleCancelInference}
          >
            取消推理
          </Button>
        )}
      </div>

      {/* 一键生成人物拼图 */}
      <div className="rounded-2xl border border-zinc-700/70 bg-gradient-to-br from-zinc-900/95 via-zinc-900/90 to-stone-950/80 p-5 shadow-[0_8px_30px_rgba(0,0,0,0.25)] space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl border border-stone-400/25 bg-stone-500/15 flex items-center justify-center">
            <LayoutGrid className="w-5 h-5 text-stone-300" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-semibold tracking-wide text-zinc-100">一键生成人物拼图</h4>
            <p className="text-xs text-zinc-400">按分镜角色自动拼图并写入空闲图槽。</p>
          </div>
        </div>

        <div className="rounded-lg border border-zinc-700/60 bg-zinc-900/60 px-3 py-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400">角色图片状态</span>
            <span className={cn("text-xs font-medium", allCharsHaveImages ? "text-emerald-300" : "text-amber-300")}>
              {charsWithImages}/{totalChars} 已生成
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
            <div
              className={cn("h-full rounded-full transition-all", allCharsHaveImages ? "bg-emerald-400/80" : "bg-amber-400/80")}
              style={{ width: `${characterImageProgress}%` }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-zinc-700/60 bg-zinc-900/60 px-3 py-2.5">
          <span className="text-xs text-zinc-400">拼图比例</span>
          <div className="flex gap-1.5">
            {["16:9", "9:16", "1:1"].map((ratio) => (
              <button
                key={ratio}
                type="button"
                onClick={() => setPuzzleRatio(ratio)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-xs font-medium transition-colors border",
                  puzzleRatio === ratio
                    ? "bg-slate-600/70 border-slate-500/70 text-zinc-100"
                    : "bg-zinc-900/70 border-zinc-700/70 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                )}
              >
                {ratio}
              </button>
            ))}
          </div>
        </div>

        {!allCharsHaveImages && (
          <div className="text-xs text-amber-300/90 border border-amber-400/20 bg-amber-500/10 px-3 py-2 rounded-lg">
            请先在「角色配置」中为所有角色生成图片，再执行拼图。
          </div>
        )}

        <Button
          className="w-full border border-slate-500/60 bg-slate-700/80 text-zinc-100 hover:bg-slate-600/90 disabled:border-zinc-700 disabled:bg-zinc-800 disabled:text-zinc-500"
          onClick={handleGenerateCharacterPuzzles}
          disabled={puzzleGenerating || !allCharsHaveImages}
        >
          {puzzleGenerating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              生成中 ({puzzleProgress.current}/{puzzleProgress.total})
            </>
          ) : (
            <>
              <LayoutGrid className="w-4 h-4 mr-2" />
              一键生成人物拼图
            </>
          )}
        </Button>
      </div>

      {/* 其他批量操作占位 */}
      <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/35 py-8 text-center text-zinc-500">
        <p className="text-sm">更多批量操作功能开发中...</p>
      </div>
    </div>
  );
}

function ExportPanel({ workflow }: { workflow: WorkflowData }) {
  const { toast } = useToast();
  const shots = workflow.shots || [];
  
  // 统计数据
  const completedVideos = shots.filter(s => s.videoStatus === "COMPLETED" && s.videoUrl);
  const completedImages = shots.filter(s => s.firstFrameStatus === "COMPLETED" && s.firstFrameUrl);
  const dialogueLineCount = shots.reduce((count, shot) => {
    const dialogue = shot.dialogue?.trim();
    if (!dialogue) return count;
    const lines = dialogue
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .filter(line => !/^(null|none|nil|n\/a|na|无|暂无|没有|空|（无）|\(无\))$/i.test(line));
    return count + lines.length;
  }, 0);
  
  // 导出状态
  const [exportingVideos, setExportingVideos] = useState(false);
  const [exportingImages, setExportingImages] = useState(false);
  const [exportingDubbing, setExportingDubbing] = useState(false);
  const [exportProgress, setExportProgress] = useState({ current: 0, total: 0, type: "" });

  // 获取文件名（从URL提取或使用默认名）
  const getFileName = (url: string, index: number, prefix: string, ext: string) => {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split("/");
      const originalName = pathParts[pathParts.length - 1];
      // 如果原始文件名有效，使用它；否则用序号命名
      if (originalName && originalName.includes(".")) {
        return `${prefix}_${String(index + 1).padStart(3, "0")}_${originalName}`;
      }
    } catch {}
    return `${prefix}_${String(index + 1).padStart(3, "0")}.${ext}`;
  };

  // 下载单个文件为 Blob
  const fetchFileAsBlob = async (url: string): Promise<Blob | null> => {
    try {
      const response = await fetch(url, { mode: "cors" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.blob();
    } catch (error) {
      console.error("下载文件失败:", url, error);
      return null;
    }
  };

  // 导出所有视频
  const handleExportVideos = async () => {
    if (completedVideos.length === 0) {
      toast("没有已完成的视频可导出", "info");
      return;
    }
    
    setExportingVideos(true);
    setExportProgress({ current: 0, total: completedVideos.length, type: "视频" });
    
    try {
      const zip = new JSZip();
      const videoFolder = zip.folder("videos");
      
      for (let i = 0; i < completedVideos.length; i++) {
        const shot = completedVideos[i];
        setExportProgress({ current: i + 1, total: completedVideos.length, type: "视频" });
        
        const blob = await fetchFileAsBlob(shot.videoUrl!);
        if (blob && videoFolder) {
          const fileName = getFileName(shot.videoUrl!, shot.sortOrder - 1, "shot", "mp4");
          videoFolder.file(fileName, blob);
        }
      }
      
      // 生成并下载 ZIP
      const content = await zip.generateAsync({ type: "blob" });
      const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      saveAs(content, `storyboard_videos_${timestamp}.zip`);
      
      toast(`成功导出 ${completedVideos.length} 个视频`, "success");
    } catch (error) {
      console.error("导出视频失败:", error);
      toast("导出视频失败，请重试", "error");
    } finally {
      setExportingVideos(false);
      setExportProgress({ current: 0, total: 0, type: "" });
    }
  };

  // 导出所有首帧图片
  const handleExportImages = async () => {
    if (completedImages.length === 0) {
      toast("没有已完成的首帧图片可导出", "info");
      return;
    }
    
    setExportingImages(true);
    setExportProgress({ current: 0, total: completedImages.length, type: "图片" });
    
    try {
      const zip = new JSZip();
      const imageFolder = zip.folder("images");
      
      for (let i = 0; i < completedImages.length; i++) {
        const shot = completedImages[i];
        setExportProgress({ current: i + 1, total: completedImages.length, type: "图片" });
        
        const blob = await fetchFileAsBlob(shot.firstFrameUrl!);
        if (blob && imageFolder) {
          // 根据 blob 类型判断扩展名
          let ext = "png";
          if (blob.type.includes("jpeg") || blob.type.includes("jpg")) ext = "jpg";
          else if (blob.type.includes("webp")) ext = "webp";
          
          const fileName = getFileName(shot.firstFrameUrl!, shot.sortOrder - 1, "shot", ext);
          imageFolder.file(fileName, blob);
        }
      }
      
      // 生成并下载 ZIP
      const content = await zip.generateAsync({ type: "blob" });
      const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      saveAs(content, `storyboard_images_${timestamp}.zip`);
      
      toast(`成功导出 ${completedImages.length} 张首帧图片`, "success");
    } catch (error) {
      console.error("导出图片失败:", error);
      toast("导出图片失败，请重试", "error");
    } finally {
      setExportingImages(false);
      setExportProgress({ current: 0, total: 0, type: "" });
    }
  };

  // 导出配音文本（JSON内容，txt文件）
  const handleExportDubbing = async () => {
    if (!workflow?.id) {
      toast("工作流数据异常，请刷新后重试", "error");
      return;
    }
    if (dialogueLineCount === 0) {
      toast("没有可导出的台词内容", "info");
      return;
    }

    setExportingDubbing(true);
    setExportProgress({ current: 0, total: 1, type: "配音文本" });

    try {
      const res = await api.post(`/ai-agent/workflows/${workflow.id}/export-dubbing-script`, {
        includeVideoPromptContext: true,
      });
      const items = Array.isArray(res.data?.items) ? res.data.items : [];
      const fallbackUsed = Boolean(res.data?.fallbackUsed);

      setExportProgress({ current: 1, total: 1, type: "配音文本" });

      if (items.length === 0) {
        toast("没有可导出的配音文本", "info");
        return;
      }

      const sanitizedItems = items
        .map((item: any) => {
          const rawText = typeof item?.text === "string" ? item.text : "";
          const cleanText = rawText
            .replace(/(\([^)]*\)|（[^）]*）|\[[^\]]*\]|【[^】]*】)/g, " ")
            .replace(/["""‘’]/g, "")
            .replace(/^[\s\-—–:：]+/, "")
            .replace(/\s+/g, " ")
            .trim();
          return { ...item, text: cleanText };
        })
        .filter((item: any) => Boolean(item.text));

      if (sanitizedItems.length === 0) {
        toast("没有可导出的配音文本", "info");
        return;
      }

      // 紧凑输出，避免 emotion 向量被换行
      const content = JSON.stringify(sanitizedItems);
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      saveAs(blob, `storyboard_dubbing_${timestamp}.txt`);

      if (fallbackUsed) {
        toast(`已导出 ${sanitizedItems.length} 条配音文本（AI异常，已使用默认情绪向量）`, "info");
      } else {
        toast(`成功导出 ${sanitizedItems.length} 条配音文本`, "success");
      }
    } catch (error) {
      console.error("导出配音文本失败:", error);
      toast("导出配音文本失败，请重试", "error");
    } finally {
      setExportingDubbing(false);
      setExportProgress({ current: 0, total: 0, type: "" });
    }
  };

  const isExporting = exportingVideos || exportingImages || exportingDubbing;
  const progressPercent =
    exportProgress.total > 0
      ? Math.min(100, Math.round((exportProgress.current / exportProgress.total) * 100))
      : 0;

  return (
    <div className="p-5 space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-gradient-to-br from-zinc-900 via-zinc-900/95 to-zinc-800/70 p-4">
        <div className="absolute -top-12 -right-12 h-28 w-28 rounded-full bg-pink-500/10 blur-2xl" />
        <div className="absolute -bottom-10 -left-10 h-24 w-24 rounded-full bg-cyan-500/10 blur-2xl" />
        <div className="relative">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <Download className="w-4 h-4 text-pink-400" />
                导出中心
              </h4>
              <p className="mt-1 text-xs text-zinc-400">
                一键打包素材，或导出配音 JSON 文本
              </p>
            </div>
            <div className="shrink-0 rounded-lg border border-zinc-700/80 bg-zinc-900/60 px-2.5 py-1 text-right">
              <p className="text-[10px] text-zinc-500">镜头总数</p>
              <p className="text-sm font-semibold text-zinc-100">{shots.length}</p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-2">
              <p className="text-[10px] text-emerald-300/80">视频</p>
              <p className="text-lg font-semibold text-emerald-300">{completedVideos.length}</p>
            </div>
            <div className="rounded-lg border border-sky-500/25 bg-sky-500/10 px-2.5 py-2">
              <p className="text-[10px] text-sky-300/80">首帧</p>
              <p className="text-lg font-semibold text-sky-300">{completedImages.length}</p>
            </div>
            <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-2.5 py-2">
              <p className="text-[10px] text-amber-300/80">台词行</p>
              <p className="text-lg font-semibold text-amber-300">{dialogueLineCount}</p>
            </div>
          </div>
        </div>
      </div>

      {isExporting && exportProgress.total > 0 && (
        <div className="rounded-xl border border-pink-500/25 bg-pink-500/10 p-3.5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm text-pink-200 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5" />
              正在导出{exportProgress.type}
            </span>
            <span className="text-xs text-pink-300">
              {progressPercent}% ({exportProgress.current}/{exportProgress.total})
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-800/90">
            <div
              className="h-full bg-gradient-to-r from-pink-500 via-rose-500 to-orange-500 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      <div className="space-y-2.5">
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 p-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-zinc-100 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/20 text-emerald-300">
                  <Video className="w-3.5 h-3.5" />
                </span>
                视频 ZIP
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                打包全部已完成视频，共 {completedVideos.length} 个
              </p>
            </div>
            <Button
              className="h-10 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-lg shadow-emerald-900/20"
              onClick={handleExportVideos}
              disabled={isExporting || completedVideos.length === 0}
            >
              {exportingVideos ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  导出中
                </>
              ) : (
                "导出视频"
              )}
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 p-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-zinc-100 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-500/20 text-blue-300">
                  <ImageIcon className="w-3.5 h-3.5" />
                </span>
                首帧图片 ZIP
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                打包全部已完成首帧，共 {completedImages.length} 张
              </p>
            </div>
            <Button
              className="h-10 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 shadow-lg shadow-blue-900/20"
              onClick={handleExportImages}
              disabled={isExporting || completedImages.length === 0}
            >
              {exportingImages ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  导出中
                </>
              ) : (
                "导出图片"
              )}
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 p-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-zinc-100 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500/20 text-amber-300">
                  <FileText className="w-3.5 h-3.5" />
                </span>
                配音 JSON 文本
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                过滤无效台词，清洗纯文本，共 {dialogueLineCount} 行
              </p>
            </div>
            <Button
              className="h-10 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 shadow-lg shadow-amber-900/20"
              onClick={handleExportDubbing}
              disabled={isExporting || dialogueLineCount === 0}
            >
              {exportingDubbing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  导出中
                </>
              ) : (
                "导出文本"
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800/70 bg-zinc-900/40 p-3">
        <p className="text-xs leading-relaxed text-zinc-400">
          视频/图片会下载为 ZIP；配音文本会调用 AI 分析角色与情绪向量并导出为 `.txt`（JSON）。
        </p>
      </div>
    </div>
  );
}

// 素材库弹窗组件 - 更大尺寸，修复接口，添加项目素材库
function AssetLibraryModal({ 
  type,
  projectId,
  onSelect, 
  onClose 
}: { 
  type: "character" | "scene" | "item";
  projectId?: number;
  onSelect: (imageUrl: string) => void; 
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"upload" | "public" | "project">("upload");
  const [assets, setAssets] = useState<{ id: number; imageUrl: string; name?: string; category?: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  // 加载素材
  useEffect(() => {
    if (activeTab === "public") {
      loadPublicAssets();
    } else if (activeTab === "project" && projectId) {
      loadProjectAssets();
    }
  }, [activeTab, projectId]);

  const loadPublicAssets = async () => {
    setLoading(true);
    try {
      // 使用正确的公共素材接口
      const category = type === "character" ? "character" : type === "scene" ? "scene" : "item";
      const res = await api.get(`/public-assets?category=${category}`);
      console.log("公共素材API返回:", res.data);
      // 后端返回的是数组，直接使用
      setAssets(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error("加载公共素材失败", error);
      setAssets([]);
    } finally {
      setLoading(false);
    }
  };

  const loadProjectAssets = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const category = type === "character" ? "character" : type === "scene" ? "scene" : "item";
      const res = await api.get(`/ai-agent/projects/${projectId}/assets?category=${category}`);
      console.log("项目素材API返回:", res.data);
      // 后端返回的是 { characters: [], scenes: [], items: [] }
      const key = type === "character" ? "characters" : type === "scene" ? "scenes" : "items";
      const assetList = res.data[key] || [];
      console.log(`${key} 数据:`, assetList);
      setAssets(assetList);
    } catch (error) {
      console.error("加载项目素材失败", error);
      setAssets([]);
    } finally {
      setLoading(false);
    }
  };

  // 上传图片
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploading(true);
    try {
      const folder = type === "character" ? "ai-agent/characters" : type === "scene" ? "ai-agent/scenes" : "ai-agent/items";
      const url = await uploadToOss(file, folder);
      onSelect(url);
      toast("上传成功", "success");
    } catch (error: any) {
      toast("上传失败", "error");
    } finally {
      setUploading(false);
    }
  };

  // 获取类型对应的颜色和图标
  const getTypeConfig = () => {
    switch (type) {
      case "character":
        return { color: "purple", icon: <Users className="w-5 h-5 text-purple-400" />, title: "选择角色图片" };
      case "scene":
        return { color: "blue", icon: <MapPin className="w-5 h-5 text-blue-400" />, title: "选择场景图片" };
      case "item":
        return { color: "orange", icon: <Box className="w-5 h-5 text-orange-400" />, title: "选择物品图片" };
    }
  };
  const typeConfig = getTypeConfig();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-[720px] max-h-[85vh] bg-[#1a1a1e] rounded-2xl border border-zinc-800 shadow-2xl flex flex-col overflow-hidden">
        {/* 头部 */}
        <div className="h-16 border-b border-zinc-800 px-6 flex items-center justify-between flex-shrink-0 bg-gradient-to-r from-[#1e1e22] to-[#1a1a1e]">
          <div className="flex items-center gap-4">
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center",
              type === "character" ? "bg-purple-500/15" : type === "scene" ? "bg-blue-500/15" : "bg-orange-500/15"
            )}>
              {typeConfig.icon}
            </div>
            <div>
              <h3 className="font-semibold text-base">{typeConfig.title}</h3>
              <p className="text-xs text-zinc-500">
                上传本地图片{projectId && "、从项目素材库"}或从公共素材库选择
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2.5 hover:bg-zinc-800 rounded-xl transition-colors">
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        {/* Tab 切换 */}
        <div className="px-6 pt-5 flex gap-3">
          <button
            onClick={() => setActiveTab("upload")}
            className={cn(
              "px-5 py-2.5 rounded-xl text-sm font-medium transition-all",
              activeTab === "upload"
                ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-900/30"
                : "text-zinc-400 hover:text-white hover:bg-zinc-800"
            )}
          >
            <Upload className="w-4 h-4 inline mr-2" />
            上传图片
          </button>
          <button
            onClick={() => setActiveTab("public")}
            className={cn(
              "px-5 py-2.5 rounded-xl text-sm font-medium transition-all",
              activeTab === "public"
                ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-900/30"
                : "text-zinc-400 hover:text-white hover:bg-zinc-800"
            )}
          >
            <ImageIcon className="w-4 h-4 inline mr-2" />
            公共素材库
          </button>
          {projectId && (
            <button
              onClick={() => setActiveTab("project")}
              className={cn(
                "px-5 py-2.5 rounded-xl text-sm font-medium transition-all",
                activeTab === "project"
                  ? "bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-lg shadow-amber-900/30"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800"
              )}
            >
              <Box className="w-4 h-4 inline mr-2" />
              项目素材库
            </button>
          )}
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === "upload" ? (
            /* 上传区域 */
            <label className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-zinc-700 rounded-2xl cursor-pointer hover:border-indigo-500 hover:bg-indigo-500/5 transition-all group">
              {uploading ? (
                <div className="flex flex-col items-center">
                  <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mb-3" />
                  <span className="text-sm text-zinc-400">上传中...</span>
                </div>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-2xl bg-zinc-800 group-hover:bg-indigo-500/20 flex items-center justify-center mb-4 transition-colors">
                    <Upload className="w-8 h-8 text-zinc-500 group-hover:text-indigo-400 transition-colors" />
                  </div>
                  <span className="text-base text-zinc-300 font-medium mb-1">点击或拖拽上传图片</span>
                  <span className="text-sm text-zinc-500">支持 JPG、PNG、WebP 格式</span>
                  <span className="text-xs text-zinc-600 mt-2">建议尺寸 1024x1024 或更高</span>
                </>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={handleUpload}
                className="hidden"
                disabled={uploading}
              />
            </label>
          ) : (
            /* 素材列表 */
            loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-10 h-10 animate-spin text-zinc-500" />
              </div>
            ) : assets.length === 0 ? (
              <div className="text-center py-16 text-zinc-500">
                <ImageIcon className="w-16 h-16 mx-auto mb-4 opacity-20" />
                <p className="text-base font-medium text-zinc-400">
                  暂无{activeTab === "public" ? "公共" : "项目"}素材
                </p>
                <p className="text-sm mt-1">切换到「上传图片」添加自己的素材</p>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-4">
                {assets.map(asset => (
                  <button
                    key={asset.id}
                    onClick={() => onSelect(asset.imageUrl)}
                    className="aspect-square rounded-xl bg-zinc-800 overflow-hidden border-2 border-zinc-700/50 hover:border-emerald-500 transition-all group relative hover:scale-105 hover:shadow-xl hover:shadow-emerald-500/20"
                  >
                    <img 
                      src={toThumbnailUrl(asset.imageUrl, 200)} 
                      alt="" 
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Check className="w-8 h-8 text-emerald-400" />
                    </div>
                    {asset.name && (
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-3">
                        <p className="text-xs text-white truncate font-medium">{asset.name}</p>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )
          )}
        </div>

        {/* 底部 */}
        <div className="h-16 border-t border-zinc-800 px-6 flex items-center justify-end bg-[#161618]">
          <Button variant="outline" className="border-zinc-700 hover:bg-zinc-800" onClick={onClose}>
            取消
          </Button>
        </div>
      </div>
    </div>
  );
}
