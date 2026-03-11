"use client";

import { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Loader2, 
  Search, 
  FileText, 
  Video, 
  Image as ImageIcon, 
  Film, 
  PenTool,
  RefreshCw,
  User,
  Calendar,
  ChevronDown,
  Eye,
  X
} from "lucide-react";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// 用户模板类型
interface UserTemplate {
  id: number;
  userId: number;
  username?: string;
  templateName: string;
  description?: string;
  systemPrompt: string;
  category: string;
  createdAt: string;
  updatedAt: string;
}

// 类别配置
const CATEGORY_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  VIDEO_INFERENCE: {
    label: "视频提示词推理",
    icon: Video,
    color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  },
  FIRST_FRAME_INFERENCE: {
    label: "首帧提示词推理",
    icon: ImageIcon,
    color: "text-violet-400 bg-violet-500/10 border-violet-500/20",
  },
  STORYBOARD: {
    label: "分镜生成",
    icon: Film,
    color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  },
  SCRIPT_WORKSHOP: {
    label: "剧本工坊",
    icon: PenTool,
    color: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  },
  SCRIPT_WORKSHOP_OUTLINE: {
    label: "剧本工坊-分集大纲",
    icon: PenTool,
    color: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  },
  SCRIPT_WORKSHOP_EPISODE: {
    label: "剧本工坊-分集脚本",
    icon: PenTool,
    color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
  },
  SCRIPT_WORKSHOP_NOVEL_COMPRESS: {
    label: "剧本工坊-小说改编",
    icon: PenTool,
    color: "text-pink-400 bg-pink-500/10 border-pink-500/20",
  },
};

