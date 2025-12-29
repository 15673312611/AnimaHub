"use client";

import { useState, useCallback, memo, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Loader2, 
  Plus, 
  Upload, 
  Trash2, 
  Wand2,
  Image as ImageIcon,
  Eye,
  Clock,
  Sparkles,
  Video
} from "lucide-react";
import { OptimizedImage, preloadImages, getOssThumbnail } from "@/components/OptimizedMedia";

interface Asset {
  id: number;
  name: string;
  imageUrl?: string;
  status: string;
  progress?: number;
  description?: string;
  generationPrompt?: string;
  generationModel?: string;
  createdAt?: string;
  [key: string]: any;
}

interface AssetGalleryProps {
  title: string;
  description: string;
  assets: Asset[];
  icon: any;
  iconColor?: string;
  onGenerate: () => void;
  onUpload: () => void;
  onDelete: (id: number) => void;
  onUseForVideo?: (asset: Asset) => void;
  emptyText: string;
}

// 状态标签组件
const StatusBadge = memo(({ status }: { status: string }) => {
  switch (status) {
    case 'COMPLETED':
      return <span className="px-2 py-0.5 text-[10px] font-medium bg-green-500/20 text-green-400 rounded-full">已完成</span>;
    case 'GENERATING':
    case 'PENDING':
      return <span className="px-2 py-0.5 text-[10px] font-medium bg-purple-500/20 text-purple-400 rounded-full animate-pulse">生成中</span>;
    case 'FAILED':
      return <span className="px-2 py-0.5 text-[10px] font-medium bg-red-500/20 text-red-400 rounded-full">失败</span>;
    default:
      return null;
  }
});
StatusBadge.displayName = 'StatusBadge';

