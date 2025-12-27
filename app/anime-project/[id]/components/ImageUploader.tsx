"use client";

import { useState, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, UploadCloud, Image as ImageIcon, X } from "lucide-react";
import api from "@/lib/api";
import { useToast } from "@/components/ui/toast-provider";
import { cn } from "@/lib/utils";

interface ImageUploaderProps {
  onUpload: (url: string) => void;
  label?: string;
  description?: string;
  className?: string;
  defaultValue?: string;
  folder?: string; // OSS存储目录，默认 uploads
}

export default function ImageUploader({ 
  onUpload, 
  label = "上传图片", 
  description = "支持 JPG、PNG 格式", 
  className,
  defaultValue,
  folder = "uploads"
}: ImageUploaderProps) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(defaultValue || null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast("请选择图片文件", "error");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast("文件大小不能超过 10MB", "error");
      return;
    }

    setUploading(true);
    try {
      // 1. 获取OSS预签名上传URL
      const presignRes = await api.post('/oss/presign', {
        fileName: file.name,
        folder: folder,
        contentType: file.type
      });

      const { uploadUrl, fileUrl, contentType } = presignRes.data;

      // 2. 直接上传文件到OSS
      await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': contentType
        },
        body: file
      });

      // 3. 设置预览和回调
      setPreviewUrl(fileUrl);
      onUpload(fileUrl);
      toast("图片上传成功", "success");
    } catch (error: any) {
      console.error("Upload error:", error);
      // 如果OSS未配置，回退到base64方式
      if (error.response?.status === 503) {
        toast("OSS未配置，请联系管理员配置阿里云OSS", "error");
      } else {
        toast(error.response?.data?.error || "上传失败", "error");
      }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPreviewUrl(null);
    onUpload("");
  };

  return (
    <div className={cn("space-y-3", className)}>
      {label && <Label className="text-zinc-400 text-sm font-medium">{label}</Label>}
      
      <div 
        onClick={() => !uploading && inputRef.current?.click()}
        className={cn(
          "relative group cursor-pointer flex flex-col items-center justify-center w-full rounded-xl border-2 border-dashed border-zinc-700 bg-zinc-900/30 hover:bg-zinc-900/50 hover:border-purple-500/50 transition-all duration-200 overflow-hidden",
          previewUrl ? "border-solid border-zinc-800 h-auto aspect-video" : "h-32",
          uploading && "opacity-50 cursor-not-allowed"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={handleFileUpload}
          disabled={uploading}
          className="hidden"
        />

        {uploading ? (
          <div className="flex flex-col items-center gap-2 text-zinc-400">
            <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
            <span className="text-xs">正在上传到云端...</span>
          </div>
        ) : previewUrl ? (
          <div className="relative w-full h-full">
             <img 
               src={previewUrl} 
               className="w-full h-full object-contain bg-black/40" 
               alt="Uploaded" 
             />
             <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                <p className="text-white text-sm font-medium">点击更换图片</p>
                <button 
                  onClick={handleRemove}
                  className="px-3 py-1 bg-red-500/20 hover:bg-red-500/40 text-red-400 text-xs rounded-full border border-red-500/50 transition-colors"
                >
                  移除图片
                </button>
             </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 p-4 text-center">
             <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                <UploadCloud className="w-5 h-5 text-zinc-400 group-hover:text-purple-400" />
             </div>
             <div className="space-y-1">
               <p className="text-sm text-zinc-300 font-medium group-hover:text-purple-300 transition-colors">点击或拖拽上传</p>
               {description && <p className="text-xs text-zinc-500">{description}</p>}
             </div>
          </div>
        )}
      </div>
    </div>
  );
}
