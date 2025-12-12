"use client";

import { useState } from "react";
import { AssetGallery } from "./AssetGallery";
import { Box, Sparkles, Upload, Loader2, Wand2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import api from "@/lib/api";
import { useToast } from "@/components/ui/toast-provider";
import { safeAsync } from "@/lib/error-handler";
import ImageUploader from "./ImageUploader";

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
  
  const [formData, setFormData] = useState({
    name: "",
    propType: "",
    description: "",
    prompt: "",
    model: "flux-pro",
    referenceImage: "",
    imageUrl: ""
  });

  const resetForm = () => {
    setFormData({
      name: "",
      propType: "",
      description: "",
      prompt: "",
      model: "flux-pro",
      referenceImage: "",
      imageUrl: ""
    });
  };

  const handleSubmit = async () => {
    if (!formData.name) {
      toast("请填写物品名称", "error");
      return;
    }

    if (mode === "generate" && !formData.prompt) {
      toast("请填写生成提示词", "error");
      return;
    }

    if (mode === "upload" && !formData.imageUrl) {
      toast("请上传图片", "error");
      return;
    }

    setCreating(true);
    await safeAsync(
      async () => {
        const endpoint = mode === "generate" ? "generate" : "upload";
        return await api.post(`/projects/${projectId}/assets/props/${endpoint}`, {
          projectId,
          ...formData
        });
      },
      toast,
      {
        successMessage: mode === "generate" ? "🎨 AI生成任务已启动" : "✅ 物品上传成功",
        onSuccess: () => {
          setShowDialog(false);
          resetForm();
          onUpdate();
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
      {
        successMessage: "🗑️ 删除成功",
        onSuccess: () => onUpdate()
      }
    );
  };

  return (
    <>
      <AssetGallery
        title="物品库"
        description="管理动漫中的关键道具、武器、车辆或装饰物"
        assets={props}
        icon={Box}
        onGenerate={() => {
          setMode("generate");
          setShowDialog(true);
        }}
        onUpload={() => {
          setMode("upload");
          setShowDialog(true);
        }}
        onDelete={handleDelete}
        emptyText="创建一个物品来丰富你的场景细节。无论是传说中的宝剑还是普通的咖啡杯。"
      />

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="bg-zinc-950/95 backdrop-blur-xl text-white border-white/10 max-w-4xl rounded-2xl shadow-2xl p-0 overflow-hidden">
          <DialogHeader className="p-6 border-b border-white/5 bg-gradient-to-r from-purple-900/20 to-blue-900/20">
            <DialogTitle className="text-xl">{mode === "generate" ? "AI 生成物品" : "上传物品素材"}</DialogTitle>
            <DialogDescription className="text-zinc-400">
              {mode === "generate" ? "使用大模型生成高质量的物品/道具图片，丰富画面细节" : "上传已有的物品图片"}
            </DialogDescription>
          </DialogHeader>

          <Tabs value={mode} onValueChange={(v: any) => setMode(v)} className="w-full flex flex-col h-full">
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
                 <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
                    {/* Left: Prompt */}
                    <div className="md:col-span-7 space-y-8">
                       <div>
                         <Label className="text-sm text-zinc-400 mb-2 block">物品描述 (Prompt)</Label>
                         <Textarea 
                            value={formData.prompt}
                            onChange={(e) => setFormData({...formData, prompt: e.target.value})}
                            placeholder="详细描述物品外观，例如: 一把闪耀着蓝色符文的金色圣剑，精美的剑柄，高清细节，奇幻风格..."
                            className="bg-zinc-900/30 border-white/10 min-h-[240px] text-base resize-none rounded-xl focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20"
                          />
                       </div>

                       <div>
                          <Label className="text-sm text-zinc-400 mb-2 block">物品功能 / 细节</Label>
                          <Textarea 
                            value={formData.description}
                            onChange={(e) => setFormData({...formData, description: e.target.value})}
                            placeholder="简要描述物品的功能、外观细节..."
                            className="bg-zinc-900/30 border-white/10 min-h-[120px] rounded-xl focus:border-purple-500/50"
                          />
                       </div>
                    </div>

                    {/* Right: Settings */}
                    <div className="md:col-span-5 space-y-6 pt-1">
                       {/* No container box */}
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
                            <Label className="text-sm text-zinc-400 mb-2 block">物品类型</Label>
                            <Select value={formData.propType} onValueChange={(v) => setFormData({...formData, propType: v})}>
                              <SelectTrigger className="bg-zinc-900/30 border-white/10 h-11 rounded-xl">
                                <SelectValue placeholder="选择类型" />
                              </SelectTrigger>
                              <SelectContent className="bg-zinc-900 border-white/10">
                                <SelectItem value="武器">武器</SelectItem>
                                <SelectItem value="工具">工具</SelectItem>
                                <SelectItem value="装饰">装饰</SelectItem>
                                <SelectItem value="交通工具">交通工具</SelectItem>
                                <SelectItem value="家具">家具</SelectItem>
                                <SelectItem value="其他">其他</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="pt-2">
                            <Label className="text-sm text-zinc-400 mb-2 block">生成模型</Label>
                            <Select value={formData.model} onValueChange={(v) => setFormData({...formData, model: v})}>
                              <SelectTrigger className="bg-zinc-900/30 border-white/10 h-11 rounded-xl">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-zinc-900 border-white/10">
                                <SelectItem value="nano-banana-2-2k">Nano Banana 2K</SelectItem>
                                <SelectItem value="nano-banana-2-4k">Nano Banana 4K</SelectItem>
                                <SelectItem value="mj_relax_imagine">Midjourney (Relax)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                             <Label className="flex justify-between items-center text-sm text-zinc-400 mb-2">
                               <span>参考图</span>
                               <span className="text-xs text-zinc-600 font-normal">可选</span>
                             </Label>
                             {formData.referenceImage ? (
                                <div className="relative aspect-video rounded-xl overflow-hidden border border-white/10 group">
                                  <img src={formData.referenceImage} className="w-full h-full object-cover" />
                                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                     <Button 
                                       variant="destructive" 
                                       size="sm" 
                                       onClick={() => setFormData({...formData, referenceImage: ""})}
                                     >
                                       删除
                                     </Button>
                                  </div>
                                </div>
                             ) : (
                                <ImageUploader 
                                  onUpload={(url) => setFormData({...formData, referenceImage: url})}
                                  label=""
                                  description="JPG/PNG"
                                  className=""
                                />
                             )}
                          </div>
                    </div>
                 </div>
               ) : (
                 <div className="max-w-xl mx-auto space-y-6 py-8">
                    <div className="space-y-4">
                      <Label className="text-lg">物品名称</Label>
                      <Input 
                          value={formData.name}
                          onChange={(e) => setFormData({...formData, name: e.target.value})}
                          placeholder="例如: 圣剑"
                          className="bg-black/20 border-white/10 h-12 text-lg rounded-xl"
                        />
                    </div>
                    <div className="space-y-4">
                      <Label className="text-lg">上传图片</Label>
                      <ImageUploader 
                        onUpload={(url) => setFormData({...formData, imageUrl: url})}
                        label="拖拽或点击上传物品图片"
                        description="支持 JPG、PNG、GIF 等格式，最大 10MB"
                        className="h-[300px] border-2 border-dashed border-white/10 hover:border-purple-500/50 transition-colors bg-zinc-900/30 rounded-xl"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>描述</Label>
                      <Textarea 
                        value={formData.description}
                        onChange={(e) => setFormData({...formData, description: e.target.value})}
                        placeholder="备注信息..."
                        className="bg-zinc-900/30 border-white/10"
                      />
                    </div>
                 </div>
               )}
            </div>

            <DialogFooter className="p-6 bg-zinc-900/50 border-t border-white/5">
              <Button variant="ghost" onClick={() => setShowDialog(false)} className="h-11 px-6 rounded-xl hover:bg-white/5">取消</Button>
              <Button 
                onClick={handleSubmit} 
                disabled={creating}
                className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white h-11 px-8 rounded-xl shadow-lg shadow-purple-900/20 hover:shadow-purple-900/40 hover:scale-[1.02] transition-all"
              >
                {creating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    处理中...
                  </>
                ) : (
                  <>
                    {mode === "generate" ? <Wand2 className="w-4 h-4 mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                    {mode === "generate" ? "开始生成" : "确认上传"}
                  </>
                )}
              </Button>
            </DialogFooter>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}

