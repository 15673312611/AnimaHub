"use client";

// LEGACY NOTE:
// This dialog consumes legacy `/scripts` data that has already been parsed into shots/characters/scenes.
// It is NOT related to the new Script Workshop (/script-workshop) which focuses on AI-writing short dramas.

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Film, Users, MapPin, Loader2, X, RefreshCw } from "lucide-react";
import api from "@/lib/api";
import { cn, toThumbnailUrl } from "@/lib/utils";

interface ScriptSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectShot: (shot: any, characters: any[], scenes: any[], scriptInfo?: { scriptId: number; scriptTitle: string; shotIndex: number }) => void;
  onSelectCharacter?: (character: any) => void;
  onSelectScene?: (scene: any) => void;
}

export default function ScriptSelectorDialog({
  open,
  onOpenChange,
  onSelectShot,
  onSelectCharacter,
  onSelectScene,
}: ScriptSelectorDialogProps) {
  const [scripts, setScripts] = useState<any[]>([]);
  const [selectedScript, setSelectedScript] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // 首次打开时加载数据
  useEffect(() => {
    if (open && !initialized) {
      fetchScripts();
      setInitialized(true);
    }
  }, [open, initialized]);

  const fetchScripts = async () => {
    setLoading(true);
    try {
      const res = await api.get("/scripts");
      const parsed = res.data.filter((s: any) => s.status === "PARSED");
      setScripts(parsed);
    } catch (err) {
      console.error("Failed to fetch scripts", err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchScripts();
    if (selectedScript) {
      loadScriptDetail(selectedScript.id);
    }
  };

  const loadScriptDetail = async (scriptId: number) => {
    try {
      const res = await api.get(`/scripts/${scriptId}`);
      setSelectedScript(res.data);
    } catch (err) {
      console.error("Failed to load script detail", err);
    }
  };

  const handleSelectShot = (shot: any, shotIndex: number) => {
    if (!selectedScript) return;

    const characters: any[] = [];
    const scenes: any[] = [];

    shot.refCharacters?.forEach((name: string) => {
      const char = selectedScript.characters.find((c: any) => c.name === name);
      if (char) characters.push(char);
    });

    if (shot.refScene) {
      const scene = selectedScript.scenes.find(
        (s: any) => s.name === shot.refScene
      );
      if (scene) scenes.push(scene);
    }

    // 传递剧本信息
    const scriptInfo = {
      scriptId: selectedScript.id,
      scriptTitle: selectedScript.title,
      shotIndex: shotIndex + 1 // 从1开始
    };

    onSelectShot(shot, characters, scenes, scriptInfo);
    onOpenChange(false);
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  // 点击遮罩关闭
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  return (
    <>
      {/* 遮罩层 - 隐藏时不渲染 */}
      <div
        className={cn(
          "fixed inset-0 z-50 bg-black/80 transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={handleBackdropClick}
      >
        {/* 弹窗内容 - 始终保持在 DOM 中 */}
        <div
          className={cn(
            "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50",
            "bg-[#111] border border-white/10 text-white rounded-lg shadow-xl",
            "w-[90vw] max-w-5xl h-[80vh] flex flex-col",
            "transition-all duration-200",
            open ? "scale-100 opacity-100" : "scale-95 opacity-0"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
            <h2 className="text-lg font-semibold">选择剧本镜头</h2>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleRefresh}
                className="h-8 w-8 text-gray-400 hover:text-white"
                title="刷新数据"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClose}
                className="h-8 w-8 text-gray-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 flex gap-4 overflow-hidden p-4">
            {/* Left: Scripts List */}
            <div className="w-64 border-r border-white/10 pr-4">
              <h3 className="text-sm font-semibold mb-3 text-gray-400">
                剧本列表
              </h3>
              <ScrollArea className="h-[calc(100%-2rem)]">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
                  </div>
                ) : scripts.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-8">
                    暂无已解析的剧本
                  </p>
                ) : (
                  <div className="space-y-2">
                    {scripts.map((script) => (
                      <button
                        key={script.id}
                        onClick={() => loadScriptDetail(script.id)}
                        className={`w-full text-left p-3 rounded-lg border transition-all ${
                          selectedScript?.id === script.id
                            ? "bg-purple-500/20 border-purple-500/50"
                            : "bg-white/5 border-white/10 hover:border-white/20"
                        }`}
                      >
                        <p className="text-sm font-medium line-clamp-1">
                          {script.title}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {script.shots?.length || 0} 个镜头
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>

            {/* Right: Script Detail */}
            <div className="flex-1 flex flex-col overflow-hidden min-w-0">
              {!selectedScript ? (
                <div className="flex-1 flex items-center justify-center text-gray-500">
                  <p>请选择一个剧本</p>
                </div>
              ) : (
                <div className="flex-1 overflow-hidden flex flex-col">
                  <h3 className="text-lg font-bold mb-4">
                    {selectedScript.title}
                  </h3>

                  <ScrollArea className="flex-1">
                    <div className="space-y-6 pr-4">
                      {/* Characters */}
                      {selectedScript.characters?.length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <Users className="w-4 h-4 text-purple-500" />
                            <h4 className="font-semibold">
                              人物 ({selectedScript.characters.length})
                            </h4>
                            <span className="text-xs text-gray-500">
                              点击加载到参考图
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            {selectedScript.characters.map((char: any) => (
                              <button
                                key={char.id}
                                onClick={() => {
                                  if (onSelectCharacter && char.imageUrl) {
                                    onSelectCharacter(char);
                                  }
                                }}
                                disabled={!char.imageUrl}
                                className={`bg-white/5 border border-white/10 rounded-lg p-2 text-left transition-all ${
                                  char.imageUrl
                                    ? "hover:border-purple-500/50 hover:bg-purple-500/10 cursor-pointer"
                                    : "opacity-50 cursor-not-allowed"
                                }`}
                              >
                                {char.imageUrl ? (
                                  <img
                                    src={toThumbnailUrl(char.imageUrl)}
                                    alt={char.name}
                                    className="w-full h-20 object-cover rounded mb-2"
                                  />
                                ) : (
                                  <div className="w-full h-20 bg-white/5 rounded mb-2 flex items-center justify-center text-xs text-gray-500">
                                    无图片
                                  </div>
                                )}
                                <p className="text-xs font-medium line-clamp-1">
                                  {char.name}
                                </p>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Scenes */}
                      {selectedScript.scenes?.length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <MapPin className="w-4 h-4 text-blue-500" />
                            <h4 className="font-semibold">
                              场景 ({selectedScript.scenes.length})
                            </h4>
                            <span className="text-xs text-gray-500">
                              点击加载到参考图
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            {selectedScript.scenes.map((scene: any) => (
                              <button
                                key={scene.id}
                                onClick={() => {
                                  if (onSelectScene && scene.imageUrl) {
                                    onSelectScene(scene);
                                  }
                                }}
                                disabled={!scene.imageUrl}
                                className={`bg-white/5 border border-white/10 rounded-lg p-2 text-left transition-all ${
                                  scene.imageUrl
                                    ? "hover:border-blue-500/50 hover:bg-blue-500/10 cursor-pointer"
                                    : "opacity-50 cursor-not-allowed"
                                }`}
                              >
                                {scene.imageUrl ? (
                                  <img
                                    src={toThumbnailUrl(scene.imageUrl)}
                                    alt={scene.name}
                                    className="w-full h-20 object-cover rounded mb-2"
                                  />
                                ) : (
                                  <div className="w-full h-20 bg-white/5 rounded mb-2 flex items-center justify-center text-xs text-gray-500">
                                    无图片
                                  </div>
                                )}
                                <p className="text-xs font-medium line-clamp-1">
                                  {scene.name}
                                </p>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Shots */}
                      {selectedScript.shots?.length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <Film className="w-4 h-4 text-amber-500" />
                            <h4 className="font-semibold">
                              镜头 ({selectedScript.shots.length})
                            </h4>
                          </div>
                          <div className="space-y-2">
                            {selectedScript.shots.map(
                              (shot: any, index: number) => {
                                const isRef2Video = shot.mode === "ref2video";

                                return (
                                  <button
                                    key={shot.id || index}
                                    onClick={() => handleSelectShot(shot, index)}
                                    className="w-full text-left bg-white/5 border border-white/10 rounded-lg p-3 hover:border-amber-500/50 transition-all"
                                  >
                                    <div className="flex items-start gap-3">
                                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-500 text-xs font-bold">
                                        {index + 1}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex flex-wrap gap-1 mb-2">
                                          <span
                                            className={`px-2 py-0.5 rounded text-xs ${
                                              isRef2Video
                                                ? "bg-orange-500/20 text-orange-400"
                                                : "bg-green-500/20 text-green-400"
                                            }`}
                                          >
                                            {isRef2Video
                                              ? "🎬 ref2video"
                                              : "🖼️ img2video"}
                                          </span>
                                          {shot.refCharacters?.map(
                                            (name: string, i: number) => (
                                              <span
                                                key={`char-${i}`}
                                                className="px-2 py-0.5 rounded text-xs bg-purple-500/20 text-purple-400"
                                              >
                                                👤 {name}
                                              </span>
                                            )
                                          )}
                                          {shot.refScene && (
                                            <span className="px-2 py-0.5 rounded text-xs bg-blue-500/20 text-blue-400">
                                              🏞️ {shot.refScene}
                                            </span>
                                          )}
                                        </div>
                                        <p className="text-sm font-medium mb-1">
                                          {isRef2Video
                                            ? shot.prompt
                                            : shot.startFrame}
                                        </p>
                                        {!isRef2Video && shot.motion && (
                                          <p className="text-xs text-cyan-400 mb-1">
                                            🎬 {shot.motion}
                                          </p>
                                        )}
                                        {shot.dialogue && (
                                          <p className="text-xs text-gray-400 italic">
                                            "{shot.dialogue}"
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  </button>
                                );
                              }
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
