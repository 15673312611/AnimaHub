"use client";

import { useState, useEffect } from "react";
import {
    X, Check, Box, Image as ImageIcon, ChevronDown, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CharacterData, SceneData } from "../types";
import { cn, toThumbnailUrl } from "@/lib/utils";
import { useImageModels } from "@/lib/useImageModels";
import api from "@/lib/api";

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (config: GenerationConfig) => void;
    characters: CharacterData[];
    scenes: SceneData[];
    shotNumber?: number;
    initialPrompt?: string;
    projectId?: string;
    dialogueHint?: string;
}

export interface GenerationConfig {
    selectedrefs: number[];
    count: number;
    prompt?: string;
    globalPrompt?: string;
    aspectRatio?: string;
    model?: string;
}

type RefType = "char" | "scene" | "prop" | "effect";

const MAX_PER_TYPE = 14;

export default function GenerationConfigModal({
    isOpen, onClose, onConfirm, characters, scenes, shotNumber = 1, initialPrompt = "", projectId, dialogueHint
}: Props) {
    const { models, defaultModel, loading: modelsLoading } = useImageModels("project");

    const [model, setModel] = useState("");
    const [count, setCount] = useState(1);
    // 从 localStorage 读取之前的宽高比设置，默认 16:9
    const [aspectRatio, setAspectRatio] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('storyboard_aspectRatio') || "16:9";
        }
        return "16:9";
    });
    const [prompt, setPrompt] = useState(initialPrompt);
    const [globalPrompt, setGlobalPrompt] = useState("");

    // 素材数据
    const [projectAssets, setProjectAssets] = useState<{
        characters: any[];
        scenes: any[];
        props: any[];
        effects: any[];
    }>({ characters: [], scenes: [], props: [], effects: [] });
    const [publicAssets, setPublicAssets] = useState<any[]>([]);

    const [selectedCharIds, setSelectedCharIds] = useState<number[]>([]);
    const [selectedSceneIds, setSelectedSceneIds] = useState<number[]>([]);
    const [selectedPropIds, setSelectedPropIds] = useState<number[]>([]);
    const [selectedEffectIds, setSelectedEffectIds] = useState<number[]>([]);

    const [activeSelector, setActiveSelector] = useState<RefType | null>(null);
    const [selectorTab, setSelectorTab] = useState<"project" | "public">("project");

    useEffect(() => {
        if (defaultModel && !model) setModel(defaultModel);
    }, [defaultModel, model]);

    useEffect(() => {
        if (isOpen) {
            setPrompt(initialPrompt);
            loadAssets();
        }
    }, [isOpen, initialPrompt, projectId]);

    const loadAssets = async () => {
        try {
            if (projectId) {
                const res = await api.get(`/projects/${projectId}/assets`);
                setProjectAssets(res.data);
            }
            const publicRes = await api.get("/public-assets");
            setPublicAssets(publicRes.data || []);
        } catch (err) {
            console.error("Failed to load assets", err);
        }
    };

    const getProjectListForType = (type: RefType) => {
        switch (type) {
            case "char": return projectAssets.characters?.length ? projectAssets.characters : characters;
            case "scene": return projectAssets.scenes?.length ? projectAssets.scenes : scenes;
            case "prop": return projectAssets.props || [];
            case "effect": return projectAssets.effects || [];
            default: return [];
        }
    };

    const getPublicListForType = (type: RefType) => {
        const categoryMap: Record<RefType, string> = {
            char: "characters", scene: "scenes", prop: "props", effect: "effects"
        };
        return publicAssets.filter(a => a.category === categoryMap[type]);
    };

    const getActiveList = () => {
        if (!activeSelector) return [];
        return selectorTab === "project"
            ? getProjectListForType(activeSelector)
            : getPublicListForType(activeSelector);
    };

    const getSelectedIdsForType = (type: RefType) => {
        switch (type) {
            case "char": return selectedCharIds;
            case "scene": return selectedSceneIds;
            case "prop": return selectedPropIds;
            case "effect": return selectedEffectIds;
            default: return [];
        }
    };

    const getSetterForType = (type: RefType) => {
        switch (type) {
            case "char": return setSelectedCharIds;
            case "scene": return setSelectedSceneIds;
            case "prop": return setSelectedPropIds;
            case "effect": return setSelectedEffectIds;
        }
    };

    const toggleSelection = (id: number) => {
        if (!activeSelector) return;
        const current = getSelectedIdsForType(activeSelector);
        const isRemoving = current.includes(id);
        if (!isRemoving && current.length >= MAX_PER_TYPE) return;
        const next = isRemoving ? current.filter(i => i !== id) : [...current, id];
        const setter = getSetterForType(activeSelector);
        setter(next);
    };

    const handleConfirm = () => {
        onConfirm({
            selectedrefs: [...selectedCharIds, ...selectedSceneIds, ...selectedPropIds, ...selectedEffectIds],
            count, prompt, globalPrompt, aspectRatio, model
        });
    };

    const currentModel = models.find(m => m.value === model);

    const getTypeName = (type: RefType) => {
        switch (type) {
            case "char": return "角色";
            case "scene": return "场景";
            case "prop": return "道具";
            case "effect": return "特效";
        }
    };

    const getSelectedItemsForType = (type: RefType) => {
        const ids = getSelectedIdsForType(type);
        const projectList = getProjectListForType(type);
        const publicList = getPublicListForType(type);
        return [...projectList, ...publicList].filter(item => ids.includes(item.id));
    };

    // 渲染参考图区块
    const renderRefBlock = (type: RefType, title: string) => {
        const ids = getSelectedIdsForType(type);
        const items = getSelectedItemsForType(type);
        const setter = getSetterForType(type);

        return (
            <div>
                <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-bold text-white">{title}</span>
                    <div className="flex items-center gap-1">
                        <span className="text-xs text-zinc-500">(共{ids.length}/{MAX_PER_TYPE}张)</span>
                        {['char', 'scene', 'prop'].includes(type) && (
                            <div className="w-4 h-4 rounded bg-blue-500/20 flex items-center justify-center ml-1">
                                <span className="text-blue-400 text-[10px]">i</span>
                            </div>
                        )}
                    </div>
                </div>
                <div className="rounded-xl border border-dashed border-zinc-700 bg-[#0c0c0e] p-3 min-h-[120px] relative">
                    {items.length > 0 ? (
                        <div className="flex gap-2 flex-wrap">
                            {items.map(item => (
                                <div key={item.id} className="relative group">
                                    <div className="w-16 h-16 rounded-lg overflow-hidden border border-zinc-700">
                                        <img src={toThumbnailUrl(item.imageUrl || "", 200)} className="w-full h-full object-cover" />
                                    </div>
                                    <button
                                        onClick={() => setter(ids.filter(i => i !== item.id))}
                                        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <X className="w-2.5 h-2.5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full py-2">
                            <div className="w-12 h-12 rounded-lg border border-dashed border-zinc-700 flex items-center justify-center mb-2">
                                <ImageIcon className="w-6 h-6 text-blue-500/60" />
                            </div>
                            <p className="text-xs text-zinc-400 mb-0.5">上传图片</p>
                            <p className="text-[10px] text-zinc-600">JPG、PNG格式，最大10MB</p>
                        </div>
                    )}
                    <Button
                        onClick={() => setActiveSelector(type)}
                        className="absolute bottom-3 right-3 bg-indigo-600 hover:bg-indigo-500 text-white text-xs h-8 px-3"
                    >
                        选择素材
                    </Button>
                </div>
            </div>
        );
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-[720px] bg-[#14141a] border-zinc-800 text-white p-0 gap-0 overflow-hidden max-h-[90vh] flex flex-col [&>button]:hidden">
                <VisuallyHidden>
                    <DialogTitle>生成配置 - 分镜号{shotNumber}</DialogTitle>
                </VisuallyHidden>
                {/* Header */}
                <div className="flex-shrink-0 bg-[#1a1a22] px-6 py-4 flex items-center justify-center relative">
                    <div className="flex items-center gap-2">
                        <span className="text-lg font-bold">分镜号{shotNumber}</span>
                        <div className="w-5 h-5 rounded bg-blue-500/20 flex items-center justify-center">
                            <span className="text-blue-400 text-xs">i</span>
                        </div>
                    </div>
                    <Button
                        size="icon" variant="ghost"
                        className="absolute right-4 top-1/2 -translate-y-1/2 h-8 w-8 text-zinc-500 hover:text-white"
                        onClick={onClose}
                    >
                        <X className="w-4 h-4" />
                    </Button>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 custom-scrollbar">
                    {/* 选择模型 */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-bold text-white">选择模型</span>
                        </div>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="outline"
                                    className="w-full h-12 bg-[#1e1e26] border-zinc-700 text-white justify-between hover:bg-[#252530] px-4"
                                    disabled={modelsLoading}
                                >
                                    <span className="font-medium">{currentModel?.label || "选择模型..."}</span>
                                    {modelsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="bg-[#1e1e26] border-zinc-700 w-[--radix-dropdown-menu-trigger-width]">
                                {models.map(m => (
                                    <DropdownMenuItem
                                        key={m.value}
                                        onClick={() => setModel(m.value)}
                                        className={cn("py-3", model === m.value && "bg-emerald-500/10")}
                                    >
                                        <span>{m.label}</span>
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                        {currentModel && (
                            <p className="text-xs text-zinc-500 mt-2">模型版本: {currentModel.value}</p>
                        )}
                    </div>

                    {/* 角色参考图 */}
                    {renderRefBlock("char", "角色参考图")}

                    {/* 场景参考图 */}
                    {renderRefBlock("scene", "场景参考图")}

                    {/* 道具参考图 */}
                    {renderRefBlock("prop", "道具参考图")}

                    {/* 特效参考图 */}
                    {renderRefBlock("effect", "特效参考图")}

                    {/* 提示词 */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-bold text-white">提示词</span>
                            <Button variant="outline" size="sm" className="h-8 px-4 border-cyan-600 text-cyan-400 hover:text-cyan-300 bg-transparent">
                                推荐提示词
                            </Button>
                        </div>
                        <Textarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder="输入提示词描述画面..."
                            className="bg-[#1e1e26] border-zinc-700 text-sm min-h-[140px] resize-none custom-scrollbar"
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="flex-shrink-0 border-t border-zinc-800 bg-[#14141a] px-6 py-4 flex items-center gap-3">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="h-10 bg-[#1e1e26] border-zinc-700 text-white px-4 gap-2">
                                <span>{aspectRatio}</span>
                                <ChevronDown className="w-4 h-4 text-zinc-500" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="bg-[#1e1e26] border-zinc-700">
                            {["16:9", "9:16", "1:1", "4:3", "3:4"].map(r => (
                                <DropdownMenuItem key={r} onClick={() => {
                                    setAspectRatio(r);
                                    localStorage.setItem('storyboard_aspectRatio', r);
                                }}>{r}</DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="h-10 bg-[#1e1e26] border-zinc-700 text-white px-4 gap-2">
                                <span>{count}张</span>
                                <ChevronDown className="w-4 h-4 text-zinc-500" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="bg-[#1e1e26] border-zinc-700">
                            {[1, 2, 4].map(n => (
                                <DropdownMenuItem key={n} onClick={() => setCount(n)}>{n}张</DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <div className="flex-1" />

                    <Button
                        onClick={handleConfirm}
                        disabled={!model || modelsLoading}
                        className="h-10 bg-gradient-to-r from-emerald-400 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 text-black font-bold px-6 disabled:opacity-50"
                    >
                        立即生成
                        <span className="ml-2 flex items-center gap-1 text-sm">
                            12 <span className="text-cyan-600">◆</span>
                        </span>
                    </Button>
                </div>

                {/* Material Selector Overlay */}
                {activeSelector && (
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6 z-50">
                        <div className="bg-[#14141a] border border-zinc-800 rounded-xl w-full max-w-lg flex flex-col shadow-2xl overflow-hidden max-h-[80%]">
                            <div className="h-12 border-b border-zinc-800 flex items-center justify-between px-4">
                                <div className="flex items-center gap-2">
                                    <span className="font-bold">选择素材</span>
                                    <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded">
                                        {getTypeName(activeSelector)}
                                    </span>
                                </div>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-zinc-400 hover:text-white" onClick={() => setActiveSelector(null)}>
                                    <X className="w-4 h-4" />
                                </Button>
                            </div>

                            <div className="flex border-b border-zinc-800 px-4">
                                {(["project", "public"] as const).map(tab => (
                                    <button
                                        key={tab}
                                        onClick={() => setSelectorTab(tab)}
                                        className={cn(
                                            "py-3 px-4 text-sm font-medium border-b-2 transition-colors",
                                            selectorTab === tab ? "border-emerald-500 text-emerald-400" : "border-transparent text-zinc-500 hover:text-zinc-300"
                                        )}
                                    >
                                        {tab === "project" ? "项目素材库" : "公共素材库"}
                                    </button>
                                ))}
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 bg-[#0c0c0e] custom-scrollbar">
                                <div className="grid grid-cols-4 gap-3">
                                    {getActiveList().map(item => {
                                        const isSelected = getSelectedIdsForType(activeSelector).includes(item.id);
                                        const currentCount = getSelectedIdsForType(activeSelector).length;
                                        const canSelect = isSelected || currentCount < MAX_PER_TYPE;
                                        return (
                                            <div
                                                key={item.id}
                                                onClick={() => canSelect && toggleSelection(item.id)}
                                                className={cn(
                                                    "aspect-square rounded-lg border-2 relative cursor-pointer overflow-hidden transition-all",
                                                    isSelected ? "border-emerald-500" : canSelect ? "border-zinc-700 hover:border-zinc-500" : "border-zinc-800 opacity-40 cursor-not-allowed"
                                                )}
                                            >
                                                {item.imageUrl ? (
                                                    <img src={toThumbnailUrl(item.imageUrl, 200)} className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center bg-zinc-800">
                                                        <Box className="w-6 h-6 text-zinc-600" />
                                                    </div>
                                                )}
                                                {isSelected && (
                                                    <div className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center">
                                                        <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
                                                            <Check className="w-4 h-4 text-white" />
                                                        </div>
                                                    </div>
                                                )}
                                                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent pt-4 pb-1 px-1">
                                                    <p className="text-[10px] text-zinc-300 truncate text-center">{item.name}</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {getActiveList().length === 0 && (
                                        <div className="col-span-4 py-12 flex flex-col items-center text-zinc-600 gap-2">
                                            <ImageIcon className="w-8 h-8 opacity-50" />
                                            <span className="text-sm">暂无素材</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="p-4 border-t border-zinc-800 flex justify-end gap-2">
                                <Button onClick={() => setActiveSelector(null)} variant="ghost" className="h-9 text-zinc-400 hover:text-white">取消</Button>
                                <Button onClick={() => setActiveSelector(null)} className="h-9 bg-emerald-600 hover:bg-emerald-500 text-white px-4">
                                    确认选择 ({getSelectedIdsForType(activeSelector).length})
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
