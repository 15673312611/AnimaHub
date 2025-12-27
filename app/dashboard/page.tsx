"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Film, Loader2, RefreshCw, Clock, Folder, MoreHorizontal } from "lucide-react";
import { useToast } from "@/components/ui/toast-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { motion, AnimatePresence } from "framer-motion";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import AuthGuard from "@/components/AuthGuard";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Project {
  id: number;
  title: string;
  description: string;
  updatedAt: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await api.get("/projects");
      if (Array.isArray(res.data)) {
        setProjects(res.data);
      } else {
        console.error("Projects response is not an array:", res.data);
        setProjects([]);
      }
    } catch (error: any) {
      console.error("Failed to load projects", error);
      setProjects([]);
      if (error.response?.status === 403 || error.response?.status === 401) {
        toast("登录已过期，请重新登录", "error");
        localStorage.removeItem("token");
        router.push("/login");
      }
    } finally {
      setLoading(false);
    }
  }, [router, toast]);

  const handleSyncStatuses = useCallback(async () => {
    try {
      setSyncing(true);
      await api.post("/projects/sync-all");
      await fetchProjects();
      setLastSyncedAt(new Date());
    } catch (error) {
      console.error("Failed to sync statuses", error);
      toast("同步状态失败", "error");
    } finally {
      setSyncing(false);
    }
  }, [fetchProjects]);

  const handleDeleteProject = useCallback(
    async (id: number) => {
      if (!window.confirm("确认删除该项目？此操作不可恢复。")) {
        return;
      }
      try {
        setDeletingId(id);
        await api.delete(`/projects/${id}`);
        setProjects((prev) => prev.filter((project) => project.id !== id));
      } catch (error) {
        console.error("Failed to delete project", error);
        toast("删除项目失败，请稍后重试。", "error");
      } finally {
        setDeletingId((current) => (current === id ? null : current));
      }
    },
    []
  );

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // Removed auto-polling logic as per request to simplify and remove status

  return (
    <AuthGuard>
    <div className="min-h-screen bg-black p-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">工作台</h1>
            <p className="text-zinc-400 text-sm">管理你的所有视频创作项目</p>
          </div>
          <div className="flex items-center gap-2">
             <Button
              variant="outline"
              size="sm"
              className="border-white/10 text-zinc-400 hover:bg-white/10 hover:text-white"
              onClick={handleSyncStatuses}
              disabled={syncing}
            >
              <RefreshCw className={cn("w-4 h-4 mr-2", syncing && "animate-spin")} />
              刷新
            </Button>
            <Link href="/create-simple">
              <Button className="bg-white text-black hover:bg-zinc-200">
                新建项目
              </Button>
            </Link>
          </div>
        </div>

        {loading ? (
           <div className="grid gap-4 grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
             {[1,2,3,4,5,6].map(i => (
               <div key={i} className="aspect-[4/3] bg-zinc-900/50 rounded-xl animate-pulse" />
             ))}
           </div>
        ) : (
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {projects.length === 0 && (
                <div className="col-span-full text-center py-20 text-zinc-500 bg-zinc-900/20 rounded-xl border border-white/5 border-dashed">
                    <div className="flex flex-col items-center gap-4">
                        <Folder className="w-12 h-12 opacity-20" />
                        <p>暂无项目，点击上方“新建项目”开始。</p>
                    </div>
                </div>
            )}
            <AnimatePresence>
            {projects.map((project, index) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
                className="group relative"
              >
                <Link href={`/anime-project/${project.id}`}>
                  {/* 动态渐变边框容器 */}
                  <div className="relative rounded-2xl p-[2px] overflow-hidden transition-all duration-300 group-hover:-translate-y-2 group-hover:shadow-2xl group-hover:shadow-purple-500/40">
                    {/* 动态渐变边框 - 流动动画 */}
                    <div 
                      className="absolute inset-0 rounded-2xl opacity-50 group-hover:opacity-100 transition-opacity duration-300"
                      style={{
                        background: `linear-gradient(90deg, #a855f7, #06b6d4, #ec4899, #f59e0b, #22c55e, #a855f7, #06b6d4)`,
                        backgroundSize: '200% 100%',
                        animation: 'border-flow 3s linear infinite',
                      }}
                    />
                    {/* 边框发光效果 */}
                    <div 
                      className="absolute inset-[-3px] rounded-2xl opacity-0 group-hover:opacity-40 blur-sm transition-opacity duration-300"
                      style={{
                        background: `linear-gradient(90deg, #a855f7, #06b6d4, #ec4899, #f59e0b, #22c55e, #a855f7, #06b6d4)`,
                        backgroundSize: '200% 100%',
                        animation: 'border-flow 3s linear infinite',
                      }}
                    />
                    {/* 内层背景 */}
                    <div className="absolute inset-[2px] rounded-[14px] bg-zinc-900" />
                    
                  <div className="relative flex flex-col h-full p-4 rounded-[14px] bg-zinc-900/95 overflow-hidden">
                    
                    {/* Background Glow Effect */}
                    <div className="absolute inset-0 bg-gradient-to-br from-purple-500/0 via-transparent to-blue-500/0 opacity-0 group-hover:opacity-10 transition-opacity duration-500" />
                    
                    {/* Icon Area */}
                    <div className="flex-1 flex items-center justify-center py-8 relative z-10">
                      {/* Folder Glow */}
                      <div className="absolute w-20 h-20 bg-purple-500/20 blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                      
                      <Folder className="w-20 h-20 text-purple-500/80 fill-purple-500/10 group-hover:text-purple-400 group-hover:fill-purple-500/20 transition-all duration-300 drop-shadow-lg" />
                      
                      {/* Decorative Line */}
                      <div className="absolute bottom-4 w-8 h-1 rounded-full bg-zinc-800 group-hover:bg-purple-500/30 transition-colors duration-300" />
                    </div>
                    
                    {/* Title Area */}
                    <div className="space-y-1.5 relative z-10 text-center">
                      <h3 className="text-sm font-semibold text-zinc-200 group-hover:text-white truncate transition-colors">
                        {project.title}
                      </h3>
                      <p className="text-[10px] font-medium text-zinc-500 group-hover:text-zinc-400 uppercase tracking-wider">
                        {new Date(project.updatedAt).toLocaleDateString()}
                      </p>
                    </div>

                    {/* Action Menu - Only visible on hover */}
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-20">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-7 w-7 rounded-full hover:bg-white/10 hover:text-white data-[state=open]:bg-white/10 data-[state=open]:text-white"
                            onClick={(e) => e.stopPropagation()} // Prevent card click
                          >
                            <MoreHorizontal className="w-4 h-4 text-zinc-400" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-32 bg-zinc-950 border-zinc-800">
                          <DropdownMenuItem 
                            className="text-red-400 focus:text-red-300 focus:bg-red-900/20 cursor-pointer text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteProject(project.id);
                            }}
                          >
                            删除项目
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  </div>
                </Link>
              </motion.div>
            ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
    </AuthGuard>
  );
}
