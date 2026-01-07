"use client";

import { useState, useEffect, useRef } from "react";
import { AssetGallery } from "./AssetGallery";
import { Sparkles, Wand2, Upload, Loader2, LayoutTemplate } from "lucide-react";
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

// 特效框架模板
const EFFECT_TEMPLATE = `特效类型:
主色调:
辅助色:
强度:
范围:
动态效果:
光效:
粒子效果:
背景:
绘画风格:`;

interface EffectsTabProps {
  projectId: number;
  effects: any[];
  onUpdate: () => void;
}

export default function EffectsTab({ projectId, effects, onUpdate }: EffectsTabProps) {
  const { toast } = useToast();
  const [showDialog, setShowDialog] = useState(false);
  const [mode, setMode] = useState<"generate" | "upload">("generate");
  const [creating, setCreating] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [simpleDesc, setSimpleDesc] = useState("");
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  
  // 使用 API 获取图片模型列表
  const { defaultModel } = useImageModels("project");
  
  const [formData, setFormData] = useState({
    name: "",
    prompt: "",
    model: "",
    referenceImage: "",
    imageUrl: ""
  });

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
      console.log('🔄 WebSocket 重连，刷新特效列表');
      onUpdate();
    });
    
    return () => {
      wsService.unsubscribeFromAssets();
      unsubscribeReconnect();
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);
  
  const handleAssetUpdate = (message: any) => {
    if (message.type === 'ASSET_STATUS_UPDATE' && message.assetType === 'effect') {
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
    setFormData({ name: "", prompt: "", model: defaultModel || "", referenceImage: "", imageUrl: "" });
    setSimpleDesc("");
  };

  // 插入框架模板
  const insertTemplate = () => {
    setFormData({ ...formData, prompt: EFFECT_TEMPLATE });
  };

  // AI 生成提示词
  const generatePromptWithAI = async () => {
    if (!simpleDesc.trim()) {
      toast("请先输入简单描述", "error");
      return;
    }
    setAiGenerating(true);
    try {
      const res = await api.post("/ai/generate-prompt", {
        type: "effect",
        description: simpleDesc,
        template: EFFECT_TEMPLATE
      });
      if (res.data?.prompt) {
        setFormData({ ...formData, prompt: res.data.prompt });
        toast("✨ 提示词生成成功", "success");
      }
    } catch (err: any) {
      const generatedPrompt = generateLocalPrompt(simpleDesc);
      setFormData({ ...formData, prompt: generatedPrompt });
      toast("✨ 提示词生成成功", "success");
    } finally {
      setAiGenerating(false);
    }
  };

  // 本地生成提示词
  const generateLocalPrompt = (desc: string) => {
    const keywords = desc.toLowerCase();
    let effectType = "魔法特效";
    let mainColor = "蓝色";
    let subColor = "白色";
    let intensity = "中等";
    let range = "中等范围";
    let dynamic = "流动飘散";
    let lighting = "自发光";
    let particles = "光点粒子";
    let background = "透明/深色背景";
    let artStyle = "动漫风格，高质量，精细细节";

    if (keywords.includes("火") || keywords.includes("燃烧") || keywords.includes("火焰")) { 
      effectType = "火焰特效"; mainColor = "橙红色"; subColor = "黄色"; dynamic = "向上燃烧跳动"; particles = "火星飞溅"; lighting = "强烈火光"; 
    }
    if (keywords.includes("冰") || keywords.includes("冻") || keywords.includes("寒")) { 
      effectType = "冰霜特效"; mainColor = "冰蓝色"; subColor = "白色"; dynamic = "结晶扩散"; particles = "冰晶飘落"; 
    }
    if (keywords.includes("雷") || keywords.includes("电") || keywords.includes("闪电")) { 
      effectType = "雷电特效"; mainColor = "紫蓝色"; subColor = "白色"; intensity = "强烈"; dynamic = "闪烁跳跃"; lighting = "强烈闪光"; 
    }
    if (keywords.includes("风") || keywords.includes("旋风")) { 
      effectType = "风系特效"; mainColor = "淡绿色"; subColor = "白色"; dynamic = "旋转流动"; particles = "叶片/气流线"; 
    }
    if (keywords.includes("水") || keywords.includes("波浪")) { 
      effectType = "水系特效"; mainColor = "深蓝色"; subColor = "青色"; dynamic = "波动流淌"; particles = "水珠飞溅"; 
    }
    if (keywords.includes("光") || keywords.includes("神圣") || keywords.includes("治愈")) { 
      effectType = "光系特效"; mainColor = "金色"; subColor = "白色"; lighting = "柔和神圣光芒"; particles = "光点上升"; 
    }
    if (keywords.includes("暗") || keywords.includes("黑暗") || keywords.includes("邪恶")) { 
      effectType = "暗系特效"; mainColor = "紫黑色"; subColor = "暗红色"; dynamic = "阴影蔓延"; particles = "黑色烟雾"; 
    }
    if (keywords.includes("爆炸") || keywords.includes("冲击")) { 
      effectType = "爆炸特效"; mainColor = "橙黄色"; subColor = "红色"; intensity = "强烈"; range = "大范围"; dynamic = "向外扩散冲击"; 
    }
    if (keywords.includes("樱花") || keywords.includes("花瓣")) { 
      effectType = "樱花飘落"; mainColor = "粉色"; subColor = "白色"; intensity = "柔和"; dynamic = "缓慢飘落旋转"; particles = "花瓣"; 
    }
    if (keywords.includes("星") || keywords.includes("星光")) { 
      effectType = "星光特效"; mainColor = "金色"; subColor = "银白色"; dynamic = "闪烁"; particles = "星星光点"; 
    }

    return `特效类型: ${effectType}
主色调: ${mainColor}
辅助色: ${subColor}
强度: ${intensity}
范围: ${range}
动态效果: ${dynamic}
光效: ${lighting}
粒子效果: ${particles}
背景: ${background}
绘画风格: ${artStyle}`;
  };

  const handleSubmit = async () => {
    if (!formData.name) { toast("请填写特效名称", "error"); return; }
    if (mode === "generate" && !formData.prompt) { toast("请填写生成提示词", "error"); return; }
    if (mode === "upload" && !formData.imageUrl) { toast("请上传图片", "error"); return; }

    setCreating(true);
    await safeAsync(
      async () => {
        const endpoint = mode === "generate" ? "generate" : "upload";
        return await api.post(`/projects/${projectId}/assets/effects/${endpoint}`, { projectId, ...formData });
      },
      toast,
      {
        successMessage: mode === "generate" ? "🎨 AI生成任务已提交，请稍候..." : "✅ 特效上传成功",
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
    if (!confirm("确定要删除这个特效吗?")) return;
    await safeAsync(
      async () => await api.delete(`/assets/effects/${id}`),
      toast,
      { successMessage: "🗑️ 删除成功", onSuccess: () => onUpdate() }
    );
  };

  return (
    <>
      <AssetGallery
        title="特效库"
        description="管理动漫中的视觉特效，如光影、魔法、粒子等"
        assets={effects}
        icon={Sparkles}
        onGenerate={() => { setMode("generate"); setShowDialog(true); }}
        onUpload={() => { setMode("upload"); setShowDialog(true); }}
        onDelete={handleDelete}
        emptyText="创建一个特效来增强画面的冲击力。火球、闪电、魔法阵或浪漫的樱花雨。"
      />

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="bg-zinc-950/95 backdrop-blur-xl text-white border-white/10 max-w-4xl rounded-2xl shadow-2xl p-0 overflow-hidden max-h-[90vh] overflow-y-auto">
          <DialogHeader className="p-6 border-b border-white/5 bg-gradient-to-r from-pink-900/20 to-rose-900/20">
            <DialogTitle className="text-xl">{mode === "generate" ? "AI 生成特效" : "上传特效素材"}</DialogTitle>
            <DialogDescription className="text-zinc-400">
              {mode === "generate" ? "使用大模型生成高质量的视觉特效图片，增强画面冲击力" : "上传已有的特效图片"}
            </DialogDescription>
          </DialogHeader>

          <Tabs value={mode} onValueChange={(v: any) => setMode(v)} className="w-full">
            <div className="px-6 pt-6">
              <TabsList className="grid w-full grid-cols-2 bg-zinc-900/50 p-1 rounded-xl border border-white/5">
                <TabsTrigger value="generate" className="rounded-lg data-[state=active]:bg-zinc-800 data-[state=active]:text-white py-2">
                   <Wand2 className="w-4 h-4 mr-2" /> AI 生成
                </TabsTrigger>
                <TabsTrigger value="upload" className="rounded-lg data-[state=active]:bg-zinc-800 data-[state=active]:text-white py-2">
                   <Upload className="w-4 h-4 mr-2" /> 手动上传
                </TabsTrigger>
              </TabsList>
            </div>
            
            <div className="p-6">
               {mode === "generate" ? (
                 <div className="space-y-6">
                    {/* AI 智能生成区域 */}
                    <div className="bg-gradient-to-r from-pink-500/10 to-rose-500/10 rounded-xl p-4 border border-pink-500/20">
                      <Label className="text-sm text-pink-400 mb-2 block flex items-center gap-2">
                        <Sparkles className="w-4 h-4" />
                        AI 智能生成提示词
                      </Label>
                      <div className="flex gap-3">
                        <Input 
                          value={simpleDesc}
                          onChange={(e) => setSimpleDesc(e.target.value)}
                          placeholder="简单描述特效，如：蓝色火焰爆炸、金色治愈光芒、紫色闪电..."
                          className="bg-zinc-900/50 border-white/10 h-11 rounded-xl flex-1"
                        />
                        <Button 
                          onClick={generatePromptWithAI}
                          disabled={aiGenerating}
                          className="bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 h-11 px-6 rounded-xl"
                        >
                          {aiGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                          {aiGenerating ? "生成中..." : "智能生成"}
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                       {/* 左侧: Prompt */}
                       <div className="md:col-span-7 space-y-3">
                          <div className="flex items-center justify-between">
                            <Label className="text-sm text-zinc-400">特效描述 (Prompt)</Label>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={insertTemplate}
                              className="text-xs text-pink-400 hover:text-pink-300 hover:bg-pink-500/10 h-7 px-2"
                            >
                              <LayoutTemplate className="w-3 h-3 mr-1" />
                              插入框架
                            </Button>
                          </div>
                          <Textarea 
                             value={formData.prompt}
                             onChange={(e) => setFormData({...formData, prompt: e.target.value})}
                             placeholder="详细描述特效细节..."
                             className="bg-zinc-900/30 border-white/10 min-h-[280px] text-sm resize-none rounded-xl focus:border-pink-500/50 focus:ring-1 focus:ring-pink-500/20 font-mono"
                           />
                       </div>

                       {/* 右侧: 设置 */}
                       <div className="md:col-span-5 space-y-5">
                             <div>
                               <Label className="text-sm text-zinc-400 mb-2 block">特效名称 *</Label>
                               <Input 
                                 value={formData.name}
                                 onChange={(e) => setFormData({...formData, name: e.target.value})}
                                 placeholder="例如: 火球术"
                                 className="bg-zinc-900/30 border-white/10 h-11 rounded-xl"
                               />
                             </div>
                             <div>
                               <Label className="text-sm text-zinc-400 mb-2 block">生成模型</Label>
                               <ModelSelector 
                                 value={formData.model} 
                                 onChange={(v) => setFormData({...formData, model: v})}
                               />
                             </div>
                             <div>
                                <Label className="flex justify-between items-center text-sm text-zinc-400 mb-2">
                                  <span>参考图</span>
                                  <span className="text-xs text-zinc-600">可选</span>
                                </Label>
                                {formData.referenceImage ? (
                                   <div className="relative aspect-video rounded-xl overflow-hidden border border-white/10 group">
                                     <img src={formData.referenceImage} className="w-full h-full object-cover" />
                                     <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button variant="destructive" size="sm" onClick={() => setFormData({...formData, referenceImage: ""})}>删除</Button>
                                     </div>
                                   </div>
                                ) : (
                                   <ImageUploader onUpload={(url) => setFormData({...formData, referenceImage: url})} label="" description="JPG/PNG" className="" />
                                )}
                             </div>
                       </div>
                    </div>
                 </div>
               ) : (
                 <div className="max-w-2xl mx-auto py-6">
                    <div className="bg-gradient-to-br from-zinc-900/80 to-zinc-900/40 rounded-2xl border border-white/5 p-8 space-y-8">
                      <div className="space-y-3">
                        <Label className="text-base font-medium text-white flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-pink-500"></span>
                          特效名称
                        </Label>
                        <Input 
                            value={formData.name}
                            onChange={(e) => setFormData({...formData, name: e.target.value})}
                            placeholder="例如: 火球术、闪电..."
                            className="bg-black/30 border-white/10 h-12 text-base rounded-xl"
                          />
                      </div>
                      <div className="space-y-3">
                        <Label className="text-base font-medium text-white flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                          上传图片
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
                          <ImageUploader onUpload={(url) => setFormData({...formData, imageUrl: url})} label="" description="支持 JPG、PNG、GIF 等格式" className="h-[280px]" />
                        )}
                      </div>
                    </div>
                 </div>
               )}
            </div>

            <DialogFooter className="p-6 bg-zinc-900/50 border-t border-white/5">
              <Button variant="ghost" onClick={() => setShowDialog(false)} className="h-11 px-6 rounded-xl hover:bg-white/5">取消</Button>
              <Button onClick={handleSubmit} disabled={creating} className="bg-gradient-to-r from-pink-600 to-rose-600 text-white h-11 px-8 rounded-xl shadow-lg">
                {creating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />处理中...</> : <>{mode === "generate" ? <Wand2 className="w-4 h-4 mr-2" /> : <Upload className="w-4 h-4 mr-2" />}{mode === "generate" ? "开始生成" : "确认上传"}</>}
              </Button>
            </DialogFooter>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}
