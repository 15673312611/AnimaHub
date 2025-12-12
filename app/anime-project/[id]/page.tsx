"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { 
  Users, 
  MapPin, 
  Box, 
  Sparkles, 
  ArrowLeft, 
  Image as ImageIcon,
  Video,
  Layers,
  Settings,
  ChevronRight,
  Menu,
  Plus,
  Play,
  Library,
  MoreVertical,
  Trash2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import Link from "next/link";
import { useToast } from "@/components/ui/toast-provider";

// Components
import CharactersTab from "./components/CharactersTab";
import ScenesTab from "./components/ScenesTab";
import PropsTab from "./components/PropsTab";
import EffectsTab from "./components/EffectsTab";

interface Project {
  id: number;
  title: string;
  description: string;
  status: string;
  assetCharacters: any[];
  assetScenes: any[];
  assetProps: any[];
  assetEffects: any[];
  compositeImages: any[];
  generatedVideos: any[];
}

export default function AnimeProjectPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  
  // Navigation State
  const [showAssetManager, setShowAssetManager] = useState(false);
  const [showCreateSegment, setShowCreateSegment] = useState(false);
  
  // Create Segment Form
  const [newSegmentName, setNewSegmentName] = useState("");
  const [creatingSegment, setCreatingSegment] = useState(false);

  useEffect(() => {
    fetchProject();
  }, [params.id]);

  const fetchProject = async () => {
    try {
      const res = await api.get(`/projects/${params.id}`);
      setProject(res.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    if (!project) return;
    setSyncing(true);
    try {
      await api.post(`/projects/${project.id}/assets/sync`);
      await fetchProject();
    } catch (error) {
      console.error(error);
    } finally {
      setSyncing(false);
    }
  };

  // Auto-sync polling
  useEffect(() => {
    if (!project) return;
    const hasGenerating = [
      ...(project.assetCharacters || []),
      ...(project.assetScenes || []),
      ...(project.assetProps || []),
      ...(project.assetEffects || []),
      ...(project.generatedVideos || [])
    ].some(item => item.status === 'GENERATING');

    if (!hasGenerating) return;
    const interval = setInterval(handleSync, 5000);
    return () => clearInterval(interval);
  }, [project]);

  const handleCreateSegment = async () => {
    if (!newSegmentName || !project) return;
    setCreatingSegment(true);
    try {
      // Create a DRAFT video entry as a "Segment" container
      // Using the correct endpoint: /projects/:id/videos
      await api.post(`/projects/${project.id}/videos`, {
        projectId: project.id,
        name: newSegmentName,
        description: "New Segment",
        startImageUrl: "https://placehold.co/1920x1080/png?text=Segment+Start", // Valid placeholder URL
        generationModel: "veo-3.1",
        duration: 5
      });
      await fetchProject();
      setShowCreateSegment(false);
      setNewSegmentName("");
      toast("分镜创建成功", "success");
    } catch (error: any) {
      toast(error.response?.data?.error || "创建失败", "error");
    } finally {
      setCreatingSegment(false);
    }
  };

  const handleDeleteSegment = async (id: number) => {
    if(!confirm("确定删除此分镜吗？")) return;
    try {
      await api.delete(`/assets/videos/${id}`);
      fetchProject();
      toast("删除成功", "success");
    } catch (e) {
      toast("删除失败", "error");
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-black text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-700 border-t-purple-500" />
          <p className="text-zinc-500 animate-pulse">加载项目资源...</p>
        </div>
      </div>
    );
  }

  if (!project) return null;

  // Project Hub View (Segment List & Assets)
  return (
    <div className="min-h-screen w-full bg-zinc-950 text-white flex flex-col">
      {/* Header */}
      <header className="h-16 border-b border-white/10 bg-black/50 backdrop-blur px-8 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-bold">{project.title}</h1>
            <p className="text-xs text-zinc-500">动漫创作工作台</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button 
            onClick={handleSync} 
            disabled={syncing}
            variant="ghost"
            className="text-zinc-400"
          >
            <Sparkles className={cn("h-4 w-4 mr-2", syncing && "animate-spin")} />
            同步
          </Button>
        </div>
      </header>

      {/* Main Content with Top Tabs */}
      <Tabs defaultValue="segments" className="flex-1 flex flex-col">
        <div className="border-b border-white/10 bg-zinc-900/50 px-8">
          <TabsList className="bg-transparent h-14 p-0 space-x-6">
            <TabsTrigger 
              value="segments" 
              className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-purple-500 data-[state=active]:bg-transparent data-[state=active]:text-purple-400 px-4 font-medium text-base"
            >
              <Video className="h-4 w-4 mr-2" />
              片段
            </TabsTrigger>
            <TabsTrigger 
              value="assets" 
              className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-purple-500 data-[state=active]:bg-transparent data-[state=active]:text-purple-400 px-4 font-medium text-base"
            >
              <Library className="h-4 w-4 mr-2" />
              素材管理
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 p-8 max-w-[1600px] mx-auto w-full">
          {/* Segments View */}
          <TabsContent value="segments" className="mt-0 space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
             {/* Create Bar */}
            <div className="bg-gradient-to-r from-purple-900/20 to-blue-900/20 rounded-2xl p-6 border border-white/5 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold mb-2">开始创作新的片段</h2>
                <p className="text-zinc-400">片段是动漫的基本组成单元，在这里创建并生成视频内容。</p>
              </div>
              <Button 
                size="lg" 
                className="bg-white text-black hover:bg-zinc-200"
                onClick={() => setShowCreateSegment(true)}
              >
                <Plus className="h-5 w-5 mr-2" />
                新建片段
              </Button>
            </div>

            {/* Segments Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {project.generatedVideos?.map((video) => (
                <div 
                  key={video.id}
                  className="group bg-zinc-900/50 rounded-xl overflow-hidden border border-white/5 hover:border-purple-500/50 hover:bg-zinc-900 transition-all cursor-pointer relative shadow-sm hover:shadow-md hover:shadow-purple-900/10"
                  onClick={() => router.push(`/anime-project/${project.id}/fragment/${video.id}`)}
                >
                  <div className="aspect-[4/3] bg-gradient-to-br from-zinc-800/50 to-zinc-900/50 flex flex-col items-center justify-center relative group-hover:from-zinc-800 group-hover:to-zinc-800 transition-all">
                     {/* Folder Icon */}
                     <div className="relative">
                        <div className="absolute inset-0 bg-purple-500/20 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                        <svg 
                          xmlns="http://www.w3.org/2000/svg" 
                          viewBox="0 0 24 24" 
                          fill="currentColor" 
                          className="w-20 h-20 text-zinc-700 group-hover:text-purple-400 group-hover:scale-110 transition-all duration-300 relative z-10"
                        >
                          <path d="M19.5 21a3 3 0 003-3v-4.5a3 3 0 00-3-3h-15a3 3 0 00-3 3V18a3 3 0 003 3h15zM1.5 10.146V6a3 3 0 013-3h5.379a2.25 2.25 0 011.59.659l2.122 2.121c.14.141.331.22.53.22H19.5a3 3 0 013 3v1.146A4.483 4.483 0 0019.5 9h-15a4.483 4.483 0 00-3 1.146z" />
                        </svg>
                     </div>
                    
                    {/* Delete Action */}
                    <Button 
                      variant="destructive" 
                      size="icon" 
                      className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSegment(video.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <div className="p-4 border-t border-white/5">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-medium truncate pr-4 text-base">{video.name}</h4>
                        <p className="text-xs text-zinc-500 mt-1 line-clamp-1">{video.description || "无描述"}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {(!project.generatedVideos || project.generatedVideos.length === 0) && (
                <div className="col-span-full py-20 text-center text-zinc-500 border-2 border-dashed border-white/5 rounded-xl">
                  <Video className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>暂无片段</p>
                  <Button variant="link" onClick={() => setShowCreateSegment(true)} className="text-purple-400">
                    点击创建第一个片段
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Assets View */}
          <TabsContent value="assets" className="mt-0 h-full animate-in fade-in slide-in-from-bottom-2 duration-500">
            <Tabs defaultValue="characters" className="space-y-6">
               <TabsList className="bg-zinc-900 border border-white/10 p-1">
                  <TabsTrigger value="characters" className="px-6">角色</TabsTrigger>
                  <TabsTrigger value="scenes" className="px-6">场景</TabsTrigger>
                  <TabsTrigger value="props" className="px-6">物品</TabsTrigger>
                  <TabsTrigger value="effects" className="px-6">特效</TabsTrigger>
               </TabsList>
               
               <TabsContent value="characters">
                 <CharactersTab projectId={project.id} characters={project.assetCharacters || []} onUpdate={fetchProject} />
               </TabsContent>
               <TabsContent value="scenes">
                 <ScenesTab projectId={project.id} scenes={project.assetScenes || []} onUpdate={fetchProject} />
               </TabsContent>
               <TabsContent value="props">
                 <PropsTab projectId={project.id} props={project.assetProps || []} onUpdate={fetchProject} />
               </TabsContent>
               <TabsContent value="effects">
                 <EffectsTab projectId={project.id} effects={project.assetEffects || []} onUpdate={fetchProject} />
               </TabsContent>
            </Tabs>
          </TabsContent>
        </div>
      </Tabs>

      {/* Create Segment Dialog */}
      <Dialog open={showCreateSegment} onOpenChange={setShowCreateSegment}>
        <DialogContent className="bg-zinc-950/95 backdrop-blur-xl border-white/10 text-white rounded-2xl shadow-2xl max-w-md">
          <DialogHeader>
            <DialogTitle>新建片段</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>片段名称</Label>
              <Input 
                placeholder="例如: 开场 - 城市俯瞰" 
                value={newSegmentName}
                onChange={(e) => setNewSegmentName(e.target.value)}
                className="bg-black/50 border-white/10 focus:border-purple-500 transition-colors"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowCreateSegment(false)} className="hover:bg-white/5">取消</Button>
            <Button 
              onClick={handleCreateSegment} 
              disabled={creatingSegment || !newSegmentName} 
              className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:opacity-90 transition-opacity"
            >
              {creatingSegment ? "创建中..." : "确认创建"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}


