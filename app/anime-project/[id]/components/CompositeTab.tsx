// 融合生图Tab
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Wand2, ImageIcon, Loader2 } from "lucide-react";
import api from "@/lib/api";
import { useToast } from "@/components/ui/toast-provider";

export default function CompositeTab({ projectId, composites, characters, scenes, props, effects, onUpdate }: any) {
  const { toast } = useToast();
  const [showDialog, setShowDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    characterIds: [] as number[],
    sceneIds: [] as number[],
    propIds: [] as number[],
    effectIds: [] as number[],
    poseDescription: "",
    additionalPrompt: "",
    aspectRatio: "16:9",
    imageCount: 1
  });

  const handleCreate = async () => {
    if (!formData.name) {
      toast("请填写名称", "error");
      return;
    }
    setCreating(true);
    try {
      await api.post(`/projects/${projectId}/composites`, {
        projectId,
        ...formData
      });
      toast("融合生图已启动", "success");
      setShowDialog(false);
      onUpdate();
    } catch (error: any) {
      toast(error.response?.data?.error || "创建失败", "error");
    } finally {
      setCreating(false);
    }
  };

  const toggleSelect = (type: 'character' | 'scene' | 'prop' | 'effect', id: number) => {
    const key = `${type}Ids` as keyof typeof formData;
    const current = formData[key] as number[];
    if (current.includes(id)) {
      setFormData({ ...formData, [key]: current.filter(i => i !== id) });
    } else {
      setFormData({ ...formData, [key]: [...current, id] });
    }
  };

  return (
    <div className="space-y-6">
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogTrigger asChild>
          <Button className="bg-gradient-to-r from-purple-600 to-blue-600">
            <Wand2 className="w-4 h-4 mr-2" />
            创建融合图片
          </Button>
        </DialogTrigger>
        <DialogContent className="bg-gray-900 text-white border-white/10 max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>融合生图</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <div>
              <Label>图片名称 *</Label>
              <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="bg-white/5 border-white/10" />
            </div>

            {/* 选择角色 */}
            <div>
              <Label>选择角色 (可多选)</Label>
              <div className="grid grid-cols-4 gap-2 mt-2">
                {characters.filter((c: any) => c.status === 'COMPLETED').map((char: any) => (
                  <div
                    key={char.id}
                    onClick={() => toggleSelect('character', char.id)}
                    className={`p-2 rounded border cursor-pointer transition-all ${
                      formData.characterIds.includes(char.id)
                        ? 'border-purple-500 bg-purple-500/20'
                        : 'border-white/10 hover:border-white/30'
                    }`}
                  >
                    <img src={char.imageUrl} alt={char.name} className="w-full aspect-square object-cover rounded mb-1" />
                    <p className="text-xs truncate">{char.name}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* 选择场景 */}
            <div>
              <Label>选择场景</Label>
              <div className="grid grid-cols-4 gap-2 mt-2">
                {scenes.filter((s: any) => s.status === 'COMPLETED').map((scene: any) => (
                  <div
                    key={scene.id}
                    onClick={() => toggleSelect('scene', scene.id)}
                    className={`p-2 rounded border cursor-pointer transition-all ${
                      formData.sceneIds.includes(scene.id)
                        ? 'border-blue-500 bg-blue-500/20'
                        : 'border-white/10 hover:border-white/30'
                    }`}
                  >
                    <img src={scene.imageUrl} alt={scene.name} className="w-full aspect-video object-cover rounded mb-1" />
                    <p className="text-xs truncate">{scene.name}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label>姿态/动作描述</Label>
              <Textarea
                value={formData.poseDescription}
                onChange={(e) => setFormData({ ...formData, poseDescription: e.target.value })}
                placeholder="例如: Character standing in the center, arms raised, smiling at camera"
                className="bg-white/5 border-white/10"
              />
            </div>

            <div>
              <Label>额外提示词</Label>
              <Textarea
                value={formData.additionalPrompt}
                onChange={(e) => setFormData({ ...formData, additionalPrompt: e.target.value })}
                placeholder="额外的画面描述..."
                className="bg-white/5 border-white/10"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>图片尺寸</Label>
                <select
                  value={formData.aspectRatio}
                  onChange={(e) => setFormData({ ...formData, aspectRatio: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded px-3 py-2"
                >
                  <option value="1:1">1:1 (正方形)</option>
                  <option value="4:3">4:3</option>
                  <option value="16:9">16:9 (宽屏)</option>
                  <option value="9:16">9:16 (竖屏)</option>
                </select>
              </div>
              <div>
                <Label>生成数量</Label>
                <Input
                  type="number"
                  min={1}
                  max={4}
                  value={formData.imageCount}
                  onChange={(e) => setFormData({ ...formData, imageCount: Number(e.target.value) })}
                  className="bg-white/5 border-white/10"
                />
              </div>
            </div>

            <Button onClick={handleCreate} disabled={creating} className="w-full">
              {creating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Wand2 className="w-4 h-4 mr-2" />}
              开始融合生成
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 融合结果展示 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {composites.map((comp: any) => (
          <Card key={comp.id} className="bg-white/5 border-white/10 overflow-hidden">
            <div className="aspect-video relative bg-black/40">
              {comp.imageUrls ? (
                <img src={JSON.parse(comp.imageUrls)[0]} alt={comp.name} className="w-full h-full object-cover" />
              ) : comp.status === 'GENERATING' ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <Loader2 className="w-12 h-12 animate-spin text-purple-500 mx-auto mb-2" />
                    <p className="text-sm">融合中 {comp.progress}%</p>
                  </div>
                </div>
              ) : (
                <ImageIcon className="absolute inset-0 m-auto w-16 h-16 text-gray-600" />
              )}
            </div>
            <div className="p-4">
              <h3 className="font-bold mb-2">{comp.name}</h3>
              <p className="text-xs text-gray-400">{comp.description}</p>
            </div>
          </Card>
        ))}

        {composites.length === 0 && (
          <div className="col-span-full text-center py-20 text-gray-500">
            <ImageIcon className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p>还没有融合图片</p>
            <p className="text-sm mt-2">先创建角色和场景素材,然后融合生成新图片</p>
          </div>
        )}
      </div>
    </div>
  );
}
