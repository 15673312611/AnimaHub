"use client";

import { X, Download, Play, Pause, Volume2, VolumeX, Maximize } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast-provider";

interface Props {
  videoUrl: string;
  onClose: () => void;
}

export default function VideoPreviewModal({ videoUrl, onClose }: Props) {
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      setProgress((video.currentTime / video.duration) * 100);
    };

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("loadedmetadata", handleLoadedMetadata);

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
    };
  }, []);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    
    if (isPlaying) {
      video.pause();
    } else {
      video.play();
    }
    setIsPlaying(!isPlaying);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    video.currentTime = percent * video.duration;
  };

  const handleDownload = async () => {
    try {
      const response = await fetch(videoUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `video-${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      toast("下载失败", "error");
    }
  };

  const handleFullscreen = () => {
    const video = videoRef.current;
    if (!video) return;
    
    if (video.requestFullscreen) {
      video.requestFullscreen();
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
      onClick={onClose}
    >
      {/* 关闭按钮 */}
      <Button
        size="sm"
        variant="outline"
        className="absolute top-4 right-4 border-zinc-700 bg-zinc-900/80 backdrop-blur z-10"
        onClick={onClose}
      >
        <X className="w-4 h-4" />
      </Button>

      {/* 视频容器 */}
      <div 
        className="relative max-w-[90vw] max-h-[85vh] w-full"
        onClick={e => e.stopPropagation()}
      >
        <video
          ref={videoRef}
          src={videoUrl}
          className="w-full h-auto max-h-[80vh] rounded-lg"
          autoPlay
          loop
          onClick={togglePlay}
        />

        {/* 控制栏 */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 rounded-b-lg">
          {/* 进度条 */}
          <div 
            className="h-1 bg-zinc-700 rounded-full mb-3 cursor-pointer group"
            onClick={handleSeek}
          >
            <div 
              className="h-full bg-emerald-500 rounded-full relative"
              style={{ width: `${progress}%` }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>

          {/* 控制按钮 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={togglePlay}
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                {isPlaying ? (
                  <Pause className="w-5 h-5 text-white" />
                ) : (
                  <Play className="w-5 h-5 text-white ml-0.5" />
                )}
              </button>
              
              <button
                onClick={toggleMute}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                {isMuted ? (
                  <VolumeX className="w-5 h-5 text-zinc-400" />
                ) : (
                  <Volume2 className="w-5 h-5 text-zinc-400" />
                )}
              </button>

              <span className="text-sm text-zinc-400">
                {formatTime(videoRef.current?.currentTime || 0)} / {formatTime(duration)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="text-zinc-400 hover:text-white"
                onClick={handleDownload}
              >
                <Download className="w-4 h-4 mr-1" />
                下载
              </Button>
              <button
                onClick={handleFullscreen}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <Maximize className="w-5 h-5 text-zinc-400" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
