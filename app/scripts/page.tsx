/**
 * ⚠️ LEGACY（旧版）：分镜/脚本解析器
 *
 * 这个模块（/scripts）用于：
 * - 管理“原始剧本”文本
 * - 调用后端把文本解析成【人物/场景/分镜表】
 * - 细化镜头 + 生成人物/场景参考图
 *
 * 它不是“剧本工坊”（/script-workshop）。
 * 之后如果要改“AI 生成剧本/多集短剧”，请在新模块实现，避免混用与误改。
 */

"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast-provider";
import { Loader2, Plus, FileText, Trash2, Eye, Download, Upload, Sparkles } from "lucide-react";
import api from "@/lib/api";
import { useRouter } from "next/navigation";

export default function ScriptsPage() {
  const { toast } = useToast();
  const router = useRouter();
  const [scripts, setScripts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchScripts();
  }, []);

  const fetchScripts = async () => {
    try {
      const res = await api.get("/scripts");
      setScripts(res.data);
    } catch (err) {
      console.error("Failed to fetch scripts", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!title.trim() || !content.trim()) {
      toast("请填写标题和内容", "error");
      return;
    }

    setCreating(true);
    try {
      const res = await api.post("/scripts", {
        title: title.trim(),
        content: content.trim(),
        userId: 1,
      });
      toast("剧本创建成功", "success");
      setCreateDialogOpen(false);
      setTitle("");
      setContent("");
      fetchScripts();
    } catch (err: any) {
      toast(err.response?.data?.error || "创建失败", "error");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("确定删除此剧本？")) return;
    
    try {
      await api.delete(`/scripts/${id}`);
      toast("删除成功", "success");
      fetchScripts();
    } catch (err: any) {
      toast(err.response?.data?.error || "删除失败", "error");
    }
  };

  const handleImportFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".txt,.md";
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        setContent(text);
        setTitle(file.name.replace(/\.(txt|md)$/, ""));
        setCreateDialogOpen(true);
      };
      reader.readAsText(file);
    };
    input.click();
  };

  return (
    <div className="min-h-screen bg-[#020204] text-white p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold">剧本管理</h1>
              <span className="text-xs px-2 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                LEGACY（旧版分镜解析器）
              </span>
              <a
                href="/script-workshop"
                className="text-xs px-2 py-1 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30"
              >
                前往：剧本工坊
              </a>
            </div>
            <p className="text-gray-400">AI 智能解析，快速生成分镜提示词（旧功能入口，后续会逐步迁移）</p>
          </div>
          <div className="flex gap-3">
            <Button
              onClick={handleImportFile}
              className="bg-white/10 hover:bg-white/20 border border-white/10"
            >
              <Upload className="w-4 h-4 mr-2" />
              导入文件
            </Button>
            <Button
              onClick={() => setCreateDialogOpen(true)}
              className="bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
            >
              <Plus className="w-4 h-4 mr-2" />
              新建剧本
            </Button>
          </div>
        </div>
      </div>

      {/* Scripts Grid */}
      <div className="max-w-7xl mx-auto">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
          </div>
        ) : scripts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 border border-dashed border-white/10 rounded-2xl">
            <FileText className="w-16 h-16 text-gray-600 mb-4" />
            <p className="text-gray-500 mb-4">还没有剧本，创建第一个吧</p>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              新建剧本
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {scripts.map((script) => (
              <div
                key={script.id}
                className="bg-white/5 border border-white/10 rounded-xl p-6 hover:border-purple-500/50 transition-all cursor-pointer group"
                onClick={() => router.push(`/scripts/${script.id}`)}
              >
                <div className="flex items-start justify-between mb-4">
                  <FileText className="w-8 h-8 text-purple-500" />
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(script.id);
                      }}
                      className="h-8 w-8 p-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                
                <h3 className="text-lg font-semibold mb-2 line-clamp-1">
                  {script.title}
                </h3>
                
                <p className="text-sm text-gray-400 mb-4 line-clamp-2">
                  {script.originalContent?.substring(0, 100)}...
                </p>
                
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span className={`px-2 py-1 rounded-full ${
                    script.status === 'PARSED' 
                      ? 'bg-green-500/20 text-green-400' 
                      : 'bg-gray-500/20 text-gray-400'
                  }`}>
                    {script.status === 'PARSED' ? '已解析' : '待解析'}
                  </span>
                  <span>
                    {new Date(script.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="bg-[#111] border-white/10 text-white max-w-3xl">
          <DialogHeader>
            <DialogTitle>新建剧本</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm text-gray-400 mb-2 block">标题</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="输入剧本标题"
                className="bg-white/5 border-white/10"
              />
            </div>
            
            <div>
              <label className="text-sm text-gray-400 mb-2 block">剧本内容</label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="粘贴或输入剧本内容..."
                className="bg-white/5 border-white/10 min-h-[300px]"
              />
            </div>
            
            <div className="flex justify-end gap-3">
              <Button
                variant="ghost"
                onClick={() => setCreateDialogOpen(false)}
              >
                取消
              </Button>
              <Button
                onClick={handleCreate}
                disabled={creating}
                className="bg-gradient-to-r from-purple-500 to-blue-500"
              >
                {creating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    创建中...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    创建
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
