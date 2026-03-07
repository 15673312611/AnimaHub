"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { 
  X, Image as ImageIcon, Upload, LayoutGrid, 
  History, Download, Trash2, Check, Sparkles,
  Users, MapPin, Box, Plus, Settings2, Sliders,
  Undo2, Redo2, MonitorPlay, Pen, Type, Loader2,
  Pencil, Send, Wand2, ChevronDown
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn, toThumbnailUrl } from "@/lib/utils";
import { uploadToOss } from "@/lib/upload";
import { useToast } from "@/components/ui/toast-provider";
import api from "@/lib/api";
import { imageApi } from "@/lib/imageApi";
import type { WorkflowData } from "../types";
import { useImageModels } from "@/lib/useImageModels";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflow: WorkflowData;
}

interface HistoryItem {
  id: number;
  resultUrl: string;
  thumbnailUrl?: string | null;
  createdAt?: string | number;
  config?: Record<string, any> | null;
  width?: number | null;
  height?: number | null;
  fileSize?: number | null;
}

interface PuzzleHistoryState {
  history: HistoryItem[];
  loading: boolean;
  refresh: () => Promise<void>;
  addHistory: (item: HistoryItem) => void;
  deleteHistory: (id: number) => Promise<void>;
}

// 自定义滚动条样式
const scrollbarStyles = `
  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: #27272a;
    border-radius: 3px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: #3f3f46;
  }
`;

export default function AiEditModal({ open, onOpenChange, workflow }: Props) {
  const [activeTool, setActiveTool] = useState("puzzle");
  const historyState = usePuzzleHistory(workflow.fragmentId, open);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <style>{scrollbarStyles}</style>
      <DialogContent className="max-w-[1400px] h-[850px] bg-[#09090b] border-zinc-800 text-white p-0 flex overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200" aria-describedby={undefined}>
        <VisuallyHidden>
          <DialogTitle>AI 创意工坊</DialogTitle>
        </VisuallyHidden>
        
        {/* 左侧：工具导航栏 (Sidebar) */}
        <div className="w-[220px] border-r border-zinc-800/50 bg-[#0c0c0e] flex flex-col">
          <div className="h-16 flex items-center px-6 border-b border-zinc-800/50">
            <div className="flex items-center gap-2 text-zinc-100 font-semibold tracking-tight">
              <Sparkles className="w-5 h-5 text-emerald-500" />
              <span>AI 创意工坊</span>
            </div>
          </div>
          
          <div className="p-4 space-y-2">
            <div className="text-xs font-medium text-zinc-500 px-2 py-1">图像工具</div>
            <ToolButton 
              active={activeTool === "puzzle"} 
              onClick={() => setActiveTool("puzzle")}
              icon={<LayoutGrid className="w-4 h-4" />}
              label="智能拼图"
              desc="多图拼接与排版"
            />
            <ToolButton 
              active={activeTool === "imageEdit"} 
              onClick={() => setActiveTool("imageEdit")}
              icon={<Pencil className="w-4 h-4" />}
              label="图片编辑"
              desc="添加文字与标记"
            />
            <ToolButton 
              active={activeTool === "style"} 
              onClick={() => {}}
              icon={<Sparkles className="w-4 h-4" />}
              label="风格迁移"
              desc="一键转换画面风格"
              disabled
            />
          </div>

          <div className="mt-auto p-4 border-t border-zinc-800/50">
            <div className="rounded-xl bg-gradient-to-br from-zinc-900 to-zinc-900/50 border border-zinc-800 p-4">
              <p className="text-xs text-zinc-400 mb-2">更多 AI 功能正在开发中</p>
              <div className="h-1 w-full bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500/50 w-1/3 rounded-full" />
              </div>
            </div>
          </div>
        </div>

        {/* 右侧：主工作区 */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#09090b] relative">
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none" />
          
          {/* 顶部栏 */}
          <header className="h-16 border-b border-zinc-800/50 flex items-center justify-between px-6 bg-[#09090b]/80 backdrop-blur-md z-10">
            <div>
              <h2 className="text-sm font-medium text-zinc-200">
                {activeTool === "puzzle" ? "智能拼图编辑器" : activeTool === "imageEdit" ? "图片编辑器" : "未命名工具"}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-white" onClick={() => onOpenChange(false)}>
                <X className="w-5 h-5" />
              </Button>
            </div>
          </header>

          {/* 内容区 */}
          <div className="flex-1 flex overflow-hidden z-0">
            {activeTool === "puzzle" && <PuzzleEditor workflow={workflow} historyState={historyState} />}
            {activeTool === "imageEdit" && <ImageEditEditor workflow={workflow} historyState={historyState} />}
          </div>
        </div>

      </DialogContent>
    </Dialog>
  );
}

function ToolButton({ 
  active, 
  icon, 
  label, 
  desc, 
  onClick, 
  disabled 
}: { 
  active: boolean; 
  icon: React.ReactNode; 
  label: string; 
  desc: string; 
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full text-left px-3 py-3 rounded-xl transition-all duration-200 group relative border",
        active 
          ? "bg-zinc-800/80 border-zinc-700/50 shadow-sm" 
          : "bg-transparent border-transparent hover:bg-zinc-800/30 text-zinc-400",
        disabled && "opacity-50 cursor-not-allowed hover:bg-transparent"
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn(
          "p-2 rounded-lg transition-colors",
          active ? "bg-emerald-500 text-white shadow-lg shadow-emerald-900/20" : "bg-zinc-800 text-zinc-400 group-hover:text-zinc-300"
        )}>
          {icon}
        </div>
        <div>
          <div className={cn(
            "text-sm font-medium mb-0.5",
            active ? "text-white" : "text-zinc-300 group-hover:text-white"
          )}>
            {label}
          </div>
          <div className="text-[10px] text-zinc-500 font-normal leading-tight">
            {desc}
          </div>
        </div>
      </div>
      {active && (
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-l-full bg-emerald-500" />
      )}
    </button>
  );
}

// ----------------------------------------------------------------------
// 拼图编辑器核心组件
// ----------------------------------------------------------------------

// 后端历史记录（拼图 & AI 编辑共用）
function usePuzzleHistory(fragmentId: number, enabled = true): PuzzleHistoryState {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!fragmentId) return;
    setLoading(true);
    try {
      const res = await api.get("/puzzle-history", { params: { fragmentId, limit: 30 } });
      const list = res.data?.list ?? res.data ?? [];
      setHistory(list);
    } catch (e) {
      console.error("加载历史记录失败", e);
    } finally {
      setLoading(false);
    }
  }, [fragmentId]);

  useEffect(() => {
    if (enabled) refresh();
  }, [enabled, refresh]);

  const addHistory = useCallback((item: HistoryItem) => {
    setHistory(prev => [item, ...prev].slice(0, 30));
  }, []);

  const deleteHistory = useCallback(async (id: number) => {
    await api.delete(`/puzzle-history/${id}`);
    setHistory(prev => prev.filter(h => h.id !== id));
  }, []);

  return { history, loading, refresh, addHistory, deleteHistory };
}

