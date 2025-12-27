"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/components/ui/toast-provider";
import { Loader2, Sparkles, Upload, X, Zap, History, Download, Copy, ArrowRight, Settings2, Image as ImageIcon, FolderPlus, Trash2, Maximize2, Wand2, Palette, RefreshCw, Plus, LayoutTemplate, Box } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuTrigger,
  DropdownMenuItem 
} from "@/components/ui/dropdown-menu";
import api from "@/lib/api";
import { wsService } from "@/lib/websocket";

const MODELS = [
  { value: "nano-banana-2-4k", label: "Nano Banana 2 (4K)", desc: "快速生成，适合测试" },
  { value: "sora_image-vip", label: "Sora Image VIP", desc: "高质量图像生成" },
  { value: "doubao-seedream-4-5-251128", label: "豆包 SeeDream 4.5", desc: "豆包最新图像模型" },
  { value: "z-image-turbo", label: "Z-Image Turbo", desc: "快速图像生成" },
  { value: "qwen-image-edit-2509", label: "通义千问图像编辑", desc: "图像编辑专用" },
];

const RATIOS = [
  { value: "1:1", label: "1:1 正方", size: "2048x2048", suffix: " --ar 1:1" },
  { value: "16:9", label: "16:9 影院", size: "2560x1440", suffix: " --ar 16:9" },
  { value: "9:16", label: "9:16 移动", size: "1440x2560", suffix: " --ar 9:16" },
  { value: "4:3", label: "4:3 经典", size: "2304x1728", suffix: " --ar 4:3" },
  { value: "3:4", label: "3:4 肖像", size: "1728x2304", suffix: " --ar 3:4" },
];

const SUGGESTIONS = [
  "赛博朋克风格的雨夜街道，霓虹灯光",
  "宫崎骏风格，漂浮在云端的魔法城堡",
  "极其写实的特写，一只沾满露珠的蓝色眼睛",
  "水墨画风格，孤舟蓑笠翁，独钓寒江雪"
];

