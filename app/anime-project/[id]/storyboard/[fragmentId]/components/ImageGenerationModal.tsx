"use client";

import { useState, useEffect } from "react";
import { 
  X, Upload, Loader2, Sparkles, Image as ImageIcon, 
  Users, MapPin, Box, Wand2, ChevronDown,
  Briefcase, Globe, FolderOpen, Zap, Plus
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast-provider";
import { cn, toThumbnailUrl } from "@/lib/utils";
import api from "@/lib/api";
import { uploadToOss } from "@/lib/upload";
import { useImageModels } from "@/lib/useImageModels";
import type { CharacterData, SceneData, ItemData, ShotData } from "../types";

// 引用类型定义
type RefType = "character" | "scene" | "item" | "effect";

interface ImageGenerationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shot: ShotData; // 改为传入完整 shot 对象
  initialPrompt: string;
  customStyle: string;
  defaultModel: string;
  characters: CharacterData[];
  scenes: SceneData[];
  items: ItemData[];
  projectId: number;
  onGenerate: (data: {
    model: string;
    prompt: string;
    ratio: string;
    batchCount: number;
    refImages: { type: RefType; url: string }[];
  }) => Promise<boolean>;
}

export default function ImageGenerationModal({
  open,
  onOpenChange,
  shot,
  initialPrompt,
  customStyle,
  defaultModel,
  characters,
  scenes,
  items,
  projectId,
  onGenerate
}: ImageGenerationModalProps) {
  const { toast } = useToast();
  const { models } = useImageModels("project");
  
  // 状态
  const [selectedModel, setSelectedModel] = useState(defaultModel);
  const [prompt, setPrompt] = useState("");
  const [ratio, setRatio] = useState("16:9");
  const [batchCount, setBatchCount] = useState(1);
  
  // 参考图状态
  const [refImages, setRefImages] = useState<Record<RefType, string[]>>({
    character: [],
    scene: [],
    item: [],
    effect: []
  });
  
  // 计算总参考图数量
  const totalRefCount = Object.values(refImages).flat().length;
  
  // 素材选择器状态
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [activeSelectorType, setActiveSelectorType] = useState<RefType>("character");
  
  // 记录上一次的 open 状态，用于检测“刚刚打开”
  const [prevOpen, setPrevOpen] = useState(false);
  
  // 初始化：仅在弹窗从关闭变为打开时执行，避免 shot/characters 变化时重置用户已选的参考图
  useEffect(() => {
    const justOpened = open && !prevOpen;
    setPrevOpen(open);
    
    if (!justOpened) return;
    
    // 不再将画风注入提示词，画风会在服务端自动拼接
    setPrompt(initialPrompt || "");
    // 确保模型选中
    if (defaultModel) setSelectedModel(defaultModel);
    
    // 自动加载已绑定的角色参考图
    const newRefImages: Record<RefType, string[]> = {
      character: [],
      scene: [],
      item: [],
      effect: []
    };
    
    if (shot) {
      // 加载角色参考图
      if (shot.refCharacterIds && shot.refCharacterIds.length > 0) {
        shot.refCharacterIds.forEach(charId => {
          const char = characters.find(c => c.id === charId);
          if (char && char.imageUrl && char.imageStatus === "COMPLETED") {
            newRefImages.character.push(char.imageUrl);
          }
        });
      }
      
      // 加载场景参考图
      if (shot.refSceneId) {
        const scene = scenes.find(s => s.id === shot.refSceneId);
        if (scene && scene.imageUrl && scene.imageStatus === "COMPLETED") {
          newRefImages.scene.push(scene.imageUrl);
        }
      }
      
      // TODO: 物品绑定功能需要数据库表添加 refItemIds 字段
      // if (shot.refItemIds && shot.refItemIds.length > 0) { ... }
    }
    
    setRefImages(newRefImages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleRemoveRef = (type: RefType, index: number) => {
    setRefImages(prev => ({ 
      ...prev, 
      [type]: prev[type].filter((_, i) => i !== index) 
    }));
  };

  const handleSelectAsset = (url: string) => {
    if (totalRefCount >= 7) {
      toast("最多只能添加7张参考图", "error");
      return;
    }
    setRefImages(prev => ({ 
      ...prev, 
      [activeSelectorType]: [...prev[activeSelectorType], url] 
    }));
    setSelectorOpen(false);
  };
  
  const handleOpenSelector = (type: RefType) => {
    setActiveSelectorType(type);
    setSelectorOpen(true);
  };

  // 直接上传处理
  const handleDirectUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: RefType) => {
    if (totalRefCount >= 7) {
      toast("最多只能添加7张参考图", "error");
      return;
    }
    
    const file = e.target.files?.[0];
    if (!file) return;
    
    toast("正在上传...", "info");
    try {
      const url = await uploadToOss(file, `ai-agent/refs/${type}`);
      setRefImages(prev => ({ 
        ...prev, 
        [type]: [...prev[type], url] 
      }));
      toast("上传成功", "success");
    } catch (error) {
      toast("上传失败", "error");
    }
  };

  const handleSubmit = async () => {
    if (!prompt.trim()) {
      toast("请输入生成提示词", "error");
      return;
    }

    // 收集所有参考图
    const validRefs: { type: RefType; url: string }[] = [];
    (Object.keys(refImages) as RefType[]).forEach(key => {
      refImages[key].forEach(url => {
        validRefs.push({ type: key, url });
      });
    });

    const started = await onGenerate({
      model: selectedModel,
      prompt,
      ratio,
      batchCount,
      refImages: validRefs
    });

    if (started) {
      onOpenChange(false);
    }
  };
  
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl bg-zinc-950 border-zinc-800 text-zinc-100 p-0 overflow-hidden flex flex-col max-h-[90vh] shadow-2xl [&>button]:hidden">
          <VisuallyHidden>
            <DialogTitle>融图创作</DialogTitle>
          </VisuallyHidden>
          {/* 顶部标题 */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-md sticky top-0 z-10">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              <h2 className="font-semibold text-lg bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">融图创作</h2>
            </div>
            <button 
              onClick={() => onOpenChange(false)}
              className="p-2 hover:bg-zinc-800 rounded-full transition-colors text-zinc-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar bg-[#141416]">
            {/* 1. 选择模型 */}
            <section className="bg-zinc-900/30 p-5 rounded-2xl border border-zinc-800/50 hover:border-zinc-700/80 transition-all duration-300">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 flex items-center justify-center border border-indigo-500/20">
                   <Wand2 className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-200">AI模型</h3>
                  <p className="text-xs text-zinc-500 mt-0.5">选择适合的绘画模型生成底图</p>
                </div>
              </div>
              
              <div className="relative group">
                <select
                  value={selectedModel}
                  onChange={e => setSelectedModel(e.target.value)}
                  className="w-full h-12 pl-4 pr-10 appearance-none bg-zinc-950 border border-zinc-800 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 outline-none text-sm transition-all group-hover:border-zinc-700 text-zinc-300"
                >
                  {models.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none group-hover:text-zinc-300 transition-colors" />
              </div>
            </section>

            {/* 2. 参考图 Grid */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-zinc-500" />
                  参考素材
                </h3>
                <span className={cn("text-xs font-medium", totalRefCount >= 7 ? "text-red-400" : "text-zinc-500")}>
                  已选 {totalRefCount}/7 张
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <RefCard 
                  title="角色参考" 
                  icon={<Users className="w-4 h-4 text-purple-400" />}
                  type="character"
                  imageUrls={refImages.character}
                  onRemove={(idx) => handleRemoveRef("character", idx)}
                  onOpenSelector={() => handleOpenSelector("character")}
                  onUpload={(e) => handleDirectUpload(e, "character")}
                  colorClass="group-hover:border-purple-500/30 hover:bg-purple-500/5"
                  disableAdd={totalRefCount >= 7}
                />
                <RefCard 
                  title="场景参考" 
                  icon={<MapPin className="w-4 h-4 text-blue-400" />}
                  type="scene"
                  imageUrls={refImages.scene}
                  onRemove={(idx) => handleRemoveRef("scene", idx)}
                  onOpenSelector={() => handleOpenSelector("scene")}
                  onUpload={(e) => handleDirectUpload(e, "scene")}
                  colorClass="group-hover:border-blue-500/30 hover:bg-blue-500/5"
                  disableAdd={totalRefCount >= 7}
                />
                <RefCard 
                  title="道具参考" 
                  icon={<Box className="w-4 h-4 text-orange-400" />}
                  type="item"
                  imageUrls={refImages.item}
                  onRemove={(idx) => handleRemoveRef("item", idx)}
                  onOpenSelector={() => handleOpenSelector("item")}
                  onUpload={(e) => handleDirectUpload(e, "item")}
                  colorClass="group-hover:border-orange-500/30 hover:bg-orange-500/5"
                  disableAdd={totalRefCount >= 7}
                />
                <RefCard 
                  title="特效参考" 
                  icon={<Zap className="w-4 h-4 text-yellow-400" />}
                  type="effect"
                  imageUrls={refImages.effect}
                  onRemove={(idx) => handleRemoveRef("effect", idx)}
                  onOpenSelector={() => handleOpenSelector("effect")}
                  onUpload={(e) => handleDirectUpload(e, "effect")}
                  colorClass="group-hover:border-yellow-500/30 hover:bg-yellow-500/5"
                  disableAdd={totalRefCount >= 7}
                />
              </div>
            </section>

            {/* 3. 参数与生成 */}
            <section className="space-y-6">
              <div className="grid grid-cols-2 gap-6 bg-zinc-900/30 p-5 rounded-2xl border border-zinc-800/50">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-200 mb-3 flex items-center gap-2">
                    <span className="w-1 h-4 rounded-full bg-blue-500"></span>
                    画面比例
                  </h3>
                  <div className="flex bg-zinc-950 p-1.5 rounded-xl border border-zinc-800/80">
                    {["16:9", "9:16", "1:1", "4:3", "3:4"].map(r => (
                      <button
                        key={r}
                        onClick={() => setRatio(r)}
                        className={cn(
                          "flex-1 py-2.5 text-[11px] font-medium rounded-lg transition-all duration-200",
                          ratio === r 
                            ? "bg-zinc-800 text-white shadow-lg border border-zinc-700 font-bold" 
                            : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900"
                        )}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-200 mb-3 flex items-center gap-2">
                    <span className="w-1 h-4 rounded-full bg-emerald-500"></span>
                    生成数量
                  </h3>
                  <div className="flex bg-zinc-950 p-1.5 rounded-xl border border-zinc-800/80">
                    {[1, 2, 3, 4].map(n => (
                      <button
                        key={n}
                        onClick={() => setBatchCount(n)}
                        className={cn(
                          "flex-1 py-2.5 text-[11px] font-medium rounded-lg transition-all duration-200",
                          batchCount === n 
                            ? "bg-zinc-800 text-white shadow-lg border border-zinc-700 font-bold" 
                            : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900"
                        )}
                      >
                        {n}张
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-zinc-900/30 p-5 rounded-2xl border border-zinc-800/50">
                <h3 className="text-sm font-semibold text-zinc-200 mb-3 flex items-center gap-2">
                  <span className="w-1 h-4 rounded-full bg-pink-500"></span>
                  生成提示词
                </h3>
                <div className="relative">
                  <Textarea
                    value={prompt}
                    onChange={e => setPrompt(e.target.value)}
                    className="bg-zinc-950 border-zinc-800 min-h-[140px] text-sm leading-relaxed p-4 rounded-xl focus:border-pink-500/50 focus:ring-1 focus:ring-pink-500/20 resize-none transition-all hover:border-zinc-700 custom-scrollbar"
                    placeholder="在此处输入提示词..."
                  />
                  <div className="absolute bottom-3 right-3 text-[10px] text-zinc-600 bg-zinc-900/80 px-2 py-1 rounded-md border border-zinc-800">
                    {prompt.length} 字符
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* 底部按钮 */}
          <div className="p-6 border-t border-zinc-800 bg-zinc-900/80 backdrop-blur-md flex items-center justify-end gap-3 sticky bottom-0 z-10">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-12 px-6 rounded-xl border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-900 hover:text-white"
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              className="group relative h-12 px-10 rounded-xl font-semibold text-zinc-900 bg-gradient-to-r from-emerald-300 via-teal-300 to-cyan-400 hover:from-emerald-200 hover:via-teal-200 hover:to-cyan-300 shadow-[0_16px_40px_-18px_rgba(34,197,94,0.55)] border border-white/20 transition-all hover:-translate-y-0.5 active:translate-y-0"
            >
              <div className="relative z-10 flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                <span className="text-base tracking-wide">立即生成</span>
              </div>
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-white/10" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 素材选择弹窗 */}
      <AssetSelectorModal
        open={selectorOpen}
        onOpenChange={setSelectorOpen}
        type={activeSelectorType}
        projectId={projectId}
        characters={characters}
        scenes={scenes}
        items={items}
        onSelect={handleSelectAsset}
      />
    </>
  );
}

// 内部组件：参考图卡片
function RefCard({ 
  title, icon, type, imageUrls, onRemove, onOpenSelector, onUpload, colorClass, disableAdd
}: { 
  title: string; 
  icon: React.ReactNode; 
  type: RefType;
  imageUrls: string[];
  onRemove: (index: number) => void;
  onOpenSelector: () => void;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  colorClass?: string;
  disableAdd: boolean;
}) {
  return (
    <div className={cn(
      "flex flex-col gap-3 p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/50 transition-all duration-300 group hover:shadow-lg",
      colorClass
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-medium text-zinc-300">{title}</span>
        </div>
        <span className="text-[10px] text-zinc-500">{imageUrls.length} 张</span>
      </div>
      
      {/* 图片列表区域 - 即使是空的也保持一定高度 */}
      <div className="min-h-[80px] grid grid-cols-4 gap-2">
        {imageUrls.map((url, i) => (
          <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-zinc-700/50 group/img">
            <img src={toThumbnailUrl(url, 800)} className="w-full h-full object-cover" alt="" />
            <button 
              onClick={() => onRemove(i)}
              className="absolute top-1 right-1 p-1 bg-black/60 hover:bg-red-500 rounded-full text-white transition-colors backdrop-blur-sm z-10"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        
        {/* 添加按钮 */}
        {!disableAdd && (
          <div className="aspect-square rounded-lg bg-zinc-800/30 border border-dashed border-zinc-700 hover:bg-zinc-800/50 hover:border-zinc-500 transition-all flex flex-col items-center justify-center cursor-pointer gap-1 group/add" onClick={onOpenSelector}>
            <Plus className="w-4 h-4 text-zinc-500 group-hover/add:text-zinc-400" />
            <span className="text-[9px] text-zinc-600 group-hover/add:text-zinc-500">添加</span>
          </div>
        )}
      </div>
      
      {/* 底部上传按钮 (可选，如果想保留直接上传的快捷入口) */}
      {imageUrls.length === 0 && !disableAdd && (
        <label className="text-center cursor-pointer mt-1">
           <span className="text-[10px] text-zinc-600 hover:text-zinc-400 underline decoration-zinc-700/50 underline-offset-2 transition-colors">
             或上传本地图片
           </span>
           <input type="file" accept="image/*" className="hidden" onChange={onUpload} />
        </label>
      )}
    </div>
  );
}

// 内部组件：素材选择器
function AssetSelectorModal({
  open,
  onOpenChange,
  type,
  projectId,
  characters,
  scenes,
  items,
  onSelect
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: RefType;
  projectId: number;
  characters: CharacterData[];
  scenes: SceneData[];
  items: ItemData[];
  onSelect: (url: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<"current" | "project" | "public">("current");
  const [assets, setAssets] = useState<{ id: number | string; imageUrl: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      loadAssets();
    }
  }, [open, activeTab]);

  // 映射 RefType 到公共素材库的 category（复数形式）
  const toPublicCategory = (t: RefType): string => {
    switch (t) {
      case "character": return "characters";
      case "scene": return "scenes";
      case "item": return "props";
      case "effect": return "effects";
      default: return t;
    }
  };

  // 映射 RefType 到项目素材库的 API 路径
  const toProjectAssetPath = (t: RefType): string => {
    switch (t) {
      case "character": return "characters";
      case "scene": return "scenes";
      case "item": return "props";
      case "effect": return "effects";
      default: return "characters";
    }
  };

  const loadAssets = async () => {
    setAssets([]);
    
    if (activeTab === "current") {
      // 从当前剧集数据加载
      let list: { id: number | string; imageUrl: string; name: string }[] = [];
      if (type === "character") {
        list = characters.filter(c => c.imageUrl).map(c => ({ id: c.id, imageUrl: c.imageUrl!, name: c.name }));
      } else if (type === "scene") {
        list = scenes.filter(s => s.imageUrl).map(s => ({ id: s.id, imageUrl: s.imageUrl!, name: s.name }));
      } else if (type === "item") {
        list = items.filter(i => i.imageUrl).map(i => ({ id: i.id, imageUrl: i.imageUrl!, name: i.name }));
      } else {
        // 特效暂无当前剧集数据，可以为空
      }
      setAssets(list);
    } else if (activeTab === "project") {
      if (!projectId) return;
      setLoading(true);
      try {
        const path = toProjectAssetPath(type);
        const res = await api.get(`/projects/${projectId}/assets/${path}`);
        const list = Array.isArray(res.data) ? res.data : [];
        setAssets(list
          .filter((a: any) => a.imageUrl)
          .map((a: any) => ({ id: a.id, imageUrl: a.imageUrl, name: a.name || "未命名" })));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    } else if (activeTab === "public") {
      setLoading(true);
      try {
        const cat = toPublicCategory(type);
        const res = await api.get(`/public-assets?category=${cat}`);
        const list = Array.isArray(res.data) ? res.data : [];
        setAssets(list.map((a: any) => ({ id: a.id, imageUrl: a.imageUrl, name: a.name || "未命名" })));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
  };
  
  // 上传逻辑（复用 DrawerPanel 里的逻辑，或者这里简化）
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    toast("上传中...", "info");
    try {
      const url = await uploadToOss(file, `ai-agent/assets/${type}`);
      onSelect(url);
      toast("上传成功", "success");
    } catch (e) {
      toast("上传失败", "error");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl bg-[#1a1a1e] border-zinc-800 text-zinc-100 p-0 flex flex-col max-h-[80vh]">
        <VisuallyHidden>
          <DialogTitle>选择素材</DialogTitle>
        </VisuallyHidden>
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-[#1e1e22]">
          <h3 className="font-semibold text-lg">选择素材</h3>
        </div>
        
        <div className="flex border-b border-zinc-800">
          {[
            { id: "current", label: "当前剧集", icon: <FolderOpen className="w-4 h-4" /> },
            { id: "project", label: "项目素材库", icon: <Briefcase className="w-4 h-4" /> },
            { id: "public", label: "公共素材库", icon: <Globe className="w-4 h-4" /> },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors",
                activeTab === tab.id
                  ? "border-indigo-500 text-indigo-400 bg-indigo-500/5"
                  : "border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
          
          <div className="ml-auto p-2 flex items-center">
             <label className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs cursor-pointer transition-colors border border-zinc-700">
                <Upload className="w-3.5 h-3.5" />
                上传图片
                <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
             </label>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar bg-[#141415]">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-zinc-600" />
            </div>
          ) : assets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
              <Box className="w-12 h-12 mb-3 opacity-20" />
              <p>暂无素材</p>
            </div>
          ) : (
            <div className="grid grid-cols-4 md:grid-cols-5 gap-4">
              {assets.map((asset, i) => (
                <div 
                  key={asset.id || i}
                  onClick={() => onSelect(asset.imageUrl)}
                  className="group relative aspect-square rounded-xl bg-zinc-800 border-2 border-transparent hover:border-indigo-500 cursor-pointer overflow-hidden transition-all"
                >
                  <img src={toThumbnailUrl(asset.imageUrl, 800)} className="w-full h-full object-cover" alt={asset.name} />
                  <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-[10px] text-white truncate">{asset.name}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
