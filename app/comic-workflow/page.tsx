"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast-provider";
import { Loader2, BookOpen, Image as ImageIcon, Film, Sparkles, ArrowRight, CheckCircle2, Clock, XCircle, Upload, X } from "lucide-react";
import api from "@/lib/api";

interface ComicPanel {
  panelNumber: number;
  imageUrl: string;
  enhancedUrl?: string;
  description?: string;
}

interface VideoSegment {
  segmentNumber: number;
  startPanel: number;
  endPanel: number;
  videoUrl?: string;
  taskId?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

interface ComicWorkflow {
  id: string;
  pageNumber: number;
  comicImageUrl: string;
  panels: ComicPanel[];
  videoSegments: VideoSegment[];
  finalVideoUrl?: string;
  status: 'init' | 'extracting' | 'enhancing' | 'generating_videos' | 'merging' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
}

export default function ComicWorkflowPage() {
  const { toast } = useToast();

  // 工作流状态
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [workflow, setWorkflow] = useState<ComicWorkflow | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  // 输入状态
  const [storyPrompt, setStoryPrompt] = useState("");
  const [panelCount, setPanelCount] = useState(9);
  const [nextPagePrompt, setNextPagePrompt] = useState("");
  const [referenceImages, setReferenceImages] = useState<string[]>([]);

  // 加载状态
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isGeneratingVideos, setIsGeneratingVideos] = useState(false);
  const [isGeneratingNextPage, setIsGeneratingNextPage] = useState(false);


