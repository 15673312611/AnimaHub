"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/components/ui/toast-provider";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Loader2, X, History, FolderPlus, Maximize2, Wand2, Palette, RefreshCw, Plus, LayoutTemplate, Box, ArrowRight, Trash2, Coins } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import api from "@/lib/api";
import { imageApi } from "@/lib/imageApi";
import { coinApi } from "@/lib/coinApi";
import { wsService } from "@/lib/websocket";
import { OptimizedImage, preloadImages } from "@/components/OptimizedMedia";
import { useImageModels } from "@/lib/useImageModels";

// 聊天消息类型
interface ChatMessage {
  id: string;
  type: 'user' | 'assistant';
  prompt?: string;
  imageUrl?: string;
  status?: 'pending' | 'generating' | 'completed' | 'failed';
  model?: string;
  ratio?: string;
  taskId?: number;
  timestamp: number;
  errorMessage?: string;
  referenceImages?: string[];
}

const RATIOS = [
  { value: "3:4", label: "3:4 肖像", size: "1728x2304", suffix: " --ar 3:4" },
  { value: "1:1", label: "1:1 正方", size: "2048x2048", suffix: " --ar 1:1" },
  { value: "16:9", label: "16:9 影院", size: "2560x1440", suffix: " --ar 16:9" },
  { value: "9:16", label: "9:16 移动", size: "1440x2560", suffix: " --ar 9:16" },
  { value: "4:3", label: "4:3 经典", size: "2304x1728", suffix: " --ar 4:3" },
];

const SUGGESTIONS = [
  "赛博朋克风格的雨夜街道，霓虹灯光",
  "宫崎骏风格，漂浮在云端的魔法城堡",
  "极其写实的特写，一只沾满露珠的蓝色眼睛",
  "水墨画风格，孤舟蓑笠翁，独钓寒江雪"
];

