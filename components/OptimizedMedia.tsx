"use client";

import { useState, useEffect, useRef, memo, useCallback } from "react";
import { Loader2, Image as ImageIcon, Video as VideoIcon } from "lucide-react";

// ============================================
// 全局缓存：记录已经加载成功的图片 URL
// ============================================
const loadedImageCache = new Set<string>();

// ============================================
// OSS 图片处理：生成缩略图 URL
// 阿里云 OSS 图片处理参数
// ============================================
export function getOssThumbnail(
  url: string,
  options: { width?: number; quality?: number; format?: "webp" | "jpg" | "png" } = {}
): string {
  if (!url) return url;
  
  // 只处理 OSS 链接
  if (!url.includes("aliyuncs.com")) return url;
  
  // 如果已经有处理参数，不重复添加
  if (url.includes("x-oss-process=")) return url;
  
  const { width = 800, quality = 90, format = "webp" } = options;
  const separator = url.includes("?") ? "&" : "?";
  
  return `${url}${separator}x-oss-process=image/resize,w_${width}/quality,q_${quality}/format,${format}`;
}

// 获取原图（移除处理参数）
export function getOriginalImage(url: string): string {
  if (!url) return url;
  return url.split("?x-oss-process=")[0].split("&x-oss-process=")[0];
}

interface OptimizedImageProps {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  priority?: boolean;
  placeholder?: "blur" | "empty";
  onLoad?: () => void;
  onError?: () => void;
  objectFit?: "cover" | "contain" | "fill" | "none";
  // 新增：是否使用缩略图，默认 true
  useThumbnail?: boolean;
  // 缩略图宽度，默认 800
  thumbnailWidth?: number;
}

export const OptimizedImage = memo(
  ({
    src,
    alt,
    className = "",
    width,
    height,
    priority = false,
    placeholder = "empty",
    onLoad,
    onError,
    objectFit = "cover",
    useThumbnail = true,
    thumbnailWidth = 800,
  }: OptimizedImageProps) => {
    const imgRef = useRef<HTMLImageElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const observerRef = useRef<IntersectionObserver | null>(null);

    // 处理图片 URL：列表页用缩略图
    const displaySrc = useThumbnail ? getOssThumbnail(src, { width: thumbnailWidth }) : src;

    // 关键：检查全局缓存，如果已加载过，直接设为 true
    const [loaded, setLoaded] = useState(() => loadedImageCache.has(displaySrc));
    const [shouldLoad, setShouldLoad] = useState(priority || loadedImageCache.has(displaySrc));
    const [error, setError] = useState(false);

    // 懒加载逻辑
    useEffect(() => {
      if (shouldLoad) return;

      const element = containerRef.current;
      if (!element) return;

      observerRef.current = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              setShouldLoad(true);
              observerRef.current?.disconnect();
            }
          });
        },
        { rootMargin: "200px", threshold: 0.01 }
      );

      observerRef.current.observe(element);

      return () => {
        observerRef.current?.disconnect();
      };
    }, [shouldLoad]);

    const handleLoad = useCallback(() => {
      // 加入全局缓存
      loadedImageCache.add(displaySrc);
      setLoaded(true);
      onLoad?.();
    }, [displaySrc, onLoad]);

    const handleError = useCallback(() => {
      setError(true);
      onError?.();
    }, [onError]);

    if (error) {
      return (
        <div
          className={`flex items-center justify-center bg-zinc-800/50 ${className}`}
        >
          <ImageIcon className="w-8 h-8 text-zinc-600" />
        </div>
      );
    }

    const objectFitClass = {
      cover: "object-cover",
      contain: "object-contain",
      fill: "object-fill",
      none: "object-none",
    }[objectFit];

    return (
      <div ref={containerRef} className={`relative ${className}`}>
        {/* 加载占位符 - 只在未加载时显示 */}
        {!loaded && shouldLoad && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-800/30 z-10">
            {placeholder === "blur" ? (
              <div className="absolute inset-0 bg-gradient-to-br from-zinc-700/50 to-zinc-800/50 animate-pulse" />
            ) : (
              <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
            )}
          </div>
        )}

        {/* 图片 */}
        {shouldLoad && (
          <img
            ref={imgRef}
            src={displaySrc}
            alt={alt}
            width={width}
            height={height}
            className={`${objectFitClass} w-full h-full transition-opacity duration-150 ${
              loaded ? "opacity-100" : "opacity-0"
            }`}
            onLoad={handleLoad}
            onError={handleError}
            loading={priority ? "eager" : "lazy"}
            decoding="async"
          />
        )}
      </div>
    );
  }
);

