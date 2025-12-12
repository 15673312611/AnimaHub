"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/components/ui/toast-provider";
import { Loader2, Image as ImageIcon, Sparkles, Upload, X, Zap, History, Download, Copy, ArrowRight, RefreshCw } from "lucide-react";
import api from "@/lib/api";

const MODELS = [
  { value: "nano-banana-2-4k", label: "Nano Banana 2 (4K) - 多模态" },
];

const RATIOS = [
  { value: "1:1", label: "正方形 1:1", size: "1024x1024", suffix: " --ar 1:1" },
  { value: "16:9", label: "宽屏 16:9", size: "1280x720", suffix: " --ar 16:9" },
  { value: "9:16", label: "手机竖屏 9:16", size: "720x1280", suffix: " --ar 9:16" },
  { value: "4:3", label: "经典 4:3", size: "1024x768", suffix: " --ar 4:3" },
  { value: "3:4", label: "经典竖屏 3:4", size: "768x1024", suffix: " --ar 3:4" },
];

export default function AiImagePage() {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState("");
  const [ratio, setRatio] = useState<string>(RATIOS[0].value);
  const [loading, setLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [revisedPrompt, setRevisedPrompt] = useState<string | null>(null);
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchHistory();
  }, []);

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
      const reader = new FileReader();
      reader.onloadend = () => {
        setReferenceImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const clearReferenceImage = () => {
    setReferenceImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim() && !referenceImage) return;

    setLoading(true);
    setImageUrl(null);
    setRevisedPrompt(null);

    const ratioConfig = RATIOS.find((r) => r.value === ratio);
    const finalPrompt = ratioConfig
      ? `${prompt.trim()} ${ratioConfig.suffix}`
      : prompt.trim();

    try {
      const res = await api.post("/images/generate", {
        prompt: finalPrompt,
        model: "nano-banana-2-4k",
        size: ratioConfig?.size,
        referenceImage,
      });

      if (res.data?.url) {
        setImageUrl(res.data.url);
        setRevisedPrompt(res.data.revisedPrompt || null);
        toast("图片生成成功！", "success");
        fetchHistory(); // Refresh history
      } else {
        toast("生成失败：未返回图片URL", "error");
      }
    } catch (err: any) {
      console.error("Failed to generate image", err);
      toast(err.response?.data?.error || "生成失败，请重试", "error");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast("提示词已复制", "success");
  };

  const loadHistoryItem = (item: any) => {
    setImageUrl(item.imageUrl);
    setPrompt(item.prompt.replace(/ --ar \d+:\d+/, "")); // Simple cleanup
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white flex font-sans overflow-hidden">
       {/* Left Sidebar: Controls */}
       <div className="w-[360px] border-r border-white/10 bg-[#0a0a0a] flex flex-col h-screen flex-shrink-0">
          <div className="p-6 border-b border-white/10">
             <div className="flex items-center gap-2 text-amber-500 mb-1">
                <Zap className="w-5 h-5 fill-amber-500" />
                <span className="text-xs font-bold tracking-wider uppercase">Sora 2 Studio</span>
             </div>
             <h1 className="text-2xl font-bold text-white">
                AI 绘图工坊
             </h1>
             <p className="text-xs text-gray-500 mt-1">
                基于 Nano Banana 2 多模态大模型
             </p>
          </div>

          <ScrollArea className="flex-1">
             <div className="p-6 space-y-6">
                {/* Text Prompt */}
                <div className="space-y-3">
                   <label className="text-sm font-medium text-gray-300 flex justify-between">
                     创意提示词
                     <span className="text-xs text-gray-500">{prompt.length} 字符</span>
                   </label>
                   <Textarea
                     value={prompt}
                     onChange={(e) => setPrompt(e.target.value)}
                     placeholder="描述你想生成的画面..."
                     className="min-h-[140px] bg-black/30 border-white/10 focus:border-amber-500/50 text-sm resize-none rounded-xl p-4 leading-relaxed"
                   />
                </div>

                {/* Reference Image */}
                <div className="space-y-3">
                   <label className="text-sm font-medium text-gray-300 flex justify-between items-center">
                     <span>参考图 (可选)</span>
                     {referenceImage && (
                       <button onClick={clearReferenceImage} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1">
                         <X className="w-3 h-3" /> 清除
                       </button>
                     )}
                   </label>
                   
                   {!referenceImage ? (
                     <div 
                       onClick={() => fileInputRef.current?.click()}
                       className="border border-dashed border-white/10 rounded-xl p-6 hover:bg-white/5 hover:border-amber-500/30 transition-all cursor-pointer flex flex-col items-center justify-center gap-2 text-gray-400 group"
                     >
                       <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-amber-500/20 transition-colors">
                          <Upload className="w-5 h-5 text-gray-500 group-hover:text-amber-500" />
                       </div>
                       <span className="text-xs">点击上传参考图片</span>
                       <input 
                         type="file" 
                         ref={fileInputRef} 
                         onChange={handleFileChange} 
                         accept="image/*" 
                         className="hidden" 
                       />
                     </div>
                   ) : (
                     <div className="relative rounded-xl overflow-hidden border border-white/10 bg-black/50 h-[160px] group">
                       <img src={referenceImage} alt="Reference" className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity" />
                     </div>
                   )}
                </div>

                {/* Settings */}
                <div className="space-y-4 pt-4 border-t border-white/10">
                   <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-300">画面比例</label>
                      <div className="grid grid-cols-2 gap-2">
                        {RATIOS.slice(0, 4).map((r) => (
                           <button
                             key={r.value}
                             onClick={() => setRatio(r.value)}
                             className={`px-3 py-2 rounded-lg text-xs border transition-all ${
                               ratio === r.value 
                               ? "bg-amber-500/10 border-amber-500 text-amber-400" 
                               : "bg-black/30 border-white/10 text-gray-400 hover:bg-white/5"
                             }`}
                           >
                             {r.label}
                           </button>
                        ))}
                      </div>
                   </div>
                </div>
             </div>
          </ScrollArea>

          <div className="p-6 border-t border-white/10 bg-[#0a0a0a] z-10">
             <Button
               onClick={handleGenerate}
               disabled={loading || (!prompt.trim() && !referenceImage)}
               className="w-full h-12 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold rounded-xl shadow-lg shadow-orange-900/20 transition-all text-base"
             >
               {loading ? (
                 <span className="flex items-center gap-2">
                   <Loader2 className="w-5 h-5 animate-spin" /> 正在绘制...
                 </span>
               ) : (
                 <span className="flex items-center gap-2">
                   <Sparkles className="w-5 h-5 fill-white" /> 开始生成
                 </span>
               )}
             </Button>
          </div>
       </div>

       {/* Center: Canvas/Result */}
       <div className="flex-1 bg-[#050505] flex flex-col relative overflow-hidden">
          {/* Toolbar */}
          <div className="h-16 border-b border-white/10 flex items-center justify-between px-6 bg-[#0a0a0a]/50 backdrop-blur-md z-10">
             <div className="flex items-center gap-4">
                <span className="text-sm font-medium text-gray-400">当前预览</span>
             </div>
             {imageUrl && (
               <div className="flex items-center gap-2">
                  <a 
                    href={imageUrl} 
                    target="_blank" 
                    rel="noreferrer"
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors"
                  >
                    <Download className="w-4 h-4" /> 下载原图
                  </a>
               </div>
             )}
          </div>

          {/* Main Content */}
          <div className="flex-1 flex items-center justify-center p-8 relative">
             {/* Background Grid Pattern */}
             <div className="absolute inset-0 opacity-[0.03]" style={{
                backgroundImage: "radial-gradient(#fff 1px, transparent 1px)",
                backgroundSize: "24px 24px"
             }}></div>

             {imageUrl ? (
               <div className="relative max-w-full max-h-full shadow-2xl rounded-sm overflow-hidden border-4 border-white/5">
                 <img 
                   src={imageUrl} 
                   alt="Generated Content" 
                   className="max-h-[80vh] object-contain"
                 />
               </div>
             ) : (
               <div className="flex flex-col items-center justify-center text-gray-600 gap-4">
                 <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center">
                   <Sparkles className="w-10 h-10 opacity-20" />
                 </div>
                 <p className="text-lg font-medium">准备就绪，等待指令</p>
                 <p className="text-sm max-w-md text-center opacity-60">
                    在左侧输入提示词并点击生成，AI 将为您创造独一无二的艺术作品。
                 </p>
               </div>
             )}
          </div>

          {/* Bottom Revised Prompt (if any) */}
          {imageUrl && revisedPrompt && (
             <div className="absolute bottom-0 left-0 right-0 bg-black/80 border-t border-white/10 p-4 backdrop-blur-lg">
                <div className="max-w-4xl mx-auto flex items-start gap-4">
                   <div className="flex-1">
                      <p className="text-xs text-amber-500 font-bold uppercase tracking-wider mb-1">Prompt Review</p>
                      <p className="text-sm text-gray-300 line-clamp-2">{revisedPrompt}</p>
                   </div>
                   <Button variant="ghost" size="icon" onClick={() => copyToClipboard(revisedPrompt)} className="shrink-0">
                      <Copy className="w-4 h-4" />
                   </Button>
                </div>
             </div>
          )}
       </div>

       {/* Right Sidebar: History */}
       <div className="w-[280px] border-l border-white/10 bg-[#0a0a0a] flex flex-col h-screen flex-shrink-0">
          <div className="p-4 border-b border-white/10 flex items-center justify-between h-16">
             <h2 className="text-sm font-bold flex items-center gap-2">
               <History className="w-4 h-4 text-amber-500" /> 历史记录
             </h2>
             <Button variant="ghost" size="icon" className="h-8 w-8" onClick={fetchHistory}>
               <RefreshCw className={`w-4 h-4 ${loadingHistory ? 'animate-spin' : ''}`} />
             </Button>
          </div>

          <ScrollArea className="flex-1">
             <div className="p-4 space-y-4">
                {history.length === 0 && !loadingHistory && (
                   <div className="text-center py-10 text-gray-600 text-xs">
                      暂无生成记录
                   </div>
                )}

                {history.map((item) => (
                   <div 
                     key={item.id}
                     onClick={() => loadHistoryItem(item)}
                     className="group cursor-pointer rounded-lg overflow-hidden border border-white/5 bg-white/5 hover:border-amber-500/50 transition-all"
                   >
                      <div className="aspect-square bg-black relative">
                         <img src={item.imageUrl} alt="History" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                         <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                            <span className="text-[10px] text-white font-medium flex items-center gap-1">
                               <ArrowRight className="w-3 h-3" /> 点击加载
                            </span>
                         </div>
                      </div>
                      <div className="p-3">
                         <p className="text-[10px] text-gray-400 line-clamp-2 leading-relaxed mb-2">
                            {item.prompt}
                         </p>
                         <div className="flex items-center justify-between text-[10px] text-gray-600">
                            <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                            <span className="uppercase bg-white/5 px-1.5 py-0.5 rounded">{item.ratio?.replace(' --ar ', '') || '1:1'}</span>
                         </div>
                      </div>
                   </div>
                ))}
             </div>
          </ScrollArea>
       </div>
    </div>
  );
}
