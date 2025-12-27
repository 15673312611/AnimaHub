"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Loader2, 
  Plus, 
  Upload, 
  Trash2, 
  Wand2,
  Image as ImageIcon
} from "lucide-react";

interface Asset {
  id: number;
  name: string;
  imageUrl?: string;
  status: string; // PENDING, GENERATING, COMPLETED, FAILED
  progress?: number;
  description?: string;
  generationPrompt?: string;
  [key: string]: any;
}

interface AssetGalleryProps {
  title: string;
  description: string;
  assets: Asset[];
  icon: any;
  onGenerate: () => void;
  onUpload: () => void;
  onDelete: (id: number) => void;
  emptyText: string;
}

export function AssetGallery({
  title,
  description,
  assets,
  icon: Icon,
  onGenerate,
  onUpload,
  onDelete,
  emptyText
}: AssetGalleryProps) {
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  return (
    <div className="h-full flex flex-col space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2 text-white">
            <Icon className="w-6 h-6 text-purple-500" />
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
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 pb-20">
          {assets.map((asset) => (
            <Card 
              key={asset.id} 
              className="bg-zinc-900 border-white/10 overflow-hidden group hover:border-purple-500/50 transition-all duration-300 relative"
              onMouseEnter={() => setHoveredId(asset.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <div className="aspect-[3/4] relative bg-black/50">
                {asset.imageUrl ? (
                  <img 
                    src={asset.imageUrl} 
                    alt={asset.name} 
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
                    {asset.status === 'GENERATING' ? (
                      <>
                        <Loader2 className="w-8 h-8 text-purple-500 animate-spin mb-3" />
                        <span className="text-xs text-purple-400 font-medium">
                          生成中 {asset.progress}%
                        </span>
                        <div className="w-full h-1 bg-zinc-800 rounded-full mt-2 overflow-hidden">
                          <div 
                            className="h-full bg-purple-500 transition-all duration-300"
                            style={{ width: `${asset.progress}%` }}
                          />
                        </div>
                      </>
                    ) : asset.status === 'FAILED' ? (
                      <div className="text-center text-red-400">
                        <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-2">
                          <ImageIcon className="w-5 h-5" />
                        </div>
                        <span className="text-xs">生成失败</span>
                      </div>
                    ) : (
                      <Icon className="w-10 h-10 text-zinc-700" />
                    )}
                  </div>
                )}
                
                {/* Overlay Actions */}
                <div className={`absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent transition-opacity duration-200 flex flex-col justify-end p-4 ${
                  hoveredId === asset.id ? 'opacity-100' : 'opacity-0'
                }`}>
                  <div className="flex justify-end gap-2 mb-auto pt-2">
                    <Button 
                      variant="destructive" 
                      size="icon" 
                      className="h-8 w-8 shadow-lg"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(asset.id);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>

              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-zinc-100 truncate text-sm" title={asset.name}>
                      {asset.name}
                    </h3>
                    <p className="text-xs text-zinc-500 mt-1 line-clamp-2" title={asset.generationPrompt || asset.description || ""}>
                      {asset.generationPrompt || asset.description || "暂无描述"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
