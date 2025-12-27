"use client";

import { useState, useEffect, useCallback } from "react";
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
  BookOpen
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { useToast } from "@/components/ui/toast-provider";
import { handleApiError, safeAsync } from "@/lib/error-handler";
import { useProjectWebSocket } from "@/lib/useWebSocket";

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
  { id: "9:16", label: "9:16 竖屏" },
  { id: "16:9", label: "16:9 横屏" },
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
  onBack
}: FragmentEditorProps) {
  const { toast } = useToast();
  
  // -- State --
  const [shotType, setShotType] = useState("action");
  const [creationMode, setCreationMode] = useState<"image" | "video">("video");
  const [videoMode, setVideoMode] = useState<"img2vid" | "frame2frame" | "fusion">("img2vid");
  
  // Inputs
  const [prompt, setPrompt] = useState("");
  const [negPrompt, setNegPrompt] = useState("");
  const [duration, setDuration] = useState(5);
  const [ratio, setRatio] = useState("9:16");
  const [resolution, setResolution] = useState("1080p");
  const [batchSize, setBatchSize] = useState(1);
  const [videoModel, setVideoModel] = useState<string>("veo3.1_fast");
  
  // Asset Selections
  const [selectedChar, setSelectedChar] = useState<any>(null);
  const [selectedScene, setSelectedScene] = useState<any>(null);
  const [selectedProp, setSelectedProp] = useState<any>(null);
  const [selectedEffect, setSelectedEffect] = useState<any>(null);
  const [refImage, setRefImage] = useState<string>(""); // For Img2Vid
  const [endImage, setEndImage] = useState<string>(""); // For Frame2Frame
  const [poseImage, setPoseImage] = useState<string>(""); // For Fusion Pose
  
  // 名称
  const [videoName, setVideoName] = useState<string>("");
  const [imageName, setImageName] = useState<string>("");
  
  // Assets Picker State
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<"char" | "scene" | "prop" | "refImage" | "endImage">("char");
  const [imageModel, setImageModel] = useState<string>("nano-banana-2-2k");

  // Loading
  const [generating, setGenerating] = useState(false);
  
  // 通用上传对话框（角色/场景/物品/特效/姿态/参考图/尾帧）
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadTarget, setUploadTarget] = useState<"char" | "scene" | "prop" | "effect" | "pose" | "refImage" | "endImage">("char");
  const [uploadName, setUploadName] = useState("");
  const [uploadUrl, setUploadUrl] = useState("");
  
  // Right Side Gallery Filter
  const [galleryFilter, setGalleryFilter] = useState<"all" | "video" | "image">("all");
  
  // Script Selector
  const [scriptDialogOpen, setScriptDialogOpen] = useState(false);

  // -- Handlers --

  const openPicker = (target: typeof pickerTarget) => {
    setPickerTarget(target);
    setPickerOpen(true);
  };

  const handleDeleteItem = async (item: any) => {
    if (!item?.id) return;
    if (!confirm("确定要删除该内容吗？")) return;
    const endpoint = item.type === 'video' ? `/assets/videos/${item.id}` : `/assets/images/${item.id}`;
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

  const handleAssetSelect = (asset: any) => {
    const url = asset.imageUrl || asset.videoUrl || asset.url; // Handle various asset shapes
    
    if (pickerTarget === "char") setSelectedChar(asset);
    else if (pickerTarget === "scene") setSelectedScene(asset);
    else if (pickerTarget === "prop") setSelectedProp(asset);
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
      setSelectedChar(asset);
    } else if (uploadTarget === "scene") {
      setSelectedScene(asset);
    } else if (uploadTarget === "prop") {
      setSelectedProp(asset);
    } else if (uploadTarget === "effect") {
      setSelectedEffect(asset);
    }
    
    onUpdate();
  };
  
  const handleScriptShotSelect = (shot: any, characters: any[], scenes: any[]) => {
    // 填充提示词
    setPrompt(shot.prompt);
    
    // 添加人物到参考图（如果有图片）
    if (characters.length > 0 && characters[0].imageUrl) {
      setRefImage(characters[0].imageUrl);
      setSelectedChar(characters[0]);
    }
    
    // 添加场景到参考图（如果有图片）
    if (scenes.length > 0 && scenes[0].imageUrl) {
      if (!refImage) {
        setRefImage(scenes[0].imageUrl);
      }
      setSelectedScene(scenes[0]);
    }
    
    toast("已加载剧本镜头", "success");
  };

  const handleGenerate = async () => {
    if (!prompt && creationMode === 'image') {
       toast("请输入提示词", "error");
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
             let fusionPrompt = prompt;
             if (selectedChar) fusionPrompt += ` Character: ${selectedChar.name}`;
             if (selectedScene) fusionPrompt += ` Scene: ${selectedScene.name}`;
             if (selectedProp) fusionPrompt += ` Prop: ${selectedProp.name}`;
             if (selectedEffect) fusionPrompt += ` Effect: ${selectedEffect.name}`;
             payload.prompt = fusionPrompt;
             payload.startImageUrl = poseImage || selectedChar?.imageUrl || "https://placehold.co/1920x1080.png?text=FusionBase";
          }

          return await api.post(`/projects/${projectId}/videos`, payload);
        } else {
          const imgPayload: any = {
            projectId,
            name: (imageName && imageName.trim()) ? imageName.trim() : `Image - ${new Date().toLocaleTimeString()}`,
            prompt,
            model: imageModel, // Use state
            ratio,
            n: 1,
            videoId: fragmentId
          };
          return await api.post(`/projects/${projectId}/images`, imgPayload);
        }
      },
      toast,
      {
        successMessage: creationMode === 'video' ? "🎬 视频生成任务已提交，正在处理中..." : "🖼️ 图片生成成功",
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
      // 刷新数据
      onUpdate();
      
      // 显示通知
      if (message.status === 'COMPLETED') {
        toast("🎉 视频生成完成！", "success");
      } else if (message.status === 'FAILED') {
        toast(`❌ 视频生成失败: ${message.errorMessage || '未知错误'}`, "error");
      }
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
           {/* Global Action / Agent Status could go here */}
           <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-full px-4 py-1.5 text-xs font-bold text-white shadow-lg shadow-purple-900/20">
             AI Agent 在线
           </div>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* LEFT PANEL: Creation Tools */}
        <div className="w-[500px] min-w-[500px] border-r border-white/10 flex flex-col bg-black/40 backdrop-blur-sm">
          {/* Scrollable Content Area */}
          <div className="flex-1 overflow-y-auto scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {/* Mode Switcher */}
            <div className="p-5 pb-0">
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
                         <Label className="text-xs text-zinc-400 font-medium">参考图片</Label>
                         <div 
                           className="aspect-[16/10] bg-zinc-900/80 border-2 border-dashed border-white/20 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-purple-500 hover:bg-purple-500/5 transition-all group relative overflow-hidden"
                           onClick={() => openUpload("refImage")}
                         >
                            {refImage ? (
                              <img src={refImage} className="w-full h-full object-contain bg-black/50" />
                            ) : (
                              <>
                                <Upload className="h-10 w-10 text-zinc-600 group-hover:text-purple-400 transition-colors mb-3" />
                                <span className="text-sm text-zinc-500">点击选择或上传参考图</span>
                                <span className="text-xs text-zinc-600 mt-1">支持从素材库选择</span>
                              </>
                            )}
                         </div>
                      </div>
                    )}

                    {/* Frame2Frame Inputs */}
                    {videoMode === "frame2frame" && (
                       <div className="space-y-3">
                          <Label className="text-xs text-zinc-400 font-medium">首尾帧图片</Label>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <span className="text-[11px] text-zinc-500">首帧</span>
                              <div 
                                 className="aspect-square bg-zinc-900/80 border-2 border-dashed border-white/20 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-purple-500 relative overflow-hidden transition-all"
                                 onClick={() => openUpload("refImage")}
                               >
                                  {refImage ? <img src={refImage} className="w-full h-full object-contain bg-black/50" /> : <Plus className="h-8 w-8 text-zinc-600" />}
                               </div>
                            </div>
                            <div className="space-y-2">
                              <span className="text-[11px] text-zinc-500">尾帧</span>
                              <div 
                                 className="aspect-square bg-zinc-900/80 border-2 border-dashed border-white/20 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-purple-500 relative overflow-hidden transition-all"
                                 onClick={() => openUpload("endImage")}
                               >
                                  {endImage ? <img src={endImage} className="w-full h-full object-contain bg-black/50" /> : <Plus className="h-8 w-8 text-zinc-600" />}
                               </div>
                            </div>
                          </div>
                       </div>
                    )}

                    {/* Fusion Inputs */}
                    {videoMode === "fusion" && (
                      <div className="space-y-3">
                        <Label className="text-xs text-zinc-400 font-medium">融合素材</Label>
                        <div className="grid grid-cols-3 gap-3">
                           {/* Character */}
                           <div 
                             className="aspect-[3/4] bg-zinc-900/80 rounded-xl border-2 border-white/10 flex flex-col items-center justify-center cursor-pointer hover:border-purple-500 relative overflow-hidden transition-all"
                             onClick={() => openUpload("char")}
                           >
                              {selectedChar ? (
                                <>
                                  <img src={selectedChar.imageUrl} className="absolute inset-0 w-full h-full object-contain bg-black/50" />
                                  <span className="relative z-10 text-[10px] font-bold bg-black/60 px-2 py-0.5 rounded">{selectedChar.name}</span>
                                </>
                              ) : (
                                <div className="flex flex-col items-center gap-2">
                                   <User className="h-6 w-6 text-zinc-600" />
                                   <span className="text-[10px] text-zinc-500">角色</span>
                                </div>
                              )}
                           </div>
                           
                           {/* Scene */}
                           <div 
                             className="aspect-[3/4] bg-zinc-900/80 rounded-xl border-2 border-white/10 flex flex-col items-center justify-center cursor-pointer hover:border-purple-500 relative overflow-hidden transition-all"
                             onClick={() => openUpload("scene")}
                           >
                              {selectedScene ? (
                                <>
                                  <img src={selectedScene.imageUrl} className="absolute inset-0 w-full h-full object-contain bg-black/50" />
                                  <span className="relative z-10 text-[10px] font-bold bg-black/60 px-2 py-0.5 rounded">{selectedScene.name}</span>
                                </>
                              ) : (
                                <div className="flex flex-col items-center gap-2">
                                   <MapPin className="h-6 w-6 text-zinc-600" />
                                   <span className="text-[10px] text-zinc-500">场景</span>
                                </div>
                              )}
                           </div>

                           {/* Prop */}
                           <div 
                             className="aspect-[3/4] bg-zinc-900/80 rounded-xl border-2 border-white/10 flex flex-col items-center justify-center cursor-pointer hover:border-purple-500 relative overflow-hidden transition-all"
                             onClick={() => openUpload("prop")}
                           >
                              {selectedProp ? (
                                <>
                                  <img src={selectedProp.imageUrl} className="absolute inset-0 w-full h-full object-contain bg-black/50" />
                                  <span className="relative z-10 text-[10px] font-bold bg-black/60 px-2 py-0.5 rounded">{selectedProp.name}</span>
                                </>
                              ) : (
                                <div className="flex flex-col items-center gap-2">
                                   <Box className="h-6 w-6 text-zinc-600" />
                                   <span className="text-[10px] text-zinc-500">物品</span>
                                </div>
                              )}
                           </div>
                        </div>
                      </div>
                    )}
                  </div>
               </div>
             )}

             {/* Image Mode - 在线融图 */}
             {creationMode === "image" && (
               <div className="space-y-5 animate-in slide-in-from-right-4 duration-300">
                 <Label className="text-xs text-zinc-400 font-medium">融合素材（点击选择）</Label>
                 <div className="grid grid-cols-3 gap-3">
                   {/* Character */}
                   <div 
                     className="aspect-[3/4] bg-zinc-900/80 rounded-xl border-2 border-white/10 flex flex-col items-center justify-center cursor-pointer hover:border-purple-500 relative overflow-hidden transition-all"
                     onClick={() => openUpload("char")}
                   >
                     {selectedChar ? (
                       <>
                         <img src={selectedChar.imageUrl} className="absolute inset-0 w-full h-full object-contain bg-black/50" />
                         <span className="relative z-10 text-[10px] font-bold bg-black/60 px-2 py-0.5 rounded">{selectedChar.name}</span>
                       </>
                     ) : (
                       <div className="flex flex-col items-center gap-2">
                         <User className="h-6 w-6 text-zinc-600" />
                         <span className="text-[10px] text-zinc-500">角色</span>
                       </div>
                     )}
                   </div>
                   
                   {/* Scene */}
                   <div 
                     className="aspect-[3/4] bg-zinc-900/80 rounded-xl border-2 border-white/10 flex flex-col items-center justify-center cursor-pointer hover:border-purple-500 relative overflow-hidden transition-all"
                     onClick={() => openUpload("scene")}
                   >
                     {selectedScene ? (
                       <>
                         <img src={selectedScene.imageUrl} className="absolute inset-0 w-full h-full object-contain bg-black/50" />
                         <span className="relative z-10 text-[10px] font-bold bg-black/60 px-2 py-0.5 rounded">{selectedScene.name}</span>
                       </>
                     ) : (
                       <div className="flex flex-col items-center gap-2">
                         <MapPin className="h-6 w-6 text-zinc-600" />
                         <span className="text-[10px] text-zinc-500">场景</span>
                       </div>
                     )}
                   </div>

                   {/* Prop */}
                   <div 
                     className="aspect-[3/4] bg-zinc-900/80 rounded-xl border-2 border-white/10 flex flex-col items-center justify-center cursor-pointer hover:border-purple-500 relative overflow-hidden transition-all"
                     onClick={() => openUpload("prop")}
                   >
                     {selectedProp ? (
                       <>
                         <img src={selectedProp.imageUrl} className="absolute inset-0 w-full h-full object-contain bg-black/50" />
                         <span className="relative z-10 text-[10px] font-bold bg-black/60 px-2 py-0.5 rounded">{selectedProp.name}</span>
                       </>
                     ) : (
                       <div className="flex flex-col items-center gap-2">
                         <Box className="h-6 w-6 text-zinc-600" />
                         <span className="text-[10px] text-zinc-500">物品</span>
                       </div>
                     )}
                   </div>
                 </div>

                 {/* Pose & Effect Row */}
                 <div className="grid grid-cols-2 gap-3">
                   {/* Pose */}
                   <div 
                     className="aspect-[3/4] bg-zinc-900/80 rounded-xl border-2 border-white/10 flex flex-col items-center justify-center cursor-pointer hover:border-purple-500 relative overflow-hidden transition-all"
                     onClick={() => openUpload("pose")}
                   >
                     {poseImage ? (
                       <>
                         <img src={poseImage} className="absolute inset-0 w-full h-full object-contain bg-black/50" />
                         <span className="relative z-10 text-[10px] font-bold bg-black/60 px-2 py-0.5 rounded">姿态</span>
                       </>
                     ) : (
                       <div className="flex flex-col items-center gap-2">
                         <Layers className="h-6 w-6 text-zinc-600" />
                         <span className="text-[10px] text-zinc-500">姿态</span>
                       </div>
                     )}
                   </div>
                   {/* Effect */}
                   <div 
                     className="aspect-[3/4] bg-zinc-900/80 rounded-xl border-2 border-white/10 flex flex-col items-center justify-center cursor-pointer hover:border-purple-500 relative overflow-hidden transition-all"
                     onClick={() => openUpload("effect")}
                   >
                     {selectedEffect ? (
                       <>
                         <img src={selectedEffect.imageUrl} className="absolute inset-0 w-full h-full object-contain bg-black/50" />
                         <span className="relative z-10 text-[10px] font-bold bg-black/60 px-2 py-0.5 rounded">{selectedEffect.name}</span>
                       </>
                     ) : (
                       <div className="flex flex-col items-center gap-2">
                         <Sparkles className="h-6 w-6 text-zinc-600" />
                         <span className="text-[10px] text-zinc-500">特效</span>
                       </div>
                     )}
                   </div>
                 </div>
               </div>
             )}

             {/* Common Prompt Area */}
             <div className="space-y-4 relative">
               {creationMode === 'video' ? (
                 <div className="space-y-2">
                   <Label className="text-xs text-zinc-400">视频名称</Label>
                   <Input 
                     value={videoName}
                     onChange={(e) => setVideoName(e.target.value)}
                     placeholder="例如：开场镜头A"
                     className="bg-black/50 border-white/10"
                   />
                 </div>
               ) : (
                 <div className="space-y-2">
                   <Label className="text-xs text-zinc-400">图片名称</Label>
                   <Input 
                     value={imageName}
                     onChange={(e) => setImageName(e.target.value)}
                     placeholder="例如：融合图A"
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
                   <Label className="text-xs text-zinc-400">描述</Label>
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
                   </div>
                </div>
                <Textarea 
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="描述画面内容、动作、运镜..."
                  className="bg-black/50 border-white/10 min-h-[100px] text-sm resize-none focus:border-purple-500/50 custom-scrollbar"
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
                
                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-2">
                      <Label className="text-[10px] text-zinc-500 uppercase tracking-wider">分辨率</Label>
                      <div className="text-xs bg-zinc-900 border border-white/10 rounded px-3 py-2 text-zinc-300">
                        {resolution}
                      </div>
                   </div>
                   <div className="space-y-2">
                      <Label className="text-[10px] text-zinc-500 uppercase tracking-wider">数量</Label>
                      <div className="flex items-center gap-2">
                         <Input 
                           type="number" 
                           min={1} 
                           max={4} 
                           value={batchSize} 
                           onChange={(e) => setBatchSize(Number(e.target.value))}
                           className="bg-zinc-900 border-white/10 h-8 text-xs"
                         />
                      </div>
                   </div>
                </div>
                {creationMode === 'video' && (
                  <div className="space-y-2">
                    <Label className="text-[10px] text-zinc-500 uppercase tracking-wider">视频模型</Label>
                    <select
                      value={videoModel}
                      onChange={(e) => setVideoModel(e.target.value)}
                      className="w-full bg-zinc-900 border border-white/10 rounded-md text-xs py-1.5 px-2 focus:outline-none"
                    >
                      <option value="veo3.1_fast">Veo 3.1（快速）</option>
                      <option value="veo3.1_hd">Veo 3.1（高清）</option>
                      <option value="doubao-seedream-4-5-251128">Doubao Seedream（豆包）</option>
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
                    >
                      <option value="nano-banana-2-2k">Nano Banana 2K</option>
                      <option value="nano-banana-2-4k">Nano Banana 4K</option>
                      <option value="mj_relax_imagine">Midjourney (Relax)</option>
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
              <div className="flex items-center gap-2">
                 <Input placeholder="搜索素材名称..." className="w-48 h-8 bg-zinc-900/50 border-white/5 text-xs rounded-full px-4 focus:bg-zinc-900 transition-colors" />
              </div>
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

           {/* Content Grid */}
           <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
                 {[/* eslint-disable @typescript-eslint/no-explicit-any */
                    ...generatedVideos.map(v => ({ ...v, type: 'video' })),
                    ...generatedImages.map(i => ({ ...i, type: 'image', name: 'Generated Image', description: i.prompt }))
                 ].filter((item: any) => {
                    if (galleryFilter === 'all') return true;
                    return item.type === galleryFilter;
                 }).sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                 .map((item: any) => (
                    <div key={`${item.type}-${item.id}`} className="group bg-zinc-900/50 rounded-xl border border-white/5 overflow-hidden hover:border-purple-500/50 transition-all">
                       <div className="aspect-video bg-black relative">
                          {item.type === 'video' ? (
                              item.videoUrl ? (
                                 <video src={item.videoUrl} className="w-full h-full object-cover" controls />
                              ) : (
                                 <div className="w-full h-full flex flex-col items-center justify-center text-zinc-700">
                                    {item.status === 'GENERATING' ? (
                                      <div className="flex flex-col items-center gap-2">
                                         <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                                         <span className="text-[10px] text-purple-400">Rendering...</span>
                                      </div>
                                    ) : (
                                      <Video className="h-8 w-8 opacity-20" />
                                    )}
                                 </div>
                              )
                          ) : (
                              <img src={item.imageUrl} className="w-full h-full object-cover" />
                          )}
                       </div>
                       <div className="p-3">
                          <div className="flex justify-between items-start mb-1">
                             <h4 className="text-xs font-medium truncate w-3/4" title={item.name}>{item.name}</h4>
                             <button className="text-zinc-600 hover:text-red-400" onClick={() => handleDeleteItem(item)}>
                               <Trash2 className="h-3 w-3" />
                             </button>
                          </div>
                          <p className="text-[10px] text-zinc-500 line-clamp-2 h-8">{item.description}</p>
                          <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
                             <span className="text-[10px] text-zinc-600">
                                {item.type === 'video' ? `${item.duration}s • ${item.generationModel}` : item.ratio || '16:9'}
                             </span>
                             <button className="text-zinc-500 hover:text-white">
                                <Download className="h-3 w-3" />
                             </button>
                          </div>
                       </div>
                    </div>
                 ))}
                 
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
            setSelectedChar(char);
            toast(`已加载人物「${char.name}」到参考图`, "success");
          }
        }}
        onSelectScene={(scene) => {
          if (scene.imageUrl) {
            setRefImage(scene.imageUrl);
            setSelectedScene(scene);
            toast(`已加载场景「${scene.name}」到参考图`, "success");
          }
        }}
      />
    </div>
  );
}
