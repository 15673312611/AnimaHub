"use client";

import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, Sparkles, Upload, Image as ImageIcon, Users, Map, Box, Wand2, Plus, Trash2, MoreHorizontal, Globe, LayoutTemplate, X, UploadCloud, RatioIcon } from "lucide-react";
import { useToast } from "@/components/ui/toast-provider";
import { motion, AnimatePresence } from "framer-motion";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import ImageUploader from "../anime-project/[id]/components/ImageUploader";
import ModelSelector from "../anime-project/[id]/components/ModelSelector";
import { useImageModels } from "@/lib/useImageModels";
import { OptimizedImage, preloadImages } from "@/components/OptimizedMedia";

interface PublicAsset {
  id: number;
  name: string;
  description?: string;
  category: string;
  subCategory?: string;
  imageUrl?: string;
  status: string;
  useCount: number;
  createdAt: string;
}

type AssetCategory = "all" | "characters" | "scenes" | "props" | "effects";

const ASSET_CATEGORIES = {
  all: { label: "全部", icon: Globe },
  characters: { label: "角色", icon: Users },
  scenes: { label: "场景", icon: Map },
  props: { label: "道具", icon: Box },
  effects: { label: "特效", icon: Wand2 },
};

export default function PublicAssetsPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<AssetCategory>("all");
  
  const [assets, setAssets] = useState<PublicAsset[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Create Dialog State
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [dialogMode, setDialogMode] = useState<"generate" | "upload">("generate");
  
  // AI 生成表单
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newCategory, setNewCategory] = useState<string>("characters");
  const [newPrompt, setNewPrompt] = useState("");
  const [newModel, setNewModel] = useState("");
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [uploadedImageUrl, setUploadedImageUrl] = useState("");
  const [simpleDesc, setSimpleDesc] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const refInputRef = useRef<HTMLInputElement>(null);
  const [refUploading, setRefUploading] = useState(false);
  
  const { defaultModel } = useImageModels("project");
  
  useEffect(() => {
    if (defaultModel && !newModel) setNewModel(defaultModel);
  }, [defaultModel, newModel]);

  // 轮询检查生成中的素材（使用 ref 避免依赖 assets 导致重复创建 interval）
  const assetsRef = useRef<PublicAsset[]>([]);
  assetsRef.current = assets;
  
  useEffect(() => {
    const checkAndPoll = () => {
      const hasGenerating = assetsRef.current.some(a => a.status === 'PENDING' || a.status === 'GENERATING');
      if (hasGenerating) {
        fetchAssets(true); // 静默刷新，不显示 loading
      }
    };
    const interval = setInterval(checkAndPoll, 5000);
    return () => clearInterval(interval);
  }, [activeTab]);

  useEffect(() => {
    fetchAssets(false); // 初始加载显示 loading
  }, [activeTab]);

  const fetchAssets = async (silent = false) => {
    // silent 模式不显示 loading，避免轮询时页面闪烁
    if (!silent) {
      setLoading(true);
    }
    try {
      const params = activeTab === "all" ? {} : { category: activeTab };
      const res = await api.get("/public-assets", { params });
      const data = res.data || [];
      setAssets(data);
      
      // 只在非静默模式下预加载图片
      if (!silent) {
        const imageUrls = data
          .filter((a: PublicAsset) => a.imageUrl)
          .slice(0, 8)
          .map((a: PublicAsset) => a.imageUrl!);
        preloadImages(imageUrls);
      }
    } catch (error) {
      console.error("Failed to load public assets", error);
      if (!silent) {
        toast("加载公共素材失败", "error");
      }
      // 静默模式下不清空 assets，保持当前状态
      if (!silent) {
        setAssets([]);
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  // AI 智能生成提示词
  const generatePromptWithAI = async () => {
    if (!simpleDesc.trim()) { toast("请先输入简单描述", "error"); return; }
    setAiGenerating(true);
    try {
      const res = await api.post("/ai/generate-prompt", { type: newCategory, description: simpleDesc });
      if (res.data?.prompt) { setNewPrompt(res.data.prompt); toast("✨ 提示词生成成功", "success"); }
    } catch {
      toast("提示词生成失败，请手动填写", "error");
    } finally { setAiGenerating(false); }
  };

  // 参考图上传
  const handleRefImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || referenceImages.length >= 4) return;
    if (!file.type.startsWith('image/')) { toast("请选择图片文件", "error"); return; }
    if (file.size > 10 * 1024 * 1024) { toast("文件不能超过 10MB", "error"); return; }
    setRefUploading(true);
    try {
      const presignRes = await api.post('/oss/presign', { fileName: file.name, folder: 'reference-images', contentType: file.type });
      const { uploadUrl, fileUrl, contentType } = presignRes.data;
      await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: file });
      setReferenceImages(prev => [...prev, fileUrl]);
    } catch { toast("上传失败", "error"); }
    finally { setRefUploading(false); if (refInputRef.current) refInputRef.current.value = ''; }
  };

  const removeRefImage = (index: number) => setReferenceImages(prev => prev.filter((_, i) => i !== index));

  const handleCreate = async () => {
    if (!newName) { toast("请填写名称", "error"); return; }
    if (dialogMode === "upload" && !uploadedImageUrl) { toast("请上传图片", "error"); return; }
    if (dialogMode === "generate" && !newPrompt) { toast("请填写生成提示词", "error"); return; }

    setCreating(true);
    try {
      if (dialogMode === "upload") {
        await api.post("/public-assets", {
          name: newName, description: newDescription, category: newCategory, imageUrl: uploadedImageUrl
        });
        toast("素材上传成功", "success");
      } else {
        await api.post("/public-assets/generate", {
          name: newName, description: newDescription, category: newCategory,
          prompt: newPrompt, model: newModel, aspectRatio,
          referenceImages: referenceImages.length > 0 ? JSON.stringify(referenceImages) : null
        });
        toast("🎨 AI生成任务已提交，请稍候...", "success");
      }
      setCreateDialogOpen(false);
      resetForm();
      fetchAssets();
    } catch (error) {
      console.error("Failed to create asset", error);
      toast("操作失败，请重试", "error");
    } finally { setCreating(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("确认删除该素材？")) return;
    try {
      await api.delete(`/public-assets/${id}`);
      setAssets(prev => prev.filter(a => a.id !== id));
      toast("删除成功", "success");
    } catch (error) {
      console.error("Failed to delete asset", error);
      toast("删除失败", "error");
    }
  };

  const resetForm = () => {
    setNewName(""); setNewDescription(""); setNewCategory("characters");
    setUploadedImageUrl(""); setNewPrompt(""); setSimpleDesc("");
    setReferenceImages([]); setNewModel(defaultModel || ""); setAspectRatio("1:1");
  };

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Globe className="w-8 h-8 text-blue-500" />
              公共素材库
            </h1>
            <p className="text-gray-400 mt-1">跨项目共享的素材资源：角色、场景、道具与特效</p>
          </div>
          
          <Button onClick={() => setCreateDialogOpen(true)} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-2" />
            添加素材
          </Button>
        </div>

        {/* ====== 添加素材弹窗 ====== */}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent className="bg-zinc-950/95 backdrop-blur-xl text-white border-white/10 max-w-4xl rounded-2xl shadow-2xl p-0 overflow-hidden max-h-[90vh] overflow-y-auto">
            <DialogHeader className="px-6 py-4 border-b border-white/5 bg-gradient-to-r from-blue-900/20 to-purple-900/20">
              <DialogTitle className="text-xl">{dialogMode === "generate" ? "AI 生成素材" : "上传素材"}</DialogTitle>
              <DialogDescription className="text-zinc-400">
                {dialogMode === "generate" ? "使用 AI 大模型生成高质量素材图片" : "上传已有的素材图片到公共库"}
              </DialogDescription>
            </DialogHeader>

            <Tabs value={dialogMode} onValueChange={(v: any) => setDialogMode(v)} className="w-full">
              <div className="px-5 pt-4">
                <TabsList className="grid w-full grid-cols-2 bg-zinc-900/50 p-1 rounded-xl border border-white/5">
                  <TabsTrigger value="generate" className="rounded-lg data-[state=active]:bg-zinc-800 data-[state=active]:text-white py-2">
                    <Wand2 className="w-4 h-4 mr-2" /> AI 生成
                  </TabsTrigger>
                  <TabsTrigger value="upload" className="rounded-lg data-[state=active]:bg-zinc-800 data-[state=active]:text-white py-2">
                    <Upload className="w-4 h-4 mr-2" /> 手动上传
                  </TabsTrigger>
                </TabsList>
              </div>

              <div className="p-5">
                {dialogMode === "generate" ? (
                  <div className="space-y-4">
                    {/* AI 智能生成提示词 */}
                    <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-xl p-3 border border-blue-500/20">
                      <div className="flex gap-2 items-center">
                        <Sparkles className="w-4 h-4 text-blue-400 flex-shrink-0" />
                        <Input
                          value={simpleDesc}
                          onChange={(e) => setSimpleDesc(e.target.value)}
                          placeholder="简单描述素材，如：银发红瞳的冷酷少女、赛博朋克城市夜景..."
                          className="bg-zinc-900/50 border-white/10 h-9 rounded-lg flex-1 text-sm"
                        />
                        <Button
                          onClick={generatePromptWithAI}
                          disabled={aiGenerating}
                          className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 h-9 px-4 rounded-lg text-xs"
                        >
                          {aiGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
{aiGenerating ? "生成中..." : "智能提示词"}
                        </Button>
                      </div>
                    </div>

                    {/* 设置行: 名称 + 分类 + 模型 */}
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <Label className="text-xs text-zinc-500 mb-1.5 block">素材名称 *</Label>
                        <Input
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          placeholder="例如: 赛博朋克主角"
                          className="bg-zinc-900/30 border-white/10 h-9 rounded-lg"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-zinc-500 mb-1.5 block">素材分类</Label>
                        <Select value={newCategory} onValueChange={setNewCategory}>
                          <SelectTrigger className="bg-zinc-900/30 border-white/10 h-9 rounded-lg">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border-white/10">
                            <SelectItem value="characters">角色</SelectItem>
                            <SelectItem value="scenes">场景</SelectItem>
                            <SelectItem value="props">道具</SelectItem>
                            <SelectItem value="effects">特效</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs text-zinc-500 mb-1.5 block">生成模型</Label>
                        <ModelSelector
                          value={newModel}
                          onChange={(v) => setNewModel(v)}
                        />
                      </div>
                    </div>

                    {/* 比例 + 参考图 */}
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0">
                        <Label className="text-xs text-zinc-500 mb-1.5 block">生成比例</Label>
                        <div className="flex gap-1">
                          {["1:1", "16:9", "9:16", "4:3", "3:4"].map((r) => (
                            <button
                              key={r}
                              onClick={() => setAspectRatio(r)}
                              className={cn(
                                "px-2.5 py-1 rounded-md text-[11px] font-medium transition-all border",
                                aspectRatio === r
                                  ? "bg-blue-600/20 border-blue-500/50 text-blue-400"
                                  : "bg-zinc-900/30 border-white/5 text-zinc-500 hover:text-zinc-300 hover:border-white/10"
                              )}
                            >
                              {r}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <Label className="text-xs text-zinc-500 mb-1.5 flex justify-between">
                          <span>参考图</span>
                          <span className="text-zinc-600">{referenceImages.length}/4</span>
                        </Label>
                        <input ref={refInputRef} type="file" accept="image/*" className="hidden" onChange={handleRefImageUpload} />
                        <div className="flex gap-1.5 items-center flex-wrap">
                          {referenceImages.map((img, idx) => (
                            <div key={idx} className="relative w-9 h-9 rounded-md overflow-hidden border border-white/10 group flex-shrink-0">
                              <img src={img} className="w-full h-full object-cover" alt="" />
                              <button
                                onClick={() => removeRefImage(idx)}
                                className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X className="w-3 h-3 text-white" />
                              </button>
                            </div>
                          ))}
                          {referenceImages.length < 4 && (
                            <button
                              onClick={() => refInputRef.current?.click()}
                              disabled={refUploading}
                              className="w-9 h-9 rounded-md border border-dashed border-white/10 flex items-center justify-center text-zinc-600 hover:text-zinc-400 hover:border-white/20 transition-colors disabled:opacity-30 flex-shrink-0"
                            >
                              {refUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Prompt - 全宽 */}
                    <div>
                      <Label className="text-xs text-zinc-500 mb-1.5 block">素材描述 (Prompt)</Label>
                      <Textarea
                        value={newPrompt}
                        onChange={(e) => setNewPrompt(e.target.value)}
                        placeholder="详细描述想要生成的素材特征..."
                        className="bg-zinc-900/30 border-white/10 min-h-[200px] text-sm resize-none rounded-xl focus:ring-1 focus:border-blue-500/50 focus:ring-blue-500/20 font-mono"
                      />
                    </div>
                  </div>
                ) : (
                  /* 手动上传 */
                  <div className="max-w-2xl mx-auto py-6">
                    <div className="bg-gradient-to-br from-zinc-900/80 to-zinc-900/40 rounded-2xl border border-white/5 p-8 space-y-8">
                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-3">
                          <Label className="text-base font-medium text-white">素材名称 *</Label>
                          <Input
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="例如: 赛博朋克主角"
                            className="bg-black/30 h-12 text-base rounded-xl border-white/10"
                          />
                        </div>
                        <div className="space-y-3">
                          <Label className="text-base font-medium text-white">素材分类</Label>
                          <Select value={newCategory} onValueChange={setNewCategory}>
                            <SelectTrigger className="bg-black/30 h-12 text-base rounded-xl border-white/10">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-zinc-800">
                              <SelectItem value="characters">角色</SelectItem>
                              <SelectItem value="scenes">场景</SelectItem>
                              <SelectItem value="props">道具</SelectItem>
                              <SelectItem value="effects">特效</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <Label className="text-base font-medium text-white">描述 (可选)</Label>
                        <Textarea
                          value={newDescription}
                          onChange={(e) => setNewDescription(e.target.value)}
                          placeholder="简要描述这个素材..."
                          className="bg-black/30 border-white/10 h-20 rounded-xl"
                        />
                      </div>
                      <div className="space-y-3">
                        <Label className="text-base font-medium text-white">上传图片 *</Label>
                        {uploadedImageUrl ? (
                          <div className="relative group rounded-2xl overflow-hidden border border-white/10 bg-black/20">
                            <div className="aspect-video">
                              <img src={uploadedImageUrl} alt="Preview" className="w-full h-full object-contain" />
                            </div>
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
                              <Button variant="outline" size="sm" onClick={() => setUploadedImageUrl("")} className="bg-red-500/20 hover:bg-red-500/40 text-red-400 border-red-500/50 rounded-full px-4">移除图片</Button>
                            </div>
                          </div>
                        ) : (
                          <ImageUploader onUpload={(url) => setUploadedImageUrl(url)} label="" description="支持 JPG/PNG/GIF，最大 10MB" folder="public-assets" className="h-[200px]" />
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter className="px-6 py-4 bg-zinc-900/50 border-t border-white/5">
                <Button variant="ghost" onClick={() => setCreateDialogOpen(false)} className="h-10 px-5 rounded-xl hover:bg-white/5">取消</Button>
                <Button onClick={handleCreate} disabled={creating} className="bg-gradient-to-r from-blue-600 to-purple-600 text-white h-10 px-6 rounded-xl shadow-lg">
                  {creating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />处理中...</> : <>{dialogMode === "generate" ? <Wand2 className="w-4 h-4 mr-2" /> : <Upload className="w-4 h-4 mr-2" />}{dialogMode === "generate" ? "开始生成" : "确认上传"}</>}
                </Button>
              </DialogFooter>
            </Tabs>
          </DialogContent>
        </Dialog>

        {/* Tabs & Content */}
        <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="w-full">
           <TabsList className="bg-zinc-900/50 border border-white/5 p-1 h-12 rounded-xl">
              {(Object.keys(ASSET_CATEGORIES) as AssetCategory[]).map((type) => {
                 const Icon = ASSET_CATEGORIES[type].icon;
                 return (
                   <TabsTrigger 
                     key={type} 
                     value={type}
                     className="data-[state=active]:bg-blue-600 data-[state=active]:text-white px-6 h-10 rounded-lg flex items-center gap-2 transition-all"
                   >
                     <Icon className="w-4 h-4" />
                     {ASSET_CATEGORIES[type].label}
                   </TabsTrigger>
                 );
              })}
           </TabsList>

           <div className="mt-8">
              {loading ? (
                 <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
                    {[1,2,3,4,5].map(i => (
                       <div key={i} className="aspect-[3/4] bg-zinc-900/50 rounded-xl animate-pulse" />
                    ))}
                 </div>
              ) : assets.length === 0 ? (
                 <div className="flex flex-col items-center justify-center py-20 bg-zinc-900/20 border border-white/5 border-dashed rounded-2xl">
                    <div className="w-16 h-16 bg-zinc-800/50 rounded-full flex items-center justify-center mb-4">
                       <ImageIcon className="w-8 h-8 text-zinc-600" />
                    </div>
                    <p className="text-zinc-400 mb-4">暂无{activeTab === "all" ? "" : ASSET_CATEGORIES[activeTab].label}素材</p>
                    <Button variant="outline" onClick={() => setCreateDialogOpen(true)}>
                       立即上传
                    </Button>
                 </div>
              ) : (
                 <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
                    <AnimatePresence>
                    {assets.map(asset => (
                       <motion.div
                          key={asset.id}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          layout
                          className="group relative"
                       >
                          <div className="relative aspect-[3/4] bg-zinc-900 rounded-xl overflow-hidden border border-white/5 hover:border-blue-500/50 transition-all shadow-lg hover:shadow-blue-900/20">
                             {/* Image */}
                             {(asset.status === 'PENDING' || asset.status === 'GENERATING') ? (
                                <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-800/50 gap-3">
                                   <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                                   <span className="text-xs text-zinc-400">{asset.status === 'PENDING' ? '等待生成...' : 'AI 生成中...'}</span>
                                </div>
                             ) : asset.status === 'FAILED' ? (
                                <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-800/50 gap-2">
                                   <X className="w-8 h-8 text-red-500" />
                                   <span className="text-xs text-red-400">生成失败</span>
                                </div>
                             ) : asset.imageUrl ? (
                                <OptimizedImage 
                                  src={asset.imageUrl} 
                                  alt={asset.name} 
                                  className="w-full h-full"
                                  objectFit="cover"
                                  priority={assets.indexOf(asset) < 5}
                                  placeholder="blur"
                                />
                             ) : (
                                <div className="w-full h-full flex items-center justify-center bg-zinc-800/50">
                                   <ImageIcon className="w-10 h-10 text-zinc-600" />
                                </div>
                             )}
                             
                             {/* Overlay Info */}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-100 transition-opacity">
                                <div className="absolute bottom-0 left-0 right-0 p-4">
                                   <h3 className="font-semibold text-white truncate">{asset.name}</h3>
                                   <p className="text-xs text-gray-400 line-clamp-1">{asset.description || "无描述"}</p>
                                   <div className="flex items-center gap-2 mt-1">
                                     <span className="text-[10px] px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded-full">
                                       {ASSET_CATEGORIES[asset.category as AssetCategory]?.label || asset.category}
                                     </span>
                                     {asset.status === 'ACTIVE' && <span className="text-[10px] text-zinc-500">使用 {asset.useCount} 次</span>}
                                   </div>
                                </div>
                             </div>
                             
                             {/* Actions */}
                             <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <DropdownMenu>
                                   <DropdownMenuTrigger asChild>
                                      <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur-sm">
                                         <MoreHorizontal className="w-4 h-4" />
                                      </Button>
                                   </DropdownMenuTrigger>
                                   <DropdownMenuContent align="end" className="bg-zinc-950 border-zinc-800">
                                      <DropdownMenuItem className="text-red-400 focus:text-red-300 cursor-pointer" onClick={() => handleDelete(asset.id)}>
                                         <Trash2 className="w-4 h-4 mr-2" />
                                         删除
                                      </DropdownMenuItem>
                                   </DropdownMenuContent>
                                </DropdownMenu>
                             </div>
                          </div>
                       </motion.div>
                    ))}
                    </AnimatePresence>
                 </div>
              )}
           </div>
        </Tabs>
      </div>
    </div>
  );
}