// 布局预设配置
const LAYOUT_PRESETS = [
  { id: "2x2", label: "2×2", cols: 2, rows: 2, desc: "4格方阵", icon: "▦" },
  { id: "1x2", label: "1×2", cols: 2, rows: 1, desc: "横排2格", icon: "▬" },
  { id: "2x1", label: "2×1", cols: 1, rows: 2, desc: "竖排2格", icon: "▮" },
  { id: "1x3", label: "1×3", cols: 3, rows: 1, desc: "横排3格", icon: "≡" },
  { id: "2x3", label: "2×3", cols: 3, rows: 2, desc: "6格宽版", icon: "⊞" },
  { id: "3x2", label: "3×2", cols: 2, rows: 3, desc: "6格高版", icon: "⊟" },
  { id: "3x3", label: "3×3", cols: 3, rows: 3, desc: "9宫格", icon: "▩" },
] as const;

// 根据比例推荐布局
const getRecommendedLayouts = (ratio: string) => {
  switch (ratio) {
    case "16:9":
      return ["2x2", "1x2", "1x3", "2x3"];
    case "9:16":
      return ["2x2", "2x1", "3x2"];
    case "4:3":
      return ["2x2", "1x2", "2x3", "3x3"];
    case "3:4":
      return ["2x2", "2x1", "3x2", "3x3"];
    default: // 1:1
      return ["2x2", "3x3", "2x3", "3x2"];
  }
};