// 单个资产卡片组件
const AssetCard = memo(({ 
  asset, 
  icon: Icon, 
  onDelete, 
  onPreview,
  onUseForVideo,
  index
}: { 
  asset: Asset; 
  icon: any; 
  onDelete: (id: number) => void; 
  onPreview: (asset: Asset) => void;
  onUseForVideo?: (asset: Asset) => void;
  index: number;
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(asset.id);
  }, [asset.id, onDelete]);

  const handlePreview = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onPreview(asset);
  }, [asset, onPreview]);

  const handleUseForVideo = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onUseForVideo?.(asset);
  }, [asset, onUseForVideo]);

  return (
    <Card 
      className="bg-gradient-to-b from-zinc-900 to-zinc-950 border-white/5 overflow-hidden group hover:border-purple-500/30 hover:shadow-xl hover:shadow-purple-500/20 transition-all duration-300 relative rounded-2xl hover:-translate-y-1"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* 图片区域 */}
      <div className="aspect-[4/5] relative bg-gradient-to-br from-zinc-800/50 to-zinc-900/50 overflow-hidden">
        {asset.imageUrl ? (
          <>
            <OptimizedImage 
              src={asset.imageUrl} 
              alt={asset.name} 
              className="w-full h-full"
              objectFit="cover"
              priority={index < 5} // 前5个优先加载
              placeholder="blur"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
            {asset.status === 'GENERATING' || asset.status === 'PENDING' ? (
              <div className="text-center">
                <div className="relative w-14 h-14 mx-auto mb-3">
                  <div className="absolute inset-0 rounded-full border-2 border-purple-500/30 animate-ping" />
                  <div className="absolute inset-2 rounded-full bg-purple-500/10 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 text-purple-500 animate-spin" />
                  </div>
                </div>
                <span className="text-sm text-purple-400 font-medium">生成中...</span>
              </div>
            ) : asset.status === 'FAILED' ? (
              <div className="text-center">
                <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-3">
                  <ImageIcon className="w-6 h-6 text-red-400" />
                </div>
                <span className="text-sm text-red-400 font-medium">生成失败</span>
                <p className="text-xs text-zinc-500 mt-1">请重试</p>
                <Button 
                  variant="destructive" 
                  size="sm" 
                  className="mt-3"
                  onClick={handleDelete}
                >
                  <Trash2 className="w-3 h-3 mr-1" />
                  删除
                </Button>
              </div>
            ) : (
              <div className="text-center">
                <Icon className="w-12 h-12 text-zinc-700 mx-auto" />
              </div>
            )}
          </div>
        )}
        
        {/* 悬浮操作按钮 */}
        <div className={`absolute inset-0 flex items-center justify-center gap-2 transition-all duration-300 ${
          isHovered && asset.imageUrl ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}>
          <Button 
            size="icon" 
            className="h-10 w-10 rounded-full bg-white/90 hover:bg-white text-zinc-900 shadow-xl backdrop-blur-sm"
            onClick={handlePreview}
          >
            <Eye className="w-4 h-4" />
          </Button>
          {onUseForVideo && (
            <Button 
              size="icon" 
              className="h-10 w-10 rounded-full bg-purple-500/90 hover:bg-purple-500 text-white shadow-xl backdrop-blur-sm"
              onClick={handleUseForVideo}
              title="用于生视频"
            >
              <Video className="w-4 h-4" />
            </Button>
          )}
          <Button 
            variant="destructive" 
            size="icon" 
            className="h-10 w-10 rounded-full shadow-xl"
            onClick={handleDelete}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>

        {/* 状态标签 */}
        <div className="absolute top-3 left-3">
          <StatusBadge status={asset.status} />
        </div>

        {/* AI 生成标识 */}
        {asset.generationPrompt && (
          <div className="absolute top-3 right-3">
            <div className="w-7 h-7 rounded-full bg-purple-500/20 backdrop-blur-sm flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            </div>
          </div>
        )}
      </div>

      {/* 信息区域 */}
      <CardContent className="p-4 space-y-2">
        <h3 className="font-semibold text-zinc-100 truncate text-sm" title={asset.name}>
          {asset.name}
        </h3>
        
        <p 
          className="text-xs text-zinc-500 line-clamp-2 leading-relaxed min-h-[2.5rem]" 
          title={asset.generationPrompt || asset.description || ""}
        >
          {asset.generationPrompt || asset.description || "暂无描述"}
        </p>

        <div className="flex items-center justify-between pt-2 border-t border-white/5">
          <span className="text-[10px] text-zinc-600 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {asset.createdAt ? new Date(asset.createdAt).toLocaleDateString() : '刚刚'}
          </span>
          {asset.generationModel && (
            <span className="text-[10px] text-zinc-600 bg-zinc-800/50 px-2 py-0.5 rounded">
              {asset.generationModel.split('-')[0]}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
});
AssetCard.displayName = 'AssetCard';

export function AssetGallery({
  title,
  description,
  assets,
  icon: Icon,
  iconColor = "text-purple-500",
  onGenerate,
  onUpload,
  onDelete,
  onUseForVideo,
  emptyText
}: AssetGalleryProps) {
  const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);

  // 预加载前几张图片（使用缩略图）
  useEffect(() => {
    const imageUrls = assets
      .filter(a => a.imageUrl)
      .slice(0, 8)
      .map(a => getOssThumbnail(a.imageUrl!, { width: 800, quality: 90 }));
    preloadImages(imageUrls);
  }, [assets]);

  const handlePreview = useCallback((asset: Asset) => {
    setPreviewAsset(asset);
  }, []);

  const handleClosePreview = useCallback(() => {
    setPreviewAsset(null);
  }, []);

  return (
    <div className="h-full flex flex-col space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2 text-white">
            <Icon className={`w-6 h-6 ${iconColor}`} />
            {title}
          </h2>
          <p className="text-zinc-400 text-sm mt-1">{description}</p>
        </div>
        <div className="flex gap-3">
          <Button 
            onClick={onUpload} 
            variant="outline" 
            className="border-white/10 hover:bg-white/10 text-zinc-300"
          >
            <Upload className="w-4 h-4 mr-2" />
            上传素材
          </Button>
          <Button 
            onClick={onGenerate} 
            className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white border-0"
          >
            <Wand2 className="w-4 h-4 mr-2" />
            AI 生成
          </Button>
        </div>
      </div>

      {assets.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-white/10 rounded-xl bg-white/5 min-h-[400px]">
          <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-6">
            <Icon className="w-10 h-10 text-zinc-600" />
          </div>
          <h3 className="text-xl font-medium text-zinc-300 mb-2">暂无{title}</h3>
          <p className="text-zinc-500 max-w-sm text-center mb-8">{emptyText}</p>
          <Button onClick={onGenerate} className="bg-purple-600 hover:bg-purple-700">
            <Plus className="w-4 h-4 mr-2" />
            创建第一个{title}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5 pb-20">
          {assets.map((asset, index) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              icon={Icon}
              onDelete={onDelete}
              onPreview={handlePreview}
              onUseForVideo={onUseForVideo}
              index={index}
            />
          ))}
        </div>
      )}

      {/* 预览弹窗 - 使用原图 */}
      {previewAsset && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-8"
          onClick={handleClosePreview}
        >
          <div className="max-w-4xl max-h-full relative" onClick={e => e.stopPropagation()}>
            {/* 预览时加载原图，显示 loading */}
            <div className="relative">
              <img 
                src={previewAsset.imageUrl} 
                alt={previewAsset.name}
                className="max-w-full max-h-[80vh] object-contain rounded-xl shadow-2xl"
              />
            </div>
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent rounded-b-xl">
              <h3 className="text-white font-semibold">{previewAsset.name}</h3>
              <p className="text-zinc-400 text-sm mt-1 line-clamp-2">
                {previewAsset.generationPrompt || previewAsset.description}
              </p>
            </div>
            <Button 
              size="icon"
              variant="ghost"
              className="absolute top-4 right-4 text-white hover:bg-white/20"
              onClick={handleClosePreview}
            >
              ✕
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
