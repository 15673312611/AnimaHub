"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { 
  ArrowLeft, 
  Image as ImageIcon, 
  Video, 
  Layers, 
  Wand2, 
  Play, 
  Settings, 
  Plus, 
  ChevronDown,
  Upload,
  Film,
  User,
  MapPin,
  Box,
  Sparkles,
  MoreHorizontal,
  Download,
  Trash2,
  RefreshCw,
  BookOpen,
  Loader2,
  X,
  Maximize2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn, toThumbnailUrl } from "@/lib/utils";
import api from "@/lib/api";
import { useToast } from "@/components/ui/toast-provider";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { handleApiError, safeAsync } from "@/lib/error-handler";
import { useProjectWebSocket } from "@/lib/useWebSocket";
import { OptimizedImage, OptimizedVideo } from "@/components/OptimizedMedia";
import { useImageModels } from "@/lib/useImageModels";
import { useVideoModels } from "@/lib/useVideoModels";

// Components
import { AssetPicker } from "./AssetPicker"; // We will create a simple inline picker or mock it
import ImageUploader from "./ImageUploader";
import AssetSelectorDialog from "./AssetSelectorDialog";
import ScriptSelectorDialog from "./ScriptSelectorDialog";

interface FragmentEditorProps {
  projectId: number;
  fragmentId: number | null; // Currently selected fragment/scene ID
  projectTitle: string;
  characters: any[];
  scenes: any[];
  props: any[];
  generatedVideos: any[]; // History of videos
  generatedImages?: any[]; // Images generated in this fragment
  onUpdate: () => void;
  onBack: () => void;
  initialRefImage?: string | null; // 从融合图库传入的参考图
  initialPrompt?: string | null; // 从融合图库传入的提示词
}

const SHOT_TYPES = [
  { id: "dialogue", label: "对话场景 (Dialogue)" },
  { id: "closeup", label: "特写 (Close-up)" },
  { id: "action", label: "简单动作 (Simple Action)" },
  { id: "interaction", label: "交互镜头 (Interaction)" },
  { id: "fight", label: "打斗场景 (Fighting)" },
  { id: "empty", label: "空镜头 (Scenery)" },
];

const RATIOS = [
  { id: "3:4", label: "3:4 竖屏" },
  { id: "9:16", label: "9:16 竖屏" },
  { id: "16:9", label: "16:9 横屏" },
  { id: "4:3", label: "4:3 横屏" },
  { id: "2.35:1", label: "2.35:1 电影" },
  { id: "1:1", label: "1:1 方形" },
];

