"use client";

import { useState, useEffect, useRef } from "react";
import { AssetGallery } from "./AssetGallery";
import { UserCircle, Upload, Loader2, Wand2, LayoutTemplate, Sparkles } from "lucide-react";
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
  
  const [formData, setFormData] = useState({
    name: "",
    prompt: "",
    model: "nano-banana-2-4k",
    referenceImage: "",
    imageUrl: ""
  });
  
  useEffect(() => {
    wsService.connect();
    wsService.subscribeToAssets(handleAssetUpdate);
    return () => {
      wsService.unsubscribeFromAssets();
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
    setFormData({ name: "", prompt: "", model: "nano-banana-2-4k", referenceImage: "", imageUrl: "" });
    setSimpleDesc("");
    setErrors({});
  };
  
  const handleImageUpload = (url: string) => {
    setFormData({ ...formData, imageUrl: url });
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
        return await api.post(`/projects/${projectId}/assets/characters/${endpoint}`, { projectId, ...formData });
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
          <DialogHeader className="p-6 border-b border-white/5 bg-gradient-to-r from-purple-900/20 to-pink-900/20">
            <DialogTitle className="text-xl">{mode === "generate" ? "AI 生成角色" : "上传角色素材"}</DialogTitle>
            <DialogDescription className="text-zinc-400">
              {mode === "generate" ? "使用大模型生成高质量的角色立绘，支持详细的特征描述" : "上传已有的角色设定图作为项目素材"}
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
                    <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-xl p-4 border border-purple-500/20">
                      <Label className="text-sm text-purple-400 mb-2 block flex items-center gap-2">
                        <Sparkles className="w-4 h-4" />
                        AI 智能生成提示词
                      </Label>
                      <div className="flex gap-3">
                        <Input 
                          value={simpleDesc}
                          onChange={(e) => setSimpleDesc(e.target.value)}
                          placeholder="简单描述角色，如：银发红瞳的冷酷少女、穿校服的活泼男孩..."
                          className="bg-zinc-900/50 border-white/10 h-11 rounded-xl flex-1"
                        />
                        <Button 
                          onClick={generatePromptWithAI}
                          disabled={aiGenerating}
                          className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 h-11 px-6 rounded-xl"
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
                            <Label className="text-sm text-zinc-400">角色描述 (Prompt)</Label>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={insertTemplate}
                              className="text-xs text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 h-7 px-2"
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
                               "bg-zinc-900/30 min-h-[320px] text-sm resize-none rounded-xl focus:ring-1 font-mono transition-colors",
                               errors.prompt 
                                 ? "border-red-500 focus:border-red-500 focus:ring-red-500/20" 
                                 : "border-white/10 focus:border-purple-500/50 focus:ring-purple-500/20"
                             )}
                           />
                           {errors.prompt && <p className="text-red-400 text-xs mt-1">请填写生成提示词</p>}
                       </div>

                       {/* 右侧: 设置 */}
                       <div className="md:col-span-5 space-y-5">
                             <div>
                               <Label className="text-sm text-zinc-400 mb-2 block">角色名称 *</Label>
                               <Input 
                                 value={formData.name}
                                 onChange={(e) => {
                                   setFormData({...formData, name: e.target.value});
                                   if (e.target.value) setErrors({...errors, name: false});
                                 }}
                                 placeholder="例如: 鸣人"
                                 className={cn(
                                   "bg-zinc-900/30 h-11 rounded-xl transition-colors",
                                   errors.name 
                                     ? "border-red-500 focus:border-red-500 focus:ring-red-500/20" 
                                     : "border-white/10"
                                 )}
                               />
                               {errors.name && <p className="text-red-400 text-xs mt-1">请填写角色名称</p>}
                             </div>
                             <div>
                               <Label className="text-sm text-zinc-400 mb-2 block">生成模型</Label>
                               <Select value={formData.model} onValueChange={(v) => setFormData({...formData, model: v})}>
                                 <SelectTrigger className="bg-zinc-900/30 border-white/10 h-11 rounded-xl">
                                   <SelectValue />
                                 </SelectTrigger>
                                 <SelectContent className="bg-zinc-900 border-white/10">
                                   <SelectItem value="nano-banana-2-4k">Nano Banana 2 (4K)</SelectItem>
                                   <SelectItem value="sora_image-vip">Sora Image VIP</SelectItem>
                                   <SelectItem value="doubao-seedream-4-5-251128">豆包 SeeDream 4.5</SelectItem>
                                   <SelectItem value="z-image-turbo">Z-Image Turbo</SelectItem>
                                   <SelectItem value="qwen-image-edit-2509">通义千问图像编辑</SelectItem>
                                 </SelectContent>
                               </Select>
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

            <DialogFooter className="p-6 bg-zinc-900/50 border-t border-white/5">
              <Button variant="ghost" onClick={() => setShowDialog(false)} className="h-11 px-6 rounded-xl hover:bg-white/5">取消</Button>
              <Button onClick={handleSubmit} disabled={creating} className="bg-gradient-to-r from-purple-600 to-pink-600 text-white h-11 px-8 rounded-xl shadow-lg">
                {creating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />处理中...</> : <>{mode === "generate" ? <Wand2 className="w-4 h-4 mr-2" /> : <Upload className="w-4 h-4 mr-2" />}{mode === "generate" ? "开始生成" : "确认上传"}</>}
              </Button>
            </DialogFooter>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}
