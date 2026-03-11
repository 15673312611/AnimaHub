"use client";

import { useState, useEffect, useLayoutEffect, useRef } from "react";
import {
  X,
  Save,
  Undo,
  Redo,
  Eraser,
  Pen,
  Type,
  Crop,
  Sparkles,
  Loader2,
  ZoomIn,
  ZoomOut,
  ChevronDown,
  Plus,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast-provider";
import { cn, toThumbnailUrl } from "@/lib/utils";
import api from "@/lib/api";
import { aiAgentImageApi } from "@/lib/aiAgentImageApi";
import { uploadToOss } from "@/lib/upload";
import { useImageModels } from "@/lib/useImageModels";

interface ImageEditorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl: string;
  shotId: number;
  slotIndex: number;
  onSave: (newUrl: string) => void;
}

type Tool = "brush" | "eraser" | "text" | "crop";
type TabValue = "ai" | "history";

// 代理图片加载（解决 Canvas 跨域）
const getProxyUrl = (url: string) => {
  if (!url) return "";
  if (url.startsWith("data:")) return url; // base64 直接用
  return `/api/proxy-image?url=${encodeURIComponent(url)}`;
};

export default function ImageEditorModal({
  open,
  onOpenChange,
  imageUrl,
  shotId,
  slotIndex,
  onSave
}: ImageEditorModalProps) {
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [ctx, setCtx] = useState<CanvasRenderingContext2D | null>(null);
  const [drawCtx, setDrawCtx] = useState<CanvasRenderingContext2D | null>(null);
  
  // 工具状态
  const [activeTool, setActiveTool] = useState<Tool>("brush");
  const [brushColor, setBrushColor] = useState("#ffffff");
  const [brushSize, setBrushSize] = useState(24); // 默认24px
  const [zoom, setZoom] = useState(100);
  
  // 属性面板显隐（画笔/橡皮/滤镜）
  const [showToolProperties, setShowToolProperties] = useState(false);

  // === 文字工具状态（对象化管理，对标专业编辑器）===
  interface TextObject {
    id: string;
    x: number;
    y: number;
    text: string;
    color: string;
    fontSize: number;
    width?: number; // 预留用于自动换行或边框
    isEditing: boolean;
  }

  const [textObjects, setTextObjects] = useState<TextObject[]>([]);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  
  // 文字通用配置
  const [textColor, setTextColor] = useState("#ffffff");
  const [textSize, setTextSize] = useState(32); // 默认调大一点，避免太小看不清

  // 文字拖拽临时状态
  const textDragRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    initialObjX: number;
    initialObjY: number;
    hasMoved: boolean;
  } | null>(null);
  
  // 剪裁工具状态
  const [isCropping, setIsCropping] = useState(false);
  const [cropRect, setCropRect] = useState<{x: number, y: number, w: number, h: number} | null>(null);

  // 绘制状态（用 ref 避免 setState 延迟导致偶发不画/不擦）
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef<{ x: number, y: number } | null>(null);


  // 橡皮擦/画笔光标位置（用 ref 避免 mousemove 时的 setState 导致卡顿）
  const cursorPosRef = useRef<{ x: number; y: number } | null>(null);
  const cursorElementRef = useRef<HTMLDivElement>(null);

  // 裁剪工具光标状态
  const [cropCursor, setCropCursor] = useState<string>("crosshair");

  // 裁剪拖拽状态
  const cropDragRef = useRef<{
    mode: "move" | "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w";
    startX: number;
    startY: number;
    startRect: { x: number; y: number; w: number; h: number };
  } | null>(null);
  
  // 历史记录（前端撤销/重做）
  // 改为存储对象 { bg: string, draw: string }
  const [undoStack, setUndoStack] = useState<{ bg: string; draw: string }[]>([]);
  const [redoStack, setRedoStack] = useState<{ bg: string; draw: string }[]>([]);
  
  // AI 编辑状态
  const [aiPrompt, setAiPrompt] = useState("");
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [refImages, setRefImages] = useState<string[]>([]);
  const [uploadingRef, setUploadingRef] = useState(false);
  const { models, defaultModel } = useImageModels("project");
  
  // 模型选择：优先使用 localStorage 中保存的用户选择，否则用默认值
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("storyboard_selectedImageModel") || "";
  });

  // 后端历史记录
  const [historyRecords, setHistoryRecords] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  // 保存状态
  const [isSaving, setIsSaving] = useState(false);

  // 图片加载状态（避免打开时闪一下 / 旧图残影）
  const [isImageLoading, setIsImageLoading] = useState(false);
  
  // 右侧 Tab
  const [activeTab, setActiveTab] = useState<TabValue>("ai");

  // 初始化
  // 用 layout effect 避免弹窗打开后先渲染旧内容导致"闪一下"
  useLayoutEffect(() => {
    if (open && imageUrl) {
      // 重置状态
      setUndoStack([]);
      setRedoStack([]);
      setAiPrompt("");
      setRefImages([]);
      setZoom(100);
      setActiveTool("brush");
      setShowToolProperties(true);
      setTextObjects([]);
      setSelectedTextId(null);
      setIsCropping(false);
      setHistoryRecords([]); // 重置历史记录

      // 先遮住画布，避免旧图残影
      setIsImageLoading(true);
      // 立即清空画布（resize 会清空内容）
      const base = canvasRef.current;
      const draw = drawCanvasRef.current;
      if (base) {
        base.width = 1;
        base.height = 1;
      }
      if (draw) {
        draw.width = 1;
        draw.height = 1;
      }

      // 立即加载（内部已有 retry 逻辑）
      const proxyUrl = getProxyUrl(imageUrl);
      loadImageToCanvas(proxyUrl);
      loadBackendHistory();
    }
  }, [open, imageUrl]);

  // 单独处理默认模型选择，确保异步加载完成后能正确设置
  useEffect(() => {
    // 当 defaultModel 加载完成且 selectedModel 为空时，设置默认值
    if (defaultModel && !selectedModel) {
      setSelectedModel(defaultModel);
    }
  }, [defaultModel, selectedModel]);

  const loadImageToCanvas = (url: string, retryCount = 0) => {
    setIsImageLoading(true);

    const canvas = canvasRef.current;
    const drawCanvas = drawCanvasRef.current;
    if (!canvas || !drawCanvas) {
      if (retryCount < 10) setTimeout(() => loadImageToCanvas(url, retryCount + 1), 50);
      return;
    }

    const context = canvas.getContext("2d", { willReadFrequently: true });
    const dContext = drawCanvas.getContext("2d", { willReadFrequently: true });

    if (!context || !dContext) {
      setIsImageLoading(false);
      return;
    }
    setCtx(context);
    setDrawCtx(dContext);

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    img.onload = () => {
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;

      canvas.width = width;
      canvas.height = height;
      drawCanvas.width = width;
      drawCanvas.height = height;

      context.clearRect(0, 0, width, height);
      context.drawImage(img, 0, 0, width, height);
      dContext.clearRect(0, 0, width, height);

      const snapBg = canvas.toDataURL();
      const snapDraw = drawCanvas.toDataURL();

      setUndoStack([{ bg: snapBg, draw: snapDraw }]);
      setRedoStack([]);

      try {
        const el = containerRef.current;
        if (el) {
          const rect = el.getBoundingClientRect();
          const availableW = Math.max(100, rect.width - 48);
          const availableH = Math.max(100, rect.height - 80);
          const scale = Math.min(availableW / width, availableH / height);
          const nextZoom = Math.max(10, Math.min(200, Math.floor(scale * 100)));
          setZoom(nextZoom);
        }
      } catch {
        // ignore
      }

      requestAnimationFrame(() => setIsImageLoading(false));
    };

    img.onerror = () => {
      // proxy 加载失败时，回退到直接加载原始 URL
      if (url.includes("/api/proxy-image") && retryCount === 0) {
        try {
          const originalUrl = new URL(url, window.location.href).searchParams.get("url");
          if (originalUrl) {
            loadImageToCanvas(originalUrl, retryCount + 1);
            return;
          }
        } catch {
          // URL 解析失败，继续走错误流程
        }
      }

      setIsImageLoading(false);
      toast("图片加载失败，请检查图片 URL 是否有效", "error");
    };
  };

  const loadBackendHistory = async (showLoading = true) => {
    if (showLoading) setLoadingHistory(true);
    try {
      const res = await api.get(`/ai-agent/shots/${shotId}/image-history`);
      setHistoryRecords(res.data || []);
    } catch (e) {
      console.error("加载历史失败", e);
    } finally {
      if (showLoading) setLoadingHistory(false);
    }
  };

  // 检查是否有生成中的记录
  const hasGeneratingRecords = historyRecords.some(
    (r) => r.status === "GENERATING" || r.status === "PROCESSING" || r.status === "PENDING"
  );

  // 定时轮询刷新历史记录（当有生成中的记录时）
  useEffect(() => {
    if (!open || !hasGeneratingRecords) return;
    
    const interval = setInterval(() => {
      loadBackendHistory(false); // 不显示 loading
    }, 3000); // 每3秒刷新
    
    return () => clearInterval(interval);
  }, [open, hasGeneratingRecords, shotId]);

  // 坐标转换（返回 Canvas 内部坐标）
  // 优先使用 drawCanvasRef，因为绘制事件绑定在上面，但两个 canvas 尺寸相同所以结果一样
  const getCoordinates = (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } => {
    const canvas = drawCanvasRef.current || canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    // canvas 实际像素 / 显示像素（包含 zoom 缩放）
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const clientX = "touches" in e && e.touches[0] ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = "touches" in e && e.touches[0] ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const getCoordinatesFromClient = (clientX: number, clientY: number): { x: number; y: number } => {
    const canvas = drawCanvasRef.current || canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const clamp = (v: number, min: number, max: number) =>
    Math.max(min, Math.min(max, v));

  // === 文字对象操作逻辑 ===

  // 辅助更新
  const updateTextObj = (id: string, updates: Partial<TextObject>) => {
    setTextObjects(prev => prev.map(o => o.id === id ? { ...o, ...updates } : o));
  };

  // 结束编辑状态
  const endEditingAll = () => {
    setTextObjects(prev => prev.map(o => {
      // 如果文字为空，自动删除
      if (o.isEditing && !o.text.trim()) return null; 
      return { ...o, isEditing: false };
    }).filter(Boolean) as TextObject[]);
  };

  // 删除选中
  const deleteSelectedText = () => {
    if (selectedTextId) {
      setTextObjects(prev => prev.filter(o => o.id !== selectedTextId));
      setSelectedTextId(null);
    }
  };

  // 全局键盘事件：删除键、ESC
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      // 只有当没有正在编辑的内容时，Delete才生效
      const isEditing = textObjects.some(o => o.isEditing);
      if (!isEditing && (e.key === "Delete" || e.key === "Backspace")) {
        deleteSelectedText();
      }
      if (e.key === "Escape") {
        endEditingAll();
        setSelectedTextId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, textObjects, selectedTextId]);

  // 全局鼠标移动（处理文字拖拽）
  useEffect(() => {
    if (!open) return;

    const onMove = (e: MouseEvent) => {
      const drag = textDragRef.current;
      if (!drag) return;

      const canvas = drawCanvasRef.current || canvasRef.current;
      if (!canvas) return;

      const clientX = e.clientX;
      const clientY = e.clientY;

      // 拖拽阈值判断，避免点击微抖动被误判为拖拽
      if (!drag.hasMoved) {
        const dist = Math.hypot(clientX - drag.startX, clientY - drag.startY);
        if (dist > 3) drag.hasMoved = true;
      }

      if (drag.hasMoved) {
        // 计算偏移量
        // 注意：这里我们需要将 client 的像素偏移转换为 canvas 内部坐标系的偏移
        // 1. 获取 Canvas 缩放比例 (CSS像素 -> Canvas像素)
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const deltaX = (clientX - drag.startX) * scaleX;
        const deltaY = (clientY - drag.startY) * scaleY;

        // 更新位置
        updateTextObj(drag.id, {
          x: drag.initialObjX + deltaX,
          y: drag.initialObjY + deltaY
        });
      }
    };

    const onUp = () => {
      if (textDragRef.current) {
        textDragRef.current = null;
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [open]);

  // === 裁剪和绘制的 window 级别事件监听（处理鼠标移出 canvas 后的拖动） ===
  useEffect(() => {
    if (!open) return;

    const onWindowMouseMove = (ev: MouseEvent) => {
      // 裁剪拖动
      if (cropDragRef.current && activeTool === "crop") {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const { x, y } = getCoordinatesFromClient(ev.clientX, ev.clientY);
        const canvasW = canvas.width;
        const canvasH = canvas.height;
        const minSize = 50;
        const drag = cropDragRef.current;
        const dx = x - drag.startX;
        const dy = y - drag.startY;
        const start = drag.startRect;

        let next = { ...start };

        if (drag.mode === "move") {
          next.x = start.x + dx;
          next.y = start.y + dy;
        } else if (drag.mode === "nw") {
          next.x = start.x + dx;
          next.y = start.y + dy;
          next.w = start.w - dx;
          next.h = start.h - dy;
        } else if (drag.mode === "ne") {
          next.y = start.y + dy;
          next.w = start.w + dx;
          next.h = start.h - dy;
        } else if (drag.mode === "sw") {
          next.x = start.x + dx;
          next.w = start.w - dx;
          next.h = start.h + dy;
        } else if (drag.mode === "se") {
          next.w = start.w + dx;
          next.h = start.h + dy;
        } else if (drag.mode === "n") {
          next.y = start.y + dy;
          next.h = start.h - dy;
        } else if (drag.mode === "s") {
          next.h = start.h + dy;
        } else if (drag.mode === "w") {
          next.x = start.x + dx;
          next.w = start.w - dx;
        } else if (drag.mode === "e") {
          next.w = start.w + dx;
        }

        // normalize negative sizes
        if (next.w < 0) {
          next.x += next.w;
          next.w = Math.abs(next.w);
        }
        if (next.h < 0) {
          next.y += next.h;
          next.h = Math.abs(next.h);
        }

        next.w = Math.max(minSize, next.w);
        next.h = Math.max(minSize, next.h);
        next.x = clamp(next.x, 0, canvasW - next.w);
        next.y = clamp(next.y, 0, canvasH - next.h);
        next.w = Math.min(next.w, canvasW);
        next.h = Math.min(next.h, canvasH);

        setCropRect(next);
        return;
      }

      // 绘制拖动（鼠标移出 canvas 后继续绘制）
      if (isDrawingRef.current && (activeTool === "brush" || activeTool === "eraser")) {
        const dCtx = drawCanvasRef.current?.getContext("2d");
        if (!dCtx || !lastPosRef.current) return;

        const { x, y } = getCoordinatesFromClient(ev.clientX, ev.clientY);

        dCtx.lineCap = "round";
        dCtx.lineJoin = "round";
        dCtx.lineWidth = brushSize;

        if (activeTool === "eraser") {
          dCtx.globalCompositeOperation = "destination-out";
          dCtx.strokeStyle = "rgba(0,0,0,1)";
        } else {
          dCtx.globalCompositeOperation = "source-over";
          dCtx.strokeStyle = brushColor;
        }

        dCtx.beginPath();
        dCtx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
        dCtx.lineTo(x, y);
        dCtx.stroke();

        lastPosRef.current = { x, y };
      }
    };

    const onWindowMouseUp = () => {
      // 裁剪结束
      if (cropDragRef.current) {
        cropDragRef.current = null;
      }

      // 绘制结束
      if (isDrawingRef.current) {
        isDrawingRef.current = false;
        lastPosRef.current = null;
        const dCtx = drawCanvasRef.current?.getContext("2d");
        if (dCtx) {
          dCtx.globalCompositeOperation = "source-over";
        }
        saveSnapshot();
      }
    };

    window.addEventListener("mousemove", onWindowMouseMove);
    window.addEventListener("mouseup", onWindowMouseUp);

    return () => {
      window.removeEventListener("mousemove", onWindowMouseMove);
      window.removeEventListener("mouseup", onWindowMouseUp);
    };
  }, [open, activeTool, brushSize, brushColor]);

  // === 绘图逻辑（重写）===
  
  // 更新光标位置（用 DOM 操作而非 state，避免卡顿）
  const updateCursorPosition = (canvasX: number, canvasY: number) => {
    cursorPosRef.current = { x: canvasX, y: canvasY };
    const el = cursorElementRef.current;
    if (el) {
      el.style.display = "block";
      el.style.left = `${canvasX - brushSize / 2}px`;
      el.style.top = `${canvasY - brushSize / 2}px`;
      el.style.width = `${brushSize}px`;
      el.style.height = `${brushSize}px`;
    }
  };

  const hideCursor = () => {
    cursorPosRef.current = null;
    const el = cursorElementRef.current;
    if (el) el.style.display = "none";
  };

  // === 文字工具逻辑（对象化重写）===
  
  // 画布点击：创建新文本
  const handleTextCanvasClick = (e: React.MouseEvent | React.TouchEvent) => {
    // 只有在点空地时才创建，点到文字对象会被 stopPropagation 拦截
    if (activeTool !== "text") return;

    // 确保 canvas 已经准备好
    const canvas = drawCanvasRef.current || canvasRef.current;
    if (!canvas) {
      console.warn("[TextTool] Canvas not ready");
      return;
    }

    // 先结束所有当前的编辑
    endEditingAll();
    
    const { x, y } = getCoordinates(e);
    
    // 确保坐标有效
    if (x < 0 || y < 0 || x > canvas.width || y > canvas.height) {
      console.warn("[TextTool] Click outside canvas bounds", { x, y, canvasWidth: canvas.width, canvasHeight: canvas.height });
      return;
    }

    const newId = Date.now().toString();
    console.log("[TextTool] Creating text object at", { x, y, id: newId });
    
    // 文字大小：以"屏幕上看起来的字号"为准。
    // 因为整个画布会按 zoom 缩放；大图 fit 后 zoom 很小，直接用 32px 会肉眼几乎看不见。
    const safeZoom = Math.max(10, zoom);
    const fontSizeOnCanvas = Math.round((textSize * 100) / safeZoom);

    setTextObjects(prev => [
      ...prev,
      {
        id: newId,
        x,
        y,
        text: "",
        color: textColor,
        fontSize: fontSizeOnCanvas,
        isEditing: true // 创建即编辑
      }
    ]);
    setSelectedTextId(newId);
  };

  // 文字对象点击：选中/准备拖拽
  const handleTextObjectMouseDown = (e: React.MouseEvent | React.TouchEvent, obj: TextObject) => {
    // 只在文字工具或移动工具（虽然现在没有独立的移动工具，但通常逻辑是一样的）下生效
    // 这里我们允许在文字工具下拖拽
    if (activeTool !== "text" && activeTool !== "brush") {
       return;
    }
    
    e.stopPropagation(); // 阻止冒泡到 Canvas 点击

    // 如果正在编辑当前对象，不处理拖拽（让用户可以选中文本）
    if (obj.isEditing) return;

    // 选中
    setSelectedTextId(obj.id);
    // 如果之前有别的在编辑，结束它
    if (textObjects.some(o => o.isEditing && o.id !== obj.id)) {
        endEditingAll();
    }

    // 准备拖拽
    const clientX = "touches" in e && e.touches[0] ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = "touches" in e && e.touches[0] ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    textDragRef.current = {
        id: obj.id,
        startX: clientX,
        startY: clientY,
        initialObjX: obj.x,
        initialObjY: obj.y,
        hasMoved: false
    };
  };

  // 文字对象双击：进入编辑
  const handleTextObjectDoubleClick = (e: React.MouseEvent, obj: TextObject) => {
      e.stopPropagation();
      if (activeTool !== "text") return;
      
      updateTextObj(obj.id, { isEditing: true });
  };

  // === 绘图/其他工具逻辑 ===

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    console.log("[startDrawing] activeTool:", activeTool);
    
    // 文字工具
    if (activeTool === "text") {
      handleTextCanvasClick(e);
      return;
    }

    // 裁剪工具
    if (activeTool === "crop") {
      handleCropPointerDown(e);
      return;
    }

    // 画笔/橡皮擦
    if (!drawCtx || (activeTool !== "brush" && activeTool !== "eraser")) return;

    const { x, y } = getCoordinates(e);
    
    isDrawingRef.current = true;
    lastPosRef.current = { x, y };

    // 配置画笔属性
    drawCtx.lineCap = "round";
    drawCtx.lineJoin = "round";
    drawCtx.lineWidth = brushSize;
    
    if (activeTool === "eraser") {
      drawCtx.globalCompositeOperation = "destination-out";
      drawCtx.strokeStyle = "rgba(0,0,0,1)";
    } else {
      drawCtx.globalCompositeOperation = "source-over";
      drawCtx.strokeStyle = brushColor;
    }

    // 画一个点（处理单击不拖动的情况）
    drawCtx.beginPath();
    drawCtx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    drawCtx.fill();
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    // 裁剪工具
    if (activeTool === "crop") {
      handleCropPointerMove(e);
      return;
    }

    const { x, y } = getCoordinates(e);

    // 更新光标位置（不管是否在绘制）
    if (activeTool === "eraser" || activeTool === "brush") {
      updateCursorPosition(x, y);
    }

    // 如果没在绘制中，就不画线
    if (!isDrawingRef.current || !drawCtx || !lastPosRef.current) return;
    
    // 重新设置画笔属性（以防变化）
    drawCtx.lineCap = "round";
    drawCtx.lineJoin = "round";
    drawCtx.lineWidth = brushSize;
    
    if (activeTool === "eraser") {
      drawCtx.globalCompositeOperation = "destination-out";
      drawCtx.strokeStyle = "rgba(0,0,0,1)";
    } else {
      drawCtx.globalCompositeOperation = "source-over";
      drawCtx.strokeStyle = brushColor;
    }

    // 从上一个点画到当前点
    drawCtx.beginPath();
    drawCtx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
    drawCtx.lineTo(x, y);
    drawCtx.stroke();
    
    lastPosRef.current = { x, y };
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    draw(e);
  };

  const handleCanvasMouseLeave = () => {
    hideCursor();
    // 不要在 leave 时停止绘制，因为可能只是鼠标移出了边界但还在拖动
    // stopDrawing 应该只在 mouseup 时触发
  };

  const stopDrawing = () => {
    // 裁剪工具
    if (activeTool === "crop") {
      handleCropPointerUp();
      return;
    }

    // 只有真正在绘制中才保存快照
    if (!isDrawingRef.current) return;
    
    isDrawingRef.current = false;
    lastPosRef.current = null;
    
    if (drawCtx) {
      drawCtx.globalCompositeOperation = "source-over";
    }
    
    saveSnapshot();
  };

  const saveSnapshot = () => {
    if (!canvasRef.current || !drawCanvasRef.current) return;
    const snapBg = canvasRef.current.toDataURL();
    const snapDraw = drawCanvasRef.current.toDataURL();
    setUndoStack(prev => [...prev, { bg: snapBg, draw: snapDraw }]);
    setRedoStack([]);
  };

  const restoreSnapshot = (snap: { bg: string; draw: string }) => {
    const canvas = canvasRef.current;
    const drawCanvas = drawCanvasRef.current;
    if (!canvas || !ctx || !drawCanvas || !drawCtx) return;

    const imgBg = new Image();
    imgBg.src = snap.bg;
    imgBg.onload = () => {
        canvas.width = imgBg.width;
        canvas.height = imgBg.height;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(imgBg, 0, 0);
    };

    const imgDraw = new Image();
    imgDraw.src = snap.draw;
    imgDraw.onload = () => {
        drawCanvas.width = imgDraw.width;
        drawCanvas.height = imgDraw.height;
        drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
        drawCtx.drawImage(imgDraw, 0, 0);
    };
  };

  // 撤销/重做
  const handleUndo = () => {
    if (undoStack.length <= 1) return;
    const current = undoStack[undoStack.length - 1];
    const prev = undoStack[undoStack.length - 2];
    
    setRedoStack(prevRedo => [...prevRedo, current]);
    setUndoStack(prevUndo => prevUndo.slice(0, -1));
    
    restoreSnapshot(prev);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    
    setUndoStack(prevUndo => [...prevUndo, next]);
    setRedoStack(prevRedo => prevRedo.slice(0, -1));
    
    restoreSnapshot(next);
  };

  // === 剪裁逻辑 ===
  const initCrop = () => {
    const canvas = canvasRef.current;
    const drawCanvas = drawCanvasRef.current;
    if (!canvas || !drawCanvas || !ctx) return;

    // 在剪裁前，将 Drawing Layer 永久合并到 Background Layer
    // 因为剪裁是破坏性操作，合并后逻辑更简单
    ctx.drawImage(drawCanvas, 0, 0);
    // 清空 drawCanvas
    const dCtx = drawCanvas.getContext("2d");
    if (dCtx) dCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    
    saveSnapshot(); // 保存合并后的状态作为新起点

    const w = canvas.width;
    const h = canvas.height;
    setCropRect({ x: 0, y: 0, w, h });
    setIsCropping(true);
    setShowToolProperties(false);
  };

  const setCropRatio = (ratio: number | null) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.width;
    const h = canvas.height;

    let newW = w;
    let newH = h;

    if (ratio) {
      if (w / h > ratio) {
        newW = h * ratio;
      } else {
        newH = w / ratio;
      }
    }
    setCropRect({
      x: (w - newW) / 2,
      y: (h - newH) / 2,
      w: newW,
      h: newH,
    });
  };

  const applyCrop = () => {
    if (!ctx || !canvasRef.current || !cropRect || !drawCanvasRef.current) return;

    const canvas = canvasRef.current;
    const drawCanvas = drawCanvasRef.current;
    const dCtx = drawCanvas.getContext("2d");
    if (!dCtx) return;

    const canvasW = canvas.width;
    const canvasH = canvas.height;

    const x = Math.max(0, Math.min(canvasW - 1, Math.round(cropRect.x)));
    const y = Math.max(0, Math.min(canvasH - 1, Math.round(cropRect.y)));
    const w = Math.max(1, Math.min(canvasW - x, Math.round(cropRect.w)));
    const h = Math.max(1, Math.min(canvasH - y, Math.round(cropRect.h)));

    try {
      const imgData = ctx.getImageData(x, y, w, h);
      
      canvas.width = w;
      canvas.height = h;
      ctx.putImageData(imgData, 0, 0);

      // Drawing Layer 已经被 initCrop 合并并清空了，所以只需要同步尺寸
      drawCanvas.width = w;
      drawCanvas.height = h;
      dCtx.clearRect(0, 0, w, h);

    } catch (err) {
      console.error(err);
      toast("剪裁失败（区域超出画布）", "error");
      return;
    }

    // 结束所有编辑
    endEditingAll();

    cropDragRef.current = null;
    setIsCropping(false);
    setCropRect(null);
    saveSnapshot();
    toast("剪裁已应用", "success");
  };

  const cancelCrop = () => {
    cropDragRef.current = null;
    setIsCropping(false);
    setCropRect(null);
  };

  const handleCropPointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (!cropRect) return;

    // 获取 client 坐标来做 hit test，因为 handle 也是以 screen/client 像素显示的（20px）
    // 如果用 canvas 坐标，大图缩小时 20px 对应的 canvas 像素很大，导致 handle 判定区域过小
    // 所以我们反过来，把 cropRect 映射到 client 坐标去判断

    // 命中判断必须基于"显示出来"的画布的矩形。
    // 两层画布尺寸相同、位置叠加，随便取一层即可。
    const canvas = drawCanvasRef.current || canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / canvas.width;
    const scaleY = rect.height / canvas.height;

    // cropRect 在 canvas 坐标系
    // 转换到 client (相对 canvas 左上角的像素距离)
    const leftPx = cropRect.x * scaleX;
    const topPx = cropRect.y * scaleY;
    const wPx = cropRect.w * scaleX;
    const hPx = cropRect.h * scaleY;
    const rightPx = leftPx + wPx;
    const bottomPx = topPx + hPx;

    const clientX =
      "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY =
      "touches" in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    // 鼠标相对于 canvas 容器左上角的坐标
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;

    const cornerSize = 24; // 角点命中区域
    const edgeSize = 12;   // 边缘命中区域

    let mode: "move" | "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w" | null = null;

    // 先检测四角（优先级最高）
    if (
      Math.abs(mouseX - leftPx) <= cornerSize &&
      Math.abs(mouseY - topPx) <= cornerSize
    )
      mode = "nw";
    else if (
      Math.abs(mouseX - rightPx) <= cornerSize &&
      Math.abs(mouseY - topPx) <= cornerSize
    )
      mode = "ne";
    else if (
      Math.abs(mouseX - leftPx) <= cornerSize &&
      Math.abs(mouseY - bottomPx) <= cornerSize
    )
      mode = "sw";
    else if (
      Math.abs(mouseX - rightPx) <= cornerSize &&
      Math.abs(mouseY - bottomPx) <= cornerSize
    )
      mode = "se";
    // 检测四边
    else if (
      Math.abs(mouseY - topPx) <= edgeSize &&
      mouseX > leftPx + cornerSize &&
      mouseX < rightPx - cornerSize
    )
      mode = "n";
    else if (
      Math.abs(mouseY - bottomPx) <= edgeSize &&
      mouseX > leftPx + cornerSize &&
      mouseX < rightPx - cornerSize
    )
      mode = "s";
    else if (
      Math.abs(mouseX - leftPx) <= edgeSize &&
      mouseY > topPx + cornerSize &&
      mouseY < bottomPx - cornerSize
    )
      mode = "w";
    else if (
      Math.abs(mouseX - rightPx) <= edgeSize &&
      mouseY > topPx + cornerSize &&
      mouseY < bottomPx - cornerSize
    )
      mode = "e";
    // 内部移动
    else if (
      mouseX >= leftPx &&
      mouseX <= rightPx &&
      mouseY >= topPx &&
      mouseY <= bottomPx
    )
      mode = "move";

    if (!mode) return;

    // 记录由于是 canvas 坐标计算，这里需要存的是 原始点击时的 canvas 坐标
    const { x: startCX, y: startCY } = getCoordinates(e);

    cropDragRef.current = {
      mode,
      startX: startCX,
      startY: startCY,
      startRect: { ...cropRect },
    };
  };

  // 更新裁剪工具光标样式
  const updateCropCursor = (e: React.MouseEvent | React.TouchEvent) => {
    if (!cropRect || cropDragRef.current) return; // 正在拖动时不更新
    
    const canvas = drawCanvasRef.current || canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / canvas.width;
    const scaleY = rect.height / canvas.height;

    const leftPx = cropRect.x * scaleX;
    const topPx = cropRect.y * scaleY;
    const wPx = cropRect.w * scaleX;
    const hPx = cropRect.h * scaleY;
    const rightPx = leftPx + wPx;
    const bottomPx = topPx + hPx;

    const clientX = "touches" in e && e.touches[0] ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = "touches" in e && e.touches[0] ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;

    const cornerSize = 24;
    const edgeSize = 12;

    let cursor = "crosshair";

    // 四角
    if (Math.abs(mouseX - leftPx) <= cornerSize && Math.abs(mouseY - topPx) <= cornerSize)
      cursor = "nwse-resize";
    else if (Math.abs(mouseX - rightPx) <= cornerSize && Math.abs(mouseY - topPx) <= cornerSize)
      cursor = "nesw-resize";
    else if (Math.abs(mouseX - leftPx) <= cornerSize && Math.abs(mouseY - bottomPx) <= cornerSize)
      cursor = "nesw-resize";
    else if (Math.abs(mouseX - rightPx) <= cornerSize && Math.abs(mouseY - bottomPx) <= cornerSize)
      cursor = "nwse-resize";
    // 四边
    else if (Math.abs(mouseY - topPx) <= edgeSize && mouseX > leftPx + cornerSize && mouseX < rightPx - cornerSize)
      cursor = "ns-resize";
    else if (Math.abs(mouseY - bottomPx) <= edgeSize && mouseX > leftPx + cornerSize && mouseX < rightPx - cornerSize)
      cursor = "ns-resize";
    else if (Math.abs(mouseX - leftPx) <= edgeSize && mouseY > topPx + cornerSize && mouseY < bottomPx - cornerSize)
      cursor = "ew-resize";
    else if (Math.abs(mouseX - rightPx) <= edgeSize && mouseY > topPx + cornerSize && mouseY < bottomPx - cornerSize)
      cursor = "ew-resize";
    // 内部
    else if (mouseX >= leftPx && mouseX <= rightPx && mouseY >= topPx && mouseY <= bottomPx)
      cursor = "move";

    setCropCursor(cursor);
  };

  const handleCropPointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    // 更新光标样式
    if (activeTool === "crop" && isCropping) {
      updateCropCursor(e);
    }

    const drag = cropDragRef.current;
    const canvas = canvasRef.current;
    if (!drag || !canvas) return;

    const canvasW = canvas.width;
    const canvasH = canvas.height;
    const minSize = 50;

    const { x, y } = getCoordinates(e);
    const dx = x - drag.startX;
    const dy = y - drag.startY;
    const start = drag.startRect;

    let next = { ...start };

    if (drag.mode === "move") {
      next.x = start.x + dx;
      next.y = start.y + dy;
    } else if (drag.mode === "nw") {
      next.x = start.x + dx;
      next.y = start.y + dy;
      next.w = start.w - dx;
      next.h = start.h - dy;
    } else if (drag.mode === "ne") {
      next.y = start.y + dy;
      next.w = start.w + dx;
      next.h = start.h - dy;
    } else if (drag.mode === "sw") {
      next.x = start.x + dx;
      next.w = start.w - dx;
      next.h = start.h + dy;
    } else if (drag.mode === "se") {
      next.w = start.w + dx;
      next.h = start.h + dy;
    } else if (drag.mode === "n") {
      next.y = start.y + dy;
      next.h = start.h - dy;
    } else if (drag.mode === "s") {
      next.h = start.h + dy;
    } else if (drag.mode === "w") {
      next.x = start.x + dx;
      next.w = start.w - dx;
    } else if (drag.mode === "e") {
      next.w = start.w + dx;
    }

    // normalize negative sizes
    if (next.w < 0) {
      next.x += next.w;
      next.w = Math.abs(next.w);
    }
    if (next.h < 0) {
      next.y += next.h;
      next.h = Math.abs(next.h);
    }

    next.w = Math.max(minSize, next.w);
    next.h = Math.max(minSize, next.h);

    next.x = clamp(next.x, 0, canvasW - next.w);
    next.y = clamp(next.y, 0, canvasH - next.h);
    next.w = Math.min(next.w, canvasW);
    next.h = Math.min(next.h, canvasH);

    setCropRect(next);
  };

  const handleCropPointerUp = () => {
    cropDragRef.current = null;
  };

  // === 保存 ===
  const handleSave = async () => {
    if (!canvasRef.current || !drawCanvasRef.current) return;

    // 如果正在剪裁，提示
    if (isCropping) {
      toast("请先确认剪裁", "error");
      return;
    }

    // 结束所有编辑
    endEditingAll();
    setSelectedTextId(null);

    setIsSaving(true);
    try {
      const baseCanvas = canvasRef.current;
      const drawCanvas = drawCanvasRef.current;

      // 合成最终图片：Base + Drawing + TextObjects
      const tmp = document.createElement("canvas");
      tmp.width = baseCanvas.width;
      tmp.height = baseCanvas.height;
      const tctx = tmp.getContext("2d");
      if (!tctx) throw new Error("Canvas Init Failed");

      // 1. Base Layer
      tctx.drawImage(baseCanvas, 0, 0);
      
      // 2. Drawing Layer
      tctx.drawImage(drawCanvas, 0, 0);

      // 3. Text Layer (Vector Rasterization)
      if (textObjects.length > 0) {
          textObjects.forEach((obj) => {
            if (!obj.text.trim()) return;
            tctx.save();
            tctx.globalCompositeOperation = "source-over";
            // 确保字体清晰：使用系统字体兜底
            tctx.font = `bold ${obj.fontSize}px sans-serif`;
            tctx.fillStyle = obj.color;
            tctx.textBaseline = "top";
            
            // 处理阴影（与 DOM 保持一致）
            tctx.shadowColor = "rgba(0,0,0,0.5)";
            tctx.shadowBlur = 2;
            tctx.shadowOffsetX = 0;
            tctx.shadowOffsetY = 0;

            const lines = obj.text.split("\n");
            const lineHeight = obj.fontSize * 1.2;
            lines.forEach((line, idx) => {
              tctx.fillText(line, obj.x, obj.y + idx * lineHeight);
            });
            tctx.restore();
          });
      }

      const blob = await new Promise<Blob | null>((resolve) =>
        tmp.toBlob(resolve, "image/png", 1.0) // 最高质量
      );
      if (!blob) throw new Error("Canvas转换失败");

      const file = new File([blob], `edit_${Date.now()}.png`, { type: "image/png" });
      const newUrl = await uploadToOss(file, "ai-agent/edited");

      await aiAgentImageApi.saveMediaSlot(shotId, {
        gridType: "image",
        slotIndex: slotIndex,
        imageUrl: newUrl,
        actionType: "EDIT_MANUAL",
      });

      toast("保存成功", "success");
      onSave(newUrl);
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast("保存失败（跨域或网络问题）", "error");
    } finally {
      setIsSaving(false);
    }
  };

  // === AI 生成 ===
  const handleUploadRefImage = async (file: File) => {
      if (refImages.length >= 5) {
          toast("最多支持5张参考图", "error");
          return;
      }
      setUploadingRef(true);
      try {
          const url = await uploadToOss(file, "ai-agent/ref-images");
          setRefImages(prev => [...prev, url]);
      } catch (e) {
          toast("上传失败", "error");
      } finally {
          setUploadingRef(false);
      }
  };

  const handleAiGenerate = async () => {
    if (!canvasRef.current || !drawCanvasRef.current) return;
    if (!aiPrompt.trim()) {
      toast("请输入修改提示词", "error");
      return;
    }
    
    setIsAiGenerating(true);
    try {
      // 合并 Image + Draw 传给 AI，暂时不包含 Text？通常 AI 图生图不含文字 Overlay 比较好？
      // 或者包含？看需求。如果不包含 Draw，那么用户的涂鸦不会被 AI 看到。
      // 所以应该：Base + Draw
      const baseCanvas = canvasRef.current;
      const drawCanvas = drawCanvasRef.current;
      
      const tmp = document.createElement("canvas");
      tmp.width = baseCanvas.width;
      tmp.height = baseCanvas.height;
      const tctx = tmp.getContext("2d");
      if (tctx) {
          tctx.drawImage(baseCanvas, 0, 0);
          tctx.drawImage(drawCanvas, 0, 0);
      }
      const currentImage = tmp.toDataURL("image/png");
      const blob = await (await fetch(currentImage)).blob();
      const file = new File([blob], `source_${Date.now()}.png`, { type: "image/png" });
      const sourceUrl = await uploadToOss(file, "ai-agent/temp");

      await aiAgentImageApi.imageEdit(shotId, {
        slotIndex,
        prompt: aiPrompt,
        sourceImageUrl: sourceUrl,
        refImageUrls: refImages, // 新增：多参考图
        model: selectedModel,    // 新增：模型选择
        mode: "img2img"
      });
      
      toast("AI任务已提交", "success");
      
      // 切换到历史记录 Tab
      setActiveTab("history");
      
      // 延迟一下再刷新历史记录，给后端时间创建 GENERATING 记录
      setTimeout(() => {
        loadBackendHistory(true);
      }, 300);
      
    } catch (e) {
      console.error(e);
      toast("请求失败", "error");
    } finally {
      setIsAiGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[98vw] h-[95vh] bg-[#1a1a1e] border-zinc-800 text-zinc-100 p-0 flex flex-col overflow-hidden shadow-2xl [&>button]:hidden">
        
        {/* 顶部栏 */}
        <div className="h-14 flex items-center justify-between px-6 border-b border-zinc-800 bg-[#202024]">
          <div className="flex items-center gap-4">
            <DialogTitle className="font-semibold text-lg tracking-tight">图片编辑器</DialogTitle>
            <div className="h-6 w-px bg-zinc-700 mx-2" />
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={handleUndo} disabled={undoStack.length <= 1} className="h-8 w-8 text-zinc-400 hover:text-white">
                <Undo className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleRedo} disabled={redoStack.length === 0} className="h-8 w-8 text-zinc-400 hover:text-white">
                <Redo className="w-4 h-4" />
              </Button>
            </div>
            <div className="h-6 w-px bg-zinc-700 mx-2" />
             <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono">
                <ZoomOut className="w-3.5 h-3.5 cursor-pointer hover:text-white" onClick={() => setZoom(z => Math.max(10, z - 10))} />
                <span className="w-8 text-center">{zoom}%</span>
                <ZoomIn className="w-3.5 h-3.5 cursor-pointer hover:text-white" onClick={() => setZoom(z => Math.min(200, z + 10))} />
             </div>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-zinc-400 hover:text-white">取消</Button>
            <Button 
              onClick={handleSave} 
              disabled={isSaving}
              className="bg-indigo-600 hover:bg-indigo-500 text-white min-w-[100px]"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              保存
            </Button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* 左侧工具栏 */}
          <div className="w-16 bg-[#202024] border-r border-zinc-800 flex flex-col items-center py-4 gap-4 z-20">
            <ToolButton active={activeTool === "brush"} onClick={() => { setActiveTool("brush"); setShowToolProperties(true); setIsCropping(false); }} icon={<Pen className="w-5 h-5" />} label="画笔" />
            <ToolButton active={activeTool === "eraser"} onClick={() => { setActiveTool("eraser"); setShowToolProperties(true); setIsCropping(false); }} icon={<Eraser className="w-5 h-5" />} label="橡皮" />
            <ToolButton active={activeTool === "text"} onClick={() => { console.log("[TextTool] Button clicked"); setActiveTool("text"); setIsCropping(false); }} icon={<Type className="w-5 h-5" />} label="文字" />
            <ToolButton active={activeTool === "crop"} onClick={() => { setActiveTool("crop"); initCrop(); }} icon={<Crop className="w-5 h-5" />} label="剪裁" />
          </div>

          {/* 画笔/橡皮 浮动属性面板 */}
          {showToolProperties && (activeTool === "brush" || activeTool === "eraser") && (
             <div className="absolute left-20 top-20 z-30 bg-zinc-900 border border-zinc-700 rounded-lg p-4 shadow-xl w-60 animate-in fade-in slide-in-from-left-2">
                 <div className="flex justify-between items-center mb-3">
                     <span className="text-xs font-medium text-zinc-300">
                         {activeTool === "brush" ? "画笔设置" : "橡皮设置"}
                     </span>
                     <X className="w-3.5 h-3.5 cursor-pointer text-zinc-500 hover:text-white" onClick={() => setShowToolProperties(false)} />
                 </div>
                 
                 <div className="space-y-4">
                     <div className="space-y-2">
                        <label className="text-xs text-zinc-500">大小 ({brushSize}px)</label>
                        <input type="range" min={1} max={100} value={brushSize} onChange={(e) => setBrushSize(parseInt(e.target.value))} className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer" />
                     </div>
                     {activeTool === "brush" && (
                         <div className="space-y-2">
                            <label className="text-xs text-zinc-500">颜色</label>
                            <div className="grid grid-cols-5 gap-2">
                                {["#ffffff", "#000000", "#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#6366f1", "#14b8a6"].map(c => (
                                    <button key={c} onClick={() => setBrushColor(c)} className={cn("w-6 h-6 rounded-full border border-zinc-600", brushColor === c && "ring-2 ring-white border-transparent")} style={{ backgroundColor: c }} />
                                ))}
                            </div>
                            <input type="color" value={brushColor} onChange={e => setBrushColor(e.target.value)} className="w-full h-8 cursor-pointer rounded bg-transparent mt-2" />
                         </div>
                     )}
                 </div>
             </div>
          )}

          {/* 中间画布 */}
          <div 
            ref={containerRef} 
            className="flex-1 bg-[#141415] relative overflow-hidden flex items-center justify-center p-8"
          >
            {/* 文字工具属性栏 (顶部浮动) */}
            {activeTool === "text" && (
              <div data-text-toolbar className="absolute top-4 left-1/2 -translate-x-1/2 bg-zinc-800 border border-zinc-700 rounded-lg p-2 flex items-center gap-4 shadow-lg z-30 pointer-events-auto">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400">字号</span>
                  <input
                    type="number"
                    value={textSize}
                    onChange={(e) => setTextSize(parseInt(e.target.value) || 24)}
                    className="w-16 h-8 bg-zinc-900 border border-zinc-700 rounded px-2 text-xs"
                    onMouseDown={e => e.stopPropagation()}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400">颜色</span>
                  <input
                    type="color"
                    value={textColor}
                    onChange={(e) => setTextColor(e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer"
                    onMouseDown={e => e.stopPropagation()}
                  />
                </div>
                <div className="h-4 w-px bg-zinc-700" />
                <span className="text-[10px] text-zinc-500">
                  点击画面添加文字，输入后点"确认"烘焦到图片
                </span>
              </div>
            )}

            {/* 剪裁工具控制栏 */}
            {activeTool === "crop" && isCropping && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-zinc-800 border border-zinc-700 rounded-lg p-2 flex flex-col items-center gap-2 shadow-lg z-30 pointer-events-auto">
                    <div className="flex items-center gap-3">
                        <span className="text-xs text-zinc-300">剪裁比例</span>
                        <div className="flex bg-zinc-900 rounded-md p-0.5">
                            <button className="px-2 py-1 text-[10px] hover:bg-zinc-700 rounded text-zinc-400" onClick={() => setCropRatio(null)}>自由</button>
                            <button className="px-2 py-1 text-[10px] hover:bg-zinc-700 rounded text-zinc-400" onClick={() => setCropRatio(1)}>1:1</button>
                            <button className="px-2 py-1 text-[10px] hover:bg-zinc-700 rounded text-zinc-400" onClick={() => setCropRatio(16/9)}>16:9</button>
                            <button className="px-2 py-1 text-[10px] hover:bg-zinc-700 rounded text-zinc-400" onClick={() => setCropRatio(4/3)}>4:3</button>
                            <button className="px-2 py-1 text-[10px] hover:bg-zinc-700 rounded text-zinc-400" onClick={() => setCropRatio(3/4)}>3:4</button>
                        </div>
                    </div>
                    <div className="flex gap-2 w-full justify-center">
                        <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={cancelCrop}>取消</Button>
                        <Button size="sm" className="h-7 text-xs bg-indigo-600" onClick={applyCrop}>确认</Button>
                    </div>
                </div>
            )}

            {/* 画布加载遮罩：避免打开时闪一下 / 切换历史图时闪烁 */}
            {isImageLoading && (
              <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-[#141415]">
                <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
                <div className="mt-2 text-[10px] text-zinc-500">图片加载中...</div>
              </div>
            )}

            <div 
              className={cn(
                "shadow-2xl border border-zinc-700/50",
              )}
              style={{ 
                  transform: `scale(${zoom / 100})`, 
                  transformOrigin: "center center",
                  // 棋盘格背景（展示透明）
                  backgroundImage: `
                    linear-gradient(45deg, #2a2a2d 25%, transparent 25%), 
                    linear-gradient(-45deg, #2a2a2d 25%, transparent 25%), 
                    linear-gradient(45deg, transparent 75%, #2a2a2d 75%), 
                    linear-gradient(-45deg, transparent 75%, #2a2a2d 75%)
                  `,
                  backgroundSize: "20px 20px",
                  backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
                  backgroundColor: "#1a1a1e",
                  position: "relative",
                  // 加载时隐藏底层，防止旧图残影透出来
                  opacity: isImageLoading ? 0 : 1,
                  transition: "opacity 120ms ease"
              }}
            >
              {/* 底层图片 Canvas */}
              <canvas
                ref={canvasRef}
                className="block"
              />
              {/* 上层绘画 Canvas（与底层完全重叠） */}
              <canvas
                ref={drawCanvasRef}
                onMouseDown={startDrawing}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={stopDrawing}
                onMouseLeave={handleCanvasMouseLeave}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                className={cn(
                  "block absolute inset-0",
                  activeTool === "text" && "cursor-text",
                  (activeTool === "brush" || activeTool === "eraser") && "cursor-none"
                )}
                style={{
                  cursor: activeTool === "crop" ? cropCursor : undefined
                }}
              />
              {/* 橡皮擦/画笔光标圈（使用 ref 直接操作 DOM 避免卡顿） */}
              {(activeTool === "eraser" || activeTool === "brush") && (
                  <div 
                      ref={cursorElementRef}
                      className="absolute rounded-full border-2 pointer-events-none z-20"
                      style={{
                          display: "none",
                          borderColor: activeTool === "eraser" ? "rgba(255,255,255,0.8)" : brushColor,
                          backgroundColor: activeTool === "brush" ? `${brushColor}33` : "transparent"
                      }}
                  />
              )}
              
              {/* 文字 Overlay 层：DOM 渲染，保证清晰度 */}
              {textObjects.map((obj) => {
                const isSelected = selectedTextId === obj.id;
                const isEditing = obj.isEditing;
                const interactive = activeTool === "text" || activeTool === "brush"; // 允许在绘图时也能看到文字（虽不可交互）

                return (
                  <div
                    key={obj.id}
                    className={cn(
                      "absolute",
                      interactive ? "pointer-events-auto" : "pointer-events-none"
                    )}
                    style={{ 
                        left: obj.x, 
                        top: obj.y,
                        // 优化：文字原点默认是左上角，这符合一般习惯
                        transform: "translate(0, 0)", 
                    }}
                    onMouseDown={(e) => handleTextObjectMouseDown(e, obj)}
                    onDoubleClick={(e) => handleTextObjectDoubleClick(e, obj)}
                  >
                    {isEditing ? (
                      <textarea
                        ref={(el) => {
                          // 确保 textarea 获得焦点
                          if (el) {
                            requestAnimationFrame(() => {
                              el.focus();
                            });
                          }
                        }}
                        value={obj.text}
                        placeholder="输入文字..."
                        onChange={(e) => updateTextObj(obj.id, { text: e.target.value })}
                        onBlur={(e) => {
                            // 检查是否点击了相关元素（避免误删）
                            const relatedTarget = e.relatedTarget as HTMLElement | null;
                            // 如果点击的是同一个 container 内的元素，可能是工具栏等，暂不处理
                            if (relatedTarget?.closest('[data-text-toolbar]')) {
                              return;
                            }
                            // 失去焦点时，如果内容为空则删除，否则退出编辑
                            if (!obj.text.trim()) {
                                setTextObjects(prev => prev.filter(o => o.id !== obj.id));
                                setSelectedTextId(null);
                            } else {
                                updateTextObj(obj.id, { isEditing: false });
                            }
                        }}
                        onMouseDown={(e) => e.stopPropagation()} // 阻止冒泡，允许在 textarea 内选中文本
                        className="bg-transparent overflow-hidden outline-none min-w-[50px] min-h-[1.2em] whitespace-pre border border-dashed border-indigo-400"
                        style={{
                          fontSize: obj.fontSize,
                          color: obj.color,
                          fontWeight: "bold",
                          lineHeight: 1.2,
                          fontFamily: "sans-serif",
                          resize: "none",
                          // 自动宽度处理：实际上 textarea 很难做 auto width，通常用 div contenteditable 或者 hidden div sync
                          // 这里简单处理：给一个较宽的宽度或者基于内容估算
                          width: `${Math.max(100, obj.text.length * obj.fontSize)}px`,
                          height: `${Math.max(obj.fontSize * 1.5, obj.text.split('\n').length * obj.fontSize * 1.2)}px`,
                          textShadow: "0px 0px 2px rgba(0,0,0,0.5)" // 增加可读性
                        }}
                      />
                    ) : (
                      <div
                        className={cn(
                          "whitespace-pre cursor-move select-none",
                          isSelected && "outline outline-2 outline-indigo-500" // 选中框
                        )}
                        style={{
                          fontSize: obj.fontSize,
                          color: obj.color,
                          fontWeight: "bold",
                          lineHeight: 1.2,
                          fontFamily: "sans-serif",
                          textShadow: "0px 0px 2px rgba(0,0,0,0.5)",
                          minWidth: "10px",
                          minHeight: "1em",
                          padding: "2px" // 增加一点点击区域
                        }}
                      >
                        {obj.text || "点击输入"}
                        
                        {/* 选中状态下的控制点（简单版：只有删除按钮） */}
                        {isSelected && (
                            <div className="absolute -top-3 -right-3">
                                <button 
                                    className="bg-red-500 text-white rounded-full p-0.5 shadow-sm hover:bg-red-600 transition-colors"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        deleteSelectedText();
                                    }}
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* 剪裁 Overlay：pointer-events-none 让事件穿透到 canvas（我们用坐标判断拖拽模式） */}
              {isCropping && cropRect && (
                <div className="absolute inset-0 pointer-events-none">
                  {/* 裁剪框 + 阴影遮罩外部 */}
                  <div
                    className="absolute border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.6)] box-content"
                    style={{
                      left: cropRect.x,
                      top: cropRect.y,
                      width: cropRect.w,
                      height: cropRect.h,
                    }}
                  >
                    {/* 网格线（3x3九宫格） */}
                    <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
                      {[...Array(9)].map((_, i) => (
                        <div key={i} className="border border-white/20" />
                      ))}
                    </div>
                    {/* 四角手柄 */}
                    <div className="absolute -top-2 -left-2 w-4 h-4 bg-white border-2 border-indigo-500 rounded-sm" />
                    <div className="absolute -top-2 -right-2 w-4 h-4 bg-white border-2 border-indigo-500 rounded-sm" />
                    <div className="absolute -bottom-2 -left-2 w-4 h-4 bg-white border-2 border-indigo-500 rounded-sm" />
                    <div className="absolute -bottom-2 -right-2 w-4 h-4 bg-white border-2 border-indigo-500 rounded-sm" />
                    {/* 四边中点手柄 */}
                    <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-6 h-3 bg-white border border-indigo-500 rounded-sm" />
                    <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-6 h-3 bg-white border border-indigo-500 rounded-sm" />
                    <div className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-3 h-6 bg-white border border-indigo-500 rounded-sm" />
                    <div className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-6 bg-white border border-indigo-500 rounded-sm" />
                    {/* 尺寸标签 */}
                    <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] text-white bg-black/70 px-1.5 py-0.5 rounded whitespace-nowrap">
                      {Math.round(cropRect.w)} × {Math.round(cropRect.h)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 右侧面板 (常驻 AI) */}
          <div className="w-80 bg-[#202024] border-l border-zinc-800 flex flex-col z-20">
             <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)} className="flex-1 flex flex-col">
                 <div className="px-4 pt-4">
                    <TabsList className="w-full bg-zinc-900">
                        <TabsTrigger value="ai" className="flex-1">AI 重绘</TabsTrigger>
                        <TabsTrigger value="history" className="flex-1">历史记录</TabsTrigger>
                    </TabsList>
                 </div>

                 <TabsContent value="ai" className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-6">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-zinc-400">选择模型</label>
                            <div className="relative">
                                <select 
                                    className="w-full h-9 bg-zinc-900 border border-zinc-700 rounded-md px-3 text-xs appearance-none"
                                    value={selectedModel}
                                    onChange={e => setSelectedModel(e.target.value)}
                                >
                                    {models.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                                </select>
                                <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-zinc-500 pointer-events-none" />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-medium text-zinc-400">修改提示词</label>
                            <Textarea 
                                value={aiPrompt}
                                onChange={e => setAiPrompt(e.target.value)}
                                placeholder="描述修改内容，例如：变成夜晚背景..."
                                className="bg-zinc-900 border-zinc-700 min-h-[100px] text-xs resize-none"
                            />
                        </div>

                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <label className="text-xs font-medium text-zinc-400">参考图 (最多5张)</label>
                                <span className="text-[10px] text-zinc-500">{refImages.length}/5</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                {refImages.map((url, i) => (
                                    <div key={i} className="relative aspect-square rounded overflow-hidden border border-zinc-700 group">
                                        <img src={toThumbnailUrl(url, 200)} className="w-full h-full object-cover" />
                                        <button 
                                            className="absolute top-1 right-1 bg-black/60 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                            onClick={() => setRefImages(prev => prev.filter((_, idx) => idx !== i))}
                                        >
                                            <X className="w-3 h-3 text-white" />
                                        </button>
                                    </div>
                                ))}
                                {refImages.length < 5 && (
                                    <label className="aspect-square rounded border border-dashed border-zinc-700 hover:border-indigo-500/50 hover:bg-zinc-800/50 flex flex-col items-center justify-center cursor-pointer transition-colors">
                                        {uploadingRef ? <Loader2 className="w-5 h-5 animate-spin text-indigo-500" /> : <Plus className="w-5 h-5 text-zinc-500" />}
                                        <input type="file" accept="image/*" className="hidden" onChange={e => {
                                            const file = e.target.files?.[0];
                                            if (file) handleUploadRefImage(file);
                                        }} />
                                    </label>
                                )}
                            </div>
                        </div>

                        <Button 
                            className="w-full bg-indigo-600 hover:bg-indigo-500 mt-4"
                            onClick={handleAiGenerate}
                            disabled={isAiGenerating}
                        >
                            {isAiGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                            开始重绘
                        </Button>
                        <p className="text-[10px] text-zinc-500 text-center">生成结果将自动保存到历史记录</p>
                    </div>
                 </TabsContent>

                 <TabsContent value="history" className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    {loadingHistory ? (
                        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-zinc-500" /></div>
                    ) : historyRecords.length === 0 ? (
                        <div className="text-center text-zinc-500 py-10 text-xs">暂无历史记录</div>
                    ) : (
                        <div className="space-y-3">
                            {historyRecords.map((record, i) => {
                                const isGenerating = record.status === "GENERATING" || record.status === "PROCESSING" || record.status === "PENDING";
                                const isFailed = record.status === "FAILED" || record.status === "ERROR";
                                return (
                                    <div 
                                        key={record.id || i} 
                                        className={cn(
                                            "group relative rounded-lg border bg-zinc-900/50 overflow-hidden transition-all",
                                            isGenerating ? "border-indigo-500/50" : isFailed ? "border-red-500/50" : "border-zinc-800 hover:border-indigo-500/50 cursor-pointer"
                                        )} 
                                        onClick={() => !isGenerating && !isFailed && record.imageUrl && loadImageToCanvas(getProxyUrl(record.imageUrl))}
                                    >
                                        {isGenerating ? (
                                            // 生成中状态
                                            <div className="w-full h-20 bg-zinc-800/50 flex items-center justify-center">
                                                <div className="flex flex-col items-center gap-1">
                                                    <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                                                    <span className="text-[10px] text-indigo-400">AI 生成中...</span>
                                                </div>
                                            </div>
                                        ) : isFailed ? (
                                            // 失败状态
                                            <div className="w-full h-20 bg-zinc-800/50 flex items-center justify-center">
                                                <div className="flex flex-col items-center gap-1">
                                                    <X className="w-5 h-5 text-red-500" />
                                                    <span className="text-[10px] text-red-400">生成失败</span>
                                                </div>
                                            </div>
                                        ) : (
                                            // 正常状态
                                            <>
                                                <img src={toThumbnailUrl(record.imageUrl, 400)} className="w-full h-20 object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                    <span className="text-xs text-white font-medium">点击加载此版本</span>
                                                </div>
                                            </>
                                        )}
                                        <div className="p-2 space-y-1">
                                            <div className="text-[10px] text-zinc-400 flex justify-between">
                                                <span>{isGenerating ? "AI 重绘" : isFailed ? "生成失败" : record.actionType || "生成"}</span>
                                                <span>{new Date(record.createdAt).toLocaleTimeString()}</span>
                                            </div>
                                            {/* 显示提示词 */}
                                            {(record as any).prompt && (
                                                <p className="text-[10px] text-zinc-500 line-clamp-2" title={(record as any).prompt}>
                                                    {(record as any).prompt}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                 </TabsContent>
             </Tabs>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ToolButton({ active, icon, onClick, label }: any) {
  return (
    <div className="flex flex-col items-center gap-1 group relative">
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "h-10 w-10 rounded-xl transition-all",
          active ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
        )}
        onClick={onClick}
        title={label}
      >
        {icon}
      </Button>
      {/* 简单的 Tooltip 实现 */}
      <span className="absolute left-14 bg-black/80 px-2 py-1 rounded text-[10px] text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
          {label}
      </span>
    </div>
  );
}
