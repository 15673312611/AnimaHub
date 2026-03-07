"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import api from "@/lib/api";

interface AnimeProject {
  id: number;
  title: string;
  description?: string | null;
  updatedAt?: string;
}

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (projectId: number, projectTitle: string) => Promise<void>;
  defaultTitle?: string;
  defaultDescription?: string;
}

export function ImportDialog({ open, onOpenChange, onImport, defaultTitle, defaultDescription }: ImportDialogProps) {
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  
  const [projects, setProjects] = useState<AnimeProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  
  const [newTitle, setNewTitle] = useState(defaultTitle || "");
  const [newDesc, setNewDesc] = useState(defaultDescription || "");

  useEffect(() => {
    if (open && mode === "existing") {
      loadProjects();
    }
  }, [open, mode]);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const res = await api.get<AnimeProject[]>("/projects");
      setProjects(res.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (mode === "new" && !newTitle.trim()) return;
    if (mode === "existing" && !selectedProjectId) return;

    setImporting(true);
    try {
      let targetId = 0;
      let targetTitle = "";

      if (mode === "existing") {
        targetId = Number(selectedProjectId);
        targetTitle = projects.find(p => p.id === targetId)?.title || "";
      } else {
        const res = await api.post("/projects", { 
          title: newTitle.trim(), 
          description: newDesc.trim() 
        });
        targetId = Number(res.data?.id);
        targetTitle = newTitle.trim();
      }

      if (!targetId) throw new Error("无效的项目ID");
      
      await onImport(targetId, targetTitle);
      onOpenChange(false);
    } catch (e) {
      console.error(e);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-950 border-white/10 text-white sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>导入到项目</DialogTitle>
          <DialogDescription>将生成的分镜和提示词导入到动漫制作项目</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-1 rounded-lg bg-black/30 border border-white/10 p-1 mb-4">
          <button
            onClick={() => setMode("new")}
            className={`rounded py-1.5 text-xs font-medium transition-colors ${
              mode === "new" ? "bg-white/10 text-white" : "text-zinc-500 hover:text-white"
            }`}
          >
            新建项目
          </button>
          <button
            onClick={() => setMode("existing")}
            className={`rounded py-1.5 text-xs font-medium transition-colors ${
              mode === "existing" ? "bg-white/10 text-white" : "text-zinc-500 hover:text-white"
            }`}
          >
            已有项目
          </button>
        </div>

        <div className="space-y-4">
          {mode === "new" ? (
            <>
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-500">项目标题</label>
                <Input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="bg-black/40 border-white/10 text-zinc-300"
                  placeholder="输入标题..."
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-500">项目描述</label>
                <Textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="bg-black/40 border-white/10 text-zinc-300 h-20 resize-none"
                  placeholder="输入描述..."
                />
              </div>
            </>
          ) : (
            <div className="space-y-1.5">
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs text-zinc-500">选择目标</label>
                <Button variant="ghost" size="sm" className="h-6 text-xs text-zinc-500" onClick={loadProjects}>刷新</Button>
              </div>
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger className="bg-black/40 border-white/10 text-zinc-300">
                  <SelectValue placeholder="-- 选择项目 --" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" className="border-white/10 text-zinc-300" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button 
            className="bg-purple-600 hover:bg-purple-500 text-white"
            onClick={handleConfirm}
            disabled={importing || (mode === "new" && !newTitle) || (mode === "existing" && !selectedProjectId)}
          >
            {importing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            确认导入
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