  // 自动刷新工作流状态
  useEffect(() => {
    if (!workflowId) return;

    const interval = setInterval(async () => {
      try {
        const res = await api.get(`/comic/workflow/${workflowId}`);
        if (res.data?.workflow) {
          setWorkflow(res.data.workflow);
        }
      } catch (error) {
        console.error('获取工作流状态失败:', error);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [workflowId]);

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
        // 将文件转为 base64
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

  // 手动步骤1: 生成漫画页
  const handleGeneratePage = async () => {
    if (!storyPrompt.trim()) {
      toast("请输入漫画内容描述", "error");
      return;
    }

    setIsGenerating(true);
    try {
      // 先创建工作流
      let wfId = workflowId;
      if (!wfId) {
        const createRes = await api.post('/comic/workflow', {
          prompt: storyPrompt.trim(),
          pageNumber: currentPage
        });
        wfId = createRes.data?.workflowId;
        setWorkflowId(wfId);
      }

      // 生成漫画页
      const res = await api.post('/comic/generate-page', {
        workflowId: wfId,
        prompt: storyPrompt.trim(),
        panelCount,
        referenceImages: referenceImages.length > 0 ? referenceImages : undefined
      });

      if (res.data?.comicImageUrl) {
        toast("漫画页生成成功！", "success");
        // 刷新工作流
        const wfRes = await api.get(`/comic/workflow/${wfId}`);
        setWorkflow(wfRes.data?.workflow);
      }
    } catch (error: any) {
      toast(error?.response?.data?.error || "生成失败", "error");
    } finally {
      setIsGenerating(false);
    }
  };

  // 手动步骤2: 提取分镜
  const handleExtractPanels = async () => {
    if (!workflowId) {
      toast("请先生成漫画页", "error");
      return;
    }

    setIsExtracting(true);
    try {
      const res = await api.post('/comic/extract-panels', {
        workflowId,
        panelCount
      });

      if (res.data?.panels) {
        toast(`成功提取 ${res.data.panels.length} 个分镜！`, "success");
        // 刷新工作流
        const wfRes = await api.get(`/comic/workflow/${workflowId}`);
        setWorkflow(wfRes.data?.workflow);
      }
    } catch (error: any) {
      toast(error?.response?.data?.error || "提取失败", "error");
    } finally {
      setIsExtracting(false);
    }
  };

  // 手动步骤3: 生成视频片段
  const handleGenerateSegments = async () => {
    if (!workflowId) {
      toast("请先提取分镜", "error");
      return;
    }

    setIsGeneratingVideos(true);
    try {
      const res = await api.post('/comic/generate-segments', {
        workflowId
      });

      if (res.data?.segments) {
        toast(`已创建 ${res.data.segments.length} 个视频生成任务！`, "success");
        // 刷新工作流
        const wfRes = await api.get(`/comic/workflow/${workflowId}`);
        setWorkflow(wfRes.data?.workflow);
      }
    } catch (error: any) {
      toast(error?.response?.data?.error || "生成失败", "error");
    } finally {
      setIsGeneratingVideos(false);
    }
  };

  // 生成下一页
  const handleGenerateNextPage = async () => {
    if (!workflowId || !nextPagePrompt.trim()) {
      toast("请输入下一页的剧情描述", "error");
      return;
    }

    setIsGeneratingNextPage(true);
    try {
      const res = await api.post('/comic/next-page', {
        workflowId,
        storyPrompt: nextPagePrompt.trim()
      });

      if (res.data?.newWorkflowId) {
        setWorkflowId(res.data.newWorkflowId);
        setCurrentPage(res.data.pageNumber);
        setNextPagePrompt("");
        toast(`第 ${res.data.pageNumber} 页生成成功！`, "success");
        
        // 刷新工作流
        const wfRes = await api.get(`/comic/workflow/${res.data.newWorkflowId}`);
        setWorkflow(wfRes.data?.workflow);
      }
    } catch (error: any) {
      toast(error?.response?.data?.error || "生成下一页失败", "error");
    } finally {
      setIsGeneratingNextPage(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-green-400" />;
      case 'processing':
        return <Clock className="w-4 h-4 text-yellow-400 animate-pulse" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-400" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusText = (status: string) => {
    const statusMap: Record<string, string> = {
      'init': '初始化',
      'extracting': '提取分镜中',
      'enhancing': '增强分镜中',
      'generating_videos': '生成视频中',
      'merging': '合并视频中',
      'completed': '已完成',
      'failed': '失败'
    };
    return statusMap[status] || status;
  };

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* 标题 */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/30 text-xs text-purple-200">
            <Sparkles className="w-3 h-3" />
            <span>AI 漫画动画制作 · 完整工作流</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold">AI 创意短视频制作</h1>
          <p className="text-sm text-gray-400">
            AI 分镜脚本生成 → 9宫格动漫分镜 → 高清分镜提取 → 首尾帧视频生成 → 短视频拼接
          </p>
        </div>

        {/* 工作流状态卡片 */}
        {workflow && (
          <Card className="bg-gradient-to-br from-purple-900/20 to-blue-900/20 border-purple-500/30">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>工作流状态 - 第 {workflow.pageNumber} 页</span>
                <span className="text-sm font-normal text-gray-400">ID: {workflow.id.slice(-8)}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="text-sm text-gray-300">当前状态:</div>
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/10">
                  {getStatusIcon(workflow.status)}
                  <span className="text-sm">{getStatusText(workflow.status)}</span>
                </div>
              </div>

              {/* 漫画页预览 */}
              {workflow.comicImageUrl && (
                <div className="space-y-2">
                  <div className="text-sm text-gray-300">漫画页:</div>
                  <img 
                    src={workflow.comicImageUrl} 
                    alt="Comic Page" 
                    className="w-full rounded-lg border border-white/10"
                  />
                </div>
              )}

              {/* 分镜预览 */}
              {workflow.panels.length > 0 && (
                <div className="space-y-2">
                  <div className="text-sm text-gray-300">提取的分镜 ({workflow.panels.length} 个):</div>
                  <div className="grid grid-cols-3 md:grid-cols-3 gap-4">
                    {workflow.panels.map((panel) => (
                      <div key={panel.panelNumber} className="space-y-2">
                        <div className="text-xs text-gray-400">分镜 {panel.panelNumber}</div>
                        {panel.enhancedUrl && (
                          <img 
                            src={panel.enhancedUrl} 
                            alt={`Panel ${panel.panelNumber}`}
                            className="w-full rounded border border-white/10"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 视频片段状态 */}
              {workflow.videoSegments.length > 0 && (
                <div className="space-y-2">
                  <div className="text-sm text-gray-300">视频片段 ({workflow.videoSegments.length} 个):</div>
                  <div className="space-y-2">
                    {workflow.videoSegments.map((segment) => (
                      <div 
                        key={segment.segmentNumber}
                        className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-sm">片段 {segment.segmentNumber}</span>
                          <span className="text-xs text-gray-400">
                            (分镜 {segment.startPanel} → {segment.endPanel})
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(segment.status)}
                          {segment.videoUrl && (
                            <a 
                              href={segment.videoUrl} 
                              target="_blank" 
                              rel="noreferrer"
                              className="text-xs text-blue-400 hover:text-blue-300"
                            >
                              查看视频
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* 创作输入区 */}
        <Card className="bg-white/5 border-white/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-400" />
              AI 创意构思输入
            </CardTitle>
            <CardDescription className="text-gray-400">
              输入你的创意构思，AI 导演会自动匹配最合适的风格，生成 9 宫格短视频脚本
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 参考图上传区 */}
            <div className="space-y-2">
              <label className="text-sm text-gray-300 flex items-center gap-2">
                <ImageIcon className="w-4 h-4" />
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
                💡 上传角色、场景或风格参考图，AI 会参考这些图片生成内容（支持 JPG/PNG，单张最大 10MB）
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-gray-300">你想画什么</label>
              <Textarea
                value={storyPrompt}
                onChange={(e) => setStoryPrompt(e.target.value)}
                placeholder="例如：主角在废墟中觉醒超能力的出场动画，要有气势，背景是末日城市..."
                className="min-h-[120px] bg-black/30 border-white/10 text-sm"
              />
            </div>

            <div className="p-3 rounded-lg bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 text-xs text-gray-300">
              <div className="font-semibold text-purple-300 mb-1">💡 提示</div>
              <div className="space-y-1">
                <div>• 简单说出你想画的内容，AI 会自动生成 9 宫格分镜</div>
                <div>• 可以上传参考图，AI 会参考图片的风格和角色</div>
                <div>• 不需要详细描述每一格，AI 会自动设计分镜</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 分步操作引导 */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-lg font-bold text-white">
            <Film className="w-5 h-5 text-purple-400" />
            制作流程
          </div>
          
          <div className="grid md:grid-cols-3 gap-4">
            {/* 步骤 1: 生成分镜 */}
            <Card className={`border-white/10 transition-all ${
              !workflow?.comicImageUrl ? 'bg-purple-900/20 border-purple-500/50 shadow-lg shadow-purple-900/20' : 'bg-white/5 opacity-50'
            }`}>
              <CardHeader className="pb-2">
                <div className="text-xs font-medium text-gray-400 mb-1">STEP 1</div>
                <CardTitle className="text-lg">生成分镜脚本</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-gray-400 mb-4 h-10">根据创意生成 9 张连贯的动漫画稿</p>
                <Button
                  className={`w-full ${!workflow?.comicImageUrl ? 'bg-purple-600 hover:bg-purple-700' : 'bg-white/10'}`}
                  disabled={isGenerating || !!workflow?.comicImageUrl}
                  onClick={handleGeneratePage}
                >
                   {isGenerating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <BookOpen className="w-4 h-4 mr-2" />}
                   {workflow?.comicImageUrl ? '已完成' : '开始生成'}
                </Button>
              </CardContent>
            </Card>

            {/* 步骤 2: 提取高清图 */}
            <Card className={`border-white/10 transition-all ${
              workflow?.comicImageUrl && workflow.panels.length === 0 ? 'bg-blue-900/20 border-blue-500/50 shadow-lg shadow-blue-900/20' : 'bg-white/5 opacity-50'
            }`}>
              <CardHeader className="pb-2">
                <div className="text-xs font-medium text-gray-400 mb-1">STEP 2</div>
                <CardTitle className="text-lg">提取高清分镜</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-gray-400 mb-4 h-10">将 9 个分镜分别放大为 4K 高清大图</p>
                <Button
                  className={`w-full ${workflow?.comicImageUrl && workflow.panels.length === 0 ? 'bg-blue-600 hover:bg-blue-700' : 'bg-white/10'}`}
                  disabled={isExtracting || !workflow?.comicImageUrl || workflow.panels.length > 0}
                  onClick={handleExtractPanels}
                >
                  {isExtracting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ImageIcon className="w-4 h-4 mr-2" />}
                  {workflow?.panels.length > 0 ? '已完成' : '提取高清图'}
                </Button>
              </CardContent>
            </Card>

            {/* 步骤 3: 生成视频 */}
            <Card className={`border-white/10 transition-all ${
              workflow?.panels.length > 0 && workflow.videoSegments.length === 0 ? 'bg-green-900/20 border-green-500/50 shadow-lg shadow-green-900/20' : 'bg-white/5 opacity-50'
            }`}>
              <CardHeader className="pb-2">
                <div className="text-xs font-medium text-gray-400 mb-1">STEP 3</div>
                <CardTitle className="text-lg">生成短视频</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-gray-400 mb-4 h-10">将分镜转化为流畅的视频片段</p>
                <Button
                  className={`w-full ${workflow?.panels.length > 0 && workflow.videoSegments.length === 0 ? 'bg-green-600 hover:bg-green-700' : 'bg-white/10'}`}
                  disabled={isGeneratingVideos || workflow?.panels.length === 0 || workflow?.videoSegments.length > 0}
                  onClick={handleGenerateSegments}
                >
                  {isGeneratingVideos ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Film className="w-4 h-4 mr-2" />}
                  {workflow?.videoSegments.length > 0 ? '已完成' : '生成视频'}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* 生成下一页 */}
        {workflow && workflow.status === 'completed' && (
          <Card className="bg-gradient-to-br from-green-900/20 to-blue-900/20 border-green-500/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowRight className="w-5 h-5 text-green-400" />
                继续创作下一页
              </CardTitle>
              <CardDescription className="text-gray-400">
                当前页已完成，输入下一页的剧情继续创作
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm text-gray-300">下一页剧情描述</label>
                <Textarea
                  value={nextPagePrompt}
                  onChange={(e) => setNextPagePrompt(e.target.value)}
                  placeholder="例如：主角激活了装置，突然传送到了另一个时空..."
                  className="min-h-[100px] bg-black/30 border-white/10 text-sm"
                />
              </div>

              <Button
                className="w-full bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700"
                disabled={isGeneratingNextPage || !nextPagePrompt.trim()}
                onClick={handleGenerateNextPage}
              >
                {isGeneratingNextPage ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> 正在生成下一页...
                  </>
                ) : (
                  <>
                    <ArrowRight className="w-4 h-4 mr-2" /> 生成第 {currentPage + 1} 页
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* 使用说明 */}
        <Card className="bg-white/5 border-white/10">
          <CardHeader>
            <CardTitle>工作流程说明</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-gray-300">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center text-xs">1</div>
              <div>
                <div className="font-semibold mb-1">生成 9 宫格动漫分镜</div>
                <div className="text-gray-400">AI 根据剧情自动生成 3x3 九宫格分镜脚本，中国抖音动漫风格，无文字</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center text-xs">2</div>
              <div>
                <div className="font-semibold mb-1">提取并增强 9 个分镜</div>
                <div className="text-gray-400">AI 自动识别并提取每个分镜，放大到 4K 高清，增强细节和光影效果</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center text-xs">3</div>
              <div>
                <div className="font-semibold mb-1">生成连续视频片段</div>
                <div className="text-gray-400">使用 MiniMax Veo，将分镜 1→2、2→3...8→9 生成 8 段连续过渡视频</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center text-xs">4</div>
              <div>
                <div className="font-semibold mb-1">拼接完整短视频</div>
                <div className="text-gray-400">将 8 段视频无缝拼接，生成完整的抖音短视频动漫</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-green-600 flex items-center justify-center text-xs">5</div>
              <div>
                <div className="font-semibold mb-1">连载下一集</div>
                <div className="text-gray-400">基于前一集的画风和角色，输入新剧情，生成续集短视频</div>
              </div>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