export default function FragmentEditor({
  projectId,
  fragmentId,
  projectTitle,
  characters,
  scenes,
  props,
  generatedVideos,
  generatedImages = [],
  onUpdate,
  onBack,
  initialRefImage,
  initialPrompt
}: FragmentEditorProps) {
  const { toast } = useToast();
  const confirm = useConfirm();
  
  // -- State --
  const [shotType, setShotType] = useState("action");
  const [creationMode, setCreationMode] = useState<"image" | "video">("video");
  const [videoMode, setVideoMode] = useState<"img2vid" | "frame2frame" | "fusion">("img2vid");
  
  // Inputs
  const [prompt, setPrompt] = useState("");
  const [negPrompt, setNegPrompt] = useState("");
  const [duration, setDuration] = useState(5);
  const [ratio, setRatio] = useState("16:9");
  const [videoModel, setVideoModel] = useState<string>("");
  
  // 根据 videoMode 获取对应的视频模型列表
  const { models: videoModels, defaultModel: defaultVideoModel, loading: videoModelsLoading } = useVideoModels(videoMode);
  
  // 当视频模型列表加载完成后，设置默认模型
  useEffect(() => {
    if (!videoModelsLoading && defaultVideoModel) {
      setVideoModel(defaultVideoModel);
    }
  }, [videoModelsLoading, defaultVideoModel, videoMode]);
  
  // 处理从融合图库传入的初始值
  useEffect(() => {
    if (initialRefImage) {
      setRefImage(initialRefImage);
      setCreationMode("video");
      setVideoMode("img2vid");
      toast("已加载融合图到参考图", "success");
    }
    if (initialPrompt) {
      setPrompt(initialPrompt);
    }
  }, [initialRefImage, initialPrompt]);
  
  // AI 提示词生成
  const [aiPromptGenerating, setAiPromptGenerating] = useState(false);
  
  // Asset Selections - 支持多选
  const [selectedChars, setSelectedChars] = useState<any[]>([]);
  const [selectedScenes, setSelectedScenes] = useState<any[]>([]);
  const [selectedProps, setSelectedProps] = useState<any[]>([]);
  const [selectedEffects, setSelectedEffects] = useState<any[]>([]);
  const [refImage, setRefImage] = useState<string>(""); // For Img2Vid
  const [endImage, setEndImage] = useState<string>(""); // For Frame2Frame
  const [poseImage, setPoseImage] = useState<string>(""); // For Fusion Pose
  
  // 兼容旧代码的getter
  const selectedChar = selectedChars[0] || null;
  const selectedScene = selectedScenes[0] || null;
  const selectedProp = selectedProps[0] || null;
  const selectedEffect = selectedEffects[0] || null;
  
  // 添加素材到数组
  const addChar = (char: any) => {
    if (!selectedChars.find(c => c.id === char.id)) {
      setSelectedChars([...selectedChars, char]);
    }
  };
  const addScene = (scene: any) => {
    if (!selectedScenes.find(s => s.id === scene.id)) {
      setSelectedScenes([...selectedScenes, scene]);
    }
  };
  const addProp = (prop: any) => {
    if (!selectedProps.find(p => p.id === prop.id)) {
      setSelectedProps([...selectedProps, prop]);
    }
  };
  const addEffect = (effect: any) => {
    if (!selectedEffects.find(e => e.id === effect.id)) {
      setSelectedEffects([...selectedEffects, effect]);
    }
  };
  
  // 移除素材
  const removeChar = (id: number) => setSelectedChars(selectedChars.filter(c => c.id !== id));
  const removeScene = (id: number) => setSelectedScenes(selectedScenes.filter(s => s.id !== id));
  const removeProp = (id: number) => setSelectedProps(selectedProps.filter(p => p.id !== id));
  const removeEffect = (id: number) => setSelectedEffects(selectedEffects.filter(e => e.id !== id));
  
  // 名称
  const [videoName, setVideoName] = useState<string>("");
  const [imageName, setImageName] = useState<string>("");
  
  // Assets Picker State
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<"char" | "scene" | "prop" | "refImage" | "endImage">("char");
  
  // 使用 API 获取图片模型列表
  const { models: imageModels, defaultModel: defaultImageModel, loading: modelsLoading } = useImageModels("project");
  const [imageModel, setImageModel] = useState<string>("");
  
  // 当模型列表加载完成后，设置默认模型
  useEffect(() => {
    if (!modelsLoading && defaultImageModel && !imageModel) {
      setImageModel(defaultImageModel);
    }
  }, [modelsLoading, defaultImageModel, imageModel]);

  // Loading
  const [generating, setGenerating] = useState(false);
  
  // 通用上传对话框（角色/场景/物品/特效/姿态/参考图/尾帧）
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadTarget, setUploadTarget] = useState<"char" | "scene" | "prop" | "effect" | "pose" | "refImage" | "endImage">("char");
  const [uploadName, setUploadName] = useState("");
  const [uploadUrl, setUploadUrl] = useState("");
  
  // Right Side Gallery Filter
  const [galleryFilter, setGalleryFilter] = useState<"all" | "video" | "image">("all");
  
  // 批量下载模式
  const [selectMode, setSelectMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  
  // 图片预览
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(null);
  
  // Script Selector
  const [scriptDialogOpen, setScriptDialogOpen] = useState(false);
  
  // 剧本绑定信息（从剧本导入镜头时保存）
  const [scriptBinding, setScriptBinding] = useState<{
    scriptId: number;
    shotId: number;
    scriptTitle: string;
    shotIndex: number;
    videoPrompt: string; // motion 提示词
  } | null>(null);
  
  // 表单验证错误状态
  const [validationErrors, setValidationErrors] = useState<{
    refImage?: boolean;
    endImage?: boolean;
    prompt?: boolean;
    imageName?: boolean;
  }>({});
  
  // 滚动容器和元素的 ref
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const refImageRef = useRef<HTMLDivElement>(null);
  const endImageRef = useRef<HTMLDivElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const imageNameRef = useRef<HTMLInputElement>(null);
  
  // 清除验证错误（当用户填写内容时）
  useEffect(() => {
    if (refImage && validationErrors.refImage) {
      setValidationErrors(prev => ({ ...prev, refImage: false }));
    }
  }, [refImage]);
  
  useEffect(() => {
    if (endImage && validationErrors.endImage) {
      setValidationErrors(prev => ({ ...prev, endImage: false }));
    }
  }, [endImage]);
  
  useEffect(() => {
    if (prompt && validationErrors.prompt) {
      setValidationErrors(prev => ({ ...prev, prompt: false }));
    }
  }, [prompt]);
  
  useEffect(() => {
    if (imageName && validationErrors.imageName) {
      setValidationErrors(prev => ({ ...prev, imageName: false }));
    }
  }, [imageName]);

  // 根据图片尺寸自动选择最接近的比例
  const detectAndSetRatio = useCallback((imageUrls: string[]) => {
    if (imageUrls.length === 0) return;
    
    // 加载所有图片获取尺寸
    const loadPromises = imageUrls.map(url => {
      return new Promise<{ width: number; height: number }>((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => resolve({ width: 0, height: 0 });
        img.src = url;
      });
    });
    
    Promise.all(loadPromises).then(sizes => {
      // 找到最宽的图片
      const validSizes = sizes.filter(s => s.width > 0);
      if (validSizes.length === 0) return;
      
      const widest = validSizes.reduce((max, s) => s.width > max.width ? s : max, validSizes[0]);
      const aspectRatio = widest.width / widest.height;
      
      // 根据宽高比选择最接近的比例
      let bestRatio = "3:4"; // 默认
      const ratioValues: { [key: string]: number } = {
        "3:4": 3/4,      // 0.75
        "9:16": 9/16,    // 0.5625
        "1:1": 1,        // 1
        "4:3": 4/3,      // 1.333
        "16:9": 16/9,    // 1.778
        "2.35:1": 2.35,  // 2.35
      };
      
      let minDiff = Infinity;
      for (const [ratio, value] of Object.entries(ratioValues)) {
        const diff = Math.abs(aspectRatio - value);
        if (diff < minDiff) {
          minDiff = diff;
          bestRatio = ratio;
        }
      }
      
      setRatio(bestRatio);
      console.log(`📐 检测到图片尺寸 ${widest.width}x${widest.height}，自动设置比例为 ${bestRatio}`);
    });
  }, []);

  // AI 丰富提示词 - 根据模式区分视频/融图
  const handleAiEnhancePrompt = async () => {
    setAiPromptGenerating(true);
    try {
      if (creationMode === "video") {
        // 视频模式
        if (videoMode === "fusion") {
          // 融合生视频模式：收集所有素材图片，使用融图接口
          const imageUrls: string[] = [];
          
          // 收集所有素材图片（使用800px缩略图）
          selectedChars.forEach(char => {
            if (char.imageUrl) imageUrls.push(toThumbnailUrl(char.imageUrl, 800));
          });
          selectedScenes.forEach(scene => {
            if (scene.imageUrl) imageUrls.push(toThumbnailUrl(scene.imageUrl, 800));
          });
          selectedProps.forEach(prop => {
            if (prop.imageUrl) imageUrls.push(toThumbnailUrl(prop.imageUrl, 800));
          });
          selectedEffects.forEach(effect => {
            if (effect.imageUrl) imageUrls.push(toThumbnailUrl(effect.imageUrl, 800));
          });
          if (poseImage) {
            imageUrls.unshift(toThumbnailUrl(poseImage, 800));
          }
          
          if (!prompt.trim() && imageUrls.length === 0) {
            toast("请先输入描述或选择素材", "error");
            setAiPromptGenerating(false);
            return;
          }
          
          // 构建融合描述，包含用户填写的内容和素材名称
          let fusionDesc = prompt || "";
          selectedChars.forEach(char => {
            fusionDesc += ` 角色：${char.name}`;
          });
          selectedScenes.forEach(scene => {
            fusionDesc += ` 场景：${scene.name}`;
          });
          selectedProps.forEach(prop => {
            fusionDesc += ` 物品：${prop.name}`;
          });
          selectedEffects.forEach(effect => {
            fusionDesc += ` 特效：${effect.name}`;
          });
          
          // 使用融图接口，传递多张缩略图
          const res = await api.post("/ai/enhance-image-prompt", {
            description: fusionDesc,
            imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
            imageUrl: imageUrls[0] || undefined
          });
          if (res.data?.prompt) {
            setPrompt(res.data.prompt);
            toast("✨ 融合视频提示词已丰富", "success");
          }
        } else {
          // 图生视频/首尾帧模式：传入参考图（使用缩略图）
          const imageUrl = refImage || selectedChar?.imageUrl || selectedScene?.imageUrl || null;
          
          if (!prompt.trim() && !imageUrl) {
            toast("请先输入描述或选择参考图", "error");
            setAiPromptGenerating(false);
            return;
          }
          
          const res = await api.post("/ai/enhance-video-prompt", {
            description: prompt || "",
            imageUrl: imageUrl ? toThumbnailUrl(imageUrl, 800) : null
          });
          if (res.data?.prompt) {
            setPrompt(res.data.prompt);
            toast("✨ 视频提示词已丰富", "success");
          }
        }
      } else {
        // 在线融图模式：传入融合素材图片，使用图片生成专用接口
        const imageUrls: string[] = [];
        
        // 收集所有素材图片（使用800px缩略图）
        selectedChars.forEach(char => {
          if (char.imageUrl) imageUrls.push(toThumbnailUrl(char.imageUrl, 800));
        });
        selectedScenes.forEach(scene => {
          if (scene.imageUrl) imageUrls.push(toThumbnailUrl(scene.imageUrl, 800));
        });
        selectedProps.forEach(prop => {
          if (prop.imageUrl) imageUrls.push(toThumbnailUrl(prop.imageUrl, 800));
        });
        selectedEffects.forEach(effect => {
          if (effect.imageUrl) imageUrls.push(toThumbnailUrl(effect.imageUrl, 800));
        });
        if (poseImage) {
          imageUrls.unshift(toThumbnailUrl(poseImage, 800));
        }
        
        if (!prompt.trim() && imageUrls.length === 0) {
          toast("请先输入描述或选择素材", "error");
          setAiPromptGenerating(false);
          return;
        }
        
        // 构建融图描述，包含用户填写的内容和素材名称
        let fusionDesc = prompt || "";
        selectedChars.forEach(char => {
          fusionDesc += ` 角色：${char.name}`;
        });
        selectedScenes.forEach(scene => {
          fusionDesc += ` 场景：${scene.name}`;
        });
        selectedProps.forEach(prop => {
          fusionDesc += ` 物品：${prop.name}`;
        });
        selectedEffects.forEach(effect => {
          fusionDesc += ` 特效：${effect.name}`;
        });
        
        const res = await api.post("/ai/enhance-image-prompt", {
          description: fusionDesc,
          imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
          imageUrl: imageUrls[0] || undefined
        });
        if (res.data?.prompt) {
          setPrompt(res.data.prompt);
          toast("✨ 融图提示词已丰富", "success");
        }
      }
    } catch (err: any) {
      toast("AI服务暂时不可用，请稍后重试", "error");
    } finally {
      setAiPromptGenerating(false);
    }
  };

  // -- Handlers --

  const openPicker = (target: typeof pickerTarget) => {
    setPickerTarget(target);
    setPickerOpen(true);
  };

  const handleDeleteItem = async (item: any) => {
    if (!item?.id) return;
    const confirmed = await confirm({
      title: "确认删除",
      description: `确定要删除「${item.name || '此内容'}」吗？此操作无法撤销。`,
      confirmText: "删除",
      cancelText: "取消",
      variant: "danger"
    });
    if (!confirmed) return;
    const endpoint = item.type === 'video' ? `/assets/videos/${item.id}` : `/images/${item.id}`;
    await safeAsync(
      async () => await api.delete(endpoint),
      toast,
      {
        successMessage: "删除成功",
        errorMessage: "删除失败",
        onSuccess: () => {
          onUpdate();
        }
      }
    );
  };

  // 批量下载相关函数
  const toggleSelectMode = () => {
    setSelectMode(!selectMode);
    setSelectedItems(new Set());
  };

  const toggleSelectItem = (itemKey: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemKey)) {
      newSelected.delete(itemKey);
    } else {
      newSelected.add(itemKey);
    }
    setSelectedItems(newSelected);
  };

  const selectAll = (items: any[]) => {
    const allKeys = items
      .filter(item => item.videoUrl || item.imageUrl)
      .map(item => `${item.type}-${item.id}`);
    setSelectedItems(new Set(allKeys));
  };

  const handleBatchDownload = async (allItems: any[]) => {
    const itemsToDownload = allItems.filter(item => 
      selectedItems.has(`${item.type}-${item.id}`) && (item.videoUrl || item.imageUrl)
    );
    
    if (itemsToDownload.length === 0) {
      toast("请选择要下载的内容", "error");
      return;
    }

    toast(`开始下载 ${itemsToDownload.length} 个文件...`, "info");
    
    // 逐个下载文件
    for (const item of itemsToDownload) {
      const url = item.type === 'video' ? item.videoUrl : item.imageUrl;
      if (!url) continue;
      
      try {
        const response = await fetch(url);
        const blob = await response.blob();
        const extension = item.type === 'video' ? 'mp4' : 'png';
        const filename = `${item.name || item.type}_${item.id}.${extension}`;
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        
        // 稍微延迟，避免浏览器阻止多个下载
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (err) {
        console.error(`下载失败: ${item.name}`, err);
      }
    }
    
    toast("下载完成", "success");
    setSelectMode(false);
    setSelectedItems(new Set());
  };

  const handleAssetSelect = (asset: any) => {
    const url = asset.imageUrl || asset.videoUrl || asset.url; // Handle various asset shapes
    
    if (pickerTarget === "char") addChar(asset);
    else if (pickerTarget === "scene") addScene(asset);
    else if (pickerTarget === "prop") addProp(asset);
    else if (pickerTarget === "refImage") setRefImage(url);
    else if (pickerTarget === "endImage") setEndImage(url);
    
    setPickerOpen(false);
  };

  // 通用上传弹窗控制
  const openUpload = (target: "char" | "scene" | "prop" | "effect" | "pose" | "refImage" | "endImage") => {
    setUploadTarget(target);
    setUploadName("");
    setUploadUrl("");
    setUploadOpen(true);
  };

  const handleAssetSelectorSelect = (asset: any) => {
    const url = asset.imageUrl || asset.videoUrl || asset.url;
    
    if (uploadTarget === "pose") {
      setPoseImage(url);
    } else if (uploadTarget === "refImage") {
      setRefImage(url);
    } else if (uploadTarget === "endImage") {
      setEndImage(url);
    } else if (uploadTarget === "char") {
      addChar(asset);
    } else if (uploadTarget === "scene") {
      addScene(asset);
    } else if (uploadTarget === "prop") {
      addProp(asset);
    } else if (uploadTarget === "effect") {
      addEffect(asset);
    }
    
    // 如果有图片URL，自动检测尺寸并设置比例
    if (url && (uploadTarget === "char" || uploadTarget === "scene" || uploadTarget === "prop" || uploadTarget === "effect" || uploadTarget === "pose")) {
      detectAndSetRatio([url]);
    }
  };
  
  const handleScriptShotSelect = (shot: any, characters: any[], scenes: any[], scriptInfo?: { scriptId: number; scriptTitle: string; shotIndex: number }) => {
    // 根据镜头模式构建完整的提示词
    const isImg2Video = shot.mode === "img2video";
    const isRef2Video = shot.mode === "ref2video" || shot.mode === "multi2video";
    let fullPrompt = "";
    
    if (isImg2Video) {
      // img2video 模式：需要先生成图片，切换到"在线融图"模式
      // 使用 startFrame 作为图片生成提示词
      // ⚠️ 第一帧绘画提示词不能包含对白，对白只能在视频运动提示词(motion)中
      fullPrompt = shot.startFrame || "";
      
      // 切换到在线融图模式
      setCreationMode("image");
      
    } else {
      // ref2video/multi2video 模式：直接使用 prompt，切换到视频生成模式
      fullPrompt = shot.prompt || "";
      
      // 切换到视频生成 - 融合模式
      setCreationMode("video");
      setVideoMode("fusion");
      
      // 只有视频模式才添加对白（对白在镜头语言/视频运动提示词中）
      if (shot.dialogue) {
        fullPrompt += `\n对白: "${shot.dialogue}"`;
      }
    }
    
    setPrompt(fullPrompt);
    
    // 保存剧本绑定信息（用于后续生成图片时绑定）
    if (scriptInfo) {
      setScriptBinding({
        scriptId: scriptInfo.scriptId,
        shotId: shot.id,
        scriptTitle: scriptInfo.scriptTitle,
        shotIndex: scriptInfo.shotIndex,
        videoPrompt: shot.motion || "" // 保存 motion 作为视频提示词
      });
      // 自动设置图片名称
      setImageName(`剧本《${scriptInfo.scriptTitle}》镜头${scriptInfo.shotIndex}`);
    }
    
    // 收集所有有图片的人物素材
    const charsWithImage = characters.filter(char => char.imageUrl);
    // 收集所有有图片的场景素材
    const scenesWithImage = scenes.filter(scene => scene.imageUrl);
    
    // 一次性设置所有素材（避免闭包问题）
    setSelectedChars(charsWithImage);
    setSelectedScenes(scenesWithImage);
    setSelectedProps([]);
    setSelectedEffects([]);
    
    // 收集所有图片URL，自动检测尺寸并设置比例
    const allImageUrls = [
      ...charsWithImage.map(c => c.imageUrl),
      ...scenesWithImage.map(s => s.imageUrl)
    ].filter(Boolean);
    if (allImageUrls.length > 0) {
      detectAndSetRatio(allImageUrls);
    }
    
    if (isImg2Video) {
      toast("已加载镜头到「在线融图」，请先生成第一帧图片", "success");
    } else {
      toast("已加载镜头到「融合生视频」", "success");
    }
  };

  const handleGenerate = async () => {
    // 清除之前的验证错误
    setValidationErrors({});
    
    // 验证必填项
    const errors: typeof validationErrors = {};
    let firstErrorRef: React.RefObject<HTMLElement | null> | null = null;
    
    if (creationMode === "video") {
      if (videoMode === "img2vid" && !refImage) {
        errors.refImage = true;
        if (!firstErrorRef) firstErrorRef = refImageRef;
      } else if (videoMode === "frame2frame") {
        if (!refImage) {
          errors.refImage = true;
          if (!firstErrorRef) firstErrorRef = refImageRef;
        }
        if (!endImage) {
          errors.endImage = true;
          if (!firstErrorRef) firstErrorRef = endImageRef;
        }
      }
    } else {
      // 在线融图模式需要图片名称和提示词
      if (!imageName.trim()) {
        errors.imageName = true;
        if (!firstErrorRef) firstErrorRef = imageNameRef;
      }
      if (!prompt.trim()) {
        errors.prompt = true;
        if (!firstErrorRef) firstErrorRef = promptRef;
      }
    }
    
    // 如果有验证错误
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      
      // 滚动到第一个错误位置
      if (firstErrorRef?.current && scrollContainerRef.current) {
        const container = scrollContainerRef.current;
        const element = firstErrorRef.current;
        const containerRect = container.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();
        
        // 检查元素是否在可视区域内
        const isVisible = elementRect.top >= containerRect.top && elementRect.bottom <= containerRect.bottom;
        
        if (!isVisible) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        
        // 聚焦到元素（如果是输入框）
        if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
          element.focus();
        }
      }
      
      toast("请填写必填项", "error");
      return;
    }
    
    setGenerating(true);
    
    const result = await safeAsync(
      async () => {
        if (creationMode === "video") {
          // Construct payload based on videoMode
          let payload: any = {
             projectId,
             parentId: fragmentId,
             name: (videoName && videoName.trim()) ? videoName.trim() : `${SHOT_TYPES.find(t=>t.id===shotType)?.label} - ${new Date().toLocaleTimeString()}`,
             description: prompt,
             generationModel: videoModel,
             duration,
             width: ratio === "9:16" ? 1080 : (ratio === "16:9" ? 1920 : 1080),
             height: ratio === "9:16" ? 1920 : (ratio === "16:9" ? 1080 : 1080),
          };

          if (videoMode === "img2vid") {
             if (!refImage) throw new Error("请上传或选择参考图片");
             payload.startImageUrl = refImage;
             payload.prompt = prompt;
          } else if (videoMode === "frame2frame") {
             if (!refImage || !endImage) throw new Error("请上传首尾帧图片");
             payload.startImageUrl = refImage;
             payload.endImageUrl = endImage;
             payload.prompt = prompt;
          } else if (videoMode === "fusion") {
             // 融合生视频模式 - 收集所有素材图片URL
             // 后端会自动检测融合模式：有componentImages但没有startImageUrl
             const componentImages: string[] = [];
             
             // 添加所有角色图片
             selectedChars.forEach(char => {
               if (char.imageUrl) componentImages.push(char.imageUrl);
             });
             // 添加所有场景图片
             selectedScenes.forEach(scene => {
               if (scene.imageUrl) componentImages.push(scene.imageUrl);
             });
             // 添加所有物品图片
             selectedProps.forEach(prop => {
               if (prop.imageUrl) componentImages.push(prop.imageUrl);
             });
             // 添加所有特效图片
             selectedEffects.forEach(effect => {
               if (effect.imageUrl) componentImages.push(effect.imageUrl);
             });
             // 姿态图优先级最高，放在最前面
             if (poseImage) {
               componentImages.unshift(poseImage);
             }
             
             if (componentImages.length === 0) {
               throw new Error("融合模式需要至少选择一个素材");
             }
             
             // 构建融合提示词
             let fusionPrompt = prompt;
             selectedChars.forEach(char => {
               fusionPrompt += ` Character: ${char.name}`;
             });
             selectedScenes.forEach(scene => {
               fusionPrompt += ` Scene: ${scene.name}`;
             });
             selectedProps.forEach(prop => {
               fusionPrompt += ` Prop: ${prop.name}`;
             });
             selectedEffects.forEach(effect => {
               fusionPrompt += ` Effect: ${effect.name}`;
             });
             
             // 质量参数由后端智能添加，前端只传原始提示词
             payload.prompt = fusionPrompt;
             payload.ratio = ratio;
             // 不传 startImageUrl，让后端检测为融合模式
             // 后端会：1.AI分析生成首帧提示词 2.豆包生成首帧图片 3.图片完成后自动生成视频
             payload.componentImages = componentImages;
          }

          return await api.post(`/projects/${projectId}/videos`, payload);
        } else {
          // 在线融图模式 - 收集所有素材图片URL
          const referenceImages: string[] = [];
          
          // 添加所有角色图片
          selectedChars.forEach(char => {
            if (char.imageUrl) referenceImages.push(char.imageUrl);
          });
          // 添加所有场景图片
          selectedScenes.forEach(scene => {
            if (scene.imageUrl) referenceImages.push(scene.imageUrl);
          });
          // 添加所有物品图片
          selectedProps.forEach(prop => {
            if (prop.imageUrl) referenceImages.push(prop.imageUrl);
          });
          // 添加所有特效图片
          selectedEffects.forEach(effect => {
            if (effect.imageUrl) referenceImages.push(effect.imageUrl);
          });
          // 姿态图优先级最高，放在最前面
          if (poseImage) {
            referenceImages.unshift(poseImage);
          }
          
          // 构建融合提示词
          let fusionPrompt = prompt;
          selectedChars.forEach(char => {
            fusionPrompt += ` Character: ${char.name}`;
          });
          selectedScenes.forEach(scene => {
            fusionPrompt += ` Scene: ${scene.name}`;
          });
          selectedProps.forEach(prop => {
            fusionPrompt += ` Prop: ${prop.name}`;
          });
          selectedEffects.forEach(effect => {
            fusionPrompt += ` Effect: ${effect.name}`;
          });
          
          // 质量参数由后端智能添加，前端只传原始提示词
          const imgPayload: any = {
            projectId,
            name: (imageName && imageName.trim()) ? imageName.trim() : `融合图 - ${new Date().toLocaleTimeString()}`,
            prompt: fusionPrompt,
            model: imageModel,
            ratio,
            videoId: fragmentId,
            // 传递所有参考图片
            referenceImages: referenceImages,
            // 兼容旧接口，传第一张作为主参考图
            referenceImage: referenceImages[0] || null
          };
          
          // 如果有剧本绑定信息，询问用户是否绑定
          if (scriptBinding) {
            const shouldBind = await confirm({
              title: "绑定剧本镜头",
              description: `是否将此图片绑定到剧本《${scriptBinding.scriptTitle}》镜头 ${scriptBinding.shotIndex}？\n\n绑定后，图片将携带视频运动提示词，方便后续一键导入图生视频。`,
              confirmText: "绑定",
              cancelText: "不绑定",
              variant: "info"
            });
            
            if (shouldBind) {
              imgPayload.scriptId = scriptBinding.scriptId;
              imgPayload.shotId = scriptBinding.shotId;
              imgPayload.scriptTitle = scriptBinding.scriptTitle;
              imgPayload.shotIndex = scriptBinding.shotIndex;
              imgPayload.videoPrompt = scriptBinding.videoPrompt;
            }
          }
          
          return await api.post(`/projects/${projectId}/images`, imgPayload);
        }
      },
      toast,
      {
        successMessage: creationMode === 'video' ? "🎬 视频生成任务已提交，正在处理中..." : "🖼️ 图片生成任务已提交，正在处理中...",
        errorMessage: undefined,
        onSuccess: () => {
          onUpdate();
        }
      }
    );
    
    setGenerating(false);
  };
  
  // WebSocket 消息处理
  const handleWebSocketMessage = useCallback((message: any) => {
    if (message.type === 'VIDEO_STATUS_UPDATE') {
      console.log('📥 收到视频状态更新:', message);
      
      // 只在完成或失败时刷新数据和显示通知
      if (message.status === 'COMPLETED') {
        onUpdate();
        toast("🎉 视频生成完成！", "success");
      } else if (message.status === 'FAILED') {
        onUpdate();
        toast(`❌ 视频生成失败: ${message.errorMessage || '未知错误'}`, "error");
      }
      // GENERATING 状态不刷新，避免重复请求
    } else if (message.type === 'IMAGE_STATUS_UPDATE') {
      console.log('📥 收到图片状态更新:', message);
      
      // 只在完成或失败时刷新数据和显示通知
      if (message.status === 'COMPLETED') {
        onUpdate();
        toast("🎉 图片生成完成！", "success");
      } else if (message.status === 'FAILED') {
        onUpdate();
        toast(`❌ 图片生成失败: ${message.errorMessage || '未知错误'}`, "error");
      }
      // GENERATING 状态不刷新也不提示，避免重复
    }
  }, [onUpdate, toast]);
  
  // 订阅 WebSocket
  useProjectWebSocket(projectId, handleWebSocketMessage);

  return (
    <div className="flex flex-col h-[calc(100vh-73px)] bg-[#09090b] text-zinc-100 font-sans overflow-hidden">
      {/* 1. Top Breadcrumb Nav */}
      <div className="h-10 border-b border-white/5 bg-zinc-950/50 flex items-center px-4 shrink-0 gap-3 z-30">
        <Button variant="ghost" size="icon" onClick={onBack} className="h-7 w-7 text-zinc-400 hover:text-white hover:bg-white/10">
           <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2 text-xs">
           <span className="text-zinc-500">当前项目</span>
           <span className="text-zinc-700">/</span>
           <span className="text-zinc-200 font-medium">{projectTitle}</span>
        </div>
      </div>

      {/* 2. Toolbar (Shot Type & Agent) */}
      <header className="h-14 border-b border-white/10 flex items-center justify-between px-6 bg-[#09090b] shrink-0 z-20">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
             <span className="text-sm text-purple-400 font-medium flex items-center gap-2">
               <Film className="h-4 w-4" />
               镜头类型
             </span>
             <select 
               className="bg-zinc-900 border border-white/10 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-purple-500 transition-colors"
               value={shotType}
               onChange={(e) => setShotType(e.target.value)}
             >
               {SHOT_TYPES.map(t => (
                 <option key={t.id} value={t.id}>{t.label}</option>
               ))}
             </select>
          </div>
        </div>

        <div className="flex items-center gap-4">
           {/* AI Agent 入口按钮 */}
           <button
             onClick={() => {
               if (fragmentId) {
                 window.location.href = `/anime-project/${projectId}/fragment/${fragmentId}/ai-agent`;
               } else {
                 toast("请先选择一个片段", "error");
               }
             }}
             className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 rounded-full px-4 py-1.5 text-xs font-bold text-white shadow-lg shadow-purple-900/20 transition-all hover:shadow-purple-900/40 cursor-pointer flex items-center gap-2"
           >
             <Sparkles className="h-3 w-3" />
             AI Agent 在线
           </button>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* LEFT PANEL: Creation Tools */}
        <div className="w-[500px] min-w-[500px] border-r border-white/10 flex flex-col bg-black/40 backdrop-blur-sm">
          {/* Scrollable Content Area */}
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {/* 剧本导入按钮 - 最顶部 */}
            <div className="p-5 pb-3">
              <button
                onClick={() => setScriptDialogOpen(true)}
                className="w-full py-3 px-4 bg-gradient-to-r from-amber-500/20 to-orange-500/20 hover:from-amber-500/30 hover:to-orange-500/30 border border-amber-500/30 hover:border-amber-500/50 rounded-xl flex items-center justify-center gap-2 text-amber-400 hover:text-amber-300 transition-all group"
              >
                <BookOpen className="h-4 w-4" />
                <span className="text-sm font-medium">从剧本导入镜头</span>
                {scriptBinding && (
                  <span className="ml-2 px-2 py-0.5 bg-amber-500/30 rounded text-[10px]">
                    已选: 镜头{scriptBinding.shotIndex}
                  </span>
                )}
              </button>
            </div>
            
            {/* Mode Switcher */}
            <div className="px-5 pb-0">
               <div className="bg-zinc-900/80 p-1.5 rounded-xl flex mb-6 border border-white/5">
                  <button 
                    onClick={() => setCreationMode("video")}
                    className={cn(
                      "flex-1 py-2.5 text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition-all",
                      creationMode === "video" ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md" : "text-zinc-400 hover:text-white hover:bg-white/5"
                    )}
                  >
                    <Video className="h-4 w-4" />
                    视频生成
                  </button>
                  <button 
                    onClick={() => setCreationMode("image")}
                    className={cn(
                      "flex-1 py-2.5 text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition-all",
                      creationMode === "image" ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md" : "text-zinc-400 hover:text-white hover:bg-white/5"
                    )}
                  >
                    <ImageIcon className="h-4 w-4" />
                    在线融图
                  </button>
               </div>
            </div>

            <div className="px-5 space-y-6 pb-24">
             {/* Dynamic Content based on Mode */}
             
             {creationMode === "video" && (
               <div className="space-y-5 animate-in slide-in-from-left-4 duration-300">
                  {/* Video Sub-Modes */}
                  <Tabs value={videoMode} onValueChange={(v: any) => setVideoMode(v)} className="w-full">
                    <TabsList className="w-full bg-zinc-900 border border-white/10 h-11 p-1 rounded-xl">
                      <TabsTrigger value="img2vid" className="flex-1 text-xs data-[state=active]:bg-zinc-700 rounded-lg">图生视频</TabsTrigger>
                      <TabsTrigger value="frame2frame" className="flex-1 text-xs data-[state=active]:bg-zinc-700 rounded-lg">首尾帧</TabsTrigger>
                      <TabsTrigger value="fusion" className="flex-1 text-xs data-[state=active]:bg-zinc-700 rounded-lg">融合生视频</TabsTrigger>
                    </TabsList>
                  </Tabs>

                  {/* Mode Specific Inputs */}
                  <div className="space-y-4">
                    {/* Img2Vid Input */}
                    {videoMode === "img2vid" && (
                      <div className="space-y-3">
                         <Label className="text-xs text-zinc-400 font-medium">
                           参考图片 <span className="text-red-500">*</span>
                         </Label>
                         <div 
                           ref={refImageRef}
                           className={cn(
                             "aspect-[16/10] bg-zinc-900/80 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-purple-500 hover:bg-purple-500/5 transition-all group relative overflow-hidden",
                             validationErrors.refImage 
                               ? "border-red-500 bg-red-500/5 animate-pulse" 
                               : "border-white/20"
                           )}
                           onClick={() => openUpload("refImage")}
                         >
                            {refImage ? (
                              <>
                                <img src={refImage} className="w-full h-full object-contain bg-black/50" />
                                <button
                                  onClick={(e) => { e.stopPropagation(); setRefImage(""); }}
                                  className="absolute top-2 right-2 w-6 h-6 bg-black/70 hover:bg-red-500/80 rounded-full flex items-center justify-center transition-colors z-10"
                                  title="清除参考图"
                                >
                                  <X className="h-3.5 w-3.5 text-white" />
                                </button>
                              </>
                            ) : (
                              <>
                                <Upload className={cn(
                                  "h-10 w-10 transition-colors mb-3",
                                  validationErrors.refImage ? "text-red-400" : "text-zinc-600 group-hover:text-purple-400"
                                )} />
                                <span className={cn(
                                  "text-sm",
                                  validationErrors.refImage ? "text-red-400" : "text-zinc-500"
                                )}>
                                  {validationErrors.refImage ? "请上传参考图片" : "点击选择或上传参考图"}
                                </span>
                                <span className="text-xs text-zinc-600 mt-1">支持从素材库选择</span>
                              </>
                            )}
                         </div>
                      </div>
                    )}

                    {/* Frame2Frame Inputs */}
                    {videoMode === "frame2frame" && (
                       <div className="space-y-3">
                          <Label className="text-xs text-zinc-400 font-medium">
                            首尾帧图片 <span className="text-red-500">*</span>
                          </Label>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <span className={cn(
                                "text-[11px]",
                                validationErrors.refImage ? "text-red-400" : "text-zinc-500"
                              )}>
                                首帧 {validationErrors.refImage && "(必填)"}
                              </span>
                              <div 
                                 ref={refImageRef}
                                 className={cn(
                                   "aspect-square bg-zinc-900/80 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-purple-500 relative overflow-hidden transition-all",
                                   validationErrors.refImage 
                                     ? "border-red-500 bg-red-500/5 animate-pulse" 
                                     : "border-white/20"
                                 )}
                                 onClick={() => openUpload("refImage")}
                               >
                                  {refImage ? (
                                    <>
                                      <img src={refImage} className="w-full h-full object-contain bg-black/50" />
                                      <button
                                        onClick={(e) => { e.stopPropagation(); setRefImage(""); }}
                                        className="absolute top-1.5 right-1.5 w-5 h-5 bg-black/70 hover:bg-red-500/80 rounded-full flex items-center justify-center transition-colors z-10"
                                        title="清除首帧"
                                      >
                                        <X className="h-3 w-3 text-white" />
                                      </button>
                                    </>
                                  ) : (
                                    <Plus className={cn(
                                      "h-8 w-8",
                                      validationErrors.refImage ? "text-red-400" : "text-zinc-600"
                                    )} />
                                  )}
                               </div>
                            </div>
                            <div className="space-y-2">
                              <span className={cn(
                                "text-[11px]",
                                validationErrors.endImage ? "text-red-400" : "text-zinc-500"
                              )}>
                                尾帧 {validationErrors.endImage && "(必填)"}
                              </span>
                              <div 
                                 ref={endImageRef}
                                 className={cn(
                                   "aspect-square bg-zinc-900/80 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-purple-500 relative overflow-hidden transition-all",
                                   validationErrors.endImage 
                                     ? "border-red-500 bg-red-500/5 animate-pulse" 
                                     : "border-white/20"
                                 )}
                                 onClick={() => openUpload("endImage")}
                               >
                                  {endImage ? (
                                    <>
                                      <img src={endImage} className="w-full h-full object-contain bg-black/50" />
                                      <button
                                        onClick={(e) => { e.stopPropagation(); setEndImage(""); }}
                                        className="absolute top-1.5 right-1.5 w-5 h-5 bg-black/70 hover:bg-red-500/80 rounded-full flex items-center justify-center transition-colors z-10"
                                        title="清除尾帧"
                                      >
                                        <X className="h-3 w-3 text-white" />
                                      </button>
                                    </>
                                  ) : (
                                    <Plus className={cn(
                                      "h-8 w-8",
                                      validationErrors.endImage ? "text-red-400" : "text-zinc-600"
                                    )} />
                                  )}
                               </div>
                            </div>
                          </div>
                       </div>
                    )}

                    {/* Fusion Inputs - 与在线融图样式一致 */}
                    {videoMode === "fusion" && (
                      <div className="space-y-3">
                        {/* 标题和统计 */}
                        <div className="flex items-center justify-between">
                          <Label className="text-xs text-zinc-400 font-medium flex items-center gap-2">
                            <Layers className="w-4 h-4 text-purple-400" />
                            融合素材（可添加多个）
                          </Label>
                          <span className="text-[10px] text-zinc-500">
                            已选 {selectedChars.length + selectedScenes.length + selectedProps.length + selectedEffects.length}/7
                          </span>
                        </div>
                        
                        {/* 角色行 */}
                        <div className="flex items-start gap-3 p-3 bg-zinc-900/60 rounded-xl border border-zinc-800 min-h-[120px]">
                          <button
                            onClick={() => {
                              const total = selectedChars.length + selectedScenes.length + selectedProps.length + selectedEffects.length;
                              if (total >= 7) {
                                toast("最多只能添加7张素材图片", "error");
                                return;
                              }
                              openUpload("char");
                            }}
                            className="flex flex-col items-center justify-center w-20 h-20 bg-purple-500/10 border-2 border-dashed border-purple-500/40 rounded-xl text-purple-400 hover:bg-purple-500/20 hover:border-purple-500/60 transition-all shrink-0"
                          >
                            <User className="h-5 w-5 mb-1" />
                            <span className="text-[10px]">角色</span>
                            <Plus className="h-3 w-3 mt-0.5" />
                          </button>
                          <div className="flex-1 min-w-0 overflow-hidden">
                            <div className="flex flex-wrap gap-2 items-start content-start">
                              {selectedChars.length === 0 ? (
                                <span className="text-[11px] text-zinc-600 h-20 flex items-center">点击左侧添加角色</span>
                              ) : (
                                selectedChars.map((char) => (
                                  <div key={`char-${char.id}`} className="relative group" style={{ width: 76, flexShrink: 0 }}>
                                    <div className="rounded-xl overflow-hidden border-2 border-purple-500/50 bg-purple-500/10 shadow-lg shadow-purple-500/10" style={{ width: 76, height: 76 }}>
                                      {char.imageUrl ? (
                                        <img src={toThumbnailUrl(char.imageUrl, 200)} style={{ width: 76, height: 76, objectFit: 'cover' }} />
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                          <User className="h-6 w-6 text-purple-400" />
                                        </div>
                                      )}
                                    </div>
                                    <p className="text-[10px] text-purple-300 text-center mt-1.5 truncate" style={{ width: 76 }}>{char.name}</p>
                                    <button 
                                      onClick={() => removeChar(char.id)} 
                                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-zinc-800 hover:bg-purple-500 border border-zinc-600 hover:border-purple-400 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-md"
                                    >
                                      <X className="h-3 w-3 text-zinc-400 group-hover:text-white" />
                                    </button>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        </div>

                        {/* 场景行 */}
                        <div className="flex items-start gap-3 p-3 bg-zinc-900/60 rounded-xl border border-zinc-800 min-h-[120px]">
                          <button
                            onClick={() => {
                              const total = selectedChars.length + selectedScenes.length + selectedProps.length + selectedEffects.length;
                              if (total >= 7) {
                                toast("最多只能添加7张素材图片", "error");
                                return;
                              }
                              openUpload("scene");
                            }}
                            className="flex flex-col items-center justify-center w-20 h-20 bg-blue-500/10 border-2 border-dashed border-blue-500/40 rounded-xl text-blue-400 hover:bg-blue-500/20 hover:border-blue-500/60 transition-all shrink-0"
                          >
                            <MapPin className="h-5 w-5 mb-1" />
                            <span className="text-[10px]">场景</span>
                            <Plus className="h-3 w-3 mt-0.5" />
                          </button>
                          <div className="flex-1 min-w-0 overflow-hidden">
                            <div className="flex flex-wrap gap-2 items-start content-start">
                              {selectedScenes.length === 0 ? (
                                <span className="text-[11px] text-zinc-600 h-20 flex items-center">点击左侧添加场景</span>
                              ) : (
                                selectedScenes.map((scene) => (
                                  <div key={`scene-${scene.id}`} className="relative group" style={{ width: 76, flexShrink: 0 }}>
                                    <div className="rounded-xl overflow-hidden border-2 border-blue-500/50 bg-blue-500/10 shadow-lg shadow-blue-500/10" style={{ width: 76, height: 76 }}>
                                      {scene.imageUrl ? (
                                        <img src={toThumbnailUrl(scene.imageUrl, 200)} style={{ width: 76, height: 76, objectFit: 'cover' }} />
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                          <MapPin className="h-6 w-6 text-blue-400" />
                                        </div>
                                      )}
                                    </div>
                                    <p className="text-[10px] text-blue-300 text-center mt-1.5 truncate" style={{ width: 76 }}>{scene.name}</p>
                                    <button 
                                      onClick={() => removeScene(scene.id)} 
                                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-zinc-800 hover:bg-blue-500 border border-zinc-600 hover:border-blue-400 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-md"
                                    >
                                      <X className="h-3 w-3 text-zinc-400 group-hover:text-white" />
                                    </button>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        </div>

                        {/* 物品行 */}
                        <div className="flex items-start gap-3 p-3 bg-zinc-900/60 rounded-xl border border-zinc-800 min-h-[120px]">
                          <button
                            onClick={() => {
                              const total = selectedChars.length + selectedScenes.length + selectedProps.length + selectedEffects.length;
                              if (total >= 7) {
                                toast("最多只能添加7张素材图片", "error");
                                return;
                              }
                              openUpload("prop");
                            }}
                            className="flex flex-col items-center justify-center w-20 h-20 bg-amber-500/10 border-2 border-dashed border-amber-500/40 rounded-xl text-amber-400 hover:bg-amber-500/20 hover:border-amber-500/60 transition-all shrink-0"
                          >
                            <Box className="h-5 w-5 mb-1" />
                            <span className="text-[10px]">物品</span>
                            <Plus className="h-3 w-3 mt-0.5" />
                          </button>
                          <div className="flex-1 min-w-0 overflow-hidden">
                            <div className="flex flex-wrap gap-2 items-start content-start">
                              {selectedProps.length === 0 ? (
                                <span className="text-[11px] text-zinc-600 h-20 flex items-center">点击左侧添加物品</span>
                              ) : (
                                selectedProps.map((prop) => (
                                  <div key={`prop-${prop.id}`} className="relative group" style={{ width: 76, flexShrink: 0 }}>
                                    <div className="rounded-xl overflow-hidden border-2 border-amber-500/50 bg-amber-500/10 shadow-lg shadow-amber-500/10" style={{ width: 76, height: 76 }}>
                                      {prop.imageUrl ? (
                                        <img src={toThumbnailUrl(prop.imageUrl, 200)} style={{ width: 76, height: 76, objectFit: 'cover' }} />
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                          <Box className="h-6 w-6 text-amber-400" />
                                        </div>
                                      )}
                                    </div>
                                    <p className="text-[10px] text-amber-300 text-center mt-1.5 truncate" style={{ width: 76 }}>{prop.name}</p>
                                    <button 
                                      onClick={() => removeProp(prop.id)} 
                                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-zinc-800 hover:bg-amber-500 border border-zinc-600 hover:border-amber-400 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-md"
                                    >
                                      <X className="h-3 w-3 text-zinc-400 group-hover:text-white" />
                                    </button>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        </div>

                        {/* 特效行 */}
                        <div className="flex items-start gap-3 p-3 bg-zinc-900/60 rounded-xl border border-zinc-800 min-h-[120px]">
                          <button
                            onClick={() => {
                              const total = selectedChars.length + selectedScenes.length + selectedProps.length + selectedEffects.length;
                              if (total >= 7) {
                                toast("最多只能添加7张素材图片", "error");
                                return;
                              }
                              openUpload("effect");
                            }}
                            className="flex flex-col items-center justify-center w-20 h-20 bg-pink-500/10 border-2 border-dashed border-pink-500/40 rounded-xl text-pink-400 hover:bg-pink-500/20 hover:border-pink-500/60 transition-all shrink-0"
                          >
                            <Sparkles className="h-5 w-5 mb-1" />
                            <span className="text-[10px]">特效</span>
                            <Plus className="h-3 w-3 mt-0.5" />
                          </button>
                          <div className="flex-1 min-w-0 overflow-hidden">
                            <div className="flex flex-wrap gap-2 items-start content-start">
                              {selectedEffects.length === 0 ? (
                                <span className="text-[11px] text-zinc-600 h-20 flex items-center">点击左侧添加特效</span>
                              ) : (
                                selectedEffects.map((effect) => (
                                  <div key={`effect-${effect.id}`} className="relative group" style={{ width: 76, flexShrink: 0 }}>
                                    <div className="rounded-xl overflow-hidden border-2 border-pink-500/50 bg-pink-500/10 shadow-lg shadow-pink-500/10" style={{ width: 76, height: 76 }}>
                                      {effect.imageUrl ? (
                                        <img src={toThumbnailUrl(effect.imageUrl, 200)} style={{ width: 76, height: 76, objectFit: 'cover' }} />
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                          <Sparkles className="h-6 w-6 text-pink-400" />
                                        </div>
                                      )}
                                    </div>
                                    <p className="text-[10px] text-pink-300 text-center mt-1.5 truncate" style={{ width: 76 }}>{effect.name}</p>
                                    <button 
                                      onClick={() => removeEffect(effect.id)} 
                                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-zinc-800 hover:bg-pink-500 border border-zinc-600 hover:border-pink-400 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-md"
                                    >
                                      <X className="h-3 w-3 text-white" />
                                    </button>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
               </div>
             )}

             {/* Image Mode - 在线融图 */}
             {creationMode === "image" && (
               <div className="space-y-3 animate-in slide-in-from-right-4 duration-300">
                 {/* 图片名称 - 移到最上面 */}
                 <div className="space-y-2">
                   <Label className={cn(
                     "text-xs",
                     validationErrors.imageName ? "text-red-400" : "text-zinc-400"
                   )}>
                     图片名称 <span className="text-red-500">*</span>
                   </Label>
                   <Input 
                     ref={imageNameRef}
                     value={imageName}
                     onChange={(e) => setImageName(e.target.value)}
                     placeholder={validationErrors.imageName ? "请输入图片名称（必填）" : "例如：融合图A"}
                     className={cn(
                       "transition-all",
                       validationErrors.imageName 
                         ? "bg-red-500/5 border-red-500 focus:border-red-500 focus:ring-red-500/20 placeholder:text-red-400" 
                         : "bg-black/50 border-white/10 focus:border-purple-500 focus:ring-purple-500/20"
                     )}
                   />
                 </div>

                 {/* 标题和统计 */}
                 <div className="flex items-center justify-between">
                   <Label className="text-xs text-zinc-400 font-medium flex items-center gap-2">
                     <Layers className="w-4 h-4 text-purple-400" />
                     融合素材
                   </Label>
                   <span className="text-[10px] text-zinc-500">
                     已选 {selectedChars.length + selectedScenes.length + selectedProps.length + selectedEffects.length}/7
                   </span>
                 </div>
                 
                 {/* 角色行 */}
                 <div className="flex items-start gap-3 p-3 bg-zinc-900/60 rounded-xl border border-zinc-800 min-h-[120px]">
                   <button
                     onClick={() => {
                       const total = selectedChars.length + selectedScenes.length + selectedProps.length + selectedEffects.length;
                       if (total >= 7) {
                         toast("最多只能添加7张素材图片", "error");
                         return;
                       }
                       openUpload("char");
                     }}
                     className="flex flex-col items-center justify-center w-20 h-20 bg-purple-500/10 border-2 border-dashed border-purple-500/40 rounded-xl text-purple-400 hover:bg-purple-500/20 hover:border-purple-500/60 transition-all shrink-0"
                   >
                     <User className="h-5 w-5 mb-1" />
                     <span className="text-[10px]">角色</span>
                     <Plus className="h-3 w-3 mt-0.5" />
                   </button>
                   <div className="flex-1 min-w-0 overflow-hidden">
                     <div className="flex flex-wrap gap-2 items-start content-start">
                       {selectedChars.length === 0 ? (
                         <span className="text-[11px] text-zinc-600 h-20 flex items-center">点击左侧添加角色</span>
                       ) : (
                         selectedChars.map((char) => (
                           <div key={`char-${char.id}`} className="relative group" style={{ width: 76, flexShrink: 0 }}>
                             <div className="rounded-xl overflow-hidden border-2 border-purple-500/50 bg-purple-500/10 shadow-lg shadow-purple-500/10" style={{ width: 76, height: 76 }}>
                               {char.imageUrl ? (
                                 <img src={toThumbnailUrl(char.imageUrl, 200)} style={{ width: 76, height: 76, objectFit: 'cover' }} />
                               ) : (
                                 <div className="w-full h-full flex items-center justify-center">
                                   <User className="h-6 w-6 text-purple-400" />
                                 </div>
                               )}
                             </div>
                             <p className="text-[10px] text-purple-300 text-center mt-1.5 truncate" style={{ width: 76 }}>{char.name}</p>
                             <button 
                               onClick={() => removeChar(char.id)} 
                               className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-zinc-800 hover:bg-purple-500 border border-zinc-600 hover:border-purple-400 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-md"
                             >
                               <X className="h-3 w-3 text-zinc-400 group-hover:text-white" />
                             </button>
                           </div>
                         ))
                       )}
                     </div>
                   </div>
                 </div>

                 {/* 场景行 */}
                 <div className="flex items-start gap-3 p-3 bg-zinc-900/60 rounded-xl border border-zinc-800 min-h-[120px]">
                   <button
                     onClick={() => {
                       const total = selectedChars.length + selectedScenes.length + selectedProps.length + selectedEffects.length;
                       if (total >= 7) {
                         toast("最多只能添加7张素材图片", "error");
                         return;
                       }
                       openUpload("scene");
                     }}
                     className="flex flex-col items-center justify-center w-20 h-20 bg-blue-500/10 border-2 border-dashed border-blue-500/40 rounded-xl text-blue-400 hover:bg-blue-500/20 hover:border-blue-500/60 transition-all shrink-0"
                   >
                     <MapPin className="h-5 w-5 mb-1" />
                     <span className="text-[10px]">场景</span>
                     <Plus className="h-3 w-3 mt-0.5" />
                   </button>
                   <div className="flex-1 min-w-0 overflow-hidden">
                     <div className="flex flex-wrap gap-2 items-start content-start">
                       {selectedScenes.length === 0 ? (
                         <span className="text-[11px] text-zinc-600 h-20 flex items-center">点击左侧添加场景</span>
                       ) : (
                         selectedScenes.map((scene) => (
                           <div key={`scene-${scene.id}`} className="relative group" style={{ width: 76, flexShrink: 0 }}>
                             <div className="rounded-xl overflow-hidden border-2 border-blue-500/50 bg-blue-500/10 shadow-lg shadow-blue-500/10" style={{ width: 76, height: 76 }}>
                               {scene.imageUrl ? (
                                 <img src={toThumbnailUrl(scene.imageUrl, 200)} style={{ width: 76, height: 76, objectFit: 'cover' }} />
                               ) : (
                                 <div className="w-full h-full flex items-center justify-center">
                                   <MapPin className="h-6 w-6 text-blue-400" />
                                 </div>
                               )}
                             </div>
                             <p className="text-[10px] text-blue-300 text-center mt-1.5 truncate" style={{ width: 76 }}>{scene.name}</p>
                             <button 
                               onClick={() => removeScene(scene.id)} 
                               className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-zinc-800 hover:bg-blue-500 border border-zinc-600 hover:border-blue-400 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-md"
                             >
                               <X className="h-3 w-3 text-zinc-400 group-hover:text-white" />
                             </button>
                           </div>
                         ))
                       )}
                     </div>
                   </div>
                 </div>

                 {/* 物品行 */}
                 <div className="flex items-start gap-3 p-3 bg-zinc-900/60 rounded-xl border border-zinc-800 min-h-[120px]">
                   <button
                     onClick={() => {
                       const total = selectedChars.length + selectedScenes.length + selectedProps.length + selectedEffects.length;
                       if (total >= 7) {
                         toast("最多只能添加7张素材图片", "error");
                         return;
                       }
                       openUpload("prop");
                     }}
                     className="flex flex-col items-center justify-center w-20 h-20 bg-amber-500/10 border-2 border-dashed border-amber-500/40 rounded-xl text-amber-400 hover:bg-amber-500/20 hover:border-amber-500/60 transition-all shrink-0"
                   >
                     <Box className="h-5 w-5 mb-1" />
                     <span className="text-[10px]">物品</span>
                     <Plus className="h-3 w-3 mt-0.5" />
                   </button>
                   <div className="flex-1 min-w-0 overflow-hidden">
                     <div className="flex flex-wrap gap-2 items-start content-start">
                       {selectedProps.length === 0 ? (
                         <span className="text-[11px] text-zinc-600 h-20 flex items-center">点击左侧添加物品</span>
                       ) : (
                         selectedProps.map((prop) => (
                           <div key={`prop-${prop.id}`} className="relative group" style={{ width: 76, flexShrink: 0 }}>
                             <div className="rounded-xl overflow-hidden border-2 border-amber-500/50 bg-amber-500/10 shadow-lg shadow-amber-500/10" style={{ width: 76, height: 76 }}>
                               {prop.imageUrl ? (
                                 <img src={toThumbnailUrl(prop.imageUrl, 200)} style={{ width: 76, height: 76, objectFit: 'cover' }} />
                               ) : (
                                 <div className="w-full h-full flex items-center justify-center">
                                   <Box className="h-6 w-6 text-amber-400" />
                                 </div>
                               )}
                             </div>
                             <p className="text-[10px] text-amber-300 text-center mt-1.5 truncate" style={{ width: 76 }}>{prop.name}</p>
                             <button 
                               onClick={() => removeProp(prop.id)} 
                               className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-zinc-800 hover:bg-amber-500 border border-zinc-600 hover:border-amber-400 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-md"
                             >
                               <X className="h-3 w-3 text-zinc-400 group-hover:text-white" />
                             </button>
                           </div>
                         ))
                       )}
                     </div>
                   </div>
                 </div>

                 {/* 特效行 */}
                 <div className="flex items-start gap-3 p-3 bg-zinc-900/60 rounded-xl border border-zinc-800 min-h-[120px]">
                   <button
                     onClick={() => {
                       const total = selectedChars.length + selectedScenes.length + selectedProps.length + selectedEffects.length;
                       if (total >= 7) {
                         toast("最多只能添加7张素材图片", "error");
                         return;
                       }
                       openUpload("effect");
                     }}
                     className="flex flex-col items-center justify-center w-20 h-20 bg-pink-500/10 border-2 border-dashed border-pink-500/40 rounded-xl text-pink-400 hover:bg-pink-500/20 hover:border-pink-500/60 transition-all shrink-0"
                   >
                     <Sparkles className="h-5 w-5 mb-1" />
                     <span className="text-[10px]">特效</span>
                     <Plus className="h-3 w-3 mt-0.5" />
                   </button>
                   <div className="flex-1 min-w-0 overflow-hidden">
                     <div className="flex flex-wrap gap-2 items-start content-start">
                       {selectedEffects.length === 0 ? (
                         <span className="text-[11px] text-zinc-600 h-20 flex items-center">点击左侧添加特效</span>
                       ) : (
                         selectedEffects.map((effect) => (
                           <div key={`effect-${effect.id}`} className="relative group" style={{ width: 76, flexShrink: 0 }}>
                             <div className="rounded-xl overflow-hidden border-2 border-pink-500/50 bg-pink-500/10 shadow-lg shadow-pink-500/10" style={{ width: 76, height: 76 }}>
                               {effect.imageUrl ? (
                                 <img src={toThumbnailUrl(effect.imageUrl, 200)} style={{ width: 76, height: 76, objectFit: 'cover' }} />
                               ) : (
                                 <div className="w-full h-full flex items-center justify-center">
                                   <Sparkles className="h-6 w-6 text-pink-400" />
                                 </div>
                               )}
                             </div>
                             <p className="text-[10px] text-pink-300 text-center mt-1.5 truncate" style={{ width: 76 }}>{effect.name}</p>
                             <button 
                               onClick={() => removeEffect(effect.id)} 
                               className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-zinc-800 hover:bg-pink-500 border border-zinc-600 hover:border-pink-400 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-md"
                             >
                               <X className="h-3 w-3 text-white" />
                             </button>
                           </div>
                         ))
                       )}
                     </div>
                   </div>
                 </div>
               </div>
             )}

             {/* Common Prompt Area */}
             <div className="space-y-4 relative">
               {creationMode === 'video' && (
                 <div className="space-y-2">
                   <Label className="text-xs text-zinc-400">视频名称</Label>
                   <Input 
                     value={videoName}
                     onChange={(e) => setVideoName(e.target.value)}
                     placeholder="例如：开场镜头A"
                     className="bg-black/50 border-white/10"
                   />
                 </div>
               )}
                <style jsx>{`
                  .custom-scrollbar::-webkit-scrollbar {
                    width: 4px;
                  }
                  .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                  }
                  .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.2);
                    border-radius: 4px;
                  }
                  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(255, 255, 255, 0.3);
                  }
                `}</style>
                <div className="flex justify-between items-center">
                   <Label className={cn(
                     "text-xs",
                     validationErrors.prompt ? "text-red-400" : "text-zinc-400"
                   )}>
                     描述 {creationMode === 'image' && <span className="text-red-500">*</span>}
                   </Label>
                   <div className="flex gap-2">
                     {creationMode === 'video' && (
                       <Button 
                         variant="ghost" 
                         size="sm" 
                         className="h-6 text-[10px] text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 px-2"
                         onClick={() => setScriptDialogOpen(true)}
                       >
                         <BookOpen className="h-3 w-3 mr-1" />
                         剧本
                       </Button>
                     )}
                     <Button 
                       variant="ghost" 
                       size="sm" 
                       className="h-6 text-[10px] text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 px-2"
                       onClick={() => setPrompt(`景别:\n视角:\n构图:\n时间:\n氛围:\n主体:`)}
                     >
                       <Wand2 className="h-3 w-3 mr-1" />
                       框架
                     </Button>
                     <Button 
                       variant="ghost" 
                       size="sm" 
                       className="h-6 text-[10px] text-pink-400 hover:text-pink-300 hover:bg-pink-500/10 px-2"
                       onClick={handleAiEnhancePrompt}
                       disabled={aiPromptGenerating}
                     >
                       {aiPromptGenerating ? (
                         <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                       ) : (
                         <Sparkles className="h-3 w-3 mr-1" />
                       )}
                       {aiPromptGenerating ? "生成中" : "AI丰富"}
                     </Button>
                   </div>
                </div>
                <Textarea 
                  ref={promptRef}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={validationErrors.prompt ? "请输入描述（必填）" : "描述画面内容、动作、运镜..."}
                  className={cn(
                    "min-h-[100px] text-sm resize-none custom-scrollbar transition-all",
                    validationErrors.prompt 
                      ? "bg-red-500/5 border-red-500 focus:border-red-500 placeholder:text-red-400" 
                      : "bg-black/50 border-white/10 focus:border-purple-500/50"
                  )}
                />
             </div>

             {/* Common Parameters */}
             <div className="space-y-4 pt-4 border-t border-white/5">
                <div className="grid grid-cols-2 gap-4">
                   {creationMode === 'video' && (
                     <div className="space-y-2">
                        <Label className="text-[10px] text-zinc-500 uppercase tracking-wider">时长</Label>
                        <div className="flex items-center gap-2 bg-zinc-900 border border-white/10 rounded-md p-1">
                           {[3, 5, 8, 10].map(s => (
                             <button 
                               key={s}
                               onClick={() => setDuration(s)}
                               className={cn(
                                 "flex-1 text-xs py-1 rounded transition-colors",
                                 duration === s ? "bg-zinc-700 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300"
                               )}
                             >
                               {s}s
                             </button>
                           ))}
                        </div>
                     </div>
                   )}
                   <div className="space-y-2">
                      <Label className="text-[10px] text-zinc-500 uppercase tracking-wider">比例</Label>
                      <select 
                        value={ratio} 
                        onChange={(e) => setRatio(e.target.value)}
                        className="w-full bg-zinc-900 border border-white/10 rounded-md text-xs py-1.5 px-2 focus:outline-none"
                      >
                         {RATIOS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                      </select>
                   </div>
                </div>
                
                {creationMode === 'video' && (
                  <div className="space-y-2">
                    <Label className="text-[10px] text-zinc-500 uppercase tracking-wider">视频模型</Label>
                    <select
                      value={videoModel}
                      onChange={(e) => setVideoModel(e.target.value)}
                      className="w-full bg-zinc-900 border border-white/10 rounded-md text-xs py-1.5 px-2 focus:outline-none"
                      disabled={videoModelsLoading}
                    >
                      {videoModelsLoading ? (
                        <option value="">加载中...</option>
                      ) : (
                        videoModels.map((model) => (
                          <option key={model.value} value={model.value}>
                            {model.label}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                )}
                {creationMode === 'image' && (
                  <div className="space-y-2">
                    <Label className="text-[10px] text-zinc-500 uppercase tracking-wider">图片模型</Label>
                    <select
                      value={imageModel}
                      onChange={(e) => setImageModel(e.target.value)}
                      className="w-full bg-zinc-900 border border-white/10 rounded-md text-xs py-1.5 px-2 focus:outline-none"
                      disabled={modelsLoading}
                    >
                      {modelsLoading ? (
                        <option value="">加载中...</option>
                      ) : (
                        imageModels.map((model) => (
                          <option key={model.value} value={model.value}>
                            {model.label}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                )}
             </div>
            </div>
          </div>
          
          {/* Fixed Generate Button Area */}
          <div className="border-t border-white/10 bg-black/80 backdrop-blur-sm p-5 shrink-0">
            <Button 
              onClick={handleGenerate}
              disabled={generating}
              className="w-full bg-gradient-to-r from-purple-600 via-purple-500 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 h-14 text-base font-bold tracking-wide shadow-lg shadow-purple-900/40 border border-white/10 rounded-xl"
            >
              {generating ? (
                <>
                  <RefreshCw className="h-5 w-5 mr-2 animate-spin" />
                  生成任务处理中...
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5 mr-2 fill-white" />
                  {creationMode === 'video' ? '开始生成视频' : '开始生成图片'}
                </>
              )}
            </Button>
            {creationMode === 'video' && (
              <p className="text-xs text-center text-zinc-500 mt-3">消耗: {duration * 2} 积分 / 次</p>
            )}
          </div>
        </div>

        {/* RIGHT PANEL: Gallery & Timeline */}
        <div className="flex-1 bg-[#0c0c0e] flex flex-col min-w-0">
           {/* Gallery Header */}
           <div className="h-14 border-b border-white/5 flex items-center justify-between px-6">
              <div className="flex items-center gap-3">
                 <Input placeholder="搜索素材名称..." className="w-48 h-8 bg-zinc-900/50 border-white/5 text-xs rounded-full px-4 focus:bg-zinc-900 transition-colors" />
                 {/* 批量操作按钮 */}
                 <button
                   onClick={toggleSelectMode}
                   className={cn(
                     "px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5",
                     selectMode 
                       ? "bg-purple-500 text-white" 
                       : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white border border-white/10"
                   )}
                 >
                   <Download className="h-3.5 w-3.5" />
                   {selectMode ? "取消" : "批量下载"}
                 </button>
              </div>
              <div className="flex items-center gap-2">
                 {selectMode && selectedItems.size > 0 && (
                   <span className="text-xs text-purple-400">
                     已选 {selectedItems.size} 项
                   </span>
                 )}
                 <div className="flex items-center gap-1 bg-zinc-900/50 p-1 rounded-lg">
                    <button 
                      onClick={() => setGalleryFilter("all")}
                      className={cn("px-4 py-1 text-xs font-medium rounded transition-colors", galleryFilter === "all" ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300")}
                    >
                      全部
                    </button>
                    <button 
                      onClick={() => setGalleryFilter("video")}
                      className={cn("px-4 py-1 text-xs font-medium rounded transition-colors", galleryFilter === "video" ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300")}
                    >
                      视频片段
                    </button>
                    <button 
                      onClick={() => setGalleryFilter("image")}
                      className={cn("px-4 py-1 text-xs font-medium rounded transition-colors", galleryFilter === "image" ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300")}
                    >
                      生成的图片
                    </button>
                 </div>
              </div>
           </div>

           {/* 批量操作栏 */}
           {selectMode && (
             <div className="h-12 border-b border-white/5 flex items-center justify-between px-6 bg-purple-500/5">
               <div className="flex items-center gap-3">
                 <button
                   onClick={() => {
                     const allItems = [
                       ...generatedVideos.map(v => ({ ...v, type: 'video' })),
                       ...generatedImages.map(i => ({ ...i, type: 'image' }))
                     ].filter(item => item.videoUrl || item.imageUrl);
                     selectAll(allItems);
                   }}
                   className="text-xs text-zinc-400 hover:text-white"
                 >
                   全选
                 </button>
                 <button
                   onClick={() => setSelectedItems(new Set())}
                   className="text-xs text-zinc-400 hover:text-white"
                 >
                   清空
                 </button>
               </div>
               <Button
                 size="sm"
                 onClick={() => {
                   const allItems = [
                     ...generatedVideos.map(v => ({ ...v, type: 'video' })),
                     ...generatedImages.map(i => ({ ...i, type: 'image' }))
                   ];
                   handleBatchDownload(allItems);
                 }}
                 disabled={selectedItems.size === 0}
                 className="bg-purple-600 hover:bg-purple-500 text-xs h-7"
               >
                 <Download className="h-3 w-3 mr-1" />
                 下载选中 ({selectedItems.size})
               </Button>
             </div>
           )}

           {/* Content Grid */}
           <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
                 {[/* eslint-disable @typescript-eslint/no-explicit-any */
                    ...generatedVideos.map(v => ({ ...v, type: 'video' })),
                    ...generatedImages.map(i => ({ ...i, type: 'image', name: i.name || '融合图', description: i.prompt }))
                 ].filter((item: any) => {
                    if (galleryFilter === 'all') return true;
                    return item.type === galleryFilter;
                 }).sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                 .map((item: any) => {
                    const itemKey = `${item.type}-${item.id}`;
                    const isSelected = selectedItems.has(itemKey);
                    const hasMedia = item.videoUrl || item.imageUrl;
                    
                    return (
                    <div 
                      key={itemKey} 
                      className={cn(
                        "group bg-zinc-900/50 rounded-xl border overflow-hidden transition-all",
                        isSelected ? "border-purple-500 ring-2 ring-purple-500/30" : "border-white/5 hover:border-purple-500/50"
                      )}
                      onClick={() => selectMode && hasMedia && toggleSelectItem(itemKey)}
                    >
                       <div className="aspect-video bg-black relative">
                          {/* 选择框 */}
                          {selectMode && hasMedia && (
                            <div 
                              className={cn(
                                "absolute top-2 left-2 w-6 h-6 rounded border-2 flex items-center justify-center z-50 cursor-pointer transition-colors shadow-lg",
                                isSelected 
                                  ? "bg-purple-500 border-purple-500" 
                                  : "bg-black/80 border-white/50 hover:border-white"
                              )}
                              onClick={(e) => { e.stopPropagation(); toggleSelectItem(itemKey); }}
                            >
                              {isSelected && (
                                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </div>
                          )}
                          {item.type === 'video' ? (
                              item.videoUrl ? (
                                 <OptimizedVideo 
                                   src={item.videoUrl} 
                                   className="w-full h-full" 
                                   controls={!selectMode}
                                   preload="metadata"
                                 />
                              ) : (
                                 <div className="w-full h-full flex flex-col items-center justify-center text-zinc-700">
                                    {(item.status === 'GENERATING' || item.status === 'PENDING_IMAGE') ? (
                                      <div className="flex flex-col items-center gap-2">
                                         <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                                         <span className="text-[10px] text-purple-400">
                                           {item.status === 'PENDING_IMAGE' ? '生成首帧中...' : 'Rendering...'}
                                         </span>
                                      </div>
                                    ) : (
                                      <Video className="h-8 w-8 opacity-20" />
                                    )}
                                 </div>
                              )
                          ) : (
                              item.imageUrl ? (
                                <OptimizedImage 
                                  src={item.imageUrl} 
                                  alt={item.name || 'Generated Image'}
                                  className="w-full h-full"
                                  objectFit="cover"
                                  placeholder="blur"
                                />
                              ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center text-zinc-700">
                                  {(item.status === 'PENDING' || item.status === 'GENERATING') ? (
                                    <div className="flex flex-col items-center gap-2">
                                      <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                                      <span className="text-[10px] text-purple-400">
                                        {item.status === 'PENDING' ? '等待生成...' : '生成中...'}
                                      </span>
                                    </div>
                                  ) : item.status === 'FAILED' ? (
                                    <div className="flex flex-col items-center gap-2">
                                      <ImageIcon className="h-8 w-8 text-red-500 opacity-50" />
                                      <span className="text-[10px] text-red-400">生成失败</span>
                                    </div>
                                  ) : (
                                    <ImageIcon className="h-8 w-8 opacity-20" />
                                  )}
                                </div>
                              )
                          )}
                       </div>
                       <div className="p-3">
                          <div className="flex justify-between items-start mb-1">
                             <div className="flex-1 min-w-0">
                               <h4 className="text-xs font-medium truncate" title={item.name}>{item.name}</h4>
                               {/* 剧本绑定标签 */}
                               {item.type === 'image' && item.scriptTitle && (
                                 <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 bg-amber-500/20 text-amber-400 text-[9px] rounded">
                                   <BookOpen className="h-2.5 w-2.5" />
                                   镜头{item.shotIndex}
                                 </span>
                               )}
                             </div>
                             {!selectMode && (
                               <button className="text-zinc-600 hover:text-red-400 ml-2 shrink-0" onClick={(e) => { e.stopPropagation(); handleDeleteItem(item); }}>
                                 <Trash2 className="h-3 w-3" />
                               </button>
                             )}
                          </div>
                          <p className="text-[10px] text-zinc-500 line-clamp-2 h-8">{item.description}</p>
                          <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
                             <div className="flex flex-col gap-0.5">
                               <span className="text-[10px] text-zinc-600">
                                  {item.type === 'video' ? `${item.duration}s • ${item.generationModel}` : item.ratio || '16:9'}
                               </span>
                               <span className="text-[9px] text-zinc-700">
                                  {item.createdAt ? new Date(item.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                               </span>
                             </div>
                             {!selectMode && (
                               <div className="flex items-center gap-2">
                                 {/* 重新生成按钮 */}
                                 <button 
                                   className="text-amber-400 hover:text-amber-300"
                                   onClick={(e) => {
                                     e.stopPropagation();
                                     if (item.type === 'video') {
                                       // 视频：导入参考图和提示词到视频生成
                                       if (item.startImageUrl) {
                                         setRefImage(item.startImageUrl);
                                       }
                                       if (item.endImageUrl) {
                                         setEndImage(item.endImageUrl);
                                         setVideoMode("frame2frame");
                                       } else {
                                         setVideoMode("img2vid");
                                       }
                                       setPrompt(item.prompt || item.description || "");
                                       setVideoName(item.name || "");
                                       setCreationMode("video");
                                       if (item.duration) setDuration(item.duration);
                                       toast("已导入视频参数，可重新生成", "success");
                                     } else {
                                       // 图片：导入参考图和提示词到在线融图
                                       setPrompt(item.prompt || item.description || "");
                                       setImageName(item.name || "");
                                       setCreationMode("image");
                                       // 如果有参考图片，尝试还原
                                       if (item.referenceImages && item.referenceImages.length > 0) {
                                         // 清空当前选择，准备重新加载
                                         setSelectedChars([]);
                                         setSelectedScenes([]);
                                         setSelectedProps([]);
                                         setSelectedEffects([]);
                                       }
                                       toast("已导入图片参数，可重新生成", "success");
                                     }
                                   }}
                                   title="重新生成"
                                 >
                                   <RefreshCw className="h-3 w-3" />
                                 </button>
                                 {/* 图片专用：查看大图按钮 */}
                                 {item.type === 'image' && item.imageUrl && (
                                   <button 
                                     className="text-cyan-400 hover:text-cyan-300"
                                     onClick={(e) => {
                                       e.stopPropagation();
                                       setPreviewImage({ url: item.imageUrl, title: item.name || '生成的图片' });
                                     }}
                                     title="查看大图"
                                   >
                                      <Maximize2 className="h-3 w-3" />
                                   </button>
                                 )}
                                 {/* 图片专用：用于生视频按钮 */}
                                 {item.type === 'image' && item.imageUrl && (
                                   <button 
                                     className="text-purple-400 hover:text-purple-300"
                                     onClick={(e) => {
                                       e.stopPropagation();
                                       setRefImage(item.imageUrl);
                                       // 优先使用 videoPrompt（视频运动提示词），否则使用图片的 prompt
                                       setPrompt(item.videoPrompt || item.prompt || item.description || "");
                                       setCreationMode("video");
                                       setVideoMode("img2vid");
                                       // 如果有剧本绑定信息，设置视频名称
                                       if (item.scriptTitle && item.shotIndex) {
                                         setVideoName(`剧本《${item.scriptTitle}》镜头${item.shotIndex}`);
                                         toast(`已加载到图生视频（来自剧本《${item.scriptTitle}》镜头${item.shotIndex}）`, "success");
                                       } else {
                                         toast("已加载到图生视频", "success");
                                       }
                                     }}
                                     title={item.scriptTitle ? `用于生视频（剧本《${item.scriptTitle}》镜头${item.shotIndex}）` : "用于生视频"}
                                   >
                                      <Video className="h-3 w-3" />
                                   </button>
                                 )}
                                 <button 
                                   className="text-zinc-500 hover:text-white"
                                   onClick={(e) => {
                                     e.stopPropagation();
                                     const url = item.type === 'video' ? item.videoUrl : item.imageUrl;
                                     if (url) {
                                       const link = document.createElement('a');
                                       link.href = url;
                                       link.download = `${item.name || item.type}_${item.id}`;
                                       link.click();
                                     }
                                   }}
                                 >
                                    <Download className="h-3 w-3" />
                                 </button>
                               </div>
                             )}
                          </div>
                       </div>
                    </div>
                 );
                 })}
                 
                 {generatedVideos.length === 0 && generatedImages.length === 0 && (
                    <div className="col-span-full flex flex-col items-center justify-center py-20 opacity-50">
                       <Box className="h-16 w-16 text-zinc-700 mb-4" />
                       <p className="text-zinc-500">暂无内容，请在左侧开始创作</p>
                    </div>
                 )}
              </div>
           </div>
        </div>
      </div>

      {/* Asset Picker Dialog */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
         <DialogContent className="bg-zinc-950 border-white/10 text-white max-w-4xl h-[80vh] flex flex-col p-0">
            <DialogHeader className="p-4 border-b border-white/10">
               <DialogTitle>选择素材 ({pickerTarget})</DialogTitle>
            </DialogHeader>
            <AssetPicker 
              type={pickerTarget} 
              characters={characters} 
              scenes={scenes} 
              props={props} 
              onSelect={handleAssetSelect} 
            />
         </DialogContent>
      </Dialog>
      {/* 综合素材选择/上传对话框 */}
      <AssetSelectorDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        projectId={projectId}
        assetType={uploadTarget === "char" ? "characters" : uploadTarget === "scene" ? "scenes" : uploadTarget === "prop" ? "props" : uploadTarget === "effect" ? "effects" : uploadTarget}
        onSelect={handleAssetSelectorSelect}
        title={`选择或上传${uploadTarget === "char" ? "角色" : uploadTarget === "scene" ? "场景" : uploadTarget === "prop" ? "物品" : uploadTarget === "effect" ? "特效" : uploadTarget === "pose" ? "姿态" : uploadTarget === "refImage" ? "参考图" : "尾帧"}素材`}
      />
      
      {/* 剧本选择对话框 */}
      <ScriptSelectorDialog
        open={scriptDialogOpen}
        onOpenChange={setScriptDialogOpen}
        onSelectShot={handleScriptShotSelect}
        onSelectCharacter={(char) => {
          if (char.imageUrl) {
            setRefImage(char.imageUrl);
            addChar(char);
            toast(`已加载人物「${char.name}」到参考图`, "success");
          }
        }}
        onSelectScene={(scene) => {
          if (scene.imageUrl) {
            setRefImage(scene.imageUrl);
            addScene(scene);
            toast(`已加载场景「${scene.name}」到参考图`, "success");
          }
        }}
      />
      
      {/* 图片预览弹窗 */}
      {previewImage && (
        <div 
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={() => setPreviewImage(null)}
        >
          <button
            onClick={() => setPreviewImage(null)}
            className="absolute top-4 right-4 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors"
          >
            <X className="h-6 w-6 text-white" />
          </button>
          <div className="max-w-[90vw] max-h-[90vh] relative" onClick={(e) => e.stopPropagation()}>
            <img 
              src={previewImage.url} 
              alt={previewImage.title}
              className="max-w-full max-h-[90vh] object-contain rounded-lg"
            />
            <p className="absolute bottom-0 left-0 right-0 text-center text-white text-sm py-2 bg-black/50 rounded-b-lg">
              {previewImage.title}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
