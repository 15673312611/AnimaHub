"use client";

import { useState, useEffect, useRef } from "react";
import { AssetGallery } from "./AssetGallery";
import { Box, Upload, Loader2, Wand2, LayoutTemplate, Sparkles } from "lucide-react";
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
import { wsService } from "@/lib/websocket";

// 物品框架模板
const PROP_TEMPLATE = `物品类型:
材质:
颜色:
尺寸:
状态:
细节特征:
光影效果:
背景:
绘画风格:`;

interface PropsTabProps {
  projectId: number;
  props: any[];
  onUpdate: () => void;
}

export default function PropsTab({ projectId, props, onUpdate }: PropsTabProps) {
  const { toast } = useToast();
  const [showDialog, setShowDialog] = useState(false);
  const [mode, setMode] = useState<"generate" | "upload">("generate");
  const [creating, setCreating] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [simpleDesc, setSimpleDesc] = useState("");
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  
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
    if (message.type === 'ASSET_STATUS_UPDATE' && message.assetType === 'prop') {
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
  };

  // 插入框架模板
  const insertTemplate = () => {
    setFormData({ ...formData, prompt: PROP_TEMPLATE });
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
        type: "prop",
        description: simpleDesc,
        template: PROP_TEMPLATE
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
    let itemType = "道具";
    let material = "金属";
    let color = "银色";
    let size = "中等大小";
    let condition = "完好";
    let details = "精细雕刻";
    let lighting = "柔和光照";
    let background = "简洁纯色背景";
    let artStyle = "动漫风格，高质量，精细细节";

    if (keywords.includes("剑") || keywords.includes("刀")) { itemType = "武器-剑"; material = "精钢"; details = "锋利刀刃，精美剑柄"; }
    if (keywords.includes("魔法") || keywords.includes("法杖")) { itemType = "魔法道具"; material = "木质与水晶"; color = "紫色发光"; details = "镶嵌宝石，符文雕刻"; }
    if (keywords.includes("书") || keywords.includes("魔法书")) { itemType = "书籍"; material = "皮革封面"; color = "古铜色"; details = "古老符文，金色装饰"; }
    if (keywords.includes("戒指") || keywords.includes("项链")) { itemType = "饰品"; material = "黄金/白银"; size = "小巧精致"; details = "镶嵌宝石"; }
    if (keywords.includes("药水") || keywords.includes("瓶子")) { itemType = "药水瓶"; material = "玻璃"; color = "发光液体"; details = "神秘光芒"; }
    if (keywords.includes("盾") || keywords.includes("盔甲")) { itemType = "防具"; material = "精钢"; size = "大型"; details = "战斗痕迹，纹章图案"; }
    if (keywords.includes("古老") || keywords.includes("破旧")) { condition = "古老破旧"; details = "岁月痕迹，斑驳锈迹"; }
    if (keywords.includes("发光") || keywords.includes("闪耀")) { lighting = "自发光效果"; color = color + "，发光"; }
    if (keywords.includes("金") || keywords.includes("黄金")) { color = "金色"; material = "黄金"; }
    if (keywords.includes("银")) { color = "银色"; material = "白银"; }

    return `物品类型: ${itemType}
材质: ${material}
颜色: ${color}
尺寸: ${size}
状态: ${condition}
细节特征: ${details}
光影效果: ${lighting}
背景: ${background}
绘画风格: ${artStyle}`;
  };

  const handleSubmit = async () => {
    if (!formData.name) { toast("请填写物品名称", "error"); return; }
    if (mode === "generate" && !formData.prompt) { toast("请填写生成提示词", "error"); return; }
    if (mode === "upload" && !formData.imageUrl) { toast("请上传图片", "error"); return; }

    setCreating(true);
    await safeAsync(
      async () => {
        const endpoint = mode === "generate" ? "generate" : "upload";
        return await api.post(`/projects/${projectId}/assets/props/${endpoint}`, { projectId, ...formData });
      },
      toast,
      {
        successMessage: mode === "generate" ? "🎨 AI生成任务已提交，请稍候..." : "✅ 物品上传成功",
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
    if (!confirm("确定要删除这个物品吗?")) return;
    await safeAsync(
      async () => await api.delete(`/assets/props/${id}`),
      toast,
      { successMessage: "🗑️ 删除成功", onSuccess: () => onUpdate() }
    );
  };

  return (
    <>
      <AssetGallery
        title="物品库"
        description="管理动漫中的关键道具、武器、车辆或装饰物"
        assets={props}
        icon={Box}
        onGenerate={() => { setMode("generate"); setShowDialog(true); }}
        onUpload={() => { setMode("upload"); setShowDialog(true); }}
        onDelete={handleDelete}
        emptyText="创建一个物品来丰富你的场景细节。无论是传说中的宝剑还是普通的咖啡杯。"
      />

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="bg-zinc-950/95 backdrop-blur-xl text-white border-white/10 max-w-4xl rounded-2xl shadow-2xl p-0 overflow-hidden max-h-[90vh] overflow-y-auto">
          <DialogHeader className="p-6 border-b border-white/5 bg-gradient-to-r from-amber-900/20 to-orange-900/20">
            <DialogTitle className="text-xl">{mode === "generate" ? "AI 生成物品" : "上传物品素材"}</DialogTitle>
            <DialogDescription className="text-zinc-400">
              {mode === "generate" ? "使用大模型生成高质量的物品/道具图片，丰富画面细节" : "上传已有的物品图片"}
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
                    <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 rounded-xl p-4 border border-amber-500/20">
                      <Label className="text-sm text-amber-400 mb-2 block flex items-center gap-2">
                        <Sparkles className="w-4 h-4" />
                        AI 智能生成提示词
                      </Label>
                      <div className="flex gap-3">
                        <Input 
                          value={simpleDesc}
                          onChange={(e) => setSimpleDesc(e.target.value)}
                          placeholder="简单描述物品，如：发光的魔法剑、古老的魔法书、金色的王冠..."
                          className="bg-zinc-900/50 border-white/10 h-11 rounded-xl flex-1"
                        />
                        <Button 
                          onClick={generatePromptWithAI}
                          disabled={aiGenerating}
                          className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 h-11 px-6 rounded-xl"
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
                            <Label className="text-sm text-zinc-400">物品描述 (Prompt)</Label>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={insertTemplate}
                              className="text-xs text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 h-7 px-2"
                            >
                              <LayoutTemplate className="w-3 h-3 mr-1" />
                              插入框架
                            </Button>
                          </div>
                          <Textarea 
                             value={formData.prompt}
                             onChange={(e) => setFormData({...formData, prompt: e.target.value})}
                             placeholder="详细描述物品外观..."
                             className="bg-zinc-900/30 border-white/10 min-h-[280px] text-sm resize-none rounded-xl focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 font-mono"
                           />
                       </div>

                       {/* 右侧: 设置 */}
                       <div className="md:col-span-5 space-y-5">
                             <div>
                               <Label className="text-sm text-zinc-400 mb-2 block">物品名称 *</Label>
                               <Input 
                                 value={formData.name}
                                 onChange={(e) => setFormData({...formData, name: e.target.value})}
                                 placeholder="例如: 圣剑"
                                 className="bg-zinc-900/30 border-white/10 h-11 rounded-xl"
                               />
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
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                          物品名称
                        </Label>
                        <Input 
                            value={formData.name}
                            onChange={(e) => setFormData({...formData, name: e.target.value})}
                            placeholder="例如: 圣剑、魔法书..."
                            className="bg-black/30 border-white/10 h-12 text-base rounded-xl"
                          />
                      </div>
                      <div className="space-y-3">
                        <Label className="text-base font-medium text-white flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
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
              <Button onClick={handleSubmit} disabled={creating} className="bg-gradient-to-r from-amber-600 to-orange-600 text-white h-11 px-8 rounded-xl shadow-lg">
                {creating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />处理中...</> : <>{mode === "generate" ? <Wand2 className="w-4 h-4 mr-2" /> : <Upload className="w-4 h-4 mr-2" />}{mode === "generate" ? "开始生成" : "确认上传"}</>}
              </Button>
            </DialogFooter>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}
