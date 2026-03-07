"use client";

import { 
  Users, MapPin, Image as ImageIcon, Video,
  ListChecks, Download, Layers, Sparkles, Box,
  Palette, Wand2, LayoutGrid
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DrawerType } from "./StoryboardWorkbench";

interface Props {
  activeDrawer: DrawerType;
  onToggleDrawer: (type: DrawerType) => void;
  stats: {
    total: number;
    withImage: number;
    withVideo: number;
    generating: number;
  };
}

interface ToolButton {
  type: DrawerType;
  icon: React.ReactNode;
  label: string;
  color?: string;
  badge?: string;
}

export default function RightToolbar({ activeDrawer, onToggleDrawer, stats }: Props) {
  const tools: ToolButton[] = [
    { type: "batchOps", icon: <LayoutGrid className="w-5 h-5" />, label: "批量操作", color: "text-rose-400" },
    { type: "characters", icon: <Users className="w-5 h-5" />, label: "角色配置", color: "text-purple-400" },
    { type: "scenes", icon: <MapPin className="w-5 h-5" />, label: "场景配置", color: "text-blue-400" },
    { type: "items", icon: <Box className="w-5 h-5" />, label: "物品配置", color: "text-orange-400" },
    { 
      type: "imageModel", 
      icon: <ImageIcon className="w-5 h-5" />, 
      label: "图片模型", 
      color: "text-amber-400" 
    },
    { 
      type: "videoModel", 
      icon: <Video className="w-5 h-5" />, 
      label: "视频模型", 
      color: "text-emerald-400" 
    },
    { type: "settings", icon: <Palette className="w-5 h-5" />, label: "画风设置", color: "text-pink-400" },
    { type: "inference", icon: <Wand2 className="w-5 h-5" />, label: "推理设置", color: "text-cyan-400" },
    { type: "tasks", icon: <ListChecks className="w-5 h-5" />, label: "任务队列", color: "text-indigo-400" },
    { type: "export", icon: <Download className="w-5 h-5" />, label: "导出", color: "text-zinc-400" },
  ];

  return (
    <div className="w-14 flex-shrink-0 bg-[#1e1e1e] border-l border-zinc-800 flex flex-col items-center py-4 gap-2">
      {tools.map(tool => (
        <button
          key={tool.type}
          onClick={() => onToggleDrawer(tool.type)}
          className={cn(
            "w-10 h-10 rounded-lg flex items-center justify-center transition-all relative group",
            activeDrawer === tool.type 
              ? "bg-emerald-500/20 text-emerald-400" 
              : "text-zinc-500 hover:text-white hover:bg-zinc-800"
          )}
          title={tool.label}
        >
          <span className={activeDrawer === tool.type ? "text-emerald-400" : tool.color}>
            {tool.icon}
          </span>
          
          {/* Tooltip */}
          <div className="absolute right-full mr-2 px-2 py-1 bg-zinc-800 rounded text-xs text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
            {tool.label}
          </div>
        </button>
      ))}

      {/* 分隔线 */}
      <div className="w-8 h-px bg-zinc-700 my-2" />

      {/* 统计信息 */}
      <div className="flex flex-col items-center gap-1 text-[10px] text-zinc-500">
        <div className="flex items-center gap-1">
          <Layers className="w-3 h-3" />
          <span>{stats.total}</span>
        </div>
        <div className="flex items-center gap-1 text-emerald-500">
          <ImageIcon className="w-3 h-3" />
          <span>{stats.withImage}</span>
        </div>
        <div className="flex items-center gap-1 text-blue-500">
          <Video className="w-3 h-3" />
          <span>{stats.withVideo}</span>
        </div>
        {stats.generating > 0 && (
          <div className="flex items-center gap-1 text-amber-500 animate-pulse">
            <Sparkles className="w-3 h-3" />
            <span>{stats.generating}</span>
          </div>
        )}
      </div>
    </div>
  );
}
