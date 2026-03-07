"use client";

import { X, Download, ZoomIn, ZoomOut, RotateCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast-provider";

interface Props {
  imageUrl: string;
  onClose: () => void;
}

export default function ImagePreviewModal({ imageUrl, onClose }: Props) {
  const { toast } = useToast();
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);

  const handleDownload = async () => {
    try {
      // 尝试使用 fetch 下载（支持同域/CORS 允许的资源）
      const response = await fetch(imageUrl, { mode: "cors" });
      if (!response.ok) throw new Error("fetch failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // 从 URL 提取文件名或使用默认名
      const filename = imageUrl.split("/").pop()?.split("?")[0] || `image-${Date.now()}.png`;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast("下载成功", "success");
    } catch (error) {
      // fetch 失败时（跨域等情况），回退到新窗口打开
      console.warn("直接下载失败，尝试新窗口打开:", error);
      window.open(imageUrl, "_blank");
      toast("已在新窗口打开，请右键保存图片", "info");
    }
  };

  const handleZoomIn = () => setScale(s => Math.min(s + 0.25, 3));
  const handleZoomOut = () => setScale(s => Math.max(s - 0.25, 0.5));
  const handleRotate = () => setRotation(r => (r + 90) % 360);

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      onClick={onClose}
    >
      {/* 工具栏 */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        <Button
          size="sm"
          variant="outline"
          className="border-zinc-700 bg-zinc-900/80 backdrop-blur"
          onClick={(e) => { e.stopPropagation(); handleZoomOut(); }}
        >
          <ZoomOut className="w-4 h-4" />
        </Button>
        <span className="text-sm text-zinc-400 min-w-[60px] text-center">
          {Math.round(scale * 100)}%
        </span>
        <Button
          size="sm"
          variant="outline"
          className="border-zinc-700 bg-zinc-900/80 backdrop-blur"
          onClick={(e) => { e.stopPropagation(); handleZoomIn(); }}
        >
          <ZoomIn className="w-4 h-4" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="border-zinc-700 bg-zinc-900/80 backdrop-blur"
          onClick={(e) => { e.stopPropagation(); handleRotate(); }}
        >
          <RotateCw className="w-4 h-4" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="border-zinc-700 bg-zinc-900/80 backdrop-blur"
          onClick={(e) => { e.stopPropagation(); handleDownload(); }}
        >
          <Download className="w-4 h-4" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="border-zinc-700 bg-zinc-900/80 backdrop-blur"
          onClick={onClose}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* 图片 */}
      <div 
        className="max-w-[90vw] max-h-[90vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <img
          src={imageUrl}
          alt=""
          className="max-w-full max-h-[90vh] object-contain transition-transform duration-200"
          style={{
            transform: `scale(${scale}) rotate(${rotation}deg)`
          }}
        />
      </div>
    </div>
  );
}
