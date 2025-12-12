"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Image as ImageIcon, Loader2, Globe, FolderOpen } from "lucide-react";
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
  
  // 项目内部素材
  const [projectAssets, setProjectAssets] = useState<any[]>([]);
  // 公共素材（跨项目）
  const [publicAssets, setPublicAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  // 上传相关
  const [uploadName, setUploadName] = useState("");
  const [uploadUrl, setUploadUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  // 是否是简单的图片选择（pose/refImage/endImage）
  const isSimpleImage = ["pose", "refImage", "endImage"].includes(assetType);

  useEffect(() => {
    if (open && !isSimpleImage) {
      fetchAssets();
    }
  }, [open, library, assetType]);

  const fetchAssets = async () => {
    setLoading(true);
    try {
      if (library === "project") {
        // 获取项目内部素材
        const res = await api.get(`/projects/${projectId}/assets/${assetType}`);
        setProjectAssets(res.data || []);
      } else {
        // 获取公共素材库（所有项目的该类型素材）
        // 1. 先获取所有项目
        const projectsRes = await api.get("/projects");
        const allProjects = projectsRes.data || [];
        
        // 2. 并行获取所有项目的该类型素材
        const assetsPromises = allProjects.map((proj: any) =>
          api.get(`/projects/${proj.id}/assets/${assetType}`).catch(() => ({ data: [] }))
        );
        const assetsResults = await Promise.all(assetsPromises);
        
        // 3. 聚合所有素材，并去重（基于 imageUrl）
        const allAssets = assetsResults.flatMap(res => res.data || []);
        const uniqueAssets = allAssets.filter((asset, index, self) =>
          index === self.findIndex(a => a.imageUrl === asset.imageUrl && a.name === asset.name)
        );
        
        setPublicAssets(uniqueAssets);
      }
    } catch (error) {
      console.error("Failed to load assets", error);
      toast("加载素材失败", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAsset = (asset: any) => {
    onSelect(asset);
    onOpenChange(false);
  };

  const handleUpload = async () => {
    if (!uploadUrl) {
      toast("请先上传图片", "error");
      return;
    }

    // 如果是简单图片，直接返回 URL
    if (isSimpleImage) {
      onSelect({ imageUrl: uploadUrl, url: uploadUrl });
      onOpenChange(false);
      return;
    }

    setUploading(true);
    try {
      const res = await api.post(`/projects/${projectId}/assets/${assetType}/upload`, {
        projectId,
        name: uploadName || "未命名素材",
        description: "",
        imageUrl: uploadUrl
      });
      toast("上传成功", "success");
      onSelect(res.data);
      onOpenChange(false);
    } catch (error) {
      console.error("Upload failed", error);
      toast("上传失败", "error");
    } finally {
      setUploading(false);
    }
  };

  const displayAssets = library === "project" ? projectAssets : publicAssets;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-5xl h-[85vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-white/10 shrink-0">
          <DialogTitle className="flex items-center justify-between">
            <span>{title || "选择或上传素材"}</span>
            <div className="flex items-center gap-2">
              {/* 模式切换 */}
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
              {/* 素材库切换 */}
              {!isSimpleImage && (
                <div className="px-6 py-3 border-b border-white/5 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <Button
                      variant={library === "project" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setLibrary("project")}
                      className={cn(
                        "h-8 text-xs",
                        library === "project" && "bg-purple-600 hover:bg-purple-700"
                      )}
                    >
                      <FolderOpen className="w-3 h-3 mr-1" />
                      项目内部素材库
                    </Button>
                    <Button
                      variant={library === "public" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setLibrary("public")}
                      className={cn(
                        "h-8 text-xs",
                        library === "public" && "bg-blue-600 hover:bg-blue-700"
                      )}
                    >
                      <Globe className="w-3 h-3 mr-1" />
                      公共素材库
                    </Button>
                  </div>
                  <span className="text-xs text-zinc-500">
                    共 {displayAssets.length} 个素材
                  </span>
                </div>
              )}

              {/* 素材列表 */}
              <div className="flex-1 overflow-y-auto p-6">
                {loading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
                  </div>
                ) : displayAssets.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-zinc-500">
                    <ImageIcon className="w-16 h-16 mb-4 opacity-20" />
                    <p>暂无素材，请切换到"上传新素材"</p>
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
                          <img
                            src={asset.imageUrl}
                            alt={asset.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ImageIcon className="w-10 h-10 text-zinc-700" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="absolute bottom-0 left-0 right-0 p-3">
                            <h4 className="text-sm font-semibold text-white truncate">
                              {asset.name}
                            </h4>
                            {asset.description && (
                              <p className="text-xs text-zinc-400 line-clamp-1">
                                {asset.description}
                              </p>
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
            /* 上传模式 */
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-2xl mx-auto space-y-6">
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
                    />
                  </div>

                  <div className="flex justify-end gap-3 pt-4">
                    <Button
                      variant="ghost"
                      onClick={() => onOpenChange(false)}
                      className="border-white/10"
                    >
                      取消
                    </Button>
                    <Button
                      onClick={handleUpload}
                      disabled={uploading || !uploadUrl}
                      className="bg-purple-600 hover:bg-purple-700"
                    >
                      {uploading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          上传中...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4 mr-2" />
                          确认上传
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
