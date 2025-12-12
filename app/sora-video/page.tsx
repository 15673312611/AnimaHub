"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast-provider";
import { Loader2, Clapperboard, Upload, X, Sparkles, Play } from "lucide-react";
import api from "@/lib/api";

export default function SoraVideoPage() {
  const { toast } = useToast();

  // 输入状态
  const [prompt, setPrompt] = useState("");
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  
  // 生成状态
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedVideo, setGeneratedVideo] = useState<{
    taskId?: string;
    videoUrl?: string;
    status?: string;
  } | null>(null);

  // 处理参考图上传
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const remainingSlots = 5 - referenceImages.length;
    if (remainingSlots <= 0) {
      toast("最多只能上传 5 张参考图", "error");
      return;
    }

    const filesToUpload = Array.from(files).slice(0, remainingSlots);
    
    for (const file of filesToUpload) {
      if (!file.type.startsWith('image/')) {
        toast(`${file.name} 不是图片文件`, "error");
        continue;
      }

      if (file.size > 10 * 1024 * 1024) {
        toast(`${file.name} 超过 10MB 限制`, "error");
        continue;
      }

      try {
        const reader = new FileReader();
        reader.onload = async (event) => {
          const base64Data = event.target?.result as string;
          
          try {
            const res = await api.post('/upload/image', {
              imageData: base64Data,
              fileName: file.name
            });

            if (res.data?.url) {
              console.log('图片上传成功，URL:', res.data.url);
              setReferenceImages(prev => [...prev, res.data.url]);
              toast(`${file.name} 上传成功`, "success");
            } else {
              console.error('上传响应中没有 URL:', res.data);
              toast(`${file.name} 上传失败：未返回图片地址`, "error");
            }
          } catch (error: any) {
            toast(error?.response?.data?.error || `上传 ${file.name} 失败`, "error");
          }
        };
        reader.readAsDataURL(file);
      } catch (error: any) {
        toast(error?.response?.data?.error || `上传 ${file.name} 失败`, "error");
      }
    }
  };

  // 删除参考图
  const handleRemoveImage = (index: number) => {
    setReferenceImages(prev => prev.filter((_, i) => i !== index));
    toast("已删除参考图", "success");
  };

  // 生成视频
  const handleGenerateVideo = async () => {
    if (!prompt.trim()) {
      toast("请输入视频描述", "error");
      return;
    }

    setIsGenerating(true);
    try {
      const res = await api.post('/sora/generate-video', {
        prompt: prompt.trim(),
        referenceImages: referenceImages.length > 0 ? referenceImages : undefined
      });

      if (res.data?.taskId) {
        setGeneratedVideo({
          taskId: res.data.taskId,
          status: 'processing'
        });
        toast("视频生成任务已创建，请稍候...", "success");
        
        // 开始轮询任务状态
        pollVideoStatus(res.data.taskId);
      }
    } catch (error: any) {
      toast(error?.response?.data?.error || "生成失败", "error");
      setIsGenerating(false);
    }
  };

  // 轮询视频状态
  const pollVideoStatus = async (taskId: string) => {
    const maxAttempts = 60; // 最多轮询 60 次（5 分钟）
    let attempts = 0;

    const poll = async () => {
      try {
        const res = await api.get(`/sora/video-status/${taskId}`);
        
        if (res.data?.status === 'completed' && res.data?.videoUrl) {
          setGeneratedVideo({
            taskId,
            videoUrl: res.data.videoUrl,
            status: 'completed'
          });
          setIsGenerating(false);
          toast("视频生成成功！", "success");
          return;
        }

        if (res.data?.status === 'failed') {
          setGeneratedVideo({
            taskId,
            status: 'failed'
          });
          setIsGenerating(false);
          toast("视频生成失败", "error");
          return;
        }

        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 5000); // 每 5 秒轮询一次
        } else {
          setIsGenerating(false);
          toast("视频生成超时，请稍后查看", "warning");
        }
      } catch (error) {
        console.error('轮询状态失败:', error);
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 5000);
        } else {
          setIsGenerating(false);
        }
      }
    };

    poll();
  };

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* 标题 */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/30 text-xs text-purple-200">
            <Sparkles className="w-3 h-3" />
            <span>AI 视频生成</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold">AI 视频创作</h1>
          <p className="text-sm text-gray-400">
            输入描述 + 上传参考图 → AI 生成高质量视频
          </p>
        </div>

        {/* 输入区 */}
        <Card className="bg-white/5 border-white/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clapperboard className="w-5 h-5 text-purple-400" />
              视频创作输入
            </CardTitle>
            <CardDescription className="text-gray-400">
              描述你想要的视频内容，AI 会根据描述和参考图生成视频
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 参考图上传区 */}
            <div className="space-y-2">
              <label className="text-sm text-gray-300 flex items-center gap-2">
                <Upload className="w-4 h-4" />
                参考图片（选填，最多 5 张）
              </label>
              <div className="flex flex-wrap gap-3">
                {/* 已上传的图片 */}
                {referenceImages.map((url, index) => (
                  <div key={index} className="relative group">
                    <img
                      src={url}
                      alt={`参考图 ${index + 1}`}
                      className="w-24 h-24 object-cover rounded-lg border border-white/20"
                    />
                    <button
                      onClick={() => handleRemoveImage(index)}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-4 h-4 text-white" />
                    </button>
                  </div>
                ))}

                {/* 上传按钮 */}
                {referenceImages.length < 5 && (
                  <label className="w-24 h-24 border-2 border-dashed border-white/20 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-purple-500/50 hover:bg-purple-500/5 transition-all">
                    <Upload className="w-6 h-6 text-gray-400 mb-1" />
                    <span className="text-xs text-gray-400">上传图片</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={handleImageUpload}
                    />
                  </label>
                )}
              </div>
              <p className="text-xs text-gray-500">
                💡 上传角色、场景或风格参考图，AI 会参考这些图片生成视频（支持 JPG/PNG，单张最大 10MB）
              </p>
            </div>

            {/* 视频描述 */}
            <div className="space-y-2">
              <label className="text-sm text-gray-300">视频描述</label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="例如：一个少女在樱花树下跳舞，镜头缓缓旋转，花瓣飘落，唯美动漫风格..."
                className="min-h-[120px] bg-black/30 border-white/10 text-sm"
              />
            </div>

            {/* 生成按钮 */}
            <Button
              className="w-full bg-purple-600 hover:bg-purple-700"
              disabled={isGenerating || !prompt.trim()}
              onClick={handleGenerateVideo}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  生成视频
                </>
              )}
            </Button>

            <div className="p-3 rounded-lg bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 text-xs text-gray-300">
              <div className="font-semibold text-purple-300 mb-1">💡 提示</div>
              <div className="space-y-1">
                <div>• 简单描述你想要的视频内容和风格</div>
                <div>• 可以上传参考图，AI 会参考图片的风格和角色</div>
                <div>• 视频生成需要 1-3 分钟，请耐心等待</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 生成结果 */}
        {generatedVideo && (
          <Card className="bg-gradient-to-br from-purple-900/20 to-blue-900/20 border-purple-500/30">
            <CardHeader>
              <CardTitle>生成结果</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {generatedVideo.status === 'processing' && (
                <div className="flex items-center gap-3 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                  <Loader2 className="w-5 h-5 text-yellow-400 animate-spin" />
                  <div>
                    <div className="text-sm font-medium text-yellow-300">视频生成中...</div>
                    <div className="text-xs text-gray-400">任务 ID: {generatedVideo.taskId}</div>
                  </div>
                </div>
              )}

              {generatedVideo.status === 'completed' && generatedVideo.videoUrl && (
                <div className="space-y-3">
                  <div className="text-sm font-medium text-green-400">✅ 视频生成成功！</div>
                  <video
                    src={generatedVideo.videoUrl}
                    controls
                    className="w-full rounded-lg border border-white/10"
                  />
                  <a
                    href={generatedVideo.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm transition-colors"
                  >
                    <Play className="w-4 h-4" />
                    在新窗口打开
                  </a>
                </div>
              )}

              {generatedVideo.status === 'failed' && (
                <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
                  ❌ 视频生成失败，请重试
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
