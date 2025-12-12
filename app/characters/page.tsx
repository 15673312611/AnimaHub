"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Sparkles, Video, Link2, PlusCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast-provider";
import { motion, AnimatePresence } from "framer-motion";
import api from "@/lib/api";
import { cn } from "@/lib/utils";

interface Character {
  id: number;
  name: string;
  description?: string;
  videoUrl?: string;
  imageUrl?: string;
  characterUrl?: string;
  timestamps?: string;
  createdAt: string;
  project: { id: number; title: string };
}

interface Project {
  id: number;
  title: string;
}

export default function CharactersPage() {
  const { toast } = useToast();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  const [projectId, setProjectId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [timestamps, setTimestamps] = useState("0,3");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [charRes, projRes] = await Promise.all([
        api.get("/projects/characters/list"),
        api.get("/projects")
      ]);
      setCharacters(charRes.data);
      setProjects(projRes.data);
      if (!projectId && projRes.data.length) {
        setProjectId(String(projRes.data[0].id));
      }
    } catch (error) {
      console.error("Failed to load characters", error);
      toast("加载角色列表失败", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !name || !videoUrl) {
      toast("请填写所有必要信息", "error");
      return;
    }
    const parts = (timestamps || "0,3")
      .split(",")
      .map((p) => parseFloat(p.trim()))
      .filter((n) => !isNaN(n));
    if (parts.length !== 2) {
      toast("时间戳格式应为 start,end，例如 0,3", "error");
      return;
    }
    const [start, end] = parts;
    const diff = end - start;
    if (start < 0 || diff < 1 || diff > 3) {
      toast("角色参考片段时长需在 1-3 秒之间，例如 0,3 或 0.5,2.0", "error");
      return;
    }
    setCreating(true);
    try {
      await api.post(`/projects/${projectId}/character`, {
        projectId: Number(projectId),
        name,
        description,
        videoUrl,
        imageUrl,
        timestamps
      });
      setName("");
      setDescription("");
      setVideoUrl("");
      setImageUrl("");
      setTimestamps("0,3");
      await loadData();
      toast("角色创建成功！", "success");
      setActiveTab("overview");
    } catch (error) {
      console.error("Failed to create character", error);
      toast("创建角色失败，请稍后重试", "error");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white p-10">
      <div className="max-w-6xl mx-auto space-y-10">
        <div className="text-center space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-purple-400">Character Studio</p>
          <h1 className="text-4xl font-bold">角色一致性管理</h1>
          <p className="text-gray-400">集中创建、管理、复用所有品牌或主角角色，确保长篇作品保持同一视觉形象。</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-2 bg-white/5 p-1 rounded-xl">
            <TabsTrigger value="overview" className="data-[state=active]:bg-white/10 rounded-lg transition-all">角色库</TabsTrigger>
            <TabsTrigger value="create" className="data-[state=active]:bg-white/10 rounded-lg transition-all">创建角色</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-8 space-y-6">
            {loading ? (
              <div className="grid gap-6 md:grid-cols-2">
                {[1, 2, 3, 4].map((i) => (
                  <Card key={i} className="bg-white/5 border-white/10">
                     <CardHeader className="flex flex-row items-start justify-between gap-4">
                       <div className="space-y-2 flex-1">
                         <Skeleton className="h-6 w-1/2" />
                         <Skeleton className="h-4 w-1/3" />
                       </div>
                       <Skeleton className="w-16 h-16 rounded-lg" />
                     </CardHeader>
                     <CardContent className="space-y-4">
                       <Skeleton className="h-4 w-full" />
                       <Skeleton className="h-20 w-full rounded-lg" />
                     </CardContent>
                  </Card>
                ))}
              </div>
            ) : characters.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card className="bg-white/5 border-white/10 text-center py-20">
                  <Sparkles className="w-10 h-10 mx-auto text-purple-400 mb-4" />
                  <p className="text-gray-400">还没有任何角色，切换到“创建角色”开始吧。</p>
                </Card>
              </motion.div>
            ) : (
              <div className="grid gap-6 md:grid-cols-2">
                <AnimatePresence>
                  {characters.map((char) => (
                    <motion.div
                      key={char.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Card className="bg-white/5 border-white/10 h-full hover:border-purple-500/30 transition-colors">
                        <CardHeader className="flex flex-row items-start justify-between">
                          <div>
                            <CardTitle className="text-xl font-semibold">{char.name}</CardTitle>
                            <CardDescription className="text-gray-400">
                              所属项目：{char.project?.title || "-"}
                            </CardDescription>
                          </div>
                          {char.imageUrl ? (
                            <img src={char.imageUrl} alt={char.name} className="w-16 h-16 rounded-lg object-cover border border-white/10" />
                          ) : (
                            <div className="w-16 h-16 rounded-lg border border-dashed border-white/20 flex items-center justify-center text-gray-600 text-xs">No Cover</div>
                          )}
                        </CardHeader>
                        <CardContent className="space-y-4 text-sm text-gray-300">
                          {char.description && <p className="leading-relaxed text-gray-400">{char.description}</p>}

                          <div className="grid grid-cols-2 gap-3 text-xs font-mono bg-black/30 p-3 rounded-lg border border-white/5">
                            <div>
                              <p className="text-gray-500">参考视频</p>
                              <a href={char.videoUrl} target="_blank" className="text-purple-300 truncate block hover:underline">
                                {char.videoUrl || "-"}
                              </a>
                            </div>
                            <div>
                              <p className="text-gray-500">character_url</p>
                              <a href={char.characterUrl} target="_blank" className="text-purple-300 truncate block hover:underline">
                                {char.characterUrl || "未注册"}
                              </a>
                            </div>
                            <div>
                              <p className="text-gray-500">时间戳</p>
                              <p>{char.timestamps || "0,1"}</p>
                            </div>
                            <div>
                              <p className="text-gray-500">创建时间</p>
                              <p>{new Date(char.createdAt).toLocaleString()}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </TabsContent>

          <TabsContent value="create" className="mt-8">
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PlusCircle className="w-5 h-5 text-purple-400" />
                  创建新的 Sora 角色
                </CardTitle>
                <CardDescription className="text-gray-400">
                  上传 2-3 秒角色参考视频，并设置关键帧时间戳，系统会调用 /sora/v1/characters 为你注册人物档案，供后续所有项目复用。
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreate} className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-sm text-gray-300">角色名称</label>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="例如：Cyber Hero"
                      className="bg-black/40 border-white/15 focus-visible:ring-purple-500"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm text-gray-300">角色参考视频 URL (2-3s)</label>
                    <Input
                      value={videoUrl}
                      onChange={(e) => setVideoUrl(e.target.value)}
                      placeholder="https://...mp4"
                      className="bg-black/40 border-white/15 focus-visible:ring-purple-500"
                      required
                    />
                  </div>

                  <div className="grid md:grid-cols-2 gap-5">
                    <div className="space-y-2">
                      <label className="text-sm text-gray-300 flex items-center gap-2">
                        关键帧时间戳 <span className="text-xs text-gray-500">(逗号分隔，例如 0.5,1.7)</span>
                      </label>
                      <Input
                        value={timestamps}
                        onChange={(e) => setTimestamps(e.target.value)}
                        className="bg-black/40 border-white/15 focus-visible:ring-purple-500"
                      />
                    </div>
                    <div className="space-y-2 text-xs text-gray-400">
                      <p>
                        提示：只需提供角色参考视频和人物出现的关键帧，Sora 会自动根据这些帧学习角色外观，不需要额外的封面图或外貌描述。
                      </p>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={creating}
                    className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 py-6 text-lg"
                  >
                    {creating ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Video className="w-5 h-5 mr-2" />}
                    {creating ? "正在注册角色..." : "提交并同步到 Sora"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