function PuzzleEditor({ 
  workflow, 
  historyState 
}: { 
  workflow: WorkflowData; 
  historyState: PuzzleHistoryState; 
}) {
  const { toast } = useToast();
  
  // 布局状态
  const [layout, setLayout] = useState<typeof LAYOUT_PRESETS[number]>(LAYOUT_PRESETS[0]);
  const slotCount = layout.cols * layout.rows;
  
  // 拼图状态 - 根据布局动态生成
  const [slots, setSlots] = useState<(string | null)[]>(() => Array(4).fill(null));
  const [spacing, setSpacing] = useState(10);
  const [radius, setRadius] = useState(0);
  // 从 localStorage 读取之前的宽高比设置，默认 16:9
  const [aspectRatio, setAspectRatio] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('storyboard_aspectRatio') || "16:9";
    }
    return "16:9";
  });
  const [generating, setGenerating] = useState(false);
  
  // 布局变化时调整 slots 数组
  useEffect(() => {
    setSlots(prev => {
      if (prev.length === slotCount) return prev;
      if (prev.length < slotCount) {
        return [...prev, ...Array(slotCount - prev.length).fill(null)];
      }
      return prev.slice(0, slotCount);
    });
  }, [slotCount]);
  
  // 共用历史记录（后端）
  const { history, deleteHistory, addHistory, refresh, loading } = historyState;
  
  // 选择图片相关
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [activeSlotIndex, setActiveSlotIndex] = useState<number | null>(null);
  
  // 画布预览自适应尺寸
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewSize, setPreviewSize] = useState({ width: 520, height: 520 });
  
  const getRatio = (ratio: string) => {
    const [w, h] = ratio.split(":").map(Number);
    return w && h ? w / h : 1;
  };
  
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      const maxW = Math.max(100, rect.width);
      const maxH = Math.max(100, rect.height);
      const ratio = getRatio(aspectRatio);
      
      let w = maxW;
      let h = w / ratio;
      if (h > maxH) {
        h = maxH;
        w = h * ratio;
      }
      setPreviewSize({ width: Math.floor(w), height: Math.floor(h) });
    };
    
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspectRatio]);

  // 加载单张图片的辅助函数
  const loadImage = (url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      // blob: URL 不需要 crossOrigin，设置反而会失败
      if (!url.startsWith("blob:")) {
        img.crossOrigin = "anonymous";
      }
      img.onload = () => resolve(img);
      img.onerror = (e) => {
        console.error("图片加载失败:", url, e);
        reject(e);
      };
      // 远程 URL 使用代理解决 CORS 问题，blob: URL 直接使用
      img.src = url.startsWith("blob:") ? url : `/api/proxy-image?url=${encodeURIComponent(url)}`;
    });
  };

  // 生成拼图
  const handleGenerate = async () => {
    if (slots.every(s => !s)) {
      toast("画布为空，请至少添加一张图片", "error");
      return;
    }

    setGenerating(true);
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // 确定画布尺寸
      let width = 2048;
      let height = 2048;

      if (aspectRatio === "16:9") {
        height = Math.round(width * 9 / 16);
      } else if (aspectRatio === "9:16") {
        height = 3640;
        width = 2048;
      } else if (aspectRatio === "4:3") {
        height = Math.round(width * 3 / 4);
      } else if (aspectRatio === "3:4") {
        height = 2730;
        width = 2048;
      }

      canvas.width = width;
      canvas.height = height;

      // 计算间距和格子尺寸 - 只有中间间隙，四周无边距
      const finalSpacing = spacing * (width / 600); 
      const finalRadius = radius * (width / 600);
      
      // 根据布局计算格子尺寸
      const cols = layout.cols;
      const rows = layout.rows;
      const cellW = (width - finalSpacing * (cols - 1)) / cols;
      const cellH = (height - finalSpacing * (rows - 1)) / rows;

      // 动态生成格子位置
      const positions: { x: number; y: number }[] = [];
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          positions.push({
            x: col * (cellW + finalSpacing),
            y: row * (cellH + finalSpacing)
          });
        }
      }

      // 预加载所有图片（只加载有效 slot）
      const imagePromises = slots.slice(0, slotCount).map(async (url, idx) => {
        if (!url) return { idx, img: null };
        try {
          const img = await loadImage(url);
          return { idx, img };
        } catch {
          return { idx, img: null };
        }
      });

      const loadedImages = await Promise.all(imagePromises);

      // 先绘制白色背景到间隙区域
      ctx.fillStyle = "#ffffff";
      // 绘制水平间隙（如果有间距的话）
      if (finalSpacing > 0) {
        for (let row = 1; row < rows; row++) {
          const gapY = row * (cellH + finalSpacing) - finalSpacing;
          ctx.fillRect(0, gapY, width, finalSpacing);
        }
        // 绘制垂直间隙
        for (let col = 1; col < cols; col++) {
          const gapX = col * (cellW + finalSpacing) - finalSpacing;
          ctx.fillRect(gapX, 0, finalSpacing, height);
        }
      }
      // 只为空白格子填充白色背景
      for (const { idx, img } of loadedImages) {
        if (!img) {
          const { x, y } = positions[idx];
          ctx.save();
          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect(x, y, cellW, cellH, finalRadius);
          } else {
            ctx.rect(x, y, cellW, cellH);
          }
          ctx.fill();
          ctx.restore();
        }
      }

      // 顺序绘制图片 (因为 canvas 操作不能并行)
      for (const { idx, img } of loadedImages) {
        if (!img) continue;
        const { x, y } = positions[idx];

        ctx.save();
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x, y, cellW, cellH, finalRadius);
        } else {
          ctx.rect(x, y, cellW, cellH);
        }
        ctx.clip();

        // spacing=0 时使用 cover 填满，避免拼接处/边缘露白；否则使用 contain 保证完整显示
        const useCover = finalSpacing === 0;
        const scale = useCover 
          ? Math.max(cellW / img.width, cellH / img.height)
          : Math.min(cellW / img.width, cellH / img.height);
        const drawW = img.width * scale;
        const drawH = img.height * scale;
        const dx = x + (cellW - drawW) / 2;
        const dy = y + (cellH - drawH) / 2;

        // 仅在 contain 模式下填充白色背景（避免透明导致的怪异显示）
        if (!useCover) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(x, y, cellW, cellH);
        }
        
        ctx.drawImage(img, 0, 0, img.width, img.height, dx, dy, drawW, drawH);
        ctx.restore();
      }

      // 转换为 Blob
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), "image/png", 0.9);
      });

      if (!blob) {
        throw new Error("无法生成图片");
      }

      // 上传到 OSS
      const file = new File([blob], `puzzle_${Date.now()}.png`, { type: "image/png" });
      const ossUrl = await uploadToOss(file, "puzzle-history");

      // 保存到后端数据库
      const config = {
        aspectRatio,
        layout: layout.id,
        cols: layout.cols,
        rows: layout.rows,
        spacing,
        radius,
        bgColor: "#ffffff", // 固定白色背景
        sourceImages: slots.slice(0, slotCount).filter(Boolean)
      };

      try {
        const saveRes = await api.post("/puzzle-history", {
          projectId: workflow.projectId,
          fragmentId: workflow.fragmentId,
          workflowId: workflow.id,
          resultUrl: ossUrl,
          config,
          width,
          height,
          fileSize: blob.size
        });
        
        if (saveRes?.data?.id) {
          addHistory({
            id: saveRes.data.id,
            createdAt: saveRes.data.createdAt,
            resultUrl: ossUrl,
            config,
            width,
            height,
            fileSize: blob.size
          });
        } else {
          await refresh();
        }
      } catch (err) {
        console.warn("保存到后端失败:", err);
      }
      toast("拼图生成成功！", "success");

    } catch (e) {
      console.error(e);
      toast("生成失败", "error");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex h-full w-full">
      {/* 中间：画布预览区 */}
      <div className="flex-1 bg-[#09090b] relative flex items-center justify-center p-8 overflow-hidden group">
        {/* 背景网格装饰 */}
        <div className="absolute inset-0 z-0 opacity-20 pointer-events-none" 
          style={{ 
            backgroundImage: "radial-gradient(#333 1px, transparent 1px)", 
            backgroundSize: "20px 20px" 
          }} 
        />
        
        <div ref={previewRef} className="relative z-10 w-full h-full flex items-center justify-center">
          {/* 拼图容器 - 自适应尺寸，避免遮挡 */}
          <div 
            className="relative shadow-2xl shadow-black/50 transition-all duration-300 ease-out overflow-hidden"
            style={{
              width: `${previewSize.width}px`,
              height: `${previewSize.height}px`,
              backgroundColor: "transparent", // 透明背景，间隙用深色
              display: "grid",
              gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
              gridTemplateRows: `repeat(${layout.rows}, 1fr)`,
              gap: `${spacing}px`, // 只有中间间隙，四周无边距
              borderRadius: "4px"
            }}
          >
          {slots.slice(0, slotCount).map((url, idx) => (
            <div
              key={idx}
              onClick={() => {
                setActiveSlotIndex(idx);
                setSelectorOpen(true);
              }}
              className="relative w-full h-full bg-[#18181b] overflow-hidden group/slot cursor-pointer hover:ring-2 hover:ring-emerald-500/50 hover:ring-inset transition-all"
              style={{ borderRadius: `${radius}px` }}
            >
              {url ? (
                <>
                  <img src={url} alt="" className="w-full h-full object-contain" />
                  {/* Hover Overlay */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/slot:opacity-100 transition-opacity flex items-center justify-center gap-3 backdrop-blur-[2px]">
                    <Button size="sm" variant="secondary" className="h-8 px-3 text-xs bg-white/90 hover:bg-white text-zinc-900 border-0">
                      更换
                    </Button>
                    <Button 
                      size="sm" 
                      variant="destructive" 
                      className="h-8 w-8 p-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        const newSlots = [...slots];
                        newSlots[idx] = null;
                        setSlots(newSlots);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-600 group-hover/slot:text-emerald-500 transition-colors">
                  <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-3 group-hover/slot:border-emerald-500/30 group-hover/slot:bg-emerald-500/10 transition-colors">
                    <Plus className="w-6 h-6" />
                  </div>
                  <span className="text-xs font-medium">点击添加图片</span>
                </div>
              )}
              
              {/* 序号标记 */}
              <div className="absolute top-2 left-2 w-5 h-5 rounded bg-black/50 backdrop-blur text-[10px] text-white/70 flex items-center justify-center font-mono pointer-events-none">
                {idx + 1}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 右侧：属性面板 (Inspector) */}
      <div className="w-[280px] bg-[#0c0c0e] border-l border-zinc-800/50 flex flex-col">
        {/* 参数设置 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar"
          style={{
            scrollbarWidth: "thin",
            scrollbarColor: "#27272a transparent"
          }}
        >
          
          {/* 布局设置 */}
          <div className="space-y-6">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
              <Settings2 className="w-3.5 h-3.5" />
              画布设置
            </h3>
            
            <div className="space-y-4">
              {/* 比例选择 */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-zinc-400">
                  <span>画布比例</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {["1:1", "16:9", "9:16", "4:3", "3:4"].map((r) => (
                    <button
                      key={r}
                      onClick={() => {
                        setAspectRatio(r);
                        localStorage.setItem('storyboard_aspectRatio', r);
                      }}
                      className={cn(
                        "h-8 rounded-lg text-xs font-medium border transition-all",
                        aspectRatio === r 
                          ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400" 
                          : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200"
                      )}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* 布局选择 */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-zinc-400">
                  <span>格子布局</span>
                  <span className="text-zinc-500">{layout.cols}×{layout.rows} = {slotCount}格</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {LAYOUT_PRESETS.map((preset) => {
                    const recommended = getRecommendedLayouts(aspectRatio);
                    const isRecommended = recommended.includes(preset.id);
                    return (
                      <button
                        key={preset.id}
                        onClick={() => setLayout(preset)}
                        title={`${preset.desc}${isRecommended ? " (推荐)" : ""}`}
                        className={cn(
                          "relative h-10 rounded-lg text-xs font-medium border transition-all flex flex-col items-center justify-center gap-0.5",
                          layout.id === preset.id 
                            ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400" 
                            : isRecommended
                              ? "bg-zinc-800 border-zinc-600 text-zinc-300 hover:text-zinc-100 hover:border-zinc-500"
                              : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-400 hover:border-zinc-700"
                        )}
                      >
                        <span className="text-base leading-none">{preset.icon}</span>
                        <span className="text-[9px] opacity-70">{preset.label}</span>
                        {isRecommended && layout.id !== preset.id && (
                          <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        )}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-zinc-600">绿点表示适合当前比例的布局</p>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs text-zinc-400">
                  <span>间距 (Spacing)</span>
                  <span className="text-zinc-200 font-mono">{spacing}px</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="50" 
                  value={spacing} 
                  onChange={(e) => setSpacing(Number(e.target.value))}
                  className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 hover:accent-emerald-400"
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs text-zinc-400">
                  <span>圆角 (Radius)</span>
                  <span className="text-zinc-200 font-mono">{radius}px</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={radius} 
                  onChange={(e) => setRadius(Number(e.target.value))}
                  className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 hover:accent-emerald-400"
                />
              </div>

            </div>
          </div>

          <div className="h-px bg-zinc-800/50" />

          {/* 生成按钮 */}
          <div className="space-y-3">
            <Button 
              className="w-full h-11 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium shadow-lg shadow-emerald-900/20 active:scale-[0.98] transition-all"
              onClick={handleGenerate}
              disabled={generating}
            >
              {generating ? (
                <>
                  <Sparkles className="w-4 h-4 mr-2 animate-spin" />
                  合成中...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  生成拼图
                </>
              )}
            </Button>
            <p className="text-[10px] text-center text-zinc-500">
              生成的图片将保存至历史记录
            </p>
          </div>

          <div className="h-px bg-zinc-800/50" />

          {/* 历史记录 */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
              <History className="w-3.5 h-3.5" />
              最近生成
            </h3>
            
            {loading ? (
              <div className="py-8 text-center bg-zinc-900/30 rounded-xl border border-zinc-800/50 border-dashed">
                <p className="text-xs text-zinc-500">加载中...</p>
              </div>
            ) : history.length === 0 ? (
              <div className="py-8 text-center bg-zinc-900/30 rounded-xl border border-zinc-800/50 border-dashed">
                <p className="text-xs text-zinc-500">暂无历史记录</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {history.map((item) => (
                  <div key={item.id} className="group relative aspect-square bg-zinc-900 rounded-lg overflow-hidden border border-zinc-800">
                    <img src={item.resultUrl} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center gap-2">
                      <a 
                        href={item.resultUrl} 
                        download={`puzzle-${typeof item.createdAt === "number" ? item.createdAt : new Date(item.createdAt || Date.now()).getTime()}.png`}
                        className="p-1.5 bg-white/10 hover:bg-white/20 rounded text-white transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>
                      <button 
                        onClick={() => {
                          deleteHistory(item.id).catch(() => {
                            toast("删除失败", "error");
                          });
                        }}
                        className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 rounded transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          </div>
        </div>
      </div>

      {/* 图片选择弹窗 */}
      <ImageSelectorModal 
        open={selectorOpen} 
        onOpenChange={setSelectorOpen}
        workflow={workflow}
        onSelect={(url) => {
          if (activeSlotIndex !== null) {
            const newSlots = [...slots];
            newSlots[activeSlotIndex] = url;
            setSlots(newSlots);
            setSelectorOpen(false);
            setActiveSlotIndex(null);
          }
        }}
      />
    </div>
  );
}

// ----------------------------------------------------------------------
// 图片选择器
// ----------------------------------------------------------------------

function ImageSelectorModal({ 
  open, 
  onOpenChange, 
  workflow,
  onSelect 
}: { 
  open: boolean; 
  onOpenChange: (v: boolean) => void;
  workflow: WorkflowData;
  onSelect: (url: string) => void;
}) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("characters");
  // 删除 uploading 状态，因为不再需要上传

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // 使用本地预览 URL，不上传到阿里云
    const localUrl = URL.createObjectURL(file);
    onSelect(localUrl);
  };

  const getAssets = () => {
    const filter = (list: any[]) => (list || []).filter(x => x && x.imageUrl).map(x => ({ id: x.id, url: x.imageUrl, name: x.name }));
    if (activeTab === "characters") return filter(workflow.characters);
    if (activeTab === "scenes") return filter(workflow.scenes);
    if (activeTab === "items") return filter(workflow.items);
    return [];
  };
  
  const assets = getAssets();

  const tabItems = [
    { id: "characters", label: "人物", icon: Users },
    { id: "scenes", label: "场景", icon: MapPin },
    { id: "items", label: "物品", icon: Box },
    { id: "upload", label: "上传", icon: Upload },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[850px] h-[600px] bg-[#0c0c0e] border-zinc-800 text-white p-0 flex overflow-hidden shadow-2xl gap-0" aria-describedby={undefined}>
        <VisuallyHidden>
          <DialogTitle>选择素材</DialogTitle>
        </VisuallyHidden>
        
        {/* Sidebar */}
        <div className="w-[180px] border-r border-zinc-800 bg-[#111114] flex flex-col pt-6 pb-4">
          <div className="px-5 mb-6">
            <h3 className="text-sm font-semibold text-zinc-100">选择素材</h3>
            <p className="text-[10px] text-zinc-500 mt-1">从项目库或本地添加</p>
          </div>
          
          <div className="flex-1 px-3 space-y-1">
            {tabItems.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                    isActive 
                      ? "bg-zinc-800 text-white shadow-sm" 
                      : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                  )}
                >
                  <Icon className={cn("w-4 h-4", isActive ? "text-emerald-500" : "text-zinc-500")} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col bg-[#0c0c0e]">
          <div className="h-16 border-b border-zinc-800 flex items-center justify-between px-6">
            <div className="text-sm font-medium text-zinc-300">
              {activeTab === "upload" ? "上传本地图片" : `${tabItems.find(t => t.id === activeTab)?.label}库`}
              {activeTab !== "upload" && <span className="ml-2 text-zinc-500 font-normal">{assets.length} 个资源</span>}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
            {activeTab === "upload" ? (
              <div className="h-full flex items-center justify-center">
                <label className="group w-full max-w-lg h-64 border-2 border-dashed border-zinc-700 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:border-emerald-500 hover:bg-emerald-500/5 transition-all bg-zinc-900/20">
                  <div className="w-20 h-20 rounded-full bg-zinc-800 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-xl">
                    <Upload className="w-8 h-8 text-zinc-400 group-hover:text-emerald-500 transition-colors" />
                  </div>
                  <p className="text-base font-medium text-zinc-300">点击选择本地图片</p>
                  <p className="text-xs text-zinc-500 mt-2">支持 JPG, PNG, WebP</p>
                  <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
                </label>
              </div>
            ) : assets.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-500">
                <div className="w-20 h-20 rounded-full bg-zinc-900/50 flex items-center justify-center mb-4">
                  <Box className="w-8 h-8 opacity-20" />
                </div>
                <p className="text-sm">暂无此类素材</p>
              </div>
            ) : (
              <div className="grid grid-cols-4 lg:grid-cols-5 gap-4">
                {assets.map((asset) => (
                  <button
                    key={asset.id}
                    onClick={() => onSelect(asset.url)}
                    className="group relative aspect-square rounded-xl bg-zinc-900 border border-zinc-800 overflow-hidden hover:border-emerald-500 hover:ring-2 hover:ring-emerald-500/20 transition-all shadow-sm"
                  >
                    <img src={toThumbnailUrl(asset.url, 300)} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/0 to-transparent opacity-60 group-hover:opacity-100 transition-opacity" />
                    <div className="absolute inset-x-0 bottom-0 p-3 translate-y-2 group-hover:translate-y-0 transition-transform">
                      <p className="text-xs text-white font-medium truncate text-center">{asset.name}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ----------------------------------------------------------------------
// 图片编辑器组件
// ----------------------------------------------------------------------

interface TextObject {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  fontSize: number;
  isEditing?: boolean;
}

function ImageEditEditor({ 
  workflow, 
  historyState 
}: { 
  workflow: WorkflowData; 
  historyState: PuzzleHistoryState; 
}) {
  const { toast } = useToast();
  
  // 模型选择
  const { models, defaultModel } = useImageModels("project");
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    // 优先读取右侧工具栏设置的图片模型
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("storyboard_selectedImageModel");
      if (saved) return saved;
    }
    return "";
  });
  
  // 初始化模型（如果 localStorage 没有，用系统默认）
  useEffect(() => {
    if (defaultModel && !selectedModel) {
      setSelectedModel(defaultModel);
    }
  }, [defaultModel, selectedModel]);

  // 如果模型代码已被修改，确保选择回落到有效模型
  useEffect(() => {
    if (models.length > 0 && selectedModel && !models.some(m => m.value === selectedModel)) {
      setSelectedModel(defaultModel || models[0].value);
    }
  }, [models, selectedModel, defaultModel]);
  
  // 图片状态
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(false);
  
  // 工具状态
  const [activeTool, setActiveTool] = useState<"brush" | "text">("brush");
  
  // 画笔状态
  const [brushColor, setBrushColor] = useState("#ef4444");
  const [brushSize, setBrushSize] = useState(4);
  
  // 文字状态
  const [textObjects, setTextObjects] = useState<TextObject[]>([]);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [textColor, setTextColor] = useState("#ffffff");
  const [textSize, setTextSize] = useState(24);
  
  // 拖动状态
  const dragRef = useRef<{ id: string; startX: number; startY: number; objX: number; objY: number } | null>(null);
  
  // Canvas refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // 绘制状态
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef<{ x: number, y: number } | null>(null);
  
  // 撤销栈 (存储 drawCanvas 的 dataURL)
  const [undoStack, setUndoStack] = useState<string[]>([]);
  
  // 是否有修改
  const [hasChanges, setHasChanges] = useState(false);
  
  // AI 状态
  const [aiPrompt, setAiPrompt] = useState("");
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // 共用历史记录（后端）
  const { history, deleteHistory, addHistory, refresh, loading } = historyState;

  // 保存当前编辑（合并画笔/文字并上传）
  const handleSave = async () => {
    if (!imageUrl || !canvasRef.current) {
      toast("请先选择一张图片", "error");
      return;
    }
    if (!hasChanges) {
      toast("没有任何修改", "info");
      return;
    }
    setIsSaving(true);
    try {
      const resultUrl = await mergeAndUpload();
      // 保存到后端历史
      try {
        const response = await api.post(`/puzzle-history`, {
          projectId: workflow.projectId,
          fragmentId: workflow.fragmentId,
          resultUrl,
          config: { type: "manual-edit" }
        });
        if (response.data?.id) {
          addHistory({
            id: response.data.id,
            resultUrl,
            config: { type: "manual-edit" }
          });
        } else {
          await refresh();
        }
      } catch (err) {
        console.warn("保存到后端失败:", err);
      }
      // 更新当前图片
      setImageUrl(resultUrl);
      setHasChanges(false);
      setTextObjects([]);
      setUndoStack([]);
      toast("保存成功！", "success");
    } catch (e) {
      console.error(e);
      toast("保存失败", "error");
    } finally {
      setIsSaving(false);
    }
  };

  // 保存当前状态到撤销栈
  const saveToUndoStack = useCallback(() => {
    if (!drawCanvasRef.current) return;
    const dataUrl = drawCanvasRef.current.toDataURL();
    setUndoStack(prev => [...prev.slice(-19), dataUrl]); // 最多保存20步
  }, []);

  // 撤销
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0 || !drawCanvasRef.current) return;
    
    const ctx = drawCanvasRef.current.getContext("2d");
    if (!ctx) return;
    
    const newStack = [...undoStack];
    newStack.pop(); // 移除当前状态
    
    if (newStack.length > 0) {
      // 恢复到上一个状态
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, drawCanvasRef.current!.width, drawCanvasRef.current!.height);
        ctx.drawImage(img, 0, 0);
      };
      img.src = newStack[newStack.length - 1];
    } else {
      // 没有历史了，清空画布
      ctx.clearRect(0, 0, drawCanvasRef.current.width, drawCanvasRef.current.height);
    }
    
    setUndoStack(newStack);
  }, [undoStack]);

  // 加载图片到 Canvas
  useEffect(() => {
    if (!imageUrl || !canvasRef.current || !drawCanvasRef.current) return;
    
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = canvasRef.current!;
      const drawCanvas = drawCanvasRef.current!;
      const ctx = canvas.getContext("2d");
      const drawCtx = drawCanvas.getContext("2d");
      
      if (!ctx || !drawCtx) return;
      
      canvas.width = img.width;
      canvas.height = img.height;
      drawCanvas.width = img.width;
      drawCanvas.height = img.height;
      
      ctx.drawImage(img, 0, 0);
      drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
      
      // 重置状态
      setTextObjects([]);
      setSelectedTextId(null);
      setEditingTextId(null);
      setUndoStack([]);
      setHasChanges(false);
    };
    img.src = imageUrl.startsWith("blob:") ? imageUrl : `/api/proxy-image?url=${encodeURIComponent(imageUrl)}`;
  }, [imageUrl]);

  // 画笔绘制 - 开始
  const handleDrawStart = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (activeTool !== "brush" || !drawCanvasRef.current) return;
    
    // 保存当前状态用于撤销
    saveToUndoStack();
    
    const rect = drawCanvasRef.current.getBoundingClientRect();
    const scaleX = drawCanvasRef.current.width / rect.width;
    const scaleY = drawCanvasRef.current.height / rect.height;
    
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    isDrawingRef.current = true;
    lastPosRef.current = { x, y };
    setHasChanges(true);
  };

  // 画笔绘制 - 移动
  const handleDrawMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || activeTool !== "brush" || !drawCanvasRef.current) return;
    
    const ctx = drawCanvasRef.current.getContext("2d");
    if (!ctx || !lastPosRef.current) return;
    
    const rect = drawCanvasRef.current.getBoundingClientRect();
    const scaleX = drawCanvasRef.current.width / rect.width;
    const scaleY = drawCanvasRef.current.height / rect.height;
    
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    ctx.beginPath();
    ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
    ctx.lineTo(x, y);
    ctx.strokeStyle = brushColor;
    ctx.lineWidth = brushSize * Math.max(scaleX, scaleY);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    
    lastPosRef.current = { x, y };
  };

  // 画笔绘制 - 结束
  const handleDrawEnd = () => {
    isDrawingRef.current = false;
    lastPosRef.current = null;
  };

  // 点击空白区域 - 创建新文字或保存当前文字
  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // 如果点击的是文字元素，不处理
    if ((e.target as HTMLElement).closest(".text-object")) return;
    
    // 如果有正在编辑的文字，保存它
    if (editingTextId) {
      const editingText = textObjects.find(t => t.id === editingTextId);
      if (editingText && !editingText.text.trim()) {
        // 如果文字为空，删除
        setTextObjects(prev => prev.filter(t => t.id !== editingTextId));
      }
      setEditingTextId(null);
      setSelectedTextId(null);
      return;
    }
    
    // 如果是文字工具，创建新文字
    if (activeTool === "text" && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const newText: TextObject = {
        id: Date.now().toString(),
        x,
        y,
        text: "",
        color: textColor,
        fontSize: textSize,
        isEditing: true,
      };
      
      setTextObjects(prev => [...prev, newText]);
      setEditingTextId(newText.id);
      setSelectedTextId(newText.id);
      setHasChanges(true);
    }
  };

  // 点击文字 - 选中或编辑
  const handleTextClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    
    if (selectedTextId === id && editingTextId !== id) {
      // 已选中，进入编辑模式
      setEditingTextId(id);
    } else {
      // 选中文字
      setSelectedTextId(id);
      setEditingTextId(null);
    }
  };

  // 文字拖动开始
  const handleTextDragStart = (e: React.MouseEvent, id: string) => {
    if (editingTextId === id) return; // 编辑中不能拖动
    e.preventDefault();
    
    const obj = textObjects.find(t => t.id === id);
    if (!obj) return;
    
    dragRef.current = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      objX: obj.x,
      objY: obj.y,
    };
    
    setSelectedTextId(id);
  };

  // 文字拖动
  const handleTextDrag = useCallback((e: MouseEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    
    setTextObjects(prev => prev.map(t => 
      t.id === drag.id 
        ? { ...t, x: drag.objX + dx, y: drag.objY + dy }
        : t
    ));
    setHasChanges(true);
  }, []);

  // 文字拖动结束
  const handleTextDragEnd = useCallback(() => {
    dragRef.current = null;
  }, []);

  // 注册全局拖动事件
  useEffect(() => {
    window.addEventListener("mousemove", handleTextDrag);
    window.addEventListener("mouseup", handleTextDragEnd);
    return () => {
      window.removeEventListener("mousemove", handleTextDrag);
      window.removeEventListener("mouseup", handleTextDragEnd);
    };
  }, [handleTextDrag, handleTextDragEnd]);

  // 更新文字
  const updateTextObject = (id: string, updates: Partial<TextObject>) => {
    setTextObjects(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    setHasChanges(true);
  };

  // 删除文字
  const deleteTextObject = (id: string) => {
    setTextObjects(prev => prev.filter(t => t.id !== id));
    setSelectedTextId(null);
    setEditingTextId(null);
    setHasChanges(true);
  };

  // 合并 Canvas 并上传
  const mergeAndUpload = async (): Promise<string> => {
    if (!canvasRef.current || !drawCanvasRef.current) {
      throw new Error("Canvas 未初始化");
    }
    
    const baseCanvas = canvasRef.current;
    const drawCanvas = drawCanvasRef.current;
    
    // 创建合并 Canvas
    const mergedCanvas = document.createElement("canvas");
    mergedCanvas.width = baseCanvas.width;
    mergedCanvas.height = baseCanvas.height;
    const ctx = mergedCanvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 初始化失败");
    
    // 绘制基底图片
    ctx.drawImage(baseCanvas, 0, 0);
    
    // 绘制画笔层
    ctx.drawImage(drawCanvas, 0, 0);
    
    // 绘制文字层
    if (textObjects.length > 0 && containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      const scaleX = baseCanvas.width / containerRect.width;
      const scaleY = baseCanvas.height / containerRect.height;
      
      textObjects.forEach(obj => {
        ctx.save();
        ctx.font = `bold ${obj.fontSize * scaleY}px sans-serif`;
        ctx.fillStyle = obj.color;
        ctx.textBaseline = "top";
        ctx.shadowColor = "rgba(0,0,0,0.5)";
        ctx.shadowBlur = 2;
        ctx.fillText(obj.text, obj.x * scaleX, obj.y * scaleY);
        ctx.restore();
      });
    }
    
    // 转换为 Blob 并上传
    const blob = await new Promise<Blob | null>(resolve => {
      mergedCanvas.toBlob(resolve, "image/png", 0.9);
    });
    
    if (!blob) throw new Error("无法生成图片");
    
    const file = new File([blob], `edit_${Date.now()}.png`, { type: "image/png" });
    return await uploadToOss(file, "ai-edit/edited");
  };

  // AI 编辑
  const handleAiEdit = async () => {
    if (!imageUrl) {
      toast("请先选择一张图片", "error");
      return;
    }
    if (!aiPrompt.trim()) {
      toast("请输入修改提示词", "error");
      return;
    }
    
    setIsAiGenerating(true);
    try {
      let sourceUrl = imageUrl;
      
      // 如果有修改，先上传修改后的图片
      if (hasChanges) {
        sourceUrl = await mergeAndUpload();
      } else if (imageUrl.startsWith("blob:")) {
        // 如果是本地图片且没修改，也需要上传
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const file = new File([blob], `source_${Date.now()}.png`, { type: "image/png" });
        sourceUrl = await uploadToOss(file, "ai-edit/source");
      }
      
      // 调用图片生成接口（使用参考图进行图生图）
      const model = selectedModel || defaultModel || "doubao";
      const modelInfo = models.find(m => m.value === model);
      const response = await imageApi.generate({
        prompt: aiPrompt,
        model: modelInfo?.value || model,
        modelId: modelInfo?.id,
        size: "1:1",
        referenceImage: sourceUrl
      });
      
      const taskId = response.data?.id;
      
      if (taskId) {
        // 异步任务，轮询结果
        toast("图片生成任务已创建，正在处理...", "info");
        
        // 轮询查询状态
        let attempts = 0;
        const maxAttempts = 360; // 最多等待 360 秒
        
        const pollStatus = async (): Promise<string | null> => {
          while (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            attempts++;
            
            try {
              const statusRes = await imageApi.getStatus(taskId);
              const status = statusRes.data?.status;
              
              if (status === "COMPLETED" && statusRes.data?.imageUrl) {
                return statusRes.data.imageUrl;
              } else if (status === "FAILED") {
                throw new Error(statusRes.data?.errorMessage || "生成失败");
              }
            } catch (err) {
              console.warn("查询状态失败:", err);
            }
          }
          return null;
        };
        
        const resultUrl = await pollStatus();
        
        if (resultUrl) {
          // 保存到后端数据库（和智能拼图同一个表）
          try {
            const saveRes = await api.post("/puzzle-history", {
              projectId: workflow.projectId,
              fragmentId: workflow.fragmentId,
              workflowId: workflow.id,
              resultUrl,
              config: {
                type: "ai-edit",
                prompt: aiPrompt,
                model: model,
                sourceImageUrl: sourceUrl
              }
            });
            
            if (saveRes?.data?.id) {
              addHistory({
                id: saveRes.data.id,
                createdAt: saveRes.data.createdAt,
                resultUrl,
                config: {
                  type: "ai-edit",
                  prompt: aiPrompt,
                  model: model,
                  sourceImageUrl: sourceUrl
                }
              });
            } else {
              await refresh();
            }
          } catch (err) {
            console.warn("保存到后端失败:", err);
          }
          
          // 加载新图片
          setImageUrl(resultUrl);
          setAiPrompt("");
          toast("AI 编辑成功！", "success");
        } else {
          toast("生成超时，请稍后重试", "error");
        }
      } else {
        toast("创建任务失败", "error");
      }
      
    } catch (e) {
      console.error(e);
      toast("AI 编辑失败", "error");
    } finally {
      setIsAiGenerating(false);
    }
  };

  return (
    <div className="flex h-full w-full">
      {/* 中间：编辑区 */}
      <div className="flex-1 bg-[#09090b] relative flex flex-col">
        {/* 工具栏 */}
        <div className="h-12 border-b border-zinc-800/50 flex items-center px-4 gap-2">
          <button
            onClick={() => setActiveTool("brush")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 transition-all",
              activeTool === "brush" 
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/50" 
                : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:text-zinc-200"
            )}
          >
            <Pen className="w-3.5 h-3.5" />
            画笔
          </button>
          <button
            onClick={() => setActiveTool("text")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 transition-all",
              activeTool === "text" 
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/50" 
                : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:text-zinc-200"
            )}
          >
            <Type className="w-3.5 h-3.5" />
            文字
          </button>
          
          <div className="h-6 w-px bg-zinc-700 mx-2" />
          
          {/* 撤销按钮 */}
          <button
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 transition-all",
              "bg-zinc-800 border border-zinc-700",
              undoStack.length > 0 ? "text-zinc-400 hover:text-zinc-200" : "text-zinc-600 cursor-not-allowed"
            )}
          >
            <Undo2 className="w-3.5 h-3.5" />
            撤销
          </button>
          
          {/* 保存按钮 */}
          <button
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 transition-all",
              hasChanges
                ? "bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500"
                : "bg-zinc-800 border border-zinc-700 text-zinc-600 cursor-not-allowed"
            )}
          >
            {isSaving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            保存
          </button>
          
          <div className="h-6 w-px bg-zinc-700 mx-2" />
          
          {/* 画笔设置 */}
          {activeTool === "brush" && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-zinc-500">颜色</span>
                <div className="flex gap-1">
                  {["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#ffffff", "#000000"].map(c => (
                    <button
                      key={c}
                      onClick={() => setBrushColor(c)}
                      className={cn(
                        "w-5 h-5 rounded-full border transition-all",
                        brushColor === c ? "border-white scale-110" : "border-zinc-600"
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-zinc-500">大小</span>
                <input
                  type="range"
                  min="1"
                  max="20"
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  className="w-20 h-1 bg-zinc-700 rounded appearance-none cursor-pointer accent-emerald-500"
                />
                <span className="text-[10px] text-zinc-400 w-6">{brushSize}px</span>
              </div>
            </div>
          )}
          
          {/* 文字设置 */}
          {activeTool === "text" && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-zinc-500">颜色</span>
                <div className="flex gap-1">
                  {["#ffffff", "#000000", "#ef4444", "#f59e0b", "#10b981", "#3b82f6"].map(c => (
                    <button
                      key={c}
                      onClick={() => setTextColor(c)}
                      className={cn(
                        "w-5 h-5 rounded-full border transition-all",
                        textColor === c ? "border-white scale-110" : "border-zinc-600"
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-zinc-500">大小</span>
                <input
                  type="range"
                  min="12"
                  max="72"
                  value={textSize}
                  onChange={(e) => setTextSize(Number(e.target.value))}
                  className="w-20 h-1 bg-zinc-700 rounded appearance-none cursor-pointer accent-emerald-500"
                />
                <span className="text-[10px] text-zinc-400 w-6">{textSize}</span>
              </div>
            </div>
          )}
        </div>
        
        {/* Canvas 区域 */}
        <div className="flex-1 flex items-center justify-center p-6 overflow-hidden">
          {imageUrl ? (
            <div 
              ref={containerRef}
              className="relative max-w-full max-h-full group/canvas"
              onClick={handleContainerClick}
              style={{ cursor: activeTool === "text" ? "text" : "default" }}
            >
              {/* 关闭/清除图片按钮 */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setImageUrl(null);
                  setTextObjects([]);
                  setUndoStack([]);
                  setHasChanges(false);
                }}
                className="absolute -top-2 -right-2 z-10 w-6 h-6 bg-zinc-800 hover:bg-red-500 border border-zinc-700 hover:border-red-500 rounded-full flex items-center justify-center text-zinc-400 hover:text-white transition-all opacity-0 group-hover/canvas:opacity-100"
                title="关闭图片"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              <canvas
                ref={canvasRef}
                className="max-w-full max-h-[550px] object-contain rounded-lg shadow-xl"
              />
              <canvas
                ref={drawCanvasRef}
                className="absolute inset-0 max-w-full max-h-[550px] object-contain"
                style={{ cursor: activeTool === "brush" ? "crosshair" : "default" }}
                onMouseDown={handleDrawStart}
                onMouseMove={handleDrawMove}
                onMouseUp={handleDrawEnd}
                onMouseLeave={handleDrawEnd}
              />
              
              {/* 文字层 */}
              {textObjects.map(obj => (
                <div
                  key={obj.id}
                  className={cn(
                    "text-object absolute select-none",
                    editingTextId !== obj.id && "cursor-move",
                    selectedTextId === obj.id && "ring-2 ring-emerald-500 ring-offset-2 ring-offset-transparent rounded"
                  )}
                  style={{
                    left: obj.x,
                    top: obj.y,
                    color: obj.color,
                    fontSize: obj.fontSize,
                    fontWeight: "bold",
                    textShadow: "0 1px 2px rgba(0,0,0,0.5)",
                    minWidth: "20px",
                    minHeight: `${obj.fontSize}px`,
                  }}
                  onClick={(e) => handleTextClick(e, obj.id)}
                  onMouseDown={(e) => handleTextDragStart(e, obj.id)}
                >
                  {editingTextId === obj.id ? (
                    <input
                      type="text"
                      value={obj.text}
                      placeholder="请输入文字"
                      onChange={(e) => updateTextObject(obj.id, { text: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          if (!obj.text.trim()) {
                            deleteTextObject(obj.id);
                          } else {
                            setEditingTextId(null);
                          }
                        } else if (e.key === "Escape") {
                          if (!obj.text.trim()) {
                            deleteTextObject(obj.id);
                          } else {
                            setEditingTextId(null);
                          }
                        }
                      }}
                      className="bg-black/20 backdrop-blur-sm border-none outline-none min-w-[100px] px-1 rounded"
                      style={{ color: obj.color, fontSize: obj.fontSize, fontWeight: "bold" }}
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className="whitespace-nowrap">{obj.text || "请输入文字"}</span>
                  )}
                  
                  {/* 选中时显示缩放手柄 */}
                  {selectedTextId === obj.id && editingTextId !== obj.id && (
                    <div
                      className="absolute -right-2 -bottom-2 w-4 h-4 bg-emerald-500 rounded-full cursor-nwse-resize flex items-center justify-center"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        const startY = e.clientY;
                        const startSize = obj.fontSize;
                        
                        const handleResize = (ev: MouseEvent) => {
                          const delta = ev.clientY - startY;
                          const newSize = Math.max(12, Math.min(100, startSize + delta * 0.5));
                          updateTextObject(obj.id, { fontSize: newSize });
                        };
                        
                        const handleResizeEnd = () => {
                          window.removeEventListener("mousemove", handleResize);
                          window.removeEventListener("mouseup", handleResizeEnd);
                        };
                        
                        window.addEventListener("mousemove", handleResize);
                        window.addEventListener("mouseup", handleResizeEnd);
                      }}
                    >
                      <svg className="w-2 h-2 text-white" viewBox="0 0 8 8" fill="currentColor">
                        <path d="M0 8L8 0v8H0z" />
                      </svg>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div 
              className="w-full max-w-md aspect-video border-2 border-dashed border-zinc-700 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:border-emerald-500 hover:bg-emerald-500/5 transition-all"
              onClick={() => setSelectorOpen(true)}
            >
              <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
                <ImageIcon className="w-8 h-8 text-zinc-500" />
              </div>
              <p className="text-sm text-zinc-400">点击选择图片</p>
              <p className="text-xs text-zinc-600 mt-1">支持从项目资源或本地上传</p>
            </div>
          )}
        </div>
      </div>

      {/* 右侧：AI 编辑 & 历史记录 */}
      <div className="w-[280px] bg-[#0c0c0e] border-l border-zinc-800/50 flex flex-col">
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar"
          style={{ scrollbarWidth: "thin", scrollbarColor: "#27272a transparent" }}
        >
          {/* AI 模型选择 */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
              <Wand2 className="w-3.5 h-3.5" />
              AI 模型
            </h3>
            
            <div className="relative group">
              <select
                value={selectedModel}
                onChange={e => setSelectedModel(e.target.value)}
                className="w-full h-10 pl-3 pr-8 appearance-none bg-zinc-900 border border-zinc-800 rounded-lg focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 outline-none text-xs transition-all group-hover:border-zinc-700 text-zinc-300"
              >
                {models.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
            </div>
          </div>

          <div className="h-px bg-zinc-800/50" />

          {/* AI 编辑 */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5" />
              AI 编辑
            </h3>
            
            <div className="space-y-3">
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="输入修改提示词，如：把背景改成夜晚..."
                className="w-full h-24 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 resize-none focus:outline-none focus:border-emerald-500/50"
              />
              
              <Button
                onClick={handleAiEdit}
                disabled={isAiGenerating || !imageUrl}
                className="w-full h-10 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium shadow-lg shadow-emerald-900/20 active:scale-[0.98] transition-all"
              >
                {isAiGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    处理中...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    AI 修改图片
                  </>
                )}
              </Button>
              
              <p className="text-[10px] text-zinc-500 text-center">
                {hasChanges ? "将保存标记后调用 AI" : "直接调用 AI 修改"}
              </p>
            </div>
          </div>

          <div className="h-px bg-zinc-800/50" />

          {/* 最近生成 */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
              <History className="w-3.5 h-3.5" />
              最近生成
            </h3>
            
            {loading ? (
              <div className="py-8 text-center bg-zinc-900/30 rounded-xl border border-zinc-800/50 border-dashed">
                <p className="text-xs text-zinc-500">加载中...</p>
              </div>
            ) : history.length === 0 ? (
              <div className="py-8 text-center bg-zinc-900/30 rounded-xl border border-zinc-800/50 border-dashed">
                <p className="text-xs text-zinc-500">暂无历史记录</p>
              </div>
            ) : (
              <div className="space-y-3">
                {history.map((item) => (
                  <div key={item.id} className="group relative bg-zinc-900 rounded-lg overflow-hidden border border-zinc-800">
                    <img src={item.resultUrl} className="w-full aspect-video object-cover" />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center gap-2">
                      <button
                        onClick={() => setImageUrl(item.resultUrl)}
                        className="p-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 rounded text-emerald-400 transition-colors"
                        title="使用此图片"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <a 
                        href={item.resultUrl} 
                        download={`edit-${typeof item.createdAt === "number" ? item.createdAt : new Date(item.createdAt || Date.now()).getTime()}.png`}
                        className="p-1.5 bg-white/10 hover:bg-white/20 rounded text-white transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>
                      <button 
                        onClick={() => {
                          deleteHistory(item.id).catch(() => {
                            toast("删除失败", "error");
                          });
                        }}
                        className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 rounded transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {item.config?.prompt && (
                      <div className="p-2 text-[10px] text-zinc-500 truncate border-t border-zinc-800">
                        {item.config.prompt}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 图片选择弹窗 */}
      <ImageSelectorModal 
        open={selectorOpen} 
        onOpenChange={setSelectorOpen}
        workflow={workflow}
        onSelect={(url) => {
          setImageUrl(url);
          setSelectorOpen(false);
        }}
      />
    </div>
  );
}
