"use client";

import { useState, useEffect, useRef } from "react";
import { AssetGallery } from "./AssetGallery";
import { MapPin, Upload, Loader2, Wand2, LayoutTemplate, Sparkles, AlertCircle, X, UploadCloud } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import api from "@/lib/api";
import { useToast } from "@/components/ui/toast-provider";
import { safeAsync } from "@/lib/error-handler";
import ImageUploader from "./ImageUploader";
import ModelSelector from "./ModelSelector";
import { useImageModels } from "@/lib/useImageModels";
import { wsService } from "@/lib/websocket";
import { cn } from "@/lib/utils";

const SCENE_TEMPLATE = `时间:
天气:
光源:
空间类型:
空间尺度:
高度:
主体:
前景:
氛围:
风格:
景别:
视角设定:
构图:`;

interface ScenesTabProps {
  projectId: number;
  scenes: any[];
  onUpdate: () => void;
}

export default function ScenesTab({ projectId, scenes, onUpdate }: ScenesTabProps) {
  const { toast } = useToast();
  const [showDialog, setShowDialog] = useState(false);
  const [mode, setMode] = useState<"generate" | "upload">("generate");
  const [creating, setCreating] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [simpleDesc, setSimpleDesc] = useState("");
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  
  // 表单错误状态
  const [errors, setErrors] = useState<{name?: string; prompt?: string; imageUrl?: string}>({});
  
  // 使用 API 获取图片模型列表
  const { defaultModel } = useImageModels("project");
  
  const [formData, setFormData] = useState({
    name: "",
    prompt: "",
    model: "",
    referenceImages: [] as string[],
    aspectRatio: "16:9",
    imageUrl: ""
  });
  const refInputRef = useRef<HTMLInputElement>(null);
  const [refUploading, setRefUploading] = useState(false);

  // 当模型列表加载完成后，设置默认模型
  useEffect(() => {
    if (defaultModel && !formData.model) {
      setFormData(prev => ({ ...prev, model: defaultModel }));
    }
  }, [defaultModel, formData.model]);

  useEffect(() => {
    wsService.connect();
    wsService.subscribeToAssets(handleAssetUpdate);
    
    // 注册重连回调：WebSocket 重连后刷新素材列表
    const unsubscribeReconnect = wsService.onReconnect(() => {
      console.log('🔄 WebSocket 重连，刷新场景列表');
      onUpdate();
    });
    
    return () => {
      wsService.unsubscribeFromAssets();
      unsubscribeReconnect();
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);
  
  const handleAssetUpdate = (message: any) => {
    if (message.type === 'ASSET_STATUS_UPDATE' && message.assetType === 'scene') {
      if (message.status === 'COMPLETED' || message.status === 'FAILED') {
        onUpdate();
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      }
    }
  };
  
  const startPolling = () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(() => onUpdate(), 5000);
    setTimeout(() => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    }, 30000);
  };

  const resetForm = () => {
    setFormData({ name: "", prompt: "", model: defaultModel || "", referenceImages: [], aspectRatio: "16:9", imageUrl: "" });
    setSimpleDesc("");
    setErrors({});
  };

  // 参考图上传
  const handleRefImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || formData.referenceImages.length >= 4) return;
    if (!file.type.startsWith('image/')) { toast("请选择图片文件", "error"); return; }
    if (file.size > 10 * 1024 * 1024) { toast("文件不能超过 10MB", "error"); return; }
    setRefUploading(true);
    try {
      const presignRes = await api.post('/oss/presign', { fileName: file.name, folder: 'reference-images', contentType: file.type });
      const { uploadUrl, fileUrl, contentType } = presignRes.data;
      await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: file });
      setFormData(prev => ({ ...prev, referenceImages: [...prev.referenceImages, fileUrl] }));
    } catch { toast("上传失败", "error"); }
    finally { setRefUploading(false); if (refInputRef.current) refInputRef.current.value = ''; }
  };

  const removeRefImage = (index: number) => {
    setFormData(prev => ({ ...prev, referenceImages: prev.referenceImages.filter((_, i) => i !== index) }));
  };

  const insertTemplate = () => {
    setFormData({ ...formData, prompt: SCENE_TEMPLATE });
    setErrors({ ...errors, prompt: undefined });
  };

  const generatePromptWithAI = async () => {
    if (!simpleDesc.trim()) {
      toast("请先输入简单描述", "error");
      return;
    }
    setAiGenerating(true);
    try {
      const res = await api.post("/ai/generate-prompt", {
        type: "scene",
        description: simpleDesc,
        template: SCENE_TEMPLATE
      });
      if (res.data?.prompt) {
        setFormData({ ...formData, prompt: res.data.prompt });
        setErrors({ ...errors, prompt: undefined });
        toast("✨ 提示词生成成功", "success");
      }
    } catch (err: any) {
      const generatedPrompt = generateLocalPrompt(simpleDesc);
      setFormData({ ...formData, prompt: generatedPrompt });
      setErrors({ ...errors, prompt: undefined });
      toast("✨ 提示词生成成功", "success");
    } finally {
      setAiGenerating(false);
    }
  };

  const generateLocalPrompt = (desc: string) => {
    const keywords = desc.toLowerCase();
    let time = "白天", weather = "晴朗", light = "自然光", spaceType = "室外";
    let scale = "中等", height = "平视", subject = desc, foreground = "";
    let atmosphere = "宁静", style = "动漫风格", shot = "中景", angle = "正面", composition = "中心构图";

    if (keywords.includes("夜") || keywords.includes("晚")) { time = "夜晚"; light = "月光/灯光"; }
    if (keywords.includes("黄昏") || keywords.includes("傍晚")) { time = "黄昏"; light = "暖色夕阳"; }
    if (keywords.includes("雨")) { weather = "下雨"; atmosphere = "忧郁"; }
    if (keywords.includes("雪")) { weather = "下雪"; atmosphere = "寂静"; }
    if (keywords.includes("室内") || keywords.includes("房间") || keywords.includes("教室")) { spaceType = "室内"; }
    if (keywords.includes("城市") || keywords.includes("街道")) { spaceType = "城市街道"; scale = "宏大"; }
    if (keywords.includes("森林")) { spaceType = "森林"; foreground = "树木枝叶"; }

    return `时间: ${time}\n天气: ${weather}\n光源: ${light}\n空间类型: ${spaceType}\n空间尺度: ${scale}\n高度: ${height}\n主体: ${subject}\n前景: ${foreground || "无"}\n氛围: ${atmosphere}\n风格: ${style}，高质量，精细细节\n景别: ${shot}\n视角设定: ${angle}\n构图: ${composition}`;
  };

  // 表单验证
  const validateForm = () => {
    const newErrors: {name?: string; prompt?: string; imageUrl?: string} = {};
    
    if (!formData.name.trim()) {
      newErrors.name = "请填写场景名称";
    }
    
    if (mode === "generate" && !formData.prompt.trim()) {
      newErrors.prompt = "请填写生成提示词";
    }
    
    if (mode === "upload" && !formData.imageUrl) {
      newErrors.imageUrl = "请上传图片";
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      toast("请填写必填项", "error");
      return;
    }

    setCreating(true);
    await safeAsync(
      async () => {
        const endpoint = mode === "generate" ? "generate" : "upload";
        const submitData = {
          projectId,
          name: formData.name,
          prompt: formData.prompt,
          generationModel: formData.model,
          aspectRatio: formData.aspectRatio,
          referenceImage: formData.referenceImages.length > 0 ? JSON.stringify(formData.referenceImages) : null,
          imageUrl: formData.imageUrl,
        };
        return await api.post(`/projects/${projectId}/assets/scenes/${endpoint}`, submitData);
      },
      toast,
      {
        successMessage: mode === "generate" ? "🎨 AI生成任务已提交，请稍候..." : "✅ 场景上传成功",
        onSuccess: () => {
          setShowDialog(false);
          resetForm();
          onUpdate();
          if (mode === "generate") startPolling();
        }
      }
    );
    setCreating(false);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("确定要删除这个场景吗?")) return;
    await safeAsync(
      async () => await api.delete(`/assets/scenes/${id}`),
      toast,
      { successMessage: "🗑️ 删除成功", onSuccess: () => onUpdate() }
    );
  };

  // 清除单个字段错误
  const clearError = (field: string) => {
    if (errors[field as keyof typeof errors]) {
      setErrors({ ...errors, [field]: undefined });
    }
  };

  return (
    <>
      <AssetGallery
        title="场景库"
        description="管理动漫中的所有背景和环境，支持AI生成和手动上传"
        assets={scenes}
        icon={MapPin}
        onGenerate={() => { setMode("generate"); resetForm(); setShowDialog(true); }}
        onUpload={() => { setMode("upload"); resetForm(); setShowDialog(true); }}
        onDelete={handleDelete}
        emptyText="创建一个场景作为故事的舞台。可以是教室、街道、森林或科幻都市。"
      />

      <Dialog open={showDialog} onOpenChange={(open) => { setShowDialog(open); if (!open) resetForm(); }}>
        <DialogContent className="bg-zinc-950/95 backdrop-blur-xl text-white border-white/10 max-w-4xl rounded-2xl shadow-2xl p-0 overflow-hidden max-h-[90vh] overflow-y-auto">
          <DialogHeader className="px-6 py-4 border-b border-white/5 bg-gradient-to-r from-blue-900/20 to-cyan-900/20">
            <DialogTitle className="text-xl">{mode === "generate" ? "AI 生成场景" : "上传场景素材"}</DialogTitle>
            <DialogDescription className="text-zinc-400">
              {mode === "generate" ? "使用大模型生成高质量的场景背景图，构建动漫世界观" : "上传已有的场景图片"}
            </DialogDescription>
          </DialogHeader>

          <Tabs value={mode} onValueChange={(v: any) => { setMode(v); setErrors({}); }} className="w-full">
            <div className="px-5 pt-4">
              <TabsList className="grid w-full grid-cols-2 bg-zinc-900/50 p-1 rounded-xl border border-white/5">
                <TabsTrigger value="generate" className="rounded-lg data-[state=active]:bg-zinc-800 data-[state=active]:text-white py-2">
                   <Wand2 className="w-4 h-4 mr-2" /> AI 生成
                </TabsTrigger>
                <TabsTrigger value="upload" className="rounded-lg data-[state=active]:bg-zinc-800 data-[state=active]:text-white py-2">
                   <Upload className="w-4 h-4 mr-2" /> 手动上传
                </TabsTrigger>
              </TabsList>
            </div>
            
            <div className="p-5">
               {mode === "generate" ? (
                 <div className="space-y-4">
                    {/* AI 智能生成区域 */}
                    <div className="bg-gradient-to-r from-blue-500/10 to-cyan-500/10 rounded-xl p-3 border border-blue-500/20">
                      <div className="flex gap-2 items-center">
                        <Sparkles className="w-4 h-4 text-blue-400 flex-shrink-0" />
                        <Input 
                          value={simpleDesc}
                          onChange={(e) => setSimpleDesc(e.target.value)}
                          placeholder="简单描述场景，如：樱花树下的学校操场、雨夜的霓虹街道..."
                          className="bg-zinc-900/50 border-white/10 h-9 rounded-lg flex-1 text-sm"
                        />
                        <Button 
                          onClick={generatePromptWithAI}
                          disabled={aiGenerating}
                          className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 h-9 px-4 rounded-lg text-xs"
                        >
                          {aiGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
{aiGenerating ? "生成中..." : "智能提示词"}
                        </Button>
                      </div>
                    </div>

                    {/* 设置行: 名称 + 模型 */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className={`text-xs mb-1.5 block ${errors.name ? 'text-red-400' : 'text-zinc-500'}`}>场景名称 *</Label>
                        <Input 
                          value={formData.name}
                          onChange={(e) => { setFormData({...formData, name: e.target.value}); clearError('name'); }}
                          placeholder="例如: 教室"
                          className={`bg-zinc-900/30 h-9 rounded-lg transition-colors ${
                            errors.name 
                              ? 'border-red-500/50 focus:border-red-500 focus:ring-1 focus:ring-red-500/20' 
                              : 'border-white/10'
                          }`}
                        />
                        {errors.name && (
                          <p className="text-xs text-red-400 flex items-center gap-1 mt-1">
                            <AlertCircle className="w-3 h-3" />
                            {errors.name}
                          </p>
                        )}
                      </div>
                      <div>
                        <Label className="text-xs text-zinc-500 mb-1.5 block">生成模型</Label>
                        <ModelSelector 
                          value={formData.model} 
                          onChange={(v) => setFormData({...formData, model: v})}
                        />
                      </div>
                    </div>

                    {/* 比例 + 参考图 */}
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0">
                        <Label className="text-xs text-zinc-500 mb-1.5 block">生成比例</Label>
                        <div className="flex gap-1">
                          {["1:1", "16:9", "9:16", "4:3", "3:4"].map((r) => (
                            <button
                              key={r}
                              onClick={() => setFormData({...formData, aspectRatio: r})}
                              className={cn(
                                "px-2.5 py-1 rounded-md text-[11px] font-medium transition-all border",
                                formData.aspectRatio === r
                                  ? "bg-blue-600/20 border-blue-500/50 text-blue-400"
                                  : "bg-zinc-900/30 border-white/5 text-zinc-500 hover:text-zinc-300 hover:border-white/10"
                              )}
                            >
                              {r}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <Label className="text-xs text-zinc-500 mb-1.5 flex justify-between">
                          <span>参考图</span>
                          <span className="text-zinc-600">{formData.referenceImages.length}/4</span>
                        </Label>
                        <input ref={refInputRef} type="file" accept="image/*" className="hidden" onChange={handleRefImageUpload} />
                        <div className="flex gap-1.5 items-center flex-wrap">
                          {formData.referenceImages.map((img, idx) => (
                            <div key={idx} className="relative w-9 h-9 rounded-md overflow-hidden border border-white/10 group flex-shrink-0">
                              <img src={img} className="w-full h-full object-cover" alt="" />
                              <button
                                onClick={() => removeRefImage(idx)}
                                className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X className="w-3 h-3 text-white" />
                              </button>
                            </div>
                          ))}
                          {formData.referenceImages.length < 4 && (
                            <button
                              onClick={() => refInputRef.current?.click()}
                              disabled={refUploading}
                              className="w-9 h-9 rounded-md border border-dashed border-white/10 flex items-center justify-center text-zinc-600 hover:text-zinc-400 hover:border-white/20 transition-colors disabled:opacity-30 flex-shrink-0"
                            >
                              {refUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Prompt - 全宽 */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <Label className={`text-xs ${errors.prompt ? 'text-red-400' : 'text-zinc-500'}`}>场景描述 (Prompt) *</Label>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={insertTemplate}
                          className="text-[11px] text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 h-6 px-2"
                        >
                          <LayoutTemplate className="w-3 h-3 mr-1" />
                          插入框架
                        </Button>
                      </div>
                      <Textarea 
                        value={formData.prompt}
                        onChange={(e) => { setFormData({...formData, prompt: e.target.value}); clearError('prompt'); }}
                        placeholder="详细描述场景细节..."
                        className={`bg-zinc-900/30 min-h-[200px] text-sm resize-none rounded-xl font-mono transition-colors ${
                          errors.prompt 
                            ? 'border-red-500/50 focus:border-red-500 focus:ring-1 focus:ring-red-500/20' 
                            : 'border-white/10 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20'
                        }`}
                      />
                      {errors.prompt && (
                        <p className="text-xs text-red-400 flex items-center gap-1 mt-1">
                          <AlertCircle className="w-3 h-3" />
                          {errors.prompt}
                        </p>
                      )}
                    </div>
                 </div>
               ) : (
                 <div className="max-w-2xl mx-auto py-6">
                    <div className="bg-gradient-to-br from-zinc-900/80 to-zinc-900/40 rounded-2xl border border-white/5 p-8 space-y-8">
                      <div className="space-y-3">
                        <Label className={`text-base font-medium flex items-center gap-2 ${errors.name ? 'text-red-400' : 'text-white'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${errors.name ? 'bg-red-500' : 'bg-blue-500'}`}></span>
                          场景名称 *
                        </Label>
                        <Input 
                          value={formData.name}
                          onChange={(e) => { setFormData({...formData, name: e.target.value}); clearError('name'); }}
                          placeholder="例如: 教室、街道、森林..."
                          className={`bg-black/30 h-12 text-base rounded-xl transition-colors ${
                            errors.name 
                              ? 'border-red-500/50 focus:border-red-500 focus:ring-1 focus:ring-red-500/20' 
                              : 'border-white/10'
                          }`}
                        />
                        {errors.name && (
                          <p className="text-xs text-red-400 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            {errors.name}
                          </p>
                        )}
                      </div>
                      <div className="space-y-3">
                        <Label className={`text-base font-medium flex items-center gap-2 ${errors.imageUrl ? 'text-red-400' : 'text-white'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${errors.imageUrl ? 'bg-red-500' : 'bg-cyan-500'}`}></span>
                          上传图片 *
                        </Label>
                        {formData.imageUrl ? (
                          <div className="relative group rounded-2xl overflow-hidden border border-white/10 bg-black/20">
                            <div className="aspect-video">
                              <img src={formData.imageUrl} alt="Preview" className="w-full h-full object-contain" />
                            </div>
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all flex flex-col items-center justify-center gap-3">
                              <Button variant="outline" size="sm" onClick={() => setFormData({...formData, imageUrl: ""})} className="bg-red-500/20 hover:bg-red-500/40 text-red-400 border-red-500/50 rounded-full px-4">移除图片</Button>
                            </div>
                          </div>
                        ) : (
                          <div className={`rounded-2xl ${errors.imageUrl ? 'ring-1 ring-red-500/50' : ''}`}>
                            <ImageUploader onUpload={(url) => { setFormData({...formData, imageUrl: url}); clearError('imageUrl'); }} label="" description="支持 JPG、PNG、GIF 等格式" className="h-[280px]" />
                          </div>
                        )}
                        {errors.imageUrl && (
                          <p className="text-xs text-red-400 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            {errors.imageUrl}
                          </p>
                        )}
                      </div>
                    </div>
                 </div>
               )}
            </div>

            <DialogFooter className="px-6 py-4 bg-zinc-900/50 border-t border-white/5">
              <Button variant="ghost" onClick={() => setShowDialog(false)} className="h-10 px-5 rounded-xl hover:bg-white/5">取消</Button>
              <Button onClick={handleSubmit} disabled={creating} className="bg-gradient-to-r from-blue-600 to-cyan-600 text-white h-10 px-6 rounded-xl shadow-lg">
                {creating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />处理中...</> : <>{mode === "generate" ? <Wand2 className="w-4 h-4 mr-2" /> : <Upload className="w-4 h-4 mr-2" />}{mode === "generate" ? "开始生成" : "确认上传"}</>}
              </Button>
            </DialogFooter>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}
