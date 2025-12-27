"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Sparkles, Upload, Image as ImageIcon, Users, Map, Box, Wand2, Plus, Trash2, MoreHorizontal, Globe } from "lucide-react";
import { useToast } from "@/components/ui/toast-provider";
import { motion, AnimatePresence } from "framer-motion";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import ImageUploader from "../anime-project/[id]/components/ImageUploader";

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
  
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newCategory, setNewCategory] = useState<string>("characters");
  const [uploadedImageUrl, setUploadedImageUrl] = useState("");

  useEffect(() => {
    fetchAssets();
  }, [activeTab]);

  const fetchAssets = async () => {
    setLoading(true);
    try {
      const params = activeTab === "all" ? {} : { category: activeTab };
      const res = await api.get("/public-assets", { params });
      setAssets(res.data || []);
    } catch (error) {
      console.error("Failed to load public assets", error);
      toast("加载公共素材失败", "error");
      setAssets([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newName) {
      toast("请填写名称", "error");
      return;
    }
    if (!uploadedImageUrl) {
      toast("请上传图片", "error");
      return;
    }

    setCreating(true);
    try {
      await api.post("/public-assets", {
        name: newName,
        description: newDescription,
        category: newCategory,
        imageUrl: uploadedImageUrl
      });
      
      toast("素材上传成功", "success");
      setCreateDialogOpen(false);
      resetForm();
      fetchAssets();
    } catch (error) {
      console.error("Failed to create asset", error);
      toast("上传失败，请重试", "error");
    } finally {
      setCreating(false);
    }
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
    setNewName("");
    setNewDescription("");
    setNewCategory("characters");
    setUploadedImageUrl("");
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
          
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
               <Button className="bg-blue-600 hover:bg-blue-700">
                  <Plus className="w-4 h-4 mr-2" />
                  上传素材
               </Button>
            </DialogTrigger>
            <DialogContent className="bg-zinc-950 border-zinc-800 text-white sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>上传公共素材</DialogTitle>
                <DialogDescription>
                  上传的素材将可在所有项目中使用
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">素材分类</label>
                  <Select value={newCategory} onValueChange={setNewCategory}>
                    <SelectTrigger className="bg-zinc-900 border-white/10">
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
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">名称</label>
                  <Input 
                    value={newName} 
                    onChange={e => setNewName(e.target.value)}
                    placeholder="例如：赛博朋克主角"
                    className="bg-zinc-900 border-white/10"
                  />
                </div>
                
                <div className="space-y-2">
                   <label className="text-sm font-medium">描述 (可选)</label>
                   <Textarea 
                      value={newDescription}
                      onChange={e => setNewDescription(e.target.value)}
                      placeholder="简要描述这个素材的用途或特征..."
                      className="bg-zinc-900 border-white/10 h-20"
                   />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">上传图片</label>
                  <ImageUploader
                    onUpload={(url) => setUploadedImageUrl(url)}
                    label=""
                    description="支持 JPG/PNG/GIF，最大 10MB"
                    folder="public-assets"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="ghost" onClick={() => setCreateDialogOpen(false)}>取消</Button>
                <Button onClick={handleCreate} disabled={creating} className="bg-blue-600 hover:bg-blue-700">
                  {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  确认上传
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

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
                             {asset.imageUrl ? (
                                <img src={asset.imageUrl} alt={asset.name} className="w-full h-full object-cover" />
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
                                     <span className="text-[10px] text-zinc-500">使用 {asset.useCount} 次</span>
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
