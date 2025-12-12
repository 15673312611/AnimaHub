// 视频生成Tab
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Video, Wand2, Loader2 } from "lucide-react";
import api from "@/lib/api";
import { useToast } from "@/components/ui/toast-provider";

export default function VideoGenTab({ projectId, videos, composites, onUpdate }: any) {
  const { toast } = useToast();
  const [showDialog, setShowDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    startImageUrl: "",
    endImageUrl: "",
    motionPrompt: "",
    cameraMovement: "",
    duration: 5,
    generationModel: "veo3.1_fast"
  });

  const handleCreate = async () => {
    if (!formData.name || !formData.startImageUrl) {
      toast("请填写名称和首帧图片", "error");
      return;
    }
    setCreating(true);
    try {
      await api.post(`/projects/${projectId}/videos`, {
        projectId,
        ...formData
      });
      toast("视频生成已启动", "success");
      setShowDialog(false);
      onUpdate();
    } catch (error: any) {
      toast(error.response?.data?.error || "创建失败", "error");
    } finally {
      setCreating(false);
    }
  };

  const selectCompositeImage = (imageUrl: string) => {
    setFormData({ ...formData, startImageUrl: imageUrl });
  };

  return (
    <div className="space-y-6">
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogTrigger asChild>
          <Button className="bg-gradient-to-r from-purple-600 to-blue-600">
            <Video className="w-4 h-4 mr-2" />
            创建视频
          </Button>
        </DialogTrigger>
        <DialogContent className="bg-gray-900 text-white border-white/10 max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>图生视频</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <div>
              <Label>视频名称 *</Label>
              <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="bg-white/5 border-white/10" />
            </div>

            <div>
              <Label>选择首帧图片 *</Label>
              <div className="grid grid-cols-4 gap-2 mt-2">
                {composites.filter((c: any) => c.status === 'COMPLETED' && c.imageUrls).map((comp: any) => {
                  const imageUrl = JSON.parse(comp.imageUrls)[0];
                  return (
                    <div
                      key={comp.id}
                      onClick={() => selectCompositeImage(imageUrl)}
                      className={`p-2 rounded border cursor-pointer transition-all ${
                        formData.startImageUrl === imageUrl
                          ? 'border-purple-500 bg-purple-500/20'
                          : 'border-white/10 hover:border-white/30'
                      }`}
                    >
                      <img src={imageUrl} alt={comp.name} className="w-full aspect-video object-cover rounded mb-1" />
                      <p className="text-xs truncate">{comp.name}</p>
                    </div>
                  );
                })}
              </div>
              <Input
                value={formData.startImageUrl}
                onChange={(e) => setFormData({ ...formData, startImageUrl: e.target.value })}
                placeholder="或直接输入图片URL"
                className="bg-white/5 border-white/10 mt-2"
              />
            </div>

            <div>
              <Label>尾帧图片 (可选,用于首尾帧插值)</Label>
              <Input
                value={formData.endImageUrl}
                onChange={(e) => setFormData({ ...formData, endImageUrl: e.target.value })}
                placeholder="https://..."
                className="bg-white/5 border-white/10"
              />
            </div>

            <div>
              <Label>运动/动作描述</Label>
              <Textarea
                value={formData.motionPrompt}
                onChange={(e) => setFormData({ ...formData, motionPrompt: e.target.value })}
                placeholder="例如: Character walking forward slowly, hair flowing in wind"
                className="bg-white/5 border-white/10"
              />
            </div>

            <div>
              <Label>镜头运动</Label>
              <Input
                value={formData.cameraMovement}
                onChange={(e) => setFormData({ ...formData, cameraMovement: e.target.value })}
                placeholder="例如: Slow push in / Pan left / Static"
                className="bg-white/5 border-white/10"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>时长 (秒)</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={formData.duration}
                  onChange={(e) => setFormData({ ...formData, duration: Number(e.target.value) })}
                  className="bg-white/5 border-white/10"
                />
              </div>
              <div>
                <Label>生成模型</Label>
                <select
                  value={formData.generationModel}
                  onChange={(e) => setFormData({ ...formData, generationModel: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded px-3 py-2"
                >
                  <option value="veo3.1_fast">Veo 3.1（快速）</option>
                  <option value="veo3.1_hd">Veo 3.1（高清）</option>
                </select>
              </div>
            </div>

            <Button onClick={handleCreate} disabled={creating} className="w-full">
              {creating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Video className="w-4 h-4 mr-2" />}
              开始生成视频
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 视频列表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {videos.map((vid: any) => (
          <Card key={vid.id} className="bg-white/5 border-white/10 overflow-hidden">
            <div className="aspect-video relative bg-black/40">
              {vid.videoUrl ? (
                <video src={vid.videoUrl} controls className="w-full h-full object-cover" />
              ) : vid.status === 'GENERATING' ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <Loader2 className="w-12 h-12 animate-spin text-purple-500 mx-auto mb-2" />
                    <p className="text-sm">生成中 {vid.progress}%</p>
                  </div>
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Video className="w-16 h-16 text-gray-600" />
                </div>
              )}
            </div>
            <div className="p-4">
              <h3 className="font-bold mb-2">{vid.name}</h3>
              <p className="text-xs text-gray-400">{vid.description}</p>
              <div className="mt-2 flex items-center gap-2 text-xs">
                <span className="text-gray-500">时长: {vid.duration}s</span>
                <span className="text-gray-500">|</span>
                <span className="text-gray-500">{vid.generationModel}</span>
              </div>
            </div>
          </Card>
        ))}

        {videos.length === 0 && (
          <div className="col-span-full text-center py-20 text-gray-500">
            <Video className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p>还没有生成视频</p>
            <p className="text-sm mt-2">先创建融合图片,然后将图片转换为视频</p>
          </div>
        )}
      </div>
    </div>
  );
}