export default function AdminPage() {
  const [templates, setTemplates] = useState<UserTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // 筛选状态
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [searchKeyword, setSearchKeyword] = useState("");
  
  // 预览状态
  const [previewTemplate, setPreviewTemplate] = useState<UserTemplate | null>(null);

  // 加载模板列表
  const loadTemplates = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<UserTemplate[]>("/admin/user-templates");
      setTemplates(res.data || []);
    } catch (e: any) {
      console.error("加载用户模板失败", e);
      setError(e.response?.data?.error || "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  // 筛选后的模板列表
  const filteredTemplates = useMemo(() => {
    return templates.filter((t) => {
      // 类别筛选
      if (selectedCategory !== "ALL" && t.category !== selectedCategory) {
        return false;
      }
      // 关键词搜索
      if (searchKeyword) {
        const keyword = searchKeyword.toLowerCase();
        return (
          t.templateName.toLowerCase().includes(keyword) ||
          t.description?.toLowerCase().includes(keyword) ||
          t.username?.toLowerCase().includes(keyword)
        );
      }
      return true;
    });
  }, [templates, selectedCategory, searchKeyword]);

  // 统计数据
  const stats = useMemo(() => {
    const result: Record<string, number> = { ALL: templates.length };
    templates.forEach((t) => {
      result[t.category] = (result[t.category] || 0) + 1;
    });
    return result;
  }, [templates]);

  return (
    <div className="min-h-screen bg-black text-white">
      {/* 顶部导航 */}
      <div className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-indigo-500/20 border border-purple-500/30 flex items-center justify-center">
                <FileText className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold">用户模板管理</h1>
                <p className="text-xs text-zinc-500">查看和管理所有用户的自定义模板</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800"
              onClick={loadTemplates}
              disabled={loading}
            >
              <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
              刷新
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* 筛选栏 */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          {/* 类别筛选 */}
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedCategory("ALL")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
                selectedCategory === "ALL"
                  ? "bg-zinc-800 text-white border-zinc-700"
                  : "bg-transparent text-zinc-500 border-transparent hover:bg-zinc-900 hover:text-zinc-300"
              )}
            >
              全部 ({stats.ALL || 0})
            </button>
            {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
              <button
                key={key}
                onClick={() => setSelectedCategory(key)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-all border flex items-center gap-1.5",
                  selectedCategory === key
                    ? config.color
                    : "bg-transparent text-zinc-500 border-transparent hover:bg-zinc-900 hover:text-zinc-300"
                )}
              >
                <config.icon className="w-3.5 h-3.5" />
                {config.label} ({stats[key] || 0})
              </button>
            ))}
          </div>
          
          {/* 搜索框 */}
          <div className="flex-1 max-w-xs ml-auto">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="搜索模板名称、用户..."
                className="pl-9 bg-zinc-900 border-zinc-800 h-9 text-sm"
              />
            </div>
          </div>
        </div>

        {/* 内容区 */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-500 mr-2" />
            <span className="text-zinc-500">加载中...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20">
            <p className="text-red-400 mb-4">{error}</p>
            <Button variant="outline" onClick={loadTemplates}>
              重试
            </Button>
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
            <FileText className="w-12 h-12 mb-4 opacity-20" />
            <p>暂无模板数据</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {/* 表头 */}
            <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs font-medium text-zinc-500 uppercase tracking-wider">
              <div className="col-span-4">模板名称</div>
              <div className="col-span-2">类别</div>
              <div className="col-span-2">创建者</div>
              <div className="col-span-2">创建时间</div>
              <div className="col-span-2 text-right">操作</div>
            </div>
            
            {/* 列表 */}
            {filteredTemplates.map((template) => {
              const categoryConfig = CATEGORY_CONFIG[template.category] || {
                label: template.category,
                icon: FileText,
                color: "text-zinc-400 bg-zinc-500/10 border-zinc-500/20"
              };
              const CategoryIcon = categoryConfig.icon;
              
              return (
                <div
                  key={template.id}
                  className="grid grid-cols-12 gap-4 px-4 py-4 rounded-xl bg-zinc-900/50 border border-zinc-800/50 hover:bg-zinc-900 hover:border-zinc-700 transition-all items-center"
                >
                  {/* 模板名称 */}
                  <div className="col-span-4">
                    <p className="font-medium text-zinc-200 truncate">{template.templateName}</p>
                    {template.description && (
                      <p className="text-xs text-zinc-500 truncate mt-0.5">{template.description}</p>
                    )}
                  </div>
                  
                  {/* 类别 */}
                  <div className="col-span-2">
                    <span className={cn(
                      "inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border",
                      categoryConfig.color
                    )}>
                      <CategoryIcon className="w-3 h-3" />
                      {categoryConfig.label}
                    </span>
                  </div>
                  
                  {/* 创建者 */}
                  <div className="col-span-2 flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-zinc-600" />
                    <span className="text-sm text-zinc-400">{template.username || `用户#${template.userId}`}</span>
                  </div>
                  
                  {/* 创建时间 */}
                  <div className="col-span-2 flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-zinc-600" />
                    <span className="text-sm text-zinc-400">
                      {new Date(template.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  
                  {/* 操作 */}
                  <div className="col-span-2 flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-3 text-zinc-400 hover:text-white"
                      onClick={() => setPreviewTemplate(template)}
                    >
                      <Eye className="w-3.5 h-3.5 mr-1.5" />
                      查看
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 预览弹窗 */}
      {previewTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden">
            {/* 弹窗头部 */}
            <div className="px-6 py-4 border-b border-zinc-900 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-zinc-100">{previewTemplate.templateName}</h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {previewTemplate.username || `用户#${previewTemplate.userId}`} · {new Date(previewTemplate.createdAt).toLocaleString()}
                </p>
              </div>
              <button
                onClick={() => setPreviewTemplate(null)}
                className="text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* 弹窗内容 */}
            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              {/* 类别 */}
              <div>
                <label className="text-xs font-medium text-zinc-500 block mb-1.5">类别</label>
                {(() => {
                  const config = CATEGORY_CONFIG[previewTemplate.category] || {
                    label: previewTemplate.category,
                    icon: FileText,
                    color: "text-zinc-400 bg-zinc-500/10 border-zinc-500/20"
                  };
                  const Icon = config.icon;
                  return (
                    <span className={cn(
                      "inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border",
                      config.color
                    )}>
                      <Icon className="w-3 h-3" />
                      {config.label}
                    </span>
                  );
                })()}
              </div>
              
              {/* 描述 */}
              {previewTemplate.description && (
                <div>
                  <label className="text-xs font-medium text-zinc-500 block mb-1.5">描述</label>
                  <p className="text-sm text-zinc-300">{previewTemplate.description}</p>
                </div>
              )}
              
              {/* 提示词内容 */}
              <div>
                <label className="text-xs font-medium text-zinc-500 block mb-1.5">提示词内容</label>
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 max-h-[300px] overflow-y-auto">
                  <pre className="text-xs text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed">
                    {previewTemplate.systemPrompt}
                  </pre>
                </div>
              </div>
            </div>
            
            {/* 弹窗底部 */}
            <div className="px-6 py-4 bg-zinc-900/50 border-t border-zinc-900 flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPreviewTemplate(null)}
                className="text-zinc-400 hover:text-zinc-200"
              >
                关闭
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