export default function AiImagePage() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [prompt, setPrompt] = useState("");
  const [ratio, setRatio] = useState<string>(RATIOS[0].value);
  // 使用 useImageModels hook 获取模型列表
  const { models, defaultModel, loading: modelsLoading, refresh: refreshModels } = useImageModels("ai-image");
  const [model, setModel] = useState<string>("");
  const selectedModelInfo = models.find(m => m.value === model);
  // 聊天消息列表
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // 改为支持多个参考图
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  // 分页状态
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize] = useState(20);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyTotalPages, setHistoryTotalPages] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // 轮询定时器映射（支持多个任务同时进行）
  const pollingRefs = useRef<Map<number, NodeJS.Timeout>>(new Map());
  
  // Dialog States
  const [historyOpen, setHistoryOpen] = useState(false);
  const [addToAssetDialogOpen, setAddToAssetDialogOpen] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  
  // Dropdown States
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);

  // Asset Dialog States
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<any>(null);
  const [assetName, setAssetName] = useState("");
  const [assetCategory, setAssetCategory] = useState("characters");
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("public"); // 默认公共素材库
  const [addingToAsset, setAddingToAsset] = useState(false);

  // 漫币状态
  const [coinBalance, setCoinBalance] = useState<number | null>(null);
  const [modelPrices, setModelPrices] = useState<Record<string, number>>({});

  // 当模型列表加载完成后，设置默认模型
  useEffect(() => {
    if (!modelsLoading && defaultModel && !model) {
      setModel(defaultModel);
    }
  }, [modelsLoading, defaultModel, model]);

  // 如果模型代码已被修改，确保选择回落到有效模型
  useEffect(() => {
    if (!modelsLoading && models.length > 0 && model && !models.some(m => m.value === model)) {
      setModel(defaultModel || models[0].value);
    }
  }, [modelsLoading, models, model, defaultModel]);

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    fetchHistory();
    fetchProjects();
    fetchCoinInfo();

    const resolveCurrentUserId = (): number | null => {
      const token = localStorage.getItem("token");
      if (!token) return null;
      try {
        const payloadPart = token.split(".")[1];
        if (!payloadPart) return null;
        const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
        const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
        const payload = JSON.parse(window.atob(padded));
        const id = Number(payload?.sub);
        return Number.isFinite(id) ? id : null;
      } catch {
        return null;
      }
    };

    const userId = resolveCurrentUserId();
    if (userId) {
      // 连接 WebSocket
      wsService.connect();
      // 订阅当前用户图片生成频道
      wsService.subscribeToUserImages(userId, handleImageStatusUpdate);
    } else {
      console.warn("WebSocket 跳过订阅：未获取到当前用户ID");
    }
    
    // 注册重连回调：WebSocket 重连后刷新状态
    const unsubscribeReconnect = wsService.onReconnect(() => {
      console.log('🔄 WebSocket 重连，刷新图片状态');
      fetchHistory();
      // 刷新模型配置
      refreshModels();
    });
    
    return () => {
      if (userId) {
        wsService.unsubscribeFromUserImages(userId);
      }
      unsubscribeReconnect();
      // 清理所有轮询
      pollingRefs.current.forEach(timer => clearInterval(timer));
      pollingRefs.current.clear();
    };
  }, []);
  
  // 处理 WebSocket 推送的图片状态更新
  const handleImageStatusUpdate = (message: any) => {
    console.log('📥 收到图片状态更新:', message);
    
    if (message.type === 'IMAGE_STATUS_UPDATE') {
      const { imageId, status, imageUrl: newImageUrl, errorMessage } = message;
      
      // 更新消息列表中的状态
      setMessages(prev => prev.map(msg => {
        if (msg.taskId === imageId) {
          if (status === 'COMPLETED' && newImageUrl) {
            // 停止该任务的轮询
            const timer = pollingRefs.current.get(imageId);
            if (timer) {
              clearInterval(timer);
              pollingRefs.current.delete(imageId);
            }
            toast("杰作已诞生", "success");
            fetchHistory();
            // 刷新漫币余额
            fetchCoinInfo();
            return { ...msg, status: 'completed', imageUrl: newImageUrl };
          } else if (status === 'FAILED') {
            // 停止该任务的轮询
            const timer = pollingRefs.current.get(imageId);
            if (timer) {
              clearInterval(timer);
              pollingRefs.current.delete(imageId);
            }
            toast(errorMessage || "生成失败", "error");
            return { ...msg, status: 'failed', errorMessage };
          } else if (status === 'GENERATING') {
            return { ...msg, status: 'generating' };
          }
        }
        return msg;
      }));
      
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
    // 清理该任务之前的轮询
    const existingTimer = pollingRefs.current.get(taskId);
    if (existingTimer) {
      clearInterval(existingTimer);
    }
    
    const timer = setInterval(async () => {
      try {
        const res = await imageApi.getStatus(taskId);
        const { status, imageUrl: newImageUrl, errorMessage } = res.data;
        
        if (status === 'COMPLETED' && newImageUrl) {
          setMessages(prev => prev.map(msg => 
            msg.taskId === taskId 
              ? { ...msg, status: 'completed', imageUrl: newImageUrl }
              : msg
          ));
          toast("杰作已诞生", "success");
          fetchHistory();
          // 刷新漫币余额
          fetchCoinInfo();
          clearInterval(timer);
          pollingRefs.current.delete(taskId);
        } else if (status === 'FAILED') {
          setMessages(prev => prev.map(msg => 
            msg.taskId === taskId 
              ? { ...msg, status: 'failed', errorMessage }
              : msg
          ));
          toast(errorMessage || "生成失败", "error");
          clearInterval(timer);
          pollingRefs.current.delete(taskId);
        } else if (status === 'GENERATING') {
          setMessages(prev => prev.map(msg => 
            msg.taskId === taskId 
              ? { ...msg, status: 'generating' }
              : msg
          ));
        }
      } catch (err) {
        console.error('轮询状态失败:', err);
      }
    }, 3000); // 每3秒轮询一次
    
    pollingRefs.current.set(taskId, timer);
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

  // 获取漫币余额和模型价格
  const fetchCoinInfo = async () => {
    try {
      const [balanceRes, pricingRes] = await Promise.all([
        coinApi.getBalance(),
        coinApi.getAllPricing()
      ]);
      setCoinBalance(balanceRes.data.balance);
      // 将价格列表转换为 map
      const priceMap: Record<string, number> = {};
      pricingRes.data.forEach((p: any) => {
        priceMap[p.modelCode] = p.pricePerCall;
      });
      setModelPrices(priceMap);
    } catch (err) {
      console.error('获取漫币信息失败', err);
    }
  };

  const fetchHistory = async (page: number = 1) => {
    setLoadingHistory(true);
    try {
      const res = await imageApi.getHistory({ page, pageSize: historyPageSize });
      const { data, total, totalPages } = res.data;
      setHistory(data);
      setHistoryTotal(total);
      setHistoryTotalPages(totalPages);
      setHistoryPage(page);
      
      // 预加载历史记录中的图片
      const imageUrls = data
        .filter((item: any) => item.imageUrl)
        .slice(0, 10)
        .map((item: any) => item.imageUrl);
      preloadImages(imageUrls);
    } catch (err) {
      console.error("Failed to fetch history", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // 获取当前模型的参考图限制
    const currentModelConfig = models.find(m => m.value === model);
    const maxRef = currentModelConfig?.maxRef ?? 7;
    
    if (maxRef === 0) {
      toast("当前模型不支持参考图", "error");
      return;
    }
    
    if (file) {
      if (referenceImages.length >= maxRef) {
        toast(`当前模型最多支持 ${maxRef} 张参考图`, "error");
        return;
      }
      
      try {
        // 1. 获取预签名上传URL
        const presignRes = await api.post("/upload/presign", {
          fileName: file.name,
          contentType: file.type,
          folder: "reference-images"
        });
        
        const { uploadUrl, fileUrl } = presignRes.data;
        
        // 2. 直接上传到OSS
        await fetch(uploadUrl, {
          method: "PUT",
          body: file,
          headers: {
            "Content-Type": file.type
          }
        });
        
        // 3. 保存OSS URL
        setReferenceImages(prev => [...prev, fileUrl]);
        toast("参考图上传成功", "success");
        
      } catch (err: any) {
        console.error("上传参考图失败", err);
        // 降级：使用base64（但后端可能不支持）
        const reader = new FileReader();
        reader.onloadend = () => {
          setReferenceImages(prev => [...prev, reader.result as string]);
        };
        reader.readAsDataURL(file);
        toast("OSS上传失败，使用本地预览", "error");
      }
    }
    // 重置 input 以便重复上传同一文件
    e.target.value = "";
  };

  const removeReferenceImage = (index: number) => {
    setReferenceImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleGenerate = async () => {
    if (!prompt.trim() && referenceImages.length === 0) return;

    const userPrompt = prompt.trim();
    const currentRatio = ratio;
    const currentModel = model;
    const currentModelInfo = models.find(m => m.value === currentModel);
    const currentModelId = currentModelInfo?.id;
    const currentRefImages = [...referenceImages];
    
    // 检查漫币余额
    const currentPrice = modelPrices[currentModelInfo?.value || currentModel] || 0;
    if (coinBalance !== null && currentPrice > 0 && coinBalance < currentPrice) {
      toast(`漫币余额不足，需要 ${currentPrice} 漫币，当前余额 ${coinBalance}`, "error");
      return;
    }
    
    const ratioConfig = RATIOS.find((r) => r.value === currentRatio);
    const finalPrompt = ratioConfig
      ? `${userPrompt} ${ratioConfig.suffix}`
      : userPrompt;

    // 仅添加一条消息：包含提示词 + 生成状态/结果（避免提示词重复显示）
    const assistantMessageId = `assistant-${Date.now()}`;
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      type: 'assistant',
      status: 'pending',
      prompt: userPrompt,
      model: currentModel,
      ratio: currentRatio,
      timestamp: Date.now(),
      referenceImages: currentRefImages.length > 0 ? currentRefImages : undefined, // 保存参考图
    };
    setMessages(prev => [...prev, assistantMessage]);

    // 清空输入框和参考图
    setPrompt("");
    setReferenceImages([]);

    try {
      // 过滤掉 base64 格式的图片，只保留 URL
      const validImages = currentRefImages.filter(img => !img.startsWith("data:"));
      
      const res = await imageApi.generate({
        prompt: finalPrompt,
        model: currentModelInfo?.value || currentModel,
        modelId: currentModelId,
        size: ratioConfig?.size,
        referenceImages: validImages.length > 0 ? validImages : undefined,
        referenceImage: validImages.length > 0 ? validImages[0] : null,
      });

      if (res.data?.id) {
        // 异步模式：更新消息状态，保存任务ID
        setMessages(prev => prev.map(msg => 
          msg.id === assistantMessageId 
            ? { ...msg, taskId: res.data.id, status: 'generating' }
            : msg
        ));
        
        // 启动轮询作为备用方案
        startPolling(res.data.id);
        
        // 刷新历史记录
        fetchHistory();
      } else if (res.data?.url) {
        // 同步模式（兼容旧接口）
        setMessages(prev => prev.map(msg => 
          msg.id === assistantMessageId 
            ? { ...msg, status: 'completed', imageUrl: res.data.url }
            : msg
        ));
        toast("杰作已诞生", "success");
        fetchHistory();
      } else {
        setMessages(prev => prev.map(msg => 
          msg.id === assistantMessageId 
            ? { ...msg, status: 'failed', errorMessage: '未返回任务ID' }
            : msg
        ));
        toast("生成失败：未返回任务ID", "error");
      }
    } catch (err: any) {
      console.error("Failed to generate image", err);
      const errorCode = err.response?.data?.code;
      const errorMsg = err.response?.data?.error || err.response?.data?.message || "生成失败，请重试";
      
      // 根据错误码显示更友好的消息
      let displayMsg = errorMsg;
      if (errorCode === 'INSUFFICIENT_BALANCE') {
        displayMsg = errorMsg; // 后端已返回友好消息
        // 刷新余额
        fetchCoinInfo();
      }
      
      setMessages(prev => prev.map(msg => 
        msg.id === assistantMessageId 
          ? { ...msg, status: 'failed', errorMessage: displayMsg }
          : msg
      ));
      toast(displayMsg, "error");
    }
  };

  const handleRegenerate = (msg: ChatMessage) => {
    if (msg.prompt) {
      console.log("🔄 重新生成 - 消息数据:", {
        prompt: msg.prompt,
        model: msg.model,
        ratio: msg.ratio,
        referenceImages: msg.referenceImages
      });
      
      setPrompt(msg.prompt);
      if (msg.model) setModel(msg.model);
      if (msg.ratio) setRatio(msg.ratio);
      if (msg.referenceImages && msg.referenceImages.length > 0) {
        console.log("✅ 恢复参考图:", msg.referenceImages);
        setReferenceImages(msg.referenceImages);
      } else {
        console.log("⚠️ 没有参考图需要恢复");
      }
      // 不自动生成，让用户看到恢复的参数后手动点击生成
      toast("已恢复提示词和参数，可修改后重新生成", "info");
    }
  };

  const loadHistoryItem = (item: any) => {
    // 将历史记录加载为一条完整的生成记录（避免提示词重复显示）
    // 额外做一次去重：避免双击/事件重复导致同一条记录被插入两次
    const normalizedPrompt = item.prompt.replace(/ --ar \\d+:\\d+/, "");
    const assistantMessageId = `assistant-history-${Date.now()}`;
    
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      type: 'assistant',
      status: 'completed',
      imageUrl: item.imageUrl,
      prompt: normalizedPrompt,
      model: item.model,
      ratio: item.ratio,
      timestamp: Date.now(),
    };
    
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (
        last &&
        last.type === 'assistant' &&
        last.status === 'completed' &&
        last.imageUrl === assistantMessage.imageUrl &&
        last.prompt === assistantMessage.prompt &&
        last.model === assistantMessage.model &&
        last.ratio === assistantMessage.ratio
      ) {
        return prev;
      }
      return [...prev, assistantMessage];
    });
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

  const handleDeleteHistory = async (item: any, e: React.MouseEvent) => {
    e.stopPropagation();
    
    const confirmed = await confirm({
      title: "删除图片",
      description: "确定要删除这张图片吗？此操作无法撤销。",
      confirmText: "删除",
      variant: "danger"
    });
    
    if (!confirmed) return;
    
    try {
      await api.delete(`/images/${item.id}`);
      toast("删除成功", "success");
      // 刷新历史记录
      fetchHistory(historyPage);
    } catch (err: any) {
      console.error("删除失败", err);
      toast(err.response?.data?.error || "删除失败", "error");
    }
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
         </Button>
      </div>

      {/* 2. 聊天消息列表区域 */}
      <div className="flex-1 relative z-10 min-h-0 overflow-hidden">
         <ScrollArea className="h-full" ref={scrollRef}>
            <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">{/* 改为 max-w-3xl 和更小的间距 */}
               {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-8 min-h-[60vh] animate-in fade-in slide-in-from-bottom-4 duration-700">
                     {/* Empty State Icon */}
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
               ) : (
                  messages.map((msg, msgIndex) => (
                     <div key={msg.id} className="w-full">
                        {/* 每条消息都是完整宽度的卡片 - 更紧凑的设计 */}
                        <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden shadow-lg">
                           {/* 消息头部 - 显示提示词和参数 */}
                           <div className="p-3 border-b border-white/5">
                              <div className="flex items-start gap-2">
                                 <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500/30 to-blue-500/30 flex items-center justify-center flex-shrink-0">
                                    <Wand2 className="w-4 h-4 text-purple-300" />
                                 </div>
                                 <div className="flex-1 min-w-0">
                                    <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap break-words">
                                       {msg.prompt}
                                    </p>
                                    <div className="flex items-center gap-2 mt-1.5 text-[10px] text-gray-500">
                                       <span className="flex items-center gap-1">
                                          <Box className="w-2.5 h-2.5" />
                                          {models.find(m => m.value === msg.model)?.label?.split('(')[0] || msg.model}
                                       </span>
                                       <span>•</span>
                                       <span className="flex items-center gap-1">
                                          <LayoutTemplate className="w-2.5 h-2.5" />
                                          {msg.ratio}
                                       </span>
                                    </div>
                                 </div>
                              </div>
                              
                              {/* 参考图显示 - 更小的尺寸 */}
                              {msg.referenceImages && msg.referenceImages.length > 0 && (
                                 <div className="mt-2 flex gap-1.5 flex-wrap">
                                    {msg.referenceImages.map((img, idx) => (
                                       <div key={idx} className="relative group">
                                          <img 
                                             src={img} 
                                             alt={`参考图${idx+1}`} 
                                             className="w-14 h-14 rounded-md object-cover border border-white/20"
                                          />
                                          <div className="absolute inset-0 bg-black/50 rounded-md opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                             <span className="text-[10px] text-white">参考 {idx + 1}</span>
                                          </div>
                                       </div>
                                    ))}
                                 </div>
                              )}
                           </div>
                           
                           {/* 消息内容 - 显示生成结果 */}
                           <div className="bg-black/20">
                              {msg.status === 'pending' || msg.status === 'generating' ? (
                                 <div className="p-8 flex flex-col items-center gap-3">
                                    <div className="relative">
                                       <div className="absolute inset-0 rounded-full blur-lg bg-gradient-to-r from-amber-500/30 to-purple-500/30 animate-pulse"></div>
                                       <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-amber-500/20 to-purple-500/20 backdrop-blur-sm border border-white/10 flex items-center justify-center">
                                          <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
                                       </div>
                                    </div>
                                    <p className="text-xs text-gray-400">
                                       {msg.status === 'pending' ? 'AI 正在准备...' : 'AI 正在创作中...'}
                                    </p>
                                 </div>
                              ) : msg.status === 'failed' ? (
                                 <div className="p-8 flex flex-col items-center gap-3">
                                    <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
                                       <X className="w-8 h-8 text-red-400" />
                                    </div>
                                    <p className="text-xs text-red-400">{msg.errorMessage || '生成失败'}</p>
                                    <Button 
                                       size="sm"
                                       onClick={() => handleRegenerate(msg)}
                                       className="bg-white/10 hover:bg-white/20 text-white border border-white/10 h-7 text-xs"
                                    >
                                       <RefreshCw className="w-3 h-3 mr-1.5" />
                                       重新生成
                                    </Button>
                                 </div>
                              ) : msg.imageUrl ? (
                                 <div className="group relative">
                                    <img 
                                       src={msg.imageUrl} 
                                       alt="生成的图片" 
                                       className="w-full max-h-[280px] object-contain cursor-pointer"
                                       onClick={() => setPreviewImageUrl(msg.imageUrl!)}
                                    />
                                    <Button 
                                       size="icon" 
                                       className="absolute top-2 right-2 rounded-full w-8 h-8 shadow-lg bg-black/60 hover:bg-black/80 text-white border border-white/10 backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all" 
                                       onClick={(e) => {
                                          e.stopPropagation();
                                          setPreviewImageUrl(msg.imageUrl!);
                                       }}
                                       title="查看大图"
                                    >
                                       <Maximize2 className="w-4 h-4" />
                                    </Button>
                                 </div>
                              ) : null}
                           </div>
                           
                           {/* 操作按钮 - 只在生成完成时显示 */}
                           {msg.imageUrl && (
                              <div className="p-2 flex items-center gap-2 border-t border-white/5 bg-white/5">
                                 <Button 
                                    size="sm"
                                    onClick={() => handleRegenerate(msg)}
                                    className="flex-1 bg-white/5 hover:bg-white/10 text-white border border-white/10 h-8 text-xs"
                                 >
                                    <RefreshCw className="w-3 h-3 mr-1.5" />
                                    重新生成
                                 </Button>
                                 <Button 
                                    size="sm"
                                    onClick={() => openAddToAssetDialog({ id: msg.taskId || 0, imageUrl: msg.imageUrl, prompt: msg.prompt })}
                                    className="flex-1 bg-gradient-to-r from-amber-500/20 to-orange-500/20 hover:from-amber-500/30 hover:to-orange-500/30 text-amber-400 border border-amber-500/30 h-8 text-xs"
                                 >
                                    <FolderPlus className="w-3 h-3 mr-1.5" />
                                    入库归档
                                 </Button>
                              </div>
                           )}
                        </div>
                     </div>
                  ))
               )}
            </div>
         </ScrollArea>
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
                     {/* 当前模型价格 */}
                     {modelPrices[selectedModelInfo?.value || model] > 0 && (
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20">
                           <Coins className="w-3.5 h-3.5 text-amber-400" />
                           <span className="text-[11px] font-medium text-amber-400">
                              本次 -{modelPrices[selectedModelInfo?.value || model]}
                           </span>
                        </div>
                     )}
                     {/* Model Selector */}
                     <DropdownMenu open={modelDropdownOpen} onOpenChange={setModelDropdownOpen}>
                        <DropdownMenuTrigger asChild>
                           <button className="flex items-center gap-2 text-[11px] font-medium text-gray-400 hover:text-white transition-colors bg-white/5 hover:bg-white/10 px-3 py-2 rounded-xl border border-white/5 outline-none">
                              <Box className="w-3.5 h-3.5 text-amber-500" />
                              <span className="truncate max-w-[120px]">{models.find(m => m.value === model)?.label?.split('(')[0] || '选择模型'}</span>
                           </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="bg-[#1a1a1a] border-white/10 p-2 w-72 backdrop-blur-xl mb-2">
                           <div className="space-y-1">
                              {models.map(m => (
                                 <button
                                    key={m.value}
                                    onClick={() => {
                                      setModel(m.value);
                                      setModelDropdownOpen(false); // 关闭下拉菜单
                                      // 如果新模型不支持参考图，清空已上传的参考图
                                      if (m.maxRef === 0 && referenceImages.length > 0) {
                                        setReferenceImages([]);
                                        toast("已清空参考图（当前模型不支持）", "info");
                                      } else if (m.maxRef && referenceImages.length > m.maxRef) {
                                        // 如果超出新模型限制，截断
                                        setReferenceImages(prev => prev.slice(0, m.maxRef));
                                        toast(`已保留前 ${m.maxRef} 张参考图`, "info");
                                      }
                                    }}
                                    className={`w-full text-left px-3 py-2.5 rounded-md transition-all ${
                                       model === m.value 
                                       ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30' 
                                       : 'text-gray-300 hover:bg-white/5 hover:text-white border border-transparent'
                                    }`}
                                 >
                                    <div className="flex flex-col gap-0.5">
                                       <div className="flex items-center justify-between">
                                          <span className="text-xs font-medium">{m.label}</span>
                                          {modelPrices[m.value] > 0 && (
                                             <span className="text-[10px] text-amber-400 flex items-center gap-0.5">
                                                <Coins className="w-3 h-3" />{modelPrices[m.value]}
                                             </span>
                                          )}
                                       </div>
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
                   {/* Add Button - 根据模型限制显示 */}
                   {(() => {
                     const currentModelConfig = models.find(m => m.value === model);
                     const maxRef = currentModelConfig?.maxRef ?? 7;
                     const canAddMore = maxRef > 0 && referenceImages.length < maxRef;
                     
                     return canAddMore ? (
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
                     ) : maxRef === 0 ? (
                       <div className="text-[10px] text-gray-500 px-2">当前模型不支持参考图</div>
                     ) : null;
                   })()}
                   
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

                   {/* Generate Button - 移除 disabled 状态，允许连续生成 */}
                   <Button 
                     onClick={handleGenerate}
                     disabled={!prompt.trim() && referenceImages.length === 0}
                     size="icon"
                     className={`
                        w-12 h-12 rounded-[18px] flex-shrink-0 transition-all duration-500
                        ${(!prompt.trim() && referenceImages.length === 0)
                           ? "bg-white/5 text-gray-600"
                           : "bg-gradient-to-tr from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white shadow-lg shadow-orange-500/30 hover:scale-105 hover:rotate-3"
                        }
                     `}
                   >
                     <ArrowRight className="w-6 h-6" />
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
                  <DialogDescription className="text-gray-500">
                    回顾您的每一次灵感迸发 · 共 {historyTotal} 条记录
                  </DialogDescription>
               </div>
               <Button variant="outline" size="sm" onClick={() => fetchHistory(historyPage)} disabled={loadingHistory} className="border-white/10 bg-white/5 hover:bg-white/10 text-gray-300">
                  <RefreshCw className={`w-4 h-4 mr-2 ${loadingHistory ? 'animate-spin' : ''}`} />
                  刷新
               </Button>
            </DialogHeader>
            <ScrollArea className="flex-1 p-8">
               <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                  {history.length === 0 && !loadingHistory && (
                     <div className="col-span-full h-64 flex flex-col items-center justify-center text-gray-600 gap-4 border border-dashed border-white/10 rounded-2xl bg-white/5">
                        <History className="w-12 h-12 opacity-20" />
                        <p>暂无历史记录</p>
                     </div>
                  )}
                  {loadingHistory && history.length === 0 && (
                     <div className="col-span-full h-64 flex flex-col items-center justify-center text-gray-600 gap-4">
                        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
                        <p>加载中...</p>
                     </div>
                  )}
                  {history.map((item, index) => (
                     <div 
                       key={item.id} 
                       className={`group relative aspect-square bg-[#0a0a0a] rounded-2xl overflow-hidden border shadow-lg transition-[border-color,box-shadow] duration-200 ${
                         item.status === 'FAILED' 
                           ? 'border-red-500/30 hover:border-red-500/50' 
                           : item.status === 'PENDING' || item.status === 'GENERATING'
                             ? 'border-amber-500/30 hover:border-amber-500/50'
                             : 'border-white/5 hover:border-amber-500/50 cursor-pointer hover:shadow-amber-500/10'
                       }`}
                       onClick={() => item.status === 'COMPLETED' && loadHistoryItem(item)}
                     >
                        {/* 根据状态显示不同内容 */}
                        {item.status === 'PENDING' || item.status === 'GENERATING' ? (
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-amber-500/5 to-transparent">
                            <div className="relative">
                              <div className="absolute inset-0 rounded-full blur-lg bg-amber-500/20 animate-pulse"></div>
                              <div className="relative w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
                                <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
                              </div>
                            </div>
                            <span className="text-xs text-amber-400 font-medium">
                              {item.status === 'PENDING' ? '准备中...' : '生成中...'}
                            </span>
                            <p className="text-[10px] text-gray-500 px-4 text-center line-clamp-2">
                              {item.prompt}
                            </p>
                          </div>
                        ) : item.status === 'FAILED' ? (
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-red-500/5 to-transparent p-4">
                            <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
                              <X className="w-6 h-6 text-red-400" />
                            </div>
                            <span className="text-xs text-red-400 font-medium">生成失败</span>
                            <p className="text-[10px] text-red-400/70 text-center line-clamp-2">
                              {item.errorMessage || '未知错误'}
                            </p>
                            <p className="text-[10px] text-gray-500 text-center line-clamp-1">
                              {item.prompt}
                            </p>
                          </div>
                        ) : (
                          <>
                            <OptimizedImage 
                              src={item.imageUrl} 
                              alt={item.prompt} 
                              className="w-full h-full group-hover:scale-105 transition-transform duration-300 ease-out"
                              objectFit="cover"
                              priority={index < 6}
                              placeholder="blur"
                            />
                            {/* 删除按钮 - 右上角 */}
                            <button
                              onClick={(e) => handleDeleteHistory(item, e)}
                              className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/70 hover:bg-red-500 text-white border border-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 z-10"
                              title="删除"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
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
                          </>
                        )}
                        {/* 删除按钮 - 对于失败和生成中的也显示 */}
                        {(item.status === 'FAILED' || item.status === 'PENDING' || item.status === 'GENERATING') && (
                          <button
                            onClick={(e) => handleDeleteHistory(item, e)}
                            className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/70 hover:bg-red-500 text-white border border-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 z-10"
                            title="删除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                     </div>
                  ))}
               </div>
            </ScrollArea>
            {/* 分页控件 */}
            {historyTotalPages > 1 && (
               <div className="flex-none px-8 py-4 border-t border-white/5 flex items-center justify-center gap-4">
                  <Button
                     variant="outline"
                     size="sm"
                     onClick={() => fetchHistory(historyPage - 1)}
                     disabled={historyPage <= 1 || loadingHistory}
                     className="border-white/10 bg-white/5 hover:bg-white/10 text-gray-300 disabled:opacity-30"
                  >
                     上一页
                  </Button>
                  <span className="text-sm text-gray-400">
                     第 <span className="text-white font-medium">{historyPage}</span> / {historyTotalPages} 页
                  </span>
                  <Button
                     variant="outline"
                     size="sm"
                     onClick={() => fetchHistory(historyPage + 1)}
                     disabled={historyPage >= historyTotalPages || loadingHistory}
                     className="border-white/10 bg-white/5 hover:bg-white/10 text-gray-300 disabled:opacity-30"
                  >
                     下一页
                  </Button>
               </div>
            )}
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

      {/* 6. Image Preview Dialog */}
      <Dialog open={!!previewImageUrl} onOpenChange={(open) => !open && setPreviewImageUrl(null)}>
         <DialogContent className="bg-black/95 border-white/10 text-white max-w-[95vw] max-h-[95vh] p-0 overflow-hidden">
            <div className="relative w-full h-full flex items-center justify-center p-4">
               {previewImageUrl && (
                  <img 
                     src={previewImageUrl} 
                     alt="Preview" 
                     className="max-w-full max-h-[85vh] object-contain rounded-lg"
                  />
               )}
               <Button 
                  size="icon"
                  variant="ghost"
                  className="absolute top-4 right-4 rounded-full w-10 h-10 bg-white/10 hover:bg-white/20 text-white"
                  onClick={() => setPreviewImageUrl(null)}
               >
                  <X className="w-5 h-5" />
               </Button>
            </div>
         </DialogContent>
      </Dialog>
    </div>
  );
}
