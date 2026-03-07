"use client";

import { useState, useEffect } from "react";
import {
  ArrowLeft, ChevronDown, Check, Users, MapPin, Layers,
  Image as ImageIcon, Sparkles, Save, X, Plus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast-provider";
import { cn, toThumbnailUrl } from "@/lib/utils";
import api from "@/lib/api";
import type { WorkflowData, CharacterData, SceneData } from "../types";

interface Props {
  workflow: WorkflowData;
  characters: CharacterData[];
  scenes: SceneData[];
  selectedShotId: number | null;
  onUpdate: () => void;
  onBack: () => void;
}

export default function LeftPanel({
  workflow, characters, scenes, selectedShotId, onUpdate, onBack
}: Props) {
  const { toast } = useToast();
  const shots = workflow.shots || [];
  const selectedShot = shots.find(s => s.id === selectedShotId);

  // 编辑状态
  const [description, setDescription] = useState("");
  const [dialogue, setDialogue] = useState("");
  const [duration, setDuration] = useState(5);
  const [selectedCharIds, setSelectedCharIds] = useState<number[]>([]);
  const [selectedSceneId, setSelectedSceneId] = useState<number | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // 下拉状态
  const [charDropdownOpen, setCharDropdownOpen] = useState(false);
  const [sceneDropdownOpen, setSceneDropdownOpen] = useState(false);

  // 同步选中镜头数据
  useEffect(() => {
    if (selectedShot) {
      setDescription(selectedShot.description || "");
      setDialogue(selectedShot.dialogue || "");
      setDuration(selectedShot.duration || 5);
      setSelectedCharIds(selectedShot.refCharacterIds || []);
      setSelectedSceneId(selectedShot.refSceneId);
      setHasChanges(false);
    }
  }, [selectedShot]);

  // 监听变化
  useEffect(() => {
    if (selectedShot) {
      const changed =
        description !== (selectedShot.description || "") ||
        dialogue !== (selectedShot.dialogue || "") ||
        duration !== (selectedShot.duration || 5) ||
        JSON.stringify(selectedCharIds) !== JSON.stringify(selectedShot.refCharacterIds || []) ||
        selectedSceneId !== selectedShot.refSceneId;
      setHasChanges(changed);
    }
  }, [description, dialogue, duration, selectedCharIds, selectedSceneId, selectedShot]);

  // 保存编辑
  const handleSave = async () => {
    if (!selectedShot) return;
    try {
      await api.put(`/ai-agent/shots/${selectedShot.id}/details`, {
        description,
        dialogue,
        duration,
        refCharacterIds: selectedCharIds,
        refSceneId: selectedSceneId
      });
      toast("保存成功", "success");
      setHasChanges(false);
      onUpdate();
    } catch (error: any) {
      toast(error.response?.data?.error || "保存失败", "error");
    }
  };

  // 切换角色选择
  const toggleCharacter = (charId: number) => {
    if (selectedCharIds.includes(charId)) {
      setSelectedCharIds(prev => prev.filter(id => id !== charId));
    } else if (selectedCharIds.length < 3) {
      setSelectedCharIds(prev => [...prev, charId]);
    } else {
      toast("最多选择3个角色", "error");
    }
  };

  // 获取选中的角色
  const selectedChars = characters.filter(c => selectedCharIds.includes(c.id));
  const selectedScene = scenes.find(s => s.id === selectedSceneId);

  return (
    <div className="w-[340px] flex-shrink-0 bg-gradient-to-b from-[#1a1a1a] to-[#141414] flex flex-col border-r border-zinc-800/50">
      {/* 顶部标题 */}
      <div className="h-14 border-b border-zinc-800/50 px-4 flex items-center justify-between bg-[#1a1a1a]/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-8 h-8 rounded-lg bg-zinc-800/50 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-sm font-semibold text-white">镜头编辑</h2>
            <p className="text-[10px] text-zinc-500">Shot Editor</p>
          </div>
        </div>
        {selectedShot && (
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-medium">
              #{selectedShot.sortOrder}
            </span>
          </div>
        )}
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {selectedShot ? (
          <div className="p-4 space-y-5">
            {/* 镜头信息卡片 */}
            <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800/50">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <span className="text-xs font-medium text-zinc-300">镜头描述</span>
              </div>
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="描述这个镜头的画面内容..."
                className="min-h-[100px] bg-zinc-800/50 border-zinc-700/50 text-sm resize-none rounded-lg focus:border-emerald-500/50 focus:ring-emerald-500/20 placeholder:text-zinc-600"
              />
            </div>

            {/* 对白输入 */}
            <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800/50">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded-lg bg-amber-500/15 flex items-center justify-center">
                  <span className="text-amber-400 text-xs font-bold">"</span>
                </div>
                <span className="text-xs font-medium text-zinc-300">角色对白</span>
                <span className="text-[10px] text-zinc-600 ml-auto">可选</span>
              </div>
              <Textarea
                value={dialogue}
                onChange={e => setDialogue(e.target.value)}
                placeholder="输入角色对白..."
                className="min-h-[60px] bg-zinc-800/50 border-zinc-700/50 text-sm resize-none rounded-lg focus:border-amber-500/50 focus:ring-amber-500/20 placeholder:text-zinc-600"
              />
            </div>

            {/* 时长设置 */}
            <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-blue-500/15 flex items-center justify-center">
                    <span className="text-blue-400 text-[10px] font-bold">秒</span>
                  </div>
                  <span className="text-xs font-medium text-zinc-300">镜头时长</span>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={30}
                    value={duration}
                    onChange={e => setDuration(Number(e.target.value))}
                    className="w-16 h-8 bg-zinc-800/50 border-zinc-700/50 text-sm text-center rounded-lg"
                  />
                  <span className="text-xs text-zinc-500">秒</span>
                </div>
              </div>
            </div>

            {/* 角色选择 */}
            <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800/50">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-purple-500/15 flex items-center justify-center">
                    <Users className="w-3.5 h-3.5 text-purple-400" />
                  </div>
                  <span className="text-xs font-medium text-zinc-300">参考角色</span>
                </div>
                <span className="text-[10px] text-zinc-500">{selectedCharIds.length}/3</span>
              </div>

              {/* 已选角色预览 */}
              <div className="flex gap-2 mb-3">
                {selectedChars.map(char => (
                  <div key={char.id} className="relative group">
                    <div className="w-14 h-14 rounded-lg bg-zinc-800 overflow-hidden border-2 border-purple-500/30">
                      {char.imageUrl ? (
                        <img src={toThumbnailUrl(char.imageUrl, 100)} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Users className="w-5 h-5 text-zinc-600" />
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => toggleCharacter(char.id)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    >
                      <X className="w-3 h-3" />
                    </button>
                    <p className="text-[9px] text-zinc-500 text-center mt-1 truncate w-14">{char.name}</p>
                  </div>
                ))}
                {selectedChars.length < 3 && (
                  <button
                    onClick={() => setCharDropdownOpen(!charDropdownOpen)}
                    className="w-14 h-14 rounded-lg border-2 border-dashed border-zinc-700 hover:border-purple-500/50 flex items-center justify-center text-zinc-600 hover:text-purple-400 transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                )}
              </div>

              {/* 角色下拉选择 */}
              {charDropdownOpen && (
                <div className="bg-zinc-800/80 backdrop-blur-sm rounded-lg border border-zinc-700/50 max-h-48 overflow-y-auto">
                  {characters.map(char => (
                    <button
                      key={char.id}
                      onClick={() => toggleCharacter(char.id)}
                      disabled={selectedCharIds.length >= 3 && !selectedCharIds.includes(char.id)}
                      className={cn(
                        "w-full px-3 py-2 flex items-center gap-3 hover:bg-zinc-700/50 text-left transition-colors disabled:opacity-40",
                        selectedCharIds.includes(char.id) && "bg-purple-500/10"
                      )}
                    >
                      <div className="w-8 h-8 rounded-lg bg-zinc-700 overflow-hidden flex-shrink-0">
                        {char.imageUrl ? (
                          <img src={toThumbnailUrl(char.imageUrl, 76)} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Users className="w-4 h-4 m-2 text-zinc-500" />
                        )}
                      </div>
                      <span className="text-xs flex-1 text-zinc-300">{char.name}</span>
                      {selectedCharIds.includes(char.id) && (
                        <Check className="w-4 h-4 text-purple-400" />
                      )}
                    </button>
                  ))}
                  {characters.length === 0 && (
                    <div className="px-3 py-6 text-center text-zinc-500 text-xs">
                      暂无角色，请先在右侧添加
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 场景选择 */}
            <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800/50">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-cyan-500/15 flex items-center justify-center">
                    <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                  </div>
                  <span className="text-xs font-medium text-zinc-300">参考场景</span>
                </div>
                <span className="text-[10px] text-zinc-500">{selectedScene ? "1/1" : "0/1"}</span>
              </div>

              {/* 已选场景预览 */}
              {selectedScene ? (
                <div className="relative group mb-3">
                  <div className="w-full h-20 rounded-lg bg-zinc-800 overflow-hidden border-2 border-cyan-500/30">
                    {selectedScene.imageUrl ? (
                      <img src={toThumbnailUrl(selectedScene.imageUrl, 200)} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <MapPin className="w-6 h-6 text-zinc-600" />
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setSelectedSceneId(null)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                  >
                    <X className="w-3 h-3" />
                  </button>
                  <p className="text-[10px] text-zinc-500 text-center mt-1">{selectedScene.name}</p>
                </div>
              ) : (
                <button
                  onClick={() => setSceneDropdownOpen(!sceneDropdownOpen)}
                  className="w-full h-16 rounded-lg border-2 border-dashed border-zinc-700 hover:border-cyan-500/50 flex items-center justify-center text-zinc-600 hover:text-cyan-400 transition-colors mb-3"
                >
                  <Plus className="w-5 h-5 mr-1" />
                  <span className="text-xs">选择场景</span>
                </button>
              )}

              {/* 场景下拉选择 */}
              {sceneDropdownOpen && (
                <div className="bg-zinc-800/80 backdrop-blur-sm rounded-lg border border-zinc-700/50 max-h-48 overflow-y-auto">
                  {scenes.map(scene => (
                    <button
                      key={scene.id}
                      onClick={() => { setSelectedSceneId(scene.id); setSceneDropdownOpen(false); }}
                      className={cn(
                        "w-full px-3 py-2 flex items-center gap-3 hover:bg-zinc-700/50 text-left transition-colors",
                        selectedSceneId === scene.id && "bg-cyan-500/10"
                      )}
                    >
                      <div className="w-8 h-8 rounded-lg bg-zinc-700 overflow-hidden flex-shrink-0">
                        {scene.imageUrl ? (
                          <img src={toThumbnailUrl(scene.imageUrl, 76)} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <MapPin className="w-4 h-4 m-2 text-zinc-500" />
                        )}
                      </div>
                      <span className="text-xs flex-1 text-zinc-300">{scene.name}</span>
                      {selectedSceneId === scene.id && (
                        <Check className="w-4 h-4 text-cyan-400" />
                      )}
                    </button>
                  ))}
                  {scenes.length === 0 && (
                    <div className="px-3 py-6 text-center text-zinc-500 text-xs">
                      暂无场景，请先在右侧添加
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-zinc-500 p-8">
            <div className="w-20 h-20 rounded-2xl bg-zinc-800/50 flex items-center justify-center mb-4">
              <Layers className="w-10 h-10 opacity-30" />
            </div>
            <p className="text-sm font-medium mb-1">未选择镜头</p>
            <p className="text-xs text-zinc-600 text-center">在右侧列表中点击选择一个镜头进行编辑</p>
          </div>
        )}
      </div>

      {/* 底部保存按钮 */}
      {selectedShot && (
        <div className="p-4 border-t border-zinc-800/50 bg-[#1a1a1a]/80 backdrop-blur-sm">
          <Button
            className={cn(
              "w-full h-10 font-medium transition-all",
              hasChanges
                ? "bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-900/30"
                : "bg-zinc-700 text-zinc-400 cursor-not-allowed"
            )}
            onClick={handleSave}
            disabled={!hasChanges}
          >
            <Save className="w-4 h-4 mr-2" />
            {hasChanges ? "保存修改" : "无更改"}
          </Button>
        </div>
      )}

      {/* 自定义滚动条 */}
      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 2px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </div>
  );
}
