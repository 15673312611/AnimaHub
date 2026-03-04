"use client";

import { useState, useEffect, useRef } from "react";
import { AssetGallery } from "./AssetGallery";
import { UserCircle, Upload, Loader2, Wand2, LayoutTemplate, Sparkles, X, UploadCloud } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import api from "@/lib/api";
import { useToast } from "@/components/ui/toast-provider";
import { useConfirm } from "@/components/ui/confirm-dialog";
import ImageUploader from "./ImageUploader";
import ModelSelector from "./ModelSelector";
import { useImageModels } from "@/lib/useImageModels";
import { safeAsync } from "@/lib/error-handler";
import { wsService } from "@/lib/websocket";
import { cn } from "@/lib/utils";

const CHARACTER_TEMPLATE = `身份:
年龄身高:
体型:
发型:
发色:
脸型:
眼睛瞳孔:
肤色:
服装:
饰品:
性格:
绘画风格:`;

interface CharactersTabProps {
  projectId: number;
  characters: any[];
  onUpdate: () => void;
}

export default function CharactersTab({ projectId, characters, onUpdate }: CharactersTabProps) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [showDialog, setShowDialog] = useState(false);
  const [mode, setMode] = useState<"generate" | "upload">("generate");
  const [creating, setCreating] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [simpleDesc, setSimpleDesc] = useState("");
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  
  // 表单错误状态
  const [errors, setErrors] = useState<{ name?: boolean; prompt?: boolean; imageUrl?: boolean }>({});
  
  // 使用 API 获取图片模型列表
  const { defaultModel } = useImageModels("project");
  
  const [formData, setFormData] = useState({
    name: "",
    prompt: "",
    model: "",
    referenceImages: [] as string[],
    aspectRatio: "1:1",
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
      console.log('🔄 WebSocket 重连，刷新角色列表');
      onUpdate();
    });
    
    return () => {
      wsService.unsubscribeFromAssets();
      unsubscribeReconnect();
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);
  
  const handleAssetUpdate = (message: any) => {
    if (message.type === 'ASSET_STATUS_UPDATE' && message.assetType === 'character') {
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
    setFormData({ name: "", prompt: "", model: defaultModel || "", referenceImages: [], aspectRatio: "1:1", imageUrl: "" });
    setSimpleDesc("");
    setErrors({});
  };
  
  const handleImageUpload = (url: string) => {
    setFormData({ ...formData, imageUrl: url });
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

  // 插入框架模板
  const insertTemplate = () => {
    setFormData({ ...formData, prompt: CHARACTER_TEMPLATE });
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
        type: "character",
        description: simpleDesc,
        template: CHARACTER_TEMPLATE
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
    let identity = "普通人";
    let ageHeight = "18岁，170cm";
    let bodyType = "标准体型";
    let hairStyle = "中长发";
    let hairColor = "黑色";
    let faceShape = "鹅蛋脸";
    let eyes = "大眼睛，黑色瞳孔";
    let skinColor = "白皙";
    let clothing = "休闲服装";
    let accessories = "无";
    let personality = "温和";
    let artStyle = "日系动漫风格，高质量，精细细节";

    if (keywords.includes("少女") || keywords.includes("女孩")) { identity = "少女"; ageHeight = "16岁，160cm"; bodyType = "纤细"; }
    if (keywords.includes("少年") || keywords.includes("男孩")) { identity = "少年"; ageHeight = "17岁，175cm"; }
    if (keywords.includes("战士") || keywords.includes("武士")) { identity = "战士"; clothing = "战斗服/盔甲"; bodyType = "健壮"; personality = "勇敢坚毅"; }
    if (keywords.includes("魔法") || keywords.includes("法师")) { identity = "魔法师"; clothing = "魔法长袍"; accessories = "魔法杖/魔法书"; }
    if (keywords.includes("学生")) { identity = "学生"; clothing = "校服"; }
    if (keywords.includes("金发") || keywords.includes("金色")) { hairColor = "金色"; }
    if (keywords.includes("银发") || keywords.includes("白发")) { hairColor = "银白色"; }
    if (keywords.includes("红发")) { hairColor = "红色"; }
    if (keywords.includes("蓝发")) { hairColor = "蓝色"; }
    if (keywords.includes("长发")) { hairStyle = "长发及腰"; }
    if (keywords.includes("短发")) { hairStyle = "短发"; }
    if (keywords.includes("双马尾")) { hairStyle = "双马尾"; }
    if (keywords.includes("红瞳") || keywords.includes("红眼")) { eyes = "大眼睛，红色瞳孔"; }
    if (keywords.includes("蓝瞳") || keywords.includes("蓝眼")) { eyes = "大眼睛，蓝色瞳孔"; }
    if (keywords.includes("冷酷") || keywords.includes("高冷")) { personality = "冷酷高傲"; }
    if (keywords.includes("活泼") || keywords.includes("开朗")) { personality = "活泼开朗"; }
    if (keywords.includes("可爱") || keywords.includes("萌")) { personality = "可爱天真"; faceShape = "圆脸"; }

    return `身份: ${identity}
年龄身高: ${ageHeight}
体型: ${bodyType}
发型: ${hairStyle}
发色: ${hairColor}
脸型: ${faceShape}
眼睛瞳孔: ${eyes}
肤色: ${skinColor}
服装: ${clothing}
饰品: ${accessories}
性格: ${personality}
绘画风格: ${artStyle}`;
  };

  const handleSubmit = async () => {
    // 验证表单
    const newErrors: { name?: boolean; prompt?: boolean; imageUrl?: boolean } = {};
    if (!formData.name) newErrors.name = true;
    if (mode === "generate" && !formData.prompt) newErrors.prompt = true;
    if (mode === "upload" && !formData.imageUrl) newErrors.imageUrl = true;
    
    setErrors(newErrors);
    
    if (Object.keys(newErrors).length > 0) {
      if (newErrors.name) toast("请填写角色名称", "error");
      else if (newErrors.prompt) toast("请填写生成提示词", "error");
      else if (newErrors.imageUrl) toast("请上传图片", "error");
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
        return await api.post(`/projects/${projectId}/assets/characters/${endpoint}`, submitData);
      },
      toast,
      {
        successMessage: mode === "generate" ? "🎨 AI生成任务已提交，请稍候..." : "✅ 角色上传成功",
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
    const confirmed = await confirm({
      title: "确认删除",
      description: "确定要删除这个角色吗？此操作无法撤销。",
      confirmText: "删除",
      cancelText: "取消",
      variant: "danger"
    });
    if (!confirmed) return;
    await safeAsync(
      async () => await api.delete(`/assets/characters/${id}`),
      toast,
      { successMessage: "🗑️ 删除成功", onSuccess: () => onUpdate() }
    );
  };

  return (
    <>
      <AssetGallery
        title="角色库"
        description="管理动漫中的所有登场角色，支持AI生成和手动上传"
        assets={characters}
        icon={UserCircle}
        onGenerate={() => { setMode("generate"); setShowDialog(true); }}
        onUpload={() => { setMode("upload"); setShowDialog(true); }}
        onDelete={handleDelete}
        emptyText="创建一个角色来开始你的故事。你可以详细设定角色的外貌、性格和风格。"
      />

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="bg-zinc-950/95 backdrop-blur-xl text-white border-white/10 max-w-4xl rounded-2xl shadow-2xl p-0 overflow-hidden max-h-[90vh] overflow-y-auto">
          <DialogHeader className="px-6 py-4 border-b border-white/5 bg-gradient-to-r from-purple-900/20 to-pink-900/20">
            <DialogTitle className="text-xl">{mode === "generate" ? "AI 生成角色" : "上传角色素材"}</DialogTitle>
            <DialogDescription className="text-zinc-400">
              {mode === "generate" ? "使用大模型生成高质量的角色立绘，支持详细的特征描述" : "上传已有的角色设定图作为项目素材"}
            </DialogDescription>
          </DialogHeader>

          <Tabs value={mode} onValueChange={(v: any) => setMode(v)} className="w-full">
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
                    <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-xl p-3 border border-purple-500/20">
                      <div className="flex gap-2 items-center">
                        <Sparkles className="w-4 h-4 text-purple-400 flex-shrink-0" />
                        <Input 
                          value={simpleDesc}
                          onChange={(e) => setSimpleDesc(e.target.value)}
                          placeholder="简单描述角色，如：银发红瞳的冷酷少女、穿校服的活泼男孩..."
                          className="bg-zinc-900/50 border-white/10 h-9 rounded-lg flex-1 text-sm"
                        />
                        <Button 
                          onClick={generatePromptWithAI}
                          disabled={aiGenerating}
                          className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 h-9 px-4 rounded-lg text-xs"
                        >
                          {aiGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
{aiGenerating ? "生成中..." : "智能提示词"}
                        </Button>
                      </div>
                    </div>

                    {/* 设置行: 名称 + 模型 */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs text-zinc-500 mb-1.5 block">角色名称 *</Label>
                        <Input 
                          value={formData.name}
                          onChange={(e) => {
                            setFormData({...formData, name: e.target.value});
                            if (e.target.value) setErrors({...errors, name: false});
                          }}
                          placeholder="例如: 鸣人"
                          className={cn(
                            "bg-zinc-900/30 h-9 rounded-lg transition-colors",
                            errors.name 
                              ? "border-red-500 focus:border-red-500 focus:ring-red-500/20" 
                              : "border-white/10"
                          )}
                        />
                        {errors.name && <p className="text-red-400 text-xs mt-1">请填写角色名称</p>}
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
                                  ? "bg-purple-600/20 border-purple-500/50 text-purple-400"
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
                        <Label className="text-xs text-zinc-500">角色描述 (Prompt)</Label>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={insertTemplate}
                          className="text-[11px] text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 h-6 px-2"
                        >
                          <LayoutTemplate className="w-3 h-3 mr-1" />
                          插入框架
                        </Button>
                      </div>
                      <Textarea 
                         value={formData.prompt}
                         onChange={(e) => {
                           setFormData({...formData, prompt: e.target.value});
                           if (e.target.value) setErrors({...errors, prompt: false});
                         }}
                         placeholder="详细描述角色的外貌特征..."
                         className={cn(
                           "bg-zinc-900/30 min-h-[200px] text-sm resize-none rounded-xl focus:ring-1 font-mono transition-colors",
                           errors.prompt 
                             ? "border-red-500 focus:border-red-500 focus:ring-red-500/20" 
                             : "border-white/10 focus:border-purple-500/50 focus:ring-purple-500/20"
                         )}
                       />
                       {errors.prompt && <p className="text-red-400 text-xs mt-1">请填写生成提示词</p>}
                    </div>
                 </div>
               ) : (
                 <div className="max-w-2xl mx-auto py-6">
                    <div className="bg-gradient-to-br from-zinc-900/80 to-zinc-900/40 rounded-2xl border border-white/5 p-8 space-y-8">
                      <div className="space-y-3">
                        <Label className="text-base font-medium text-white flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                          角色名称
                        </Label>
                        <Input 
                            value={formData.name}
                            onChange={(e) => {
                              setFormData({...formData, name: e.target.value});
                              if (e.target.value) setErrors({...errors, name: false});
                            }}
                            placeholder="例如: 鸣人、佐助..."
                            className={cn(
                              "bg-black/30 h-12 text-base rounded-xl transition-colors",
                              errors.name 
                                ? "border-red-500 focus:border-red-500 focus:ring-red-500/20" 
                                : "border-white/10"
                            )}
                          />
                          {errors.name && <p className="text-red-400 text-xs mt-1">请填写角色名称</p>}
                      </div>
                      <div className="space-y-3">
                        <Label className="text-base font-medium text-white flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-pink-500"></span>
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
                          <div className={cn(
                            "rounded-2xl transition-colors",
                            errors.imageUrl && "ring-2 ring-red-500"
                          )}>
                            <ImageUploader onUpload={(url) => {
                              handleImageUpload(url);
                              setErrors({...errors, imageUrl: false});
                            }} label="" description="支持 JPG、PNG、GIF 等格式" className="h-[280px]" />
                          </div>
                        )}
                        {errors.imageUrl && <p className="text-red-400 text-xs mt-1">请上传图片</p>}
                      </div>
                    </div>
                 </div>
               )}
            </div>

            <DialogFooter className="px-6 py-4 bg-zinc-900/50 border-t border-white/5">
              <Button variant="ghost" onClick={() => setShowDialog(false)} className="h-10 px-5 rounded-xl hover:bg-white/5">取消</Button>
              <Button onClick={handleSubmit} disabled={creating} className="bg-gradient-to-r from-purple-600 to-pink-600 text-white h-10 px-6 rounded-xl shadow-lg">
                {creating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />处理中...</> : <>{mode === "generate" ? <Wand2 className="w-4 h-4 mr-2" /> : <Upload className="w-4 h-4 mr-2" />}{mode === "generate" ? "开始生成" : "确认上传"}</>}
              </Button>
            </DialogFooter>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}
