/**
 * ⚠️ LEGACY（旧版）：分镜/脚本解析器详情页
 *
 * 这里展示的是 legacy `/scripts/:id`：
 * - 原始文本 → AI 解析分镜（人物/场景/镜头）
 * - 细化镜头、生成参考图、导出 JSON/MD
 *
 * 它不是“剧本工坊”（/script-workshop，负责 AI 生成短剧/多集剧本）。
 * 后续扩展“生成剧本/多集短剧”请不要改这里，避免两套体系混用。
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast-provider";
import { Loader2, ArrowLeft, Sparkles, Download, Users, MapPin, Film, Wand2, Play, FileJson, Clock, Zap, Maximize2, X, Pencil, Save } from "lucide-react";
import api from "@/lib/api";
import { scriptsImageApi } from "@/lib/scriptsImageApi";
import { useScriptWebSocket } from "@/lib/useWebSocket";

// 模型类型定义
interface ImageModel {
  value: string;
  label: string;
  desc: string;
}

// 默认模型（作为后备）
const DEFAULT_IMAGE_MODELS: ImageModel[] = [
  { value: "doubao-seedream-4-5-251128", label: "豆包 SeeDream 4.5", desc: "豆包最新图像模型" },
  { value: "nano-banana-2-4k", label: "Nano Banana 2 (4K)", desc: "快速生成" },
  { value: "sora_image", label: "Sora Image", desc: "Sora图像生成" },
  { value: "z-image-turbo", label: "Z-Image Turbo", desc: "快速高质量生成" },
];

export default function ScriptDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [script, setScript] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [refiningAll, setRefiningAll] = useState(false);
  const [refiningShot, setRefiningShot] = useState<number | null>(null);
  const [selectedDialogModel, setSelectedDialogModel] = useState<string | null>(null);
  // 模型列表从API获取
  const [imageModels, setImageModels] = useState<ImageModel[]>(DEFAULT_IMAGE_MODELS);
  const [selectedImageModel, setSelectedImageModel] = useState<string>("");
  const [generatingImages, setGeneratingImages] = useState<Set<string>>(new Set()); // 支持并发生成多个
  const [generatingAllCharacters, setGeneratingAllCharacters] = useState(false);
  const [generatingAllScenes, setGeneratingAllScenes] = useState(false);
  // 跟踪正在生成中的人物/场景ID
  const [generatingCharacterIds, setGeneratingCharacterIds] = useState<Set<number>>(new Set());
  const [generatingSceneIds, setGeneratingSceneIds] = useState<Set<number>>(new Set());
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(null);
  const [editingCharacter, setEditingCharacter] = useState<any>(null);
  const [editingScene, setEditingScene] = useState<any>(null);
  const [editingShot, setEditingShot] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  // 获取模型列表
  const fetchImageModels = async () => {
    try {
      const res = await api.get("/config/image-models?page=script");
      const { models: modelList, defaultModel } = res.data;
      if (modelList && modelList.length > 0) {
        setImageModels(modelList);
        setSelectedImageModel(defaultModel || modelList[0].value);
      } else {
        setImageModels(DEFAULT_IMAGE_MODELS);
        setSelectedImageModel(DEFAULT_IMAGE_MODELS[0].value);
      }
    } catch (err) {
      console.error("Failed to fetch models, using defaults", err);
      setImageModels(DEFAULT_IMAGE_MODELS);
      setSelectedImageModel(DEFAULT_IMAGE_MODELS[0].value);
    }
  };

  useEffect(() => {
    fetchScript();
    fetchImageModels();
    loadDialogModel();
  }, [params.id]);

  const loadDialogModel = () => {
    try {
      const raw = localStorage.getItem('sora_settings');
      if (raw) {
        const stored = JSON.parse(raw);
        if (stored.selectedDialogModel) {
          setSelectedDialogModel(stored.selectedDialogModel);
        }
      }
    } catch (error) {
      console.warn('Failed to load dialog model', error);
    }
  };

  const fetchScript = async () => {
    try {
      const res = await api.get(`/scripts/${params.id}`);
      setScript(res.data);
    } catch (err) {
      console.error("Failed to fetch script", err);
      toast("加载失败", "error");
    } finally {
      setLoading(false);
    }
  };

  // 第一步：解析分镜表
  const handleParse = async () => {
    setParsing(true);
    try {
      const res = await api.post(`/scripts/${params.id}/parse`, {
        dialogModel: selectedDialogModel,
      });
      setScript(res.data);
      toast("分镜表解析成功", "success");
    } catch (err: any) {
      toast(err.response?.data?.error || "解析失败", "error");
    } finally {
      setParsing(false);
    }
  };

  // 第二步：细化单个镜头（不传模型，使用后端系统配置）
  const handleRefineShot = async (shotId: number, index: number) => {
    setRefiningShot(index);
    try {
      const res = await api.post(`/scripts/shots/${shotId}/refine`);
      // 更新单个镜头
      const updatedShots = script.shots.map((s: any) => 
        s.id === shotId ? res.data : s
      );
      setScript({ ...script, shots: updatedShots });
      toast(`镜头 ${index + 1} 细化完成`, "success");
    } catch (err: any) {
      toast(err.response?.data?.error || "细化失败", "error");
    } finally {
      setRefiningShot(null);
    }
  };

  // 批量细化所有镜头（不传模型，使用后端系统配置）
  const handleRefineAll = async () => {
    setRefiningAll(true);
    try {
      const res = await api.post(`/scripts/${params.id}/refine-all`);
      setScript(res.data);
      toast("所有镜头细化完成", "success");
    } catch (err: any) {
      toast(err.response?.data?.error || "批量细化失败", "error");
    } finally {
      setRefiningAll(false);
    }
  };

  // 导出JSON
  const handleExportJson = () => {
    if (!script) return;
    
    const exportData = {
      title: script.title,
      style: script.style || "动漫风格",
      characters: script.characters?.map((c: any) => ({
        uniqueId: c.uniqueId,
        name: c.name,
        prompt: c.prompt
      })) || [],
      scenes: script.scenes?.map((s: any) => ({
        uniqueId: s.uniqueId,
        name: s.name,
        prompt: s.prompt
      })) || [],
      shots: script.shots?.map((shot: any) => ({
        description: shot.description,
        duration: shot.duration,
        dialogue: shot.dialogue || null,
        mode: shot.mode || null,
        refCharacters: shot.refCharacters || [],
        refScene: shot.refScene || null,
        startFrame: shot.startFrame || null,
        motion: shot.motion || null,
        prompt: shot.prompt || null
      })) || []
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${script.title}_剧本.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("JSON导出成功", "success");
  };

  // 导出Markdown
  const handleDownload = () => {
    if (!script) return;
    
    let content = `# ${script.title} - 分镜脚本\n\n`;
    content += `## 原始剧本\n${script.originalContent}\n\n`;
    
    if (script.characters?.length > 0) {
      content += `## 人物设定 (${script.characters.length})\n\n`;
      script.characters.forEach((char: any, i: number) => {
        content += `### ${i + 1}. ${char.name}\n`;
        content += `**提示词**: ${char.prompt}\n\n`;
      });
    }
    
    if (script.scenes?.length > 0) {
      content += `## 场景设定 (${script.scenes.length})\n\n`;
      script.scenes.forEach((scene: any, i: number) => {
        content += `### ${i + 1}. ${scene.name}\n`;
        content += `**提示词**: ${scene.prompt}\n\n`;
      });
    }
    
    if (script.shots?.length > 0) {
      content += `## 分镜表 (${script.shots.length})\n\n`;
      script.shots.forEach((shot: any, i: number) => {
        content += `### 镜头 ${i + 1} (${shot.duration || 3}秒)\n`;
        content += `**描述**: ${shot.description}\n`;
        if (shot.dialogue) content += `**对话**: "${shot.dialogue}"\n`;
        if (shot.mode) {
          content += `**模式**: ${shot.mode}\n`;
          if (shot.refCharacters?.length > 0) content += `**参考人物**: ${shot.refCharacters.join(', ')}\n`;
          if (shot.refScene) content += `**参考场景**: ${shot.refScene}\n`;
          if (shot.startFrame) content += `**第一帧**: ${shot.startFrame}\n`;
          if (shot.motion) content += `**运动**: ${shot.motion}\n`;
        }
        content += `\n`;
      });
    }
    
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${script.title}_分镜脚本.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 保存人物编辑
  const handleSaveCharacter = async () => {
    if (!editingCharacter) return;
    setSaving(true);
    try {
      const res = await api.put(`/scripts/characters/${editingCharacter.id}`, {
        name: editingCharacter.name,
        prompt: editingCharacter.prompt,
      });
      const updated = script.characters.map((c: any) =>
        c.id === editingCharacter.id ? { ...c, ...res.data } : c
      );
      setScript({ ...script, characters: updated });
      setEditingCharacter(null);
      toast("人物更新成功", "success");
    } catch (err: any) {
      toast(err.response?.data?.message || "更新失败", "error");
    } finally {
      setSaving(false);
    }
  };

  // 保存场景编辑
  const handleSaveScene = async () => {
    if (!editingScene) return;
    setSaving(true);
    try {
      const res = await api.put(`/scripts/scenes/${editingScene.id}`, {
        name: editingScene.name,
        prompt: editingScene.prompt,
        ratio: editingScene.ratio || "16:9",
      });
      const updated = script.scenes.map((s: any) =>
        s.id === editingScene.id ? { ...s, ...res.data, ratio: editingScene.ratio || "16:9" } : s
      );
      setScript({ ...script, scenes: updated });
      setEditingScene(null);
      toast("场景更新成功", "success");
    } catch (err: any) {
      toast(err.response?.data?.message || "更新失败", "error");
    } finally {
      setSaving(false);
    }
  };

  // 保存镜头编辑
  const handleSaveShot = async () => {
    if (!editingShot) return;
    setSaving(true);
    try {
      const res = await api.put(`/scripts/shots/${editingShot.id}`, editingShot);
      const updated = script.shots.map((s: any) =>
        s.id === editingShot.id ? { ...s, ...res.data } : s
      );
      setScript({ ...script, shots: updated });
      setEditingShot(null);
      toast("镜头更新成功", "success");
    } catch (err: any) {
      toast(err.response?.data?.message || "更新失败", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateImage = async (type: string, item: any) => {
    const key = `${type}_${item.id}`;
    // 添加到生成中集合（支持并发）- 同时更新两个状态以保持一致
    setGeneratingImages(prev => new Set(prev).add(key));
    if (type === "character") {
      setGeneratingCharacterIds(prev => new Set(prev).add(item.id));
    } else if (type === "scene") {
      setGeneratingSceneIds(prev => new Set(prev).add(item.id));
    }
    
    try {
      toast("开始生成图片...", "info");
      
      if (type === "character") {
        const res = await scriptsImageApi.generateCharacterImage(item.id, {
          model: selectedImageModel,
          ratio: "1:1",
        });
        // 使用函数式更新，只更新目标项，保留其他项的最新状态
        setScript((prev: any) => {
          if (!prev || !prev.characters) return prev;
          return {
            ...prev,
            characters: prev.characters.map((c: any) =>
              c.id === item.id ? { ...c, imageUrl: res.data.imageUrl, base64Data: res.data.base64Data } : c
            )
          };
        });
        toast("图片生成成功", "success");
      } else if (type === "scene") {
        // 使用场景自定义的比例，默认16:9
        const sceneRatio = item.ratio || "16:9";
        const res = await scriptsImageApi.generateSceneImage(item.id, {
          model: selectedImageModel,
          ratio: sceneRatio,
        });
        // 使用函数式更新，只更新目标项，保留其他项的最新状态
        setScript((prev: any) => {
          if (!prev || !prev.scenes) return prev;
          return {
            ...prev,
            scenes: prev.scenes.map((s: any) =>
              s.id === item.id ? { ...s, imageUrl: res.data.imageUrl, base64Data: res.data.base64Data } : s
            )
          };
        });
        toast("图片生成成功", "success");
      }
    } catch (err: any) {
      toast(err.response?.data?.message || err.response?.data?.error || "生成失败", "error");
    } finally {
      // 从生成中集合移除 - 同时更新两个状态
      setGeneratingImages(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      if (type === "character") {
        setGeneratingCharacterIds(prev => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
      } else if (type === "scene") {
        setGeneratingSceneIds(prev => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
      }
    }
  };

  // 一键生成所有人物图片（一个请求，异步+WebSocket推送）
  const handleGenerateAllCharacters = async () => {
    if (!script?.characters?.length) return;
    
    // 过滤出没有图片且不在生成中的人物
    const charactersToGenerate = script.characters.filter((c: any) => 
      !c.imageUrl && !generatingCharacterIds.has(c.id)
    );
    if (charactersToGenerate.length === 0) {
      toast("所有人物都已有图片或正在生成中", "info");
      return;
    }
    
    setGeneratingAllCharacters(true);
    // 标记所有要生成的人物ID为生成中状态（合并已有的）
    setGeneratingCharacterIds(prev => {
      const next = new Set(prev);
      charactersToGenerate.forEach((c: any) => next.add(c.id));
      return next;
    });
    
    try {
      await scriptsImageApi.generateAllCharacters(Number(params.id), {
        model: selectedImageModel,
      });
      toast(`已开始生成 ${charactersToGenerate.length} 个人物图片，请等待...`, "info");
    } catch (err: any) {
      toast("批量生成失败", "error");
      setGeneratingAllCharacters(false);
      // 只移除本次批量添加的ID
      setGeneratingCharacterIds(prev => {
        const next = new Set(prev);
        charactersToGenerate.forEach((c: any) => next.delete(c.id));
        return next;
      });
    }
  };

  // 一键生成所有场景图片（一个请求，异步+WebSocket推送）
  const handleGenerateAllScenes = async () => {
    if (!script?.scenes?.length) return;
    
    // 过滤出没有图片且不在生成中的场景
    const scenesToGenerate = script.scenes.filter((s: any) => 
      !s.imageUrl && !generatingSceneIds.has(s.id)
    );
    if (scenesToGenerate.length === 0) {
      toast("所有场景都已有图片或正在生成中", "info");
      return;
    }
    
    setGeneratingAllScenes(true);
    // 标记所有要生成的场景ID为生成中状态（合并已有的）
    setGeneratingSceneIds(prev => {
      const next = new Set(prev);
      scenesToGenerate.forEach((s: any) => next.add(s.id));
      return next;
    });
    
    try {
      await scriptsImageApi.generateAllScenes(Number(params.id), {
        model: selectedImageModel,
      });
      toast(`已开始生成 ${scenesToGenerate.length} 个场景图片，请等待...`, "info");
    } catch (err: any) {
      toast("批量生成失败", "error");
      setGeneratingAllScenes(false);
      // 只移除本次批量添加的ID
      setGeneratingSceneIds(prev => {
        const next = new Set(prev);
        scenesToGenerate.forEach((s: any) => next.delete(s.id));
        return next;
      });
    }
  };
  
  // WebSocket 消息处理
  const handleWebSocketMessage = useCallback((message: any) => {
    if (message.type === 'SCRIPT_IMAGE_UPDATE') {
      const { itemType, itemId, status, imageUrl, errorMessage } = message;
      
      if (itemType === 'character') {
        if (status === 'GENERATING') {
          // 收到生成中状态，添加到生成中集合
          setGeneratingCharacterIds(prev => {
            const next = new Set(prev);
            next.add(itemId);
            return next;
          });
        } else {
          // 从生成中状态移除该ID
          setGeneratingCharacterIds(prev => {
            const next = new Set(prev);
            next.delete(itemId);
            // 如果没有正在生成的了，关闭总开关
            if (next.size === 0) {
              setGeneratingAllCharacters(false);
            }
            return next;
          });
          // 同时从 generatingImages 移除
          setGeneratingImages(prev => {
            const next = new Set(prev);
            next.delete(`character_${itemId}`);
            return next;
          });
          
          if (status === 'COMPLETED' && imageUrl) {
            setScript((prev: any) => {
              if (!prev || !prev.characters) return prev;
              return {
                ...prev,
                characters: prev.characters.map((c: any) =>
                  c.id === itemId ? { ...c, imageUrl } : c
                )
              };
            });
            toast("人物图片生成完成", "success");
          } else if (status === 'FAILED') {
            toast(`人物图片生成失败: ${errorMessage || '未知错误'}`, "error");
          }
        }
      } else if (itemType === 'scene') {
        if (status === 'GENERATING') {
          // 收到生成中状态，添加到生成中集合
          setGeneratingSceneIds(prev => {
            const next = new Set(prev);
            next.add(itemId);
            return next;
          });
        } else {
          // 从生成中状态移除该ID
          setGeneratingSceneIds(prev => {
            const next = new Set(prev);
            next.delete(itemId);
            // 如果没有正在生成的了，关闭总开关
            if (next.size === 0) {
              setGeneratingAllScenes(false);
            }
            return next;
          });
          // 同时从 generatingImages 移除
          setGeneratingImages(prev => {
            const next = new Set(prev);
            next.delete(`scene_${itemId}`);
            return next;
          });
          
          if (status === 'COMPLETED' && imageUrl) {
            setScript((prev: any) => {
              if (!prev || !prev.scenes) return prev;
              return {
                ...prev,
                scenes: prev.scenes.map((s: any) =>
                  s.id === itemId ? { ...s, imageUrl } : s
                )
              };
            });
            toast("场景图片生成完成", "success");
          } else if (status === 'FAILED') {
            toast(`场景图片生成失败: ${errorMessage || '未知错误'}`, "error");
          }
        }
      }
    }
  }, [toast]);
  
  // 订阅 WebSocket
  useScriptWebSocket(script?.id || null, handleWebSocketMessage);

  // 计算总时长
  const totalDuration = script?.shots?.reduce((sum: number, shot: any) => sum + (shot.duration || 3), 0) || 0;
  // 检查是否有未细化的镜头
  const hasUnrefinedShots = script?.shots?.some((shot: any) => !shot.mode);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#020204] text-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
  }

  if (!script) return null;

  return (
    <div className="min-h-screen bg-[#020204] text-white">
      {/* Header */}
      <div className="border-b border-white/10 bg-black/50 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => router.push("/scripts")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              返回
            </Button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold">{script.title}</h1>
                <span className="text-[10px] px-2 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  LEGACY
                </span>
                <a
                  href="/script-workshop"
                  className="text-[10px] px-2 py-1 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30"
                >
                  前往：剧本工坊
                </a>
              </div>
              <p className="text-sm text-gray-400">
                {script.status === 'PARSED' ? '已解析' : '未解析'}
                {script.style && ` · ${script.style}`}
                {totalDuration > 0 && ` · 总时长 ${totalDuration}秒`}
              </p>
            </div>
          </div>
          
          <div className="flex gap-3">
            {script.status === 'PARSED' && (
              <>
                <Button onClick={handleExportJson} variant="ghost" className="border border-white/10">
                  <FileJson className="w-4 h-4 mr-2" />
                  导出JSON
                </Button>
                <Button onClick={handleDownload} variant="ghost" className="border border-white/10">
                  <Download className="w-4 h-4 mr-2" />
                  导出MD
                </Button>
              </>
            )}
            <Button
              onClick={handleParse}
              disabled={parsing}
              className="bg-gradient-to-r from-purple-500 to-blue-500"
            >
              {parsing ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />解析中...</>
              ) : (
                <><Sparkles className="w-4 h-4 mr-2" />{script.status === 'PARSED' ? '重新解析' : '第一步：解析分镜'}</>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-8 py-8">
        {script.status !== 'PARSED' ? (
          <div className="bg-white/5 border border-white/10 rounded-xl p-8">
            <h2 className="text-lg font-semibold mb-4">原始剧本</h2>
            <Textarea value={script.originalContent} readOnly className="bg-white/5 border-white/10 min-h-[400px]" />
            <div className="mt-6 text-center">
              <p className="text-gray-400 mb-4">点击"第一步：解析分镜"按钮，AI将生成人物、场景和镜头分镜表</p>
              <Button onClick={handleParse} disabled={parsing} size="lg" className="bg-gradient-to-r from-purple-500 to-blue-500">
                {parsing ? (
                  <><Loader2 className="w-5 h-5 mr-2 animate-spin" />解析中...</>
                ) : (
                  <><Sparkles className="w-5 h-5 mr-2" />第一步：解析分镜</>
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Characters */}
            {script.characters?.length > 0 && (
              <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <Users className="w-6 h-6 text-purple-500" />
                    <h2 className="text-xl font-bold">人物参考图 ({script.characters.length})</h2>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-400">生图模型:</span>
                      <select
                        value={selectedImageModel}
                        onChange={(e) => setSelectedImageModel(e.target.value)}
                        className="bg-[#1a1a2e] border border-white/20 rounded px-3 py-1.5 text-sm text-white cursor-pointer hover:border-purple-500/50 focus:border-purple-500 focus:outline-none transition-colors"
                        style={{ colorScheme: 'dark' }}
                      >
                        {imageModels.map((m) => (
                          <option key={m.value} value={m.value} className="bg-[#1a1a2e] text-white py-2">{m.label}</option>
                        ))}
                      </select>
                    </div>
                    <Button
                      onClick={handleGenerateAllCharacters}
                      disabled={generatingAllCharacters}
                      className="bg-gradient-to-r from-purple-500 to-pink-500"
                    >
                      {generatingAllCharacters ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" />生成中...</>
                      ) : (
                        <><Wand2 className="w-4 h-4 mr-2" />一键生成所有人物</>
                      )}
                    </Button>
                  </div>
                </div>
                <p className="text-sm text-gray-400 mb-6">生成人物参考图（3:4比例，正面全身照），用于后续镜头保持人物一致性</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {script.characters.map((char: any) => {
                    const isGenerating = generatingImages.has(`character_${char.id}`) || generatingCharacterIds.has(char.id);
                    return (
                      <div key={char.id} className="group relative aspect-[3/4] bg-white/5 border border-white/10 rounded-lg overflow-hidden">
                        {/* 图片或占位 */}
                        {char.imageUrl ? (
                          <img src={char.imageUrl} alt={char.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-900/30 to-purple-600/10">
                            <Users className="w-16 h-16 text-purple-500/30" />
                          </div>
                        )}
                        
                        {/* 生成中的加载遮罩（统一样式） */}
                        {isGenerating && (
                          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center z-10">
                            <Loader2 className="w-10 h-10 text-purple-500 animate-spin mb-2" />
                            <span className="text-sm text-purple-300">生成中...</span>
                          </div>
                        )}
                        
                        {/* 顶部按钮 - 编辑和放大 */}
                        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => setEditingCharacter({ ...char })}
                            className="p-1.5 rounded-lg bg-black/50 text-white/70 hover:text-white hover:bg-black/70"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          {char.imageUrl && (
                            <button
                              onClick={() => setPreviewImage({ url: char.imageUrl, title: char.name })}
                              className="p-1.5 rounded-lg bg-black/50 text-white/70 hover:text-white hover:bg-black/70"
                            >
                              <Maximize2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        
                        {/* 底部遮罩层 - 显示信息 */}
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-3 pt-10">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-white">{char.name}</h3>
                            {char.uniqueId && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/30 text-purple-300">{char.uniqueId}</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-300 line-clamp-2 mb-2">{char.prompt}</p>
                          
                          {/* 生成按钮 - hover时显示 */}
                          <Button 
                            size="sm" 
                            onClick={() => handleGenerateImage("character", char)} 
                            disabled={isGenerating}
                            className="w-full h-7 text-xs bg-purple-500/30 hover:bg-purple-500/50 text-purple-200 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            {isGenerating ? (
                              <><Loader2 className="w-3 h-3 mr-1 animate-spin" />生成中...</>
                            ) : (
                              <><Wand2 className="w-3 h-3 mr-1" />{char.imageUrl ? '重新生成' : '生成参考图'}</>
                            )}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Scenes */}
            {script.scenes?.length > 0 && (
              <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <MapPin className="w-6 h-6 text-blue-500" />
                    <h2 className="text-xl font-bold">场景参考图 ({script.scenes.length})</h2>
                  </div>
                  <Button
                    onClick={handleGenerateAllScenes}
                    disabled={generatingAllScenes}
                    className="bg-gradient-to-r from-blue-500 to-cyan-500"
                  >
                    {generatingAllScenes ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />生成中...</>
                    ) : (
                      <><Wand2 className="w-4 h-4 mr-2" />一键生成所有场景</>
                    )}
                  </Button>
                </div>
                <p className="text-sm text-gray-400 mb-6">生成场景参考图，用于纯场景镜头（16:9比例）</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {script.scenes.map((scene: any) => {
                    const isGenerating = generatingImages.has(`scene_${scene.id}`) || generatingSceneIds.has(scene.id);
                    return (
                      <div key={scene.id} className="group relative aspect-video bg-white/5 border border-white/10 rounded-lg overflow-hidden">
                        {/* 图片或占位 */}
                        {scene.imageUrl ? (
                          <img src={scene.imageUrl} alt={scene.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-900/30 to-blue-600/10">
                            <MapPin className="w-16 h-16 text-blue-500/30" />
                          </div>
                        )}
                        
                        {/* 生成中的加载遮罩（统一样式） */}
                        {isGenerating && (
                          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center z-10">
                            <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-2" />
                            <span className="text-sm text-blue-300">生成中...</span>
                          </div>
                        )}
                        
                        {/* 顶部按钮 - 编辑和放大 */}
                        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => setEditingScene({ ...scene })}
                            className="p-1.5 rounded-lg bg-black/50 text-white/70 hover:text-white hover:bg-black/70"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          {scene.imageUrl && (
                            <button
                              onClick={() => setPreviewImage({ url: scene.imageUrl, title: scene.name })}
                              className="p-1.5 rounded-lg bg-black/50 text-white/70 hover:text-white hover:bg-black/70"
                            >
                              <Maximize2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        
                        {/* 底部遮罩层 - 显示信息 */}
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-3 pt-8">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-white">{scene.name}</h3>
                            {scene.uniqueId && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/30 text-blue-300">{scene.uniqueId}</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-300 line-clamp-2 mb-2">{scene.prompt}</p>
                          
                          {/* 生成按钮 - hover时显示 */}
                          <Button 
                            size="sm" 
                            onClick={() => handleGenerateImage("scene", scene)} 
                            disabled={isGenerating}
                            className="w-full h-7 text-xs bg-blue-500/30 hover:bg-blue-500/50 text-blue-200 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            {isGenerating ? (
                              <><Loader2 className="w-3 h-3 mr-1 animate-spin" />生成中...</>
                            ) : (
                              <><Wand2 className="w-3 h-3 mr-1" />{scene.imageUrl ? '重新生成' : '生成参考图'}</>
                            )}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Shots */}
            {script.shots?.length > 0 && (
              <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <Film className="w-6 h-6 text-amber-500" />
                    <h2 className="text-xl font-bold">分镜表 ({script.shots.length}个镜头)</h2>
                    <span className="text-sm text-gray-400 flex items-center gap-1">
                      <Clock className="w-4 h-4" /> 总时长 {totalDuration}秒
                    </span>
                  </div>
                  <Button
                    onClick={handleRefineAll}
                    disabled={refiningAll}
                    className={hasUnrefinedShots 
                      ? "bg-gradient-to-r from-amber-500 to-orange-500"
                      : "bg-gradient-to-r from-green-500 to-emerald-500"
                    }
                  >
                    {refiningAll ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />批量细化中...</>
                    ) : hasUnrefinedShots ? (
                      <><Zap className="w-4 h-4 mr-2" />第二步：批量细化所有镜头</>
                    ) : (
                      <><Zap className="w-4 h-4 mr-2" />重新细化所有镜头</>
                    )}
                  </Button>
                </div>
                <p className="text-sm text-gray-400 mb-6">
                  点击单个镜头的"细化"按钮，AI将生成具体的制作方案（参考人物/场景、第一帧提示词、运动描述）
                </p>
                
                <div className="space-y-3">
                  {script.shots.map((shot: any, index: number) => {
                    const isRefined = !!shot.mode;
                    const isMulti = shot.mode === 'multi2video';
                    
                    return (
                      <div key={shot.id || index} className={`bg-white/5 border rounded-lg p-4 transition-all ${
                        isRefined ? 'border-green-500/30' : 'border-white/10 hover:border-amber-500/50'
                      }`}>
                        <div className="flex items-start gap-4">
                          {/* 镜头序号 */}
                          <div className={`flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center ${
                            isRefined ? 'bg-green-500/20 text-green-500' : 'bg-amber-500/20 text-amber-500'
                          }`}>
                            <span className="font-bold text-lg">{index + 1}</span>
                          </div>
                          
                          <div className="flex-1 space-y-2">
                            {/* 第一行：描述 + 时长 */}
                            <div className="flex items-center gap-3">
                              <span className="text-white font-medium">{shot.description}</span>
                              <span className="text-xs px-2 py-0.5 rounded bg-gray-500/20 text-gray-400 flex items-center gap-1">
                                <Clock className="w-3 h-3" /> {shot.duration || 3}秒
                              </span>
                            </div>
                            
                            {/* 对话 */}
                            {shot.dialogue && (
                              <p className="text-sm text-purple-400 italic pl-3 border-l-2 border-purple-500/50">
                                "{shot.dialogue}"
                              </p>
                            )}
                            
                            {/* 已细化：显示制作方案 */}
                            {isRefined && (
                              <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                                {/* 模式和参考 */}
                                <div className="flex flex-wrap gap-2">
                                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                    isMulti ? 'bg-orange-500/20 text-orange-400' : 'bg-green-500/20 text-green-400'
                                  }`}>
                                    {isMulti ? '🎬 multi2video' : '🖼️ img2video'}
                                  </span>
                                  {shot.refCharacters?.map((name: string, i: number) => (
                                    <span key={`char-${i}`} className="px-2 py-0.5 rounded text-xs font-medium bg-purple-500/20 text-purple-400">
                                      👤 {name}
                                    </span>
                                  ))}
                                  {shot.refScene && (
                                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-500/20 text-blue-400">
                                      🏞️ {shot.refScene}
                                    </span>
                                  )}
                                </div>
                                
                                {/* img2video: 第一帧 + motion */}
                                {!isMulti && shot.startFrame && (
                                  <>
                                    <div className="bg-white/5 rounded p-2">
                                      <p className="text-xs text-gray-500 mb-1">📷 第一帧AI绘画提示词</p>
                                      <p className="text-sm text-white">{shot.startFrame}</p>
                                    </div>
                                    {shot.motion && (
                                      <div className="flex items-start gap-2 text-sm text-cyan-400">
                                        <Play className="w-3 h-3 mt-1 flex-shrink-0" />
                                        <span>{shot.motion}</span>
                                      </div>
                                    )}
                                  </>
                                )}
                                
                                {/* multi2video: 完整prompt */}
                                {isMulti && shot.prompt && (
                                  <div className="bg-white/5 rounded p-2">
                                    <p className="text-xs text-gray-500 mb-1">🎬 完整提示词</p>
                                    <p className="text-sm text-white">{shot.prompt}</p>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          
                          {/* 操作按钮 */}
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditingShot({ ...shot })}
                              className="bg-white/5 hover:bg-white/10 text-gray-400"
                            >
                              <Pencil className="w-3 h-3" />
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleRefineShot(shot.id, index)}
                              disabled={refiningShot === index || refiningAll}
                              className={isRefined 
                                ? "bg-green-500/20 hover:bg-green-500/30 text-green-400" 
                                : "bg-amber-500/20 hover:bg-amber-500/30 text-amber-400"
                              }
                            >
                              {refiningShot === index ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <><Wand2 className="w-3 h-3 mr-1" />{isRefined ? '重新细化' : '细化'}</>
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 人物编辑模态框 */}
      {editingCharacter && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setEditingCharacter(null)}>
          <div className="bg-[#1a1a2e] border border-white/10 rounded-xl p-6 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">编辑人物</h3>
              <button onClick={() => setEditingCharacter(null)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">人物名称</label>
                <input
                  type="text"
                  value={editingCharacter.name}
                  onChange={(e) => setEditingCharacter({ ...editingCharacter, name: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">外貌提示词（发型必须详细描述！）</label>
                <Textarea
                  value={editingCharacter.prompt}
                  onChange={(e) => setEditingCharacter({ ...editingCharacter, prompt: e.target.value })}
                  className="bg-white/5 border-white/10 min-h-[150px]"
                  placeholder="包含：性别、年龄、发型发色（长度、颜色、扎法）、五官、肤色、服装..."
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setEditingCharacter(null)}>取消</Button>
                <Button onClick={handleSaveCharacter} disabled={saving} className="bg-purple-500 hover:bg-purple-600">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                  保存
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 场景编辑模态框 */}
      {editingScene && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setEditingScene(null)}>
          <div className="bg-[#1a1a2e] border border-white/10 rounded-xl p-6 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">编辑场景</h3>
              <button onClick={() => setEditingScene(null)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">场景名称</label>
                  <input
                    type="text"
                    value={editingScene.name}
                    onChange={(e) => setEditingScene({ ...editingScene, name: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">图片比例</label>
                  <select
                    value={editingScene.ratio || "16:9"}
                    onChange={(e) => setEditingScene({ ...editingScene, ratio: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none cursor-pointer"
                    style={{ colorScheme: 'dark' }}
                  >
                    <option value="16:9">16:9 (横屏)</option>
                    <option value="9:16">9:16 (竖屏)</option>
                    <option value="4:3">4:3</option>
                    <option value="3:4">3:4</option>
                    <option value="1:1">1:1 (正方形)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">场景提示词</label>
                <Textarea
                  value={editingScene.prompt}
                  onChange={(e) => setEditingScene({ ...editingScene, prompt: e.target.value })}
                  className="bg-white/5 border-white/10 min-h-[150px]"
                  placeholder="描述场景的环境、光线、氛围..."
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setEditingScene(null)}>取消</Button>
                <Button onClick={handleSaveScene} disabled={saving} className="bg-blue-500 hover:bg-blue-600">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                  保存
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 镜头编辑模态框 */}
      {editingShot && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 overflow-y-auto" onClick={() => setEditingShot(null)}>
          <div className="bg-[#1a1a2e] border border-white/10 rounded-xl p-6 w-full max-w-2xl my-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">编辑镜头</h3>
              <button onClick={() => setEditingShot(null)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">镜头描述（25字以内）</label>
                  <input
                    type="text"
                    value={editingShot.description || ''}
                    onChange={(e) => setEditingShot({ ...editingShot, description: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">时长（秒）</label>
                  <input
                    type="number"
                    value={editingShot.duration || 3}
                    onChange={(e) => setEditingShot({ ...editingShot, duration: parseInt(e.target.value) || 3 })}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-amber-500 focus:outline-none"
                    min={1}
                    max={10}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">对话</label>
                <input
                  type="text"
                  value={editingShot.dialogue || ''}
                  onChange={(e) => setEditingShot({ ...editingShot, dialogue: e.target.value || null })}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                  placeholder="无对话留空"
                />
              </div>
              
              {editingShot.mode && (
                <>
                  <div className="border-t border-white/10 pt-4">
                    <p className="text-sm text-gray-500 mb-3">制作方案（细化后可编辑）</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">模式</label>
                      <select
                        value={editingShot.mode}
                        onChange={(e) => setEditingShot({ ...editingShot, mode: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-amber-500 focus:outline-none"
                        style={{ colorScheme: 'dark' }}
                      >
                        <option value="img2video">img2video（单人物/场景）</option>
                        <option value="multi2video">multi2video（多人物）</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">参考场景</label>
                      <input
                        type="text"
                        value={editingShot.refScene || ''}
                        onChange={(e) => setEditingShot({ ...editingShot, refScene: e.target.value || null })}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                        placeholder="场景名称"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">第一帧AI绘画提示词</label>
                    <Textarea
                      value={editingShot.startFrame || ''}
                      onChange={(e) => setEditingShot({ ...editingShot, startFrame: e.target.value })}
                      className="bg-white/5 border-white/10 min-h-[100px]"
                      placeholder="纯视觉描述：景别、机位、人物位置、姿态、表情、光线、背景..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">运动描述</label>
                    <Textarea
                      value={editingShot.motion || ''}
                      onChange={(e) => setEditingShot({ ...editingShot, motion: e.target.value })}
                      className="bg-white/5 border-white/10 min-h-[80px]"
                      placeholder="从第一帧开始的动作变化..."
                    />
                  </div>
                </>
              )}
              
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => setEditingShot(null)}>取消</Button>
                <Button onClick={handleSaveShot} disabled={saving} className="bg-amber-500 hover:bg-amber-600">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                  保存
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 图片预览模态框 */}
      {previewImage && (
        <div 
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <button
            onClick={() => setPreviewImage(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
          <div className="max-w-4xl max-h-[90vh] relative" onClick={(e) => e.stopPropagation()}>
            <img 
              src={previewImage.url} 
              alt={previewImage.title} 
              className="max-w-full max-h-[85vh] object-contain rounded-lg"
            />
            <p className="text-center text-white mt-3 text-lg">{previewImage.title}</p>
          </div>
        </div>
      )}
    </div>
  );
}
