"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Video, Play, Download, Share2, Trash2, Loader2 } from "lucide-react";
import api from "@/lib/api";

interface VideoItem {
  id: number;
  title: string;
  projectId: number;
  url: string;
  thumbnail?: string;
  duration?: number;
  createdAt: string;
  status: string;
}

export default function VideosPage() {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchVideos();
  }, []);

  const fetchVideos = async () => {
    try {
      // 从所有完成的项目中获取视频
      const res = await api.get("/projects");
      const projects = res.data;
      
      const videoList: VideoItem[] = [];
      projects.forEach((project: any) => {
        if (project.finalVideoUrl) {
          videoList.push({
            id: project.id,
            title: project.title,
            projectId: project.id,
            url: project.finalVideoUrl,
            createdAt: project.updatedAt,
            status: project.status
          });
        }
      });
      
      setVideos(videoList);
    } catch (error) {
      console.error("Failed to fetch videos");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = (url: string, title: string) => {
    const link = document.createElement('a');
    link.href = `http://localhost:3001${url}`;
    link.download = `${title}.mp4`;
    link.click();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-cyan-900/20 to-black text-white p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
              🎬 我的视频库
            </h1>
            <p className="text-gray-400 mt-2">管理和分享您创作的所有动漫视频</p>
          </div>
          <Video className="w-12 h-12 text-cyan-400 opacity-20" />
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
          </div>
        ) : videos.length === 0 ? (
          <Card className="bg-white/5 border-white/10 text-center py-20">
            <CardContent>
              <Video className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400 mb-4">还没有完成的视频</p>
              <Link href="/create-simple">
                <Button className="bg-cyan-600 hover:bg-cyan-700">
                  立即创建视频
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {videos.map((video) => (
              <Card key={video.id} className="bg-white/5 border-white/10 hover:border-cyan-500/50 transition-all group overflow-hidden">
                <div className="aspect-video bg-black relative overflow-hidden">
                  <video 
                    src={`http://localhost:3001${video.url}`}
                    className="w-full h-full object-cover"
                    poster="/api/placeholder/640/360"
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Button 
                      size="lg" 
                      className="rounded-full bg-cyan-600 hover:bg-cyan-700"
                      onClick={() => window.open(`http://localhost:3001${video.url}`, '_blank')}
                    >
                      <Play className="w-6 h-6" />
                    </Button>
                  </div>
                </div>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Video className="w-5 h-5 text-cyan-400" />
                    {video.title}
                  </CardTitle>
                  <CardDescription className="text-gray-400">
                    创建于 {new Date(video.createdAt).toLocaleDateString('zh-CN')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="flex-1 border-white/20 hover:bg-white/10"
                      onClick={() => handleDownload(video.url, video.title)}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      下载
                    </Button>
                    <Link href={`/project/${video.projectId}`} className="flex-1">
                      <Button size="sm" variant="outline" className="w-full border-white/20 hover:bg-white/10">
                        编辑
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
