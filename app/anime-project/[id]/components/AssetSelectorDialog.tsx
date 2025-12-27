"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, Image as ImageIcon, Loader2, Globe, FolderOpen, Users, Map, Box, Wand2 } from "lucide-react";
import ImageUploader from "./ImageUploader";
import api from "@/lib/api";
import { useToast } from "@/components/ui/toast-provider";
import { cn } from "@/lib/utils";

interface AssetSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number;
  assetType: "characters" | "scenes" | "props" | "effects" | "pose" | "refImage" | "endImage";
  onSelect: (asset: any) => void;
  title?: string;
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: any }> = {
  all: { label: "全部", icon: Globe },
  characters: { label: "角色", icon: Users },
  scenes: { label: "场景", icon: Map },
  props: { label: "道具", icon: Box },
  effects: { label: "特效", icon: Wand2 },
};

export default function AssetSelectorDialog({
  open,
  onOpenChange,
  projectId,
  assetType,
  onSelect,
  title
}: AssetSelectorDialogProps) {
  const { toast } = useToast();
  const [mode, setMode] = useState<"select" | "upload">("select");
  const [library, setLibrary] = useState<"project" | "public">("project");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  
  const [projectAssets, setProjectAssets] = useState<any[]>([]);
  const [publicAssets, setPublicAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [uploadName, setUploadName] = useState("");
  const [uploadUrl, setUploadUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  // 是否是简单的图片选择（pose/refImage/endImage）- 可以选择所有分类
  const isSimpleImage = ["pose", "refImage", "endImage"].includes(assetType);

  useEffect(() => {
    if (open) {
      setCategoryFilter("all");
      fetchAssets();
    }
  }, [open, library, assetType]);

  useEffect(() => {
    if (open) {
      // 当分类筛选变化时重新获取素材
      if (library === "public") {
        fetchPublicAssets();
      } else if (isSimpleImage) {
        fetchProjectAssets();
      }
    }
  }, [categoryFilter]);

  const fetchAssets = async () => {
    setLoading(true);
    try {
      if (library === "project") {
        await fetchProjectAssets();
      } else {
        await fetchPublicAssets();
      }
    } catch (error) {
      console.error("Failed to load assets", error);
      toast("加载素材失败", "error");
    } finally {
      setLoading(false);
    }
  };

  const fetchProjectAssets = async () => {
    if (isSimpleImage) {
      // 对于参考图/尾帧/姿态，获取项目内所有类型的素材
      try {
        const [chars, scenes, props, effects] = await Promise.all([
          api.get(`/projects/${projectId}/assets/characters`).catch(() => ({ data: [] })),
          api.get(`/projects/${projectId}/assets/scenes`).catch(() => ({ data: [] })),
          api.get(`/projects/${projectId}/assets/props`).catch(() => ({ data: [] })),
          api.get(`/projects/${projectId}/assets/effects`).catch(() => ({ data: [] })),
        ]);
        
        let allAssets = [
          ...(chars.data || []).map((a: any) => ({ ...a, category: 'characters' })),
          ...(scenes.data || []).map((a: any) => ({ ...a, category: 'scenes' })),
          ...(props.data || []).map((a: any) => ({ ...a, category: 'props' })),
          ...(effects.data || []).map((a: any) => ({ ...a, category: 'effects' })),
        ];
        
        // 根据分类筛选
        if (categoryFilter !== "all") {
          allAssets = allAssets.filter(a => a.category === categoryFilter);
        }
        
        setProjectAssets(allAssets);
      } catch (error) {
        console.error("Failed to load project assets", error);
        setProjectAssets([]);
      }
      return;
    }
    const res = await api.get(`/projects/${projectId}/assets/${assetType}`);
    setProjectAssets(res.data || []);
  };

  const fetchPublicAssets = async () => {
    try {
      const params: any = {};
      if (isSimpleImage) {
        // 对于参考图/尾帧/姿态，可以选择所有分类
        if (categoryFilter !== "all") {
          params.category = categoryFilter;
        }
      } else {
        // 对于特定类型，只显示该类型
        params.category = assetType;
      }
      const res = await api.get("/public-assets", { params });
      setPublicAssets(res.data || []);
    } catch (error) {
      console.error("Failed to load public assets", error);
      setPublicAssets([]);
    }
  };

  const handleSelectAsset = async (asset: any) => {
    if (library === "public" && asset.id) {
      try {
        await api.post(`/public-assets/${asset.id}/use`);
      } catch (e) {}
    }
    onSelect(asset);
    onOpenChange(false);
  };

  const handleUpload = async () => {
    if (!uploadUrl) {
      toast("请先上传图片", "error");
      return;
    }
    if (isSimpleImage) {
      onSelect({ imageUrl: uploadUrl, url: uploadUrl });
      onOpenChange(false);
      return;
    }
    setUploading(true);
    try {
      if (library === "public") {
        const res = await api.post("/public-assets", {
          name: uploadName || "未命名素材",
          description: "",
          category: assetType,
          imageUrl: uploadUrl
        });
        toast("已上传到公共素材库", "success");
        onSelect(res.data);
      } else {
        const res = await api.post(`/projects/${projectId}/assets/${assetType}/upload`, {
          projectId,
          name: uploadName || "未命名素材",
          description: "",
          imageUrl: uploadUrl
        });
        toast("已上传到项目素材库", "success");
        onSelect(res.data);
      }
      onOpenChange(false);
    } catch (error) {
      console.error("Upload failed", error);
      toast("上传失败", "error");
    } finally {
      setUploading(false);
    }
  };

  const displayAssets = library === "project" ? projectAssets : publicAssets;
  const getCategoryLabel = (category: string) => {
    return CATEGORY_CONFIG[category]?.label || category;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-5xl h-[85vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-white/10 shrink-0">
          <DialogTitle className="flex items-center justify-between">
            <span>{title || "选择或上传素材"}</span>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-zinc-900 p-1 rounded-lg">
                <button
                  onClick={() => setMode("select")}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded transition-all",
                    mode === "select" ? "bg-purple-600 text-white" : "text-zinc-400 hover:text-white"
                  )}
                >
                  选择素材
                </button>
                <button
                  onClick={() => setMode("upload")}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded transition-all",
                    mode === "upload" ? "bg-purple-600 text-white" : "text-zinc-400 hover:text-white"
                  )}
                >
                  上传新素材
                </button>
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col">
          {mode === "select" ? (
            <>
              <div className="px-6 py-3 border-b border-white/5 flex flex-col gap-3 shrink-0">
                {/* 素材库切换 */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Button
                      variant={library === "project" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setLibrary("project")}
                      className={cn("h-8 text-xs", library === "project" && "bg-purple-600 hover:bg-purple-700")}
                    >
                      <FolderOpen className="w-3 h-3 mr-1" />
                      项目内部素材库
                    </Button>
                    <Button
                      variant={library === "public" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setLibrary("public")}
                      className={cn("h-8 text-xs", library === "public" && "bg-blue-600 hover:bg-blue-700")}
                    >
                      <Globe className="w-3 h-3 mr-1" />
                      公共素材库
                    </Button>
                  </div>
                  <span className="text-xs text-zinc-500">共 {displayAssets.length} 个素材</span>
                </div>
                
                {/* 分类筛选：仅在有多个分类可选时显示（isSimpleImage时显示全部分类） */}
                {isSimpleImage && (
                  <div className="flex items-center gap-1 bg-zinc-900/50 p-1 rounded-lg">
                    {Object.entries(CATEGORY_CONFIG).map(([key, config]) => {
                      const Icon = config.icon;
                      return (
                        <button
                          key={key}
                          onClick={() => setCategoryFilter(key)}
                          className={cn(
                            "px-3 py-1.5 text-xs font-medium rounded flex items-center gap-1.5 transition-all",
                            categoryFilter === key 
                              ? (library === "public" ? "bg-blue-600 text-white" : "bg-purple-600 text-white")
                              : "text-zinc-400 hover:text-white hover:bg-white/5"
                          )}
                        >
                          <Icon className="w-3 h-3" />
                          {config.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {loading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
                  </div>
                ) : displayAssets.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-zinc-500">
                    <ImageIcon className="w-16 h-16 mb-4 opacity-20" />
                    <p className="mb-2">
                      {library === "project" ? "项目内暂无素材" : `公共素材库暂无${categoryFilter === "all" ? "" : getCategoryLabel(categoryFilter)}素材`}
                    </p>
                    <p className="text-xs text-zinc-600">切换到"上传新素材"添加</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {displayAssets.map((asset) => (
                      <div
                        key={asset.id}
                        onClick={() => handleSelectAsset(asset)}
                        className="group relative aspect-[3/4] bg-zinc-900 rounded-xl overflow-hidden border border-white/5 hover:border-purple-500/50 cursor-pointer transition-all hover:scale-105"
                      >
                        {asset.imageUrl ? (
                          <img src={asset.imageUrl} alt={asset.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ImageIcon className="w-10 h-10 text-zinc-700" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="absolute bottom-0 left-0 right-0 p-3">
                            <h4 className="text-sm font-semibold text-white truncate">{asset.name}</h4>
                            {asset.description && <p className="text-xs text-zinc-400 line-clamp-1">{asset.description}</p>}
                            {asset.category && (
                              <span className="inline-block mt-1 text-[10px] px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded-full">
                                {getCategoryLabel(asset.category)}
                              </span>
                            )}
                          </div>
                        </div>
                        {asset.status === "GENERATING" && (
                          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                            <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-2xl mx-auto space-y-6">
                {!isSimpleImage && (
                  <div className="flex items-center gap-2 p-3 bg-zinc-900/50 rounded-lg border border-white/5">
                    <span className="text-sm text-zinc-400">上传到：</span>
                    <Button
                      variant={library === "project" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setLibrary("project")}
                      className={cn("h-7 text-xs", library === "project" && "bg-purple-600 hover:bg-purple-700")}
                    >
                      <FolderOpen className="w-3 h-3 mr-1" />
                      项目内部
                    </Button>
                    <Button
                      variant={library === "public" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setLibrary("public")}
                      className={cn("h-7 text-xs", library === "public" && "bg-blue-600 hover:bg-blue-700")}
                    >
                      <Globe className="w-3 h-3 mr-1" />
                      公共素材库
                    </Button>
                  </div>
                )}
                
                <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-6 space-y-4">
                  {!isSimpleImage && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-zinc-300">素材名称</label>
                      <Input
                        value={uploadName}
                        onChange={(e) => setUploadName(e.target.value)}
                        placeholder="例如：主角正面照"
                        className="bg-zinc-900 border-white/10 h-11"
                      />
                    </div>
                  )}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-300">上传图片</label>
                    <ImageUploader
                      onUpload={(url) => setUploadUrl(url)}
                      label=""
                      description="支持 JPG/PNG/GIF，最大 10MB"
                      folder={library === "public" ? "public-assets" : "project-assets"}
                    />
                  </div>
                  <div className="flex justify-end gap-3 pt-4">
                    <Button variant="ghost" onClick={() => onOpenChange(false)} className="border-white/10">
                      取消
                    </Button>
                    <Button
                      onClick={handleUpload}
                      disabled={uploading || !uploadUrl}
                      className={cn(library === "public" ? "bg-blue-600 hover:bg-blue-700" : "bg-purple-600 hover:bg-purple-700")}
                    >
                      {uploading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          上传中...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4 mr-2" />
                          {library === "public" ? "上传到公共素材库" : "上传到项目"}
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