OptimizedImage.displayName = "OptimizedImage";

// ============================================
// 优化的视频组件 - 点击播放才加载视频
// 使用 OSS 视频截帧作为封面，避免加载整个视频
// ============================================

// OSS 视频截帧：获取视频第一帧作为封面
export function getVideoThumbnail(url: string): string {
  if (!url) return "";
  
  // 只处理 OSS 链接
  if (!url.includes("aliyuncs.com")) return "";
  
  // 如果已经有处理参数，不重复添加
  if (url.includes("x-oss-process=")) return url;
  
  // OSS 视频截帧参数：截取第 0 秒的帧，输出为 jpg
  return `${url}?x-oss-process=video/snapshot,t_0,f_jpg,w_800`;
}

interface OptimizedVideoProps {
  src: string;
  poster?: string;
  className?: string;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  controls?: boolean;
  preload?: "none" | "metadata" | "auto";
  onLoadedData?: () => void;
  onError?: () => void;
}

export const OptimizedVideo = memo(
  ({
    src,
    poster,
    className = "",
    autoPlay = false,
    muted = true,
    loop = false,
    controls = true,
    preload = "none", // 默认不预加载
    onLoadedData,
    onError,
  }: OptimizedVideoProps) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState(false);

    // 自动生成封面：优先用传入的 poster，否则用 OSS 视频截帧
    const videoPoster = poster || getVideoThumbnail(src);

    const handleLoadedData = useCallback(() => {
      setLoaded(true);
      onLoadedData?.();
    }, [onLoadedData]);

    const handleError = useCallback(() => {
      setError(true);
      onError?.();
    }, [onError]);

    const handlePlay = useCallback(() => {
      setIsPlaying(true);
    }, []);

    if (error) {
      return (
        <div
          className={`flex items-center justify-center bg-zinc-800/50 ${className}`}
        >
          <VideoIcon className="w-8 h-8 text-zinc-600" />
        </div>
      );
    }

    return (
      <div ref={containerRef} className={`relative ${className}`}>
        {/* 未播放时显示封面和播放按钮 */}
        {!isPlaying && (
          <div
            className="absolute inset-0 cursor-pointer group z-10"
            onClick={handlePlay}
          >
            {/* 封面图或占位符 */}
            {videoPoster ? (
              <img
                src={videoPoster}
                alt="Video thumbnail"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
                <VideoIcon className="w-12 h-12 text-zinc-700" />
              </div>
            )}
            {/* 播放按钮 */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition-colors">
              <div className="w-14 h-14 rounded-full bg-white/90 group-hover:bg-white flex items-center justify-center shadow-xl transition-all group-hover:scale-110">
                <svg
                  className="w-6 h-6 text-zinc-900 ml-1"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
          </div>
        )}

        {/* 加载中 */}
        {isPlaying && !loaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-800/30 z-10">
            <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
          </div>
        )}

        {/* 视频 - 只有点击播放后才加载 */}
        {isPlaying && (
          <video
            ref={videoRef}
            src={src}
            poster={videoPoster}
            className={`w-full h-full object-cover transition-opacity duration-300 ${
              loaded ? "opacity-100" : "opacity-0"
            }`}
            autoPlay={true}
            muted={muted}
            loop={loop}
            controls={controls}
            preload={preload}
            playsInline
            onLoadedData={handleLoadedData}
            onError={handleError}
          />
        )}
      </div>
    );
  }
);

OptimizedVideo.displayName = "OptimizedVideo";

// 预加载函数
export const preloadImage = (src: string) => {
  if (!src || typeof window === "undefined") return;
  const img = new window.Image();
  img.onload = () => loadedImageCache.add(src);
  img.src = src;
};

export const preloadImages = (srcs: string[]) => {
  srcs.forEach((src) => preloadImage(src));
};

export const isImageCached = (src: string): boolean => {
  return loadedImageCache.has(src);
};

export default OptimizedImage;