export default function AiImagePage() {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState("");
  const [ratio, setRatio] = useState<string>(RATIOS[0].value);
  const [model, setModel] = useState<string>(MODELS[0].value);
  const [loading, setLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [revisedPrompt, setRevisedPrompt] = useState<string | null>(null);
  const [currentPrompt, setCurrentPrompt] = useState<string>("");
  const [currentModel, setCurrentModel] = useState<string>("");
  const [currentRatio, setCurrentRatio] = useState<string>("");
  // 当前生成任务ID
  const [currentTaskId, setCurrentTaskId] = useState<number | null>(null);
  // 改为支持多个参考图
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 轮询定时器
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  
  // Dialog States
  const [historyOpen, setHistoryOpen] = useState(false);
  const [addToAssetDialogOpen, setAddToAssetDialogOpen] = useState(false);

  // Asset Dialog States
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<any>(null);
  const [assetName, setAssetName] = useState("");
  const [assetCategory, setAssetCategory] = useState("characters");
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("public"); // 默认公共素材库
  const [addingToAsset, setAddingToAsset] = useState(false);

  useEffect(() => {
    fetchHistory();
    fetchProjects();
    
    // 连接 WebSocket
    wsService.connect();
    
    // 订阅用户图片生成频道（使用默认用户ID 1）
    const userId = 1;
    wsService.subscribeToUserImages(userId, handleImageStatusUpdate);
    
    return () => {
      wsService.unsubscribeFromUserImages(userId);
      // 清理轮询
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);
  
  // 处理 WebSocket 推送的图片状态更新
  const handleImageStatusUpdate = (message: any) => {
    console.log('📥 收到图片状态更新:', message);
    
    if (message.type === 'IMAGE_STATUS_UPDATE') {
      const { imageId, status, imageUrl: newImageUrl, errorMessage } = message;
      
      // 如果是当前正在生成的任务
      if (currentTaskId && imageId === currentTaskId) {
        if (status === 'COMPLETED' && newImageUrl) {
          setImageUrl(newImageUrl);
          setLoading(false);
          setCurrentTaskId(null);
          toast("杰作已诞生", "success");
          fetchHistory();
          // 停止轮询
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
        } else if (status === 'FAILED') {
          setLoading(false);
          setCurrentTaskId(null);
          toast(errorMessage || "生成失败，请重试", "error");
          // 停止轮询
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
        }
      }
      
      // 更新历史记录中的状态
      setHistory(prev => prev.map(item => 
        item.id === imageId 
          ? { ...item, status, imageUrl: newImageUrl || item.imageUrl, errorMessage }
          : item
      ));
    }
  };
  
  // 轮询检查任务状态（作为 WebSocket 的备用方案）
  const startPolling = (taskId: number) => {
    // 清理之前的轮询
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }
    
    pollingRef.current = setInterval(async () => {
      try {
        const res = await api.get(`/images/${taskId}/status`);
        const { status, imageUrl: newImageUrl, errorMessage } = res.data;
        
        if (status === 'COMPLETED' && newImageUrl) {
          setImageUrl(newImageUrl);
          setLoading(false);
          setCurrentTaskId(null);
          toast("杰作已诞生", "success");
          fetchHistory();
          clearInterval(pollingRef.current!);
          pollingRef.current = null;
        } else if (status === 'FAILED') {
          setLoading(false);
          setCurrentTaskId(null);
          toast(errorMessage || "生成失败，请重试", "error");
          clearInterval(pollingRef.current!);
          pollingRef.current = null;
        }
      } catch (err) {
        console.error('轮询状态失败:', err);
      }
    }, 3000); // 每3秒轮询一次
  };

  const fetchProjects = async () => {
    try {
      const res = await api.get("/projects");
      setProjects(res.data);
      // 不再默认选择第一个项目，保持默认为公共素材库
    } catch (err) {
      console.error("Failed to fetch projects", err);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await api.get("/images/history");
      setHistory(res.data);
    } catch (err) {
      console.error("Failed to fetch history", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (referenceImages.length >= 3) {
        toast("最多只能添加 3 张参考图", "error");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setReferenceImages(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    }
    // 重置 input 以便重复上传同一文件
    e.target.value = "";
  };

  const removeReferenceImage = (index: number) => {
    setReferenceImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleGenerate = async () => {
    if (!prompt.trim() && referenceImages.length === 0) return;

    setLoading(true);
    setImageUrl(null); // 清空之前的图片
    setCurrentPrompt(prompt.trim());
    setCurrentModel(model);
    setCurrentRatio(ratio);
    
    const ratioConfig = RATIOS.find((r) => r.value === ratio);
    const finalPrompt = ratioConfig
      ? `${prompt.trim()} ${ratioConfig.suffix}`
      : prompt.trim();

    // 清空输入框
    setPrompt("");

    try {
      //目前后端API仅支持单张referenceImage，取第一张
      const referenceImage = referenceImages.length > 0 ? referenceImages[0] : null;

      const res = await api.post("/images/generate", {
        prompt: finalPrompt,
        model: model,
        size: ratioConfig?.size,
        referenceImage,
      });

      if (res.data?.id) {
        // 异步模式：保存任务ID，等待 WebSocket 推送或轮询
        setCurrentTaskId(res.data.id);
        toast("生成任务已提交，请稍候...", "success");
        
        // 启动轮询作为备用方案
        startPolling(res.data.id);
        
        // 刷新历史记录（会显示 PENDING 状态的任务）
        fetchHistory();
      } else if (res.data?.url) {
        // 同步模式（兼容旧接口）
        setImageUrl(res.data.url);
        setRevisedPrompt(res.data.revisedPrompt || null);
        setLoading(false);
        toast("杰作已诞生", "success");
        fetchHistory(); 
      } else {
        setLoading(false);
        toast("生成失败：未返回任务ID", "error");
      }
    } catch (err: any) {
      console.error("Failed to generate image", err);
      setLoading(false);
      toast(err.response?.data?.error || err.response?.data?.message || "生成失败，请重试", "error");
    }
  };

  const handleRegenerate = () => {
    setPrompt(currentPrompt);
    setModel(currentModel);
    setRatio(currentRatio);
    setImageUrl(null);
    setTimeout(() => handleGenerate(), 100);
  };

  const handleEditPrompt = () => {
    setPrompt(currentPrompt);
    setImageUrl(null);
  };

  const loadHistoryItem = (item: any) => {
    setImageUrl(item.imageUrl);
    setPrompt(item.prompt.replace(/ --ar \d+:\d+/, "")); 
    setHistoryOpen(false);
  };

  const openAddToAssetDialog = (item: any) => {
    setSelectedHistoryItem(item);
    setAssetName("");
    setAssetCategory("characters");
    setAddToAssetDialogOpen(true);
  };

  const handleAddToAsset = async () => {
    if (!assetName.trim() || !selectedHistoryItem) {
      toast("请填写素材名称", "error");
      return;
    }

    setAddingToAsset(true);
    try {
      // 如果选择公共素材库，调用公共素材接口
      if (selectedProjectId === "public") {
        await api.post("/public-assets", {
          name: assetName,
          category: assetCategory,
          imageUrl: selectedHistoryItem.imageUrl,
          description: selectedHistoryItem.prompt,
        });
      } else {
        // 调用项目素材上传接口（直接用 imageUrl）
        const categoryPath = assetCategory === "characters" ? "characters" 
          : assetCategory === "scenes" ? "scenes"
          : assetCategory === "props" ? "props"
          : "effects";
        
        await api.post(`/projects/${selectedProjectId}/assets/${categoryPath}/upload`, {
          name: assetName,
          description: selectedHistoryItem.prompt,
          imageUrl: selectedHistoryItem.imageUrl,
        });
      }
      toast("已添加到素材库", "success");
      setAddToAssetDialogOpen(false);
    } catch (err: any) {
      console.error("Failed to add to asset", err);
      toast(err.response?.data?.error || "添加失败", "error");
    } finally {
      setAddingToAsset(false);
    }
  };

  const useSuggestion = (text: string) => {
    setPrompt(text);
  };

  return (
    <div className="h-[calc(100vh-4rem)] w-full flex flex-col bg-[#020204] text-white relative font-sans selection:bg-amber-500/30 overflow-hidden rounded-tl-2xl">
      
      {/* 0. Ambient Background Effects */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        {/* Top-right glow */}
        <div className="absolute -top-[20%] -right-[10%] w-[70vw] h-[70vw] rounded-full bg-indigo-900/10 blur-[120px] mix-blend-screen animate-pulse duration-[10s]"></div>
        {/* Bottom-left glow */}
        <div className="absolute -bottom-[20%] -left-[10%] w-[60vw] h-[60vw] rounded-full bg-amber-900/5 blur-[100px] mix-blend-screen"></div>
        {/* Noise overlay */}
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-15 brightness-100 contrast-150 mix-blend-overlay"></div>
      </div>

      {/* 1. Header Area (Compact) */}
      <div className="flex-none px-6 py-4 flex justify-end z-20">
         <Button 
           variant="ghost" 
           onClick={() => setHistoryOpen(true)}
           className="relative bg-gradient-to-r from-purple-500/20 to-blue-500/20 border border-purple-500/30 hover:border-purple-500/50 hover:from-purple-500/30 hover:to-blue-500/30 backdrop-blur-xl text-white gap-2.5 h-10 px-5 rounded-full transition-all duration-300 shadow-lg shadow-purple-500/20 hover:shadow-purple-500/30 hover:scale-105"
         >
           <div className="absolute inset-0 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 opacity-0 hover:opacity-10 transition-opacity" />
           <History className="w-4 h-4 text-purple-400" />
           <span className="text-sm font-semibold tracking-wide">历史记录</span>
           {history.length > 0 && (
             <span className="ml-1 px-2 py-0.5 text-[10px] font-bold bg-purple-500 text-white rounded-full">
               {history.length}
             </span>
           )}
         </Button>
      </div>

      {/* 2. Main Content Area (Flex-1, Scrollable internally if needed) */}
      <div className="flex-1 flex flex-col items-center justify-center relative z-10 min-h-0 overflow-y-auto scrollbar-hide">
         <div className="w-full h-full flex items-center justify-center p-4">
            
            {loading ? (
               <div className="flex flex-col items-center gap-8 max-w-2xl animate-in fade-in zoom-in-95 duration-1000">
                  <div className="relative">
                    <div className="absolute inset-0 rounded-full blur-2xl bg-gradient-to-r from-amber-500/30 to-purple-500/30 animate-pulse"></div>
                    <div className="relative w-32 h-32 rounded-full bg-gradient-to-br from-amber-500/20 to-purple-500/20 backdrop-blur-sm border border-white/10 flex items-center justify-center">
                        <div className="absolute inset-2 rounded-full border-2 border-dashed border-amber-500/50 animate-spin" style={{ animationDuration: '3s' }}></div>
                        <Wand2 className="w-12 h-12 text-amber-500 animate-pulse" />
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-3 text-center px-8">
                     <p className="text-lg font-semibold text-white">AI 正在创作中...</p>
                     <div className="max-w-xl px-6 py-3 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
                        <p className="text-sm text-gray-300 leading-relaxed">{currentPrompt}</p>
                     </div>
                     <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span className="px-2 py-1 rounded-md bg-white/5 border border-white/5">
                           {MODELS.find(m => m.value === currentModel)?.label}
                        </span>
                        <span className="px-2 py-1 rounded-md bg-white/5 border border-white/5">
                           {currentRatio}
                        </span>
                     </div>
                     {/* 提示可以退出 */}
                     <div className="mt-4 px-4 py-3 rounded-xl bg-purple-500/10 border border-purple-500/20">
                        <p className="text-xs text-purple-300">
                           💡 您可以离开此页面，稍后在 
                           <button 
                             onClick={() => setHistoryOpen(true)}
                             className="mx-1 text-purple-400 hover:text-purple-300 underline underline-offset-2 font-medium"
                           >
                             历史记录
                           </button>
                           中查看生成结果
                        </p>
                     </div>
                  </div>
               </div>
            ) : imageUrl ? (
               <div className="relative w-full h-full flex flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-700 gap-4 py-4">
                  <div className="relative flex items-center justify-center w-full">
                     <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-indigo-500/5 blur-3xl opacity-50"></div>
                     
                     <div className="relative group">
                        <img 
                          src={imageUrl} 
                          alt="Generated" 
                          className="max-w-[70vw] max-h-[45vh] object-contain rounded-xl shadow-2xl shadow-black/80 ring-1 ring-white/10"
                        />
                        
                        <Button 
                           size="icon" 
                           className="absolute top-4 right-4 rounded-full w-10 h-10 shadow-xl bg-white/10 hover:bg-white text-white hover:text-black border border-white/10 backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all" 
                           onClick={() => window.open(imageUrl, '_blank')}
                           title="查看大图"
                        >
                           <Maximize2 className="w-4 h-4" />
                        </Button>
                     </div>
                  </div>
                  
                  {/* 底部操作按钮 */}
                  <div className="flex items-center gap-3 z-20">
                     <Button 
                        onClick={handleEditPrompt}
                        className="h-11 px-6 rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/10 backdrop-blur-md shadow-lg gap-2"
                     >
                        <Wand2 className="w-4 h-4" />
                        <span className="text-sm font-medium">编辑提示词</span>
                     </Button>
                     <Button 
                        onClick={handleRegenerate}
                        className="h-11 px-6 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white shadow-lg shadow-purple-500/30 gap-2"
                     >
                        <RefreshCw className="w-4 h-4" />
                        <span className="text-sm font-medium">重新生成</span>
                     </Button>
                     <Button 
                        onClick={() => openAddToAssetDialog({ id: 0, imageUrl, prompt: currentPrompt })}
                        className="h-11 px-6 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-lg shadow-amber-500/30 gap-2"
                     >
                        <FolderPlus className="w-4 h-4" />
                        <span className="text-sm font-medium">入库归档</span>
                     </Button>
                  </div>
               </div>
            ) : (
               <div className="flex flex-col items-center justify-center gap-8 max-w-3xl animate-in fade-in slide-in-from-bottom-4 duration-700 -mt-16">
                  {/* Empty State Icon - Slightly Larger */}
                  <div className="relative group cursor-default scale-110">
                      <div className="absolute inset-0 bg-gradient-to-tr from-amber-500/20 to-purple-500/20 blur-[50px] rounded-full group-hover:blur-[60px] transition-all duration-500"></div>
                      <div className="relative w-32 h-32 rounded-[2rem] bg-gradient-to-b from-white/5 to-transparent border border-white/5 backdrop-blur-sm flex items-center justify-center transform rotate-3 group-hover:rotate-6 transition-transform duration-500">
                         <Palette className="w-12 h-12 text-white/20 group-hover:text-white/40 transition-colors" />
                      </div>
                      <div className="absolute -top-3 -right-3 w-16 h-16 rounded-2xl bg-gradient-to-b from-amber-500/10 to-transparent border border-white/5 backdrop-blur-md flex items-center justify-center transform -rotate-6 group-hover:-rotate-12 transition-transform duration-500 delay-100">
                         <Wand2 className="w-6 h-6 text-amber-500/50 group-hover:text-amber-500/80 transition-colors" />
                      </div>
                  </div>
                  
                  <div className="text-center space-y-3">
                     <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white via-white to-gray-400">
                        释放无限创意
                     </h2>
                     <p className="text-gray-500 text-sm max-w-md mx-auto leading-relaxed">
                        输入提示词，或添加参考图，AI 即刻为您绘制。
                     </p>
                  </div>

                  <div className="flex flex-wrap justify-center gap-2.5 mt-2 px-8">
                     {SUGGESTIONS.map((text, i) => (
                        <button 
                           key={i}
                           onClick={() => useSuggestion(text)}
                           className="px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/5 hover:border-amber-500/30 text-[11px] text-gray-400 hover:text-white transition-all duration-300"
                        >
                           {text}
                        </button>
                     ))}
                  </div>
               </div>
            )}
         </div>
      </div>

      {/* 3. Input Footer (Fixed Bottom, Raised slightly) */}
      <div className="flex-none px-6 pb-16 pt-2 z-30 flex justify-center w-full">
         <div className="w-full max-w-[850px] flex flex-col gap-2.5">
            
            {/* Input Capsule - Slightly Larger */}
            <div 
               className={`
                  relative bg-[#0F0F11]/90 backdrop-blur-xl border border-white/10 
                  rounded-[24px] shadow-2xl shadow-black/50 
                  transition-all duration-300 ease-out
                  hover:border-white/20 hover:bg-[#121214]
                  flex flex-col p-3 gap-3
               `}
            >
               {/* Top Bar: Settings & Ref Images */}
               <div className="flex items-center justify-between border-b border-white/5 pb-2.5 px-1">
                  
                  {/* Left: Model & Ratio Settings */}
                  <div className="flex items-center gap-2.5">
                     {/* Model Selector */}
                     <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                           <button className="flex items-center gap-2 text-[11px] font-medium text-gray-400 hover:text-white transition-colors bg-white/5 hover:bg-white/10 px-3 py-2 rounded-xl border border-white/5 outline-none">
                              <Box className="w-3.5 h-3.5 text-amber-500" />
                              <span className="truncate max-w-[120px]">{MODELS.find(m => m.value === model)?.label.split('(')[0]}</span>
                           </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="bg-[#1a1a1a] border-white/10 p-2 w-72 backdrop-blur-xl mb-2">
                           <div className="space-y-1">
                              {MODELS.map(m => (
                                 <button
                                    key={m.value}
                                    onClick={() => setModel(m.value)}
                                    className={`w-full text-left px-3 py-2.5 rounded-md transition-all ${
                                       model === m.value 
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

                     {/* Ratio Selector */}
                     <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                           <button className="flex items-center gap-2 text-[11px] font-medium text-gray-400 hover:text-white transition-colors bg-white/5 hover:bg-white/10 px-3 py-2 rounded-xl border border-white/5 outline-none">
                              <LayoutTemplate className="w-3.5 h-3.5 text-blue-400" />
                              <span>{RATIOS.find(r => r.value === ratio)?.value}</span>
                           </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="bg-[#1a1a1a] border-white/10 p-2 w-64 backdrop-blur-xl mb-2">
                           <div className="grid grid-cols-2 gap-2">
                              {RATIOS.map(r => (
                                 <button
                                    key={r.value}
                                    onClick={() => setRatio(r.value)}
                                    className={`flex flex-col items-center p-2 rounded-md border transition-all ${
                                       ratio === r.value 
                                       ? 'bg-amber-500/20 border-amber-500/50 text-amber-500' 
                                       : 'bg-white/5 border-transparent text-gray-400 hover:bg-white/10 hover:text-white'
                                    }`}
                                 >
                                    <span className="text-xs font-bold">{r.value}</span>
                                 </button>
                              ))}
                           </div>
                        </DropdownMenuContent>
                     </DropdownMenu>
                  </div>
               </div>

               {/* Middle: Reference Images Area */}
               <div className="flex items-center gap-3 px-1 min-h-[48px]">
                   {/* Add Button */}
                   {referenceImages.length < 3 && (
                     <div className="relative group">
                       <button 
                         onClick={() => fileInputRef.current?.click()}
                         className="w-12 h-12 rounded-xl border border-dashed border-white/20 hover:border-amber-500/50 bg-white/5 hover:bg-white/10 flex flex-col items-center justify-center gap-0.5 transition-all group-hover:scale-105"
                       >
                         <Plus className="w-4 h-4 text-gray-400 group-hover:text-amber-500" />
                         <span className="text-[9px] text-gray-500 group-hover:text-amber-500/80 font-medium">添加</span>
                       </button>
                       <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
                     </div>
                   )}
                   
                   {/* Images List */}
                   {referenceImages.map((img, idx) => (
                     <div key={idx} className="relative group w-12 h-12 animate-in fade-in zoom-in duration-300">
                       <img src={img} alt={`Ref ${idx}`} className="w-full h-full object-cover rounded-xl border border-white/10" />
                       <button 
                         onClick={() => removeReferenceImage(idx)}
                         className="absolute -top-1.5 -right-1.5 bg-zinc-800 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 shadow-md border border-white/10"
                       >
                         <X className="w-3 h-3" />
                       </button>
                     </div>
                   ))}

                   {/* Vertical Divider */}
                   <div className="w-[1px] h-8 bg-white/10 mx-1"></div>

                   {/* Text Input */}
                   <div className="flex-1">
                     <Textarea 
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="描述您的想象..."
                        className="w-full bg-transparent border-0 focus-visible:ring-0 text-white placeholder:text-gray-500/50 min-h-[40px] max-h-[120px] p-2 text-base resize-none leading-relaxed selection:bg-amber-500/30"
                        rows={1}
                        onInput={(e) => {
                           const target = e.target as HTMLTextAreaElement;
                           target.style.height = 'auto';
                           target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
                        }}
                        onKeyDown={(e) => {
                           if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleGenerate();
                           }
                        }}
                     />
                   </div>

                   {/* Generate Button */}
                   <Button 
                     onClick={handleGenerate}
                     disabled={loading || (!prompt.trim() && referenceImages.length === 0)}
                     size="icon"
                     className={`
                        w-12 h-12 rounded-[18px] flex-shrink-0 transition-all duration-500
                        ${loading || (!prompt.trim() && referenceImages.length === 0)
                           ? "bg-white/5 text-gray-600"
                           : "bg-gradient-to-tr from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white shadow-lg shadow-orange-500/30 hover:scale-105 hover:rotate-3"
                        }
                     `}
                   >
                     {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-6 h-6" />}
                   </Button>
               </div>
            </div>
         </div>
      </div>

      {/* 4. History Dialog (Fullscreen Gallery) */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
         <DialogContent className="bg-[#050505]/98 border-white/10 text-white max-w-[95vw] h-[90vh] flex flex-col p-0 overflow-hidden shadow-2xl">
            <DialogHeader className="p-8 border-b border-white/5 flex flex-row items-center justify-between space-y-0">
               <div className="flex flex-col gap-1">
                  <DialogTitle className="text-2xl font-bold font-display tracking-tight">创作足迹</DialogTitle>
                  <DialogDescription className="text-gray-500">回顾您的每一次灵感迸发</DialogDescription>
               </div>
               <Button variant="outline" size="sm" onClick={fetchHistory} disabled={loadingHistory} className="border-white/10 bg-white/5 hover:bg-white/10 text-gray-300">
                  <RefreshCw className={`w-4 h-4 mr-2 ${loadingHistory ? 'animate-spin' : ''}`} />
                  刷新
               </Button>
            </DialogHeader>
            <ScrollArea className="flex-1 p-8">
               <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                  {history.length === 0 && (
                     <div className="col-span-full h-64 flex flex-col items-center justify-center text-gray-600 gap-4 border border-dashed border-white/10 rounded-2xl bg-white/5">
                        <History className="w-12 h-12 opacity-20" />
                        <p>暂无历史记录</p>
                     </div>
                  )}
                  {history.map((item) => (
                     <div 
                       key={item.id} 
                       className="group relative aspect-square bg-[#0a0a0a] rounded-2xl overflow-hidden border border-white/5 hover:border-amber-500/50 cursor-pointer shadow-lg hover:shadow-amber-500/10 transition-[border-color,box-shadow] duration-200" 
                       onClick={() => loadHistoryItem(item)}
                     >
                        <img 
                          src={item.imageUrl} 
                          alt={item.prompt} 
                          className="w-full h-full object-cover will-change-transform group-hover:scale-105 transition-transform duration-300 ease-out" 
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-4">
                           <div className="flex items-center gap-2 mb-2">
                              <span className="text-[10px] font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                                 {item.ratio?.replace(' --ar ', '') || '1:1'}
                              </span>
                           </div>
                           <p className="text-[11px] text-gray-200 line-clamp-2 leading-relaxed mb-3 font-medium">
                              {item.prompt}
                           </p>
                           <Button 
                             size="sm" 
                             className="w-full h-8 text-xs bg-white text-black hover:bg-gray-200 font-medium border-0"
                             onClick={(e) => {
                                e.stopPropagation();
                                openAddToAssetDialog(item);
                             }}
                           >
                              <FolderPlus className="w-3 h-3 mr-1.5" /> 素材库
                           </Button>
                        </div>
                     </div>
                  ))}
               </div>
            </ScrollArea>
         </DialogContent>
      </Dialog>

      {/* 5. Add to Asset Dialog (Clean) */}
      <Dialog open={addToAssetDialogOpen} onOpenChange={setAddToAssetDialogOpen}>
         <DialogContent className="bg-[#111] border-white/10 text-white sm:max-w-[450px] p-0 overflow-hidden shadow-2xl">
           <div className="p-6 border-b border-white/10 bg-gradient-to-r from-white/5 to-transparent">
             <DialogTitle className="text-lg font-bold">入库归档</DialogTitle>
             <DialogDescription className="text-gray-500 mt-1">
               将此创作保存为项目资产
             </DialogDescription>
           </div>
           
           <div className="p-6 space-y-5">
             {selectedHistoryItem && (
               <div className="flex gap-4">
                  <div className="w-24 h-24 rounded-lg overflow-hidden border border-white/10 flex-shrink-0">
                     <img 
                     src={selectedHistoryItem.imageUrl} 
                     alt="Preview" 
                     className="w-full h-full object-cover"
                     />
                  </div>
                  <div className="flex-1 space-y-1">
                     <p className="text-xs text-gray-500 uppercase tracking-wider font-bold">Prompt</p>
                     <p className="text-xs text-gray-300 line-clamp-3 leading-relaxed border-l-2 border-white/10 pl-2">
                        {selectedHistoryItem.prompt}
                     </p>
                  </div>
               </div>
             )}
             
             <div className="space-y-4">
               <div className="space-y-1.5">
                 <label className="text-xs font-medium text-gray-400 ml-1">资产名称</label>
                 <Input 
                   value={assetName} 
                   onChange={e => setAssetName(e.target.value)}
                   placeholder="为这个杰作取个名字..."
                   className="bg-black/40 border-white/10 h-10 focus:border-amber-500/50 transition-colors"
                 />
               </div>
               
               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                     <label className="text-xs font-medium text-gray-400 ml-1">分类</label>
                     <Select value={assetCategory} onValueChange={setAssetCategory}>
                     <SelectTrigger className="bg-black/40 border-white/10 h-10">
                        <SelectValue />
                     </SelectTrigger>
                     <SelectContent className="bg-[#1a1a1a] border-white/10">
                        <SelectItem value="characters">角色</SelectItem>
                        <SelectItem value="scenes">场景</SelectItem>
                        <SelectItem value="props">道具</SelectItem>
                        <SelectItem value="effects">特效</SelectItem>
                     </SelectContent>
                     </Select>
                  </div>
                  <div className="space-y-1.5">
                     <label className="text-xs font-medium text-gray-400 ml-1">所属项目</label>
                     <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                     <SelectTrigger className="bg-black/40 border-white/10 h-10">
                        <SelectValue placeholder="选择项目" />
                     </SelectTrigger>
                     <SelectContent className="bg-[#1a1a1a] border-white/10">
                        <SelectItem value="public" className="text-blue-400">
                          <span className="flex items-center gap-2">
                            🌐 公共素材库
                          </span>
                        </SelectItem>
                        {projects.length > 0 && (
                          <div className="my-1 border-t border-white/10" />
                        )}
                        {projects.map(p => (
                           <SelectItem key={p.id} value={String(p.id)}>{p.title}</SelectItem>
                        ))}
                     </SelectContent>
                     </Select>
                  </div>
               </div>
             </div>
           </div>

           <DialogFooter className="p-6 pt-2 bg-black/20">
             <Button variant="ghost" onClick={() => setAddToAssetDialogOpen(false)} className="hover:bg-white/5">
               取消
             </Button>
             <Button 
               onClick={handleAddToAsset} 
               disabled={addingToAsset}
               className="bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-900/20"
             >
               {addingToAsset && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
               确认归档
             </Button>
           </DialogFooter>
         </DialogContent>
       </Dialog>
    </div>
  );
}
