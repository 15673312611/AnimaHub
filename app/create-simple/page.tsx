"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Loader2, ArrowLeft, Sparkles } from "lucide-react";
import Link from "next/link";
import api from "@/lib/api";
import { useToast } from "@/components/ui/toast-provider";

export default function CreateSimplePage() {
  const router = useRouter();
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: ""
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      toast("请输入项目名称", "error");
      return;
    }

    setCreating(true);
    try {
      const res = await api.post("/projects", formData);
      toast("项目创建成功!", "success");
      // 跳转到新的项目管理页面
      router.push(`/anime-project/${res.data.id}`);
    } catch (error: any) {
      console.error(error);
      toast(error.response?.data?.error || "创建失败", "error");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-8">
        <div>
          <Link href="/dashboard">
            <Button variant="ghost" size="sm" className="mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              返回工作台
            </Button>
          </Link>
          <h1 className="text-3xl font-bold mb-2">创建动漫项目</h1>
          <p className="text-gray-400">创建一个空项目,手动管理角色、场景等素材</p>
        </div>

        <Card className="bg-white/5 border-white/10 p-8">
          <form onSubmit={handleCreate} className="space-y-6">
            <div>
              <Label htmlFor="title" className="text-lg mb-2 block">项目名称 *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="例如: 我的第一部动漫"
                className="bg-white/5 border-white/10 text-lg h-12"
                required
              />
            </div>

            <div>
              <Label htmlFor="description" className="text-lg mb-2 block">项目描述</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="简单描述一下这个项目的主题和内容..."
                className="bg-white/5 border-white/10 min-h-[120px]"
              />
            </div>

            <div className="pt-4">
              <Button
                type="submit"
                disabled={creating}
                className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 h-12 text-lg"
              >
                {creating ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    创建中...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5 mr-2" />
                    创建项目
                  </>
                )}
              </Button>
            </div>

            <div className="text-sm text-gray-500 text-center pt-4 border-t border-white/10">
              <p>💡 提示: 创建后您可以在项目中添加角色、场景、物品、特效等素材</p>
              <p className="mt-2">然后使用AI融合生成图片和视频</p>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
