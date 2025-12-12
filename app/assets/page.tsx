"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Sparkles, Upload, Image as ImageIcon, Users, Map, Box, Wand2, Plus, Trash2, MoreHorizontal } from "lucide-react";
import { useToast } from "@/components/ui/toast-provider";
import { motion, AnimatePresence } from "framer-motion";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface Project {
  id: number;
  title: string;
}

interface Asset {
  id: number;
  name: string;
  description?: string;
  imageUrl?: string;
  status: string; // DRAFT, GENERATING, COMPLETED, FAILED
  taskId?: string;
  progress?: number;
  createdAt: string;
  // Specific fields based on type can be added here if needed
}

type AssetType = "characters" | "scenes" | "props" | "effects";

const ASSET_TYPES = {
  characters: { label: "角色", icon: Users },
  scenes: { label: "场景", icon: Map },
  props: { label: "道具", icon: Box },
  effects: { label: "特效", icon: Wand2 },
};

export default function AssetsPage() {
  const { toast } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<AssetType>("characters");
  
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Create Dialog State
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createMode, setCreateMode] = useState<"generate" | "upload">("generate");
  const [creating, setCreating] = useState(false);
  
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPrompt, setNewPrompt] = useState(""); // For generation
  const [uploadedImageUrl, setUploadedImageUrl] = useState(""); // For upload

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      fetchAssets();
    }
  }, [selectedProjectId, activeTab]);

  const fetchProjects = async () => {
    try {
      const res = await api.get("/projects");
      if (Array.isArray(res.data) && res.data.length > 0) {
        setProjects(res.data);
        // Default select first project if none selected
        if (!selectedProjectId) {
          setSelectedProjectId(String(res.data[0].id));
        }
      }
    } catch (error) {
      console.error("Failed to load projects", error);
      toast("加载项目列表失败", "error");
    }
  };

  const fetchAssets = async () => {
    if (!selectedProjectId) return;
    setLoading(true);
    try {
      // e.g. /projects/1/assets/characters
      const res = await api.get(`/projects/${selectedProjectId}/assets/${activeTab}`);
      setAssets(res.data);
    } catch (error) {
      console.error(`Failed to load ${activeTab}`, error);
      toast(`加载${ASSET_TYPES[activeTab].label}失败`, "error");
      setAssets([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!selectedProjectId || !newName) {
      toast("请填写名称", "error");
      return;
    }

    setCreating(true);
    try {
      const endpoint = createMode === "generate" ? "generate" : "upload";
      const payload: any = {
        name: newName,
        description: newDescription,
        projectId: Number(selectedProjectId),
      };

      if (createMode === "generate") {
        payload.prompt = newPrompt;
        // payload.model = "flux"; // Optional
      } else {
        payload.imageUrl = uploadedImageUrl;
      }

      // e.g. POST /projects/1/assets/characters/generate
      await api.post(`/projects/${selectedProjectId}/assets/${activeTab}/${endpoint}`, payload);
      
      toast(`${ASSET_TYPES[activeTab].label}${createMode === "generate" ? "生成任务已提交" : "上传成功"}`, "success");
      setCreateDialogOpen(false);
      resetForm();
      fetchAssets(); // Refresh list
    } catch (error) {
      console.error("Failed to create asset", error);
      toast("创建失败，请重试", "error");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("确认删除该素材？")) return;
    try {
      await api.delete(`/assets/${activeTab}/${id}`);
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
    setNewPrompt("");
    setUploadedImageUrl("");
    setCreateMode("generate");
  };

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <LibraryIcon className="w-8 h-8 text-purple-500" />
              素材库
            </h1>
            <p className="text-gray-400 mt-1">管理项目的所有数字资产：角色、场景、道具与特效</p>
          </div>
          
          <div className="flex items-center gap-3">
             <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger className="w-[200px] bg-zinc-900 border-white/10">
                  <SelectValue placeholder="选择项目" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  {projects.map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.title}</SelectItem>
                  ))}
                </SelectContent>
             </Select>

             <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                <DialogTrigger asChild>
                   <Button className="bg-purple-600 hover:bg-purple-700">
                      <Plus className="w-4 h-4 mr-2" />
                      新建{ASSET_TYPES[activeTab].label}
                   </Button>
                </DialogTrigger>
                <DialogContent className="bg-zinc-950 border-zinc-800 text-white sm:max-w-[500px]">
                  <DialogHeader>
                    <DialogTitle>新建{ASSET_TYPES[activeTab].label}</DialogTitle>
                    <DialogDescription>
                      使用 AI 生成或上传现有的图片素材。
                    </DialogDescription>
                  </DialogHeader>
                  
                  <Tabs value={createMode} onValueChange={(v: any) => setCreateMode(v)} className="w-full">
                    <TabsList className="grid w-full grid-cols-2 bg-zinc-900">
                      <TabsTrigger value="generate">AI 生成</TabsTrigger>
                      <TabsTrigger value="upload">本地上传</TabsTrigger>
                    </TabsList>
                    
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">名称</label>
                        <Input 
                          value={newName} 
                          onChange={e => setNewName(e.target.value)}
                          placeholder={`例如：${activeTab === 'characters' ? '赛博朋克主角' : '未来城市街道'}`}
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

                      <TabsContent value="generate" className="space-y-4 mt-0">
                         <div className="space-y-2">
                            <label className="text-sm font-medium flex items-center gap-2">
                              <Sparkles className="w-3 h-3 text-purple-400" /> 
                              生成提示词
                            </label>
                            <Textarea 
                                value={newPrompt}
                                onChange={e => setNewPrompt(e.target.value)}
                                placeholder="详细描述画面内容、风格、光影、色彩等..."
                                className="bg-zinc-900 border-white/10 h-32"
                            />
                         </div>
                      </TabsContent>

                      <TabsContent value="upload" className="space-y-4 mt-0">
                         <div className="space-y-2">
                            <label className="text-sm font-medium flex items-center gap-2">
                              <Upload className="w-3 h-3 text-blue-400" />
                              图片 URL
                            </label>
                            <Input 
                              value={uploadedImageUrl}
                              onChange={e => setUploadedImageUrl(e.target.value)}
                              placeholder="https://..."
                              className="bg-zinc-900 border-white/10"
                            />
                            <p className="text-xs text-gray-500">* 暂支持直接输入 URL，文件上传功能开发中</p>
                         </div>
                      </TabsContent>
                    </div>
                  </Tabs>

                  <DialogFooter>
                    <Button variant="ghost" onClick={() => setCreateDialogOpen(false)}>取消</Button>
                    <Button onClick={handleCreate} disabled={creating} className="bg-purple-600 hover:bg-purple-700">
                      {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      {createMode === 'generate' ? '开始生成' : '确认上传'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
             </Dialog>
          </div>
        </div>

        {/* Tabs & Content */}
        <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="w-full">
           <TabsList className="bg-zinc-900/50 border border-white/5 p-1 h-12 rounded-xl">
              {(Object.keys(ASSET_TYPES) as AssetType[]).map((type) => {
                 const Icon = ASSET_TYPES[type].icon;
                 return (
                   <TabsTrigger 
                     key={type} 
                     value={type}
                     className="data-[state=active]:bg-purple-600 data-[state=active]:text-white px-6 h-10 rounded-lg flex items-center gap-2 transition-all"
                   >
                     <Icon className="w-4 h-4" />
                     {ASSET_TYPES[type].label}
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
                    <p className="text-zinc-400 mb-4">暂无{ASSET_TYPES[activeTab].label}素材</p>
                    <Button variant="outline" onClick={() => setCreateDialogOpen(true)}>
                       立即创建
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
                          <div className="relative aspect-[3/4] bg-zinc-900 rounded-xl overflow-hidden border border-white/5 hover:border-purple-500/50 transition-all shadow-lg hover:shadow-purple-900/20">
                             {/* Image or Placeholder */}
                             {asset.imageUrl ? (
                                <img src={asset.imageUrl} alt={asset.name} className="w-full h-full object-cover" />
                             ) : (
                                <div className="w-full h-full flex items-center justify-center bg-zinc-800/50">
                                   {asset.status === 'GENERATING' ? (
                                      <div className="flex flex-col items-center gap-2 text-purple-400">
                                         <Loader2 className="w-8 h-8 animate-spin" />
                                         <span className="text-xs">生成中...</span>
                                      </div>
                                   ) : (
                                      <ImageIcon className="w-10 h-10 text-zinc-600" />
                                   )}
                                </div>
                             )}
                             
                             {/* Overlay Info */}
                             <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-100 transition-opacity">
                                <div className="absolute bottom-0 left-0 right-0 p-4">
                                   <h3 className="font-semibold text-white truncate">{asset.name}</h3>
                                   <p className="text-xs text-gray-400 line-clamp-1">{asset.description || "无描述"}</p>
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
                             
                             {/* Status Badge */}
                             {asset.status === 'GENERATING' && (
                                <div className="absolute top-2 left-2 px-2 py-1 bg-purple-500/80 text-white text-[10px] font-bold rounded-full backdrop-blur-sm">
                                   生成中
                                </div>
                             )}
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

function LibraryIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m16 6 4 14" />
      <path d="M12 6v14" />
      <path d="M8 8v12" />
      <path d="M4 4v16" />
    </svg>
  );
}
