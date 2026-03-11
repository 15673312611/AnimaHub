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
import { cn, toThumbnailUrl } from "@/lib/utils";
import { useImageModels } from "@/lib/useImageModels";
import api from "@/lib/api";

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onConfirm?: (config: FusionImageConfig) => void;
    shotNumber?: number;
    initialPrompt?: string;
    projectId?: string;
    dialogueHint?: string;
}

export interface FusionImageConfig {
    characterRefs: number[];
    sceneRefs: number[];
    propRefs: number[];
    effectRefs: number[];
    count: number;
    prompt: string;
    globalPrompt: string;
    aspectRatio: string;
    model: string;
}

type RefType = "char" | "scene" | "prop" | "effect";

const MAX_PER_TYPE = 14;

export default function FusionImageModal({
    isOpen, onClose, onConfirm, shotNumber = 1, initialPrompt = "", projectId, dialogueHint
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

    // 选中的素材ID
    const [selectedCharIds, setSelectedCharIds] = useState<number[]>([]);
    const [selectedSceneIds, setSelectedSceneIds] = useState<number[]>([]);
    const [selectedPropIds, setSelectedPropIds] = useState<number[]>([]);
    const [selectedEffectIds, setSelectedEffectIds] = useState<number[]>([]);

    // 素材选择器状态
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
            case "char": return projectAssets.characters || [];
            case "scene": return projectAssets.scenes || [];
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
        onConfirm?.({
            characterRefs: selectedCharIds,
            sceneRefs: selectedSceneIds,
            propRefs: selectedPropIds,
            effectRefs: selectedEffectIds,
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
                        {type === "char" && (
                            <div className="w-4 h-4 rounded bg-blue-500/20 flex items-center justify-center ml-1">
                                <span className="text-blue-400 text-[10px]">i</span>
                            </div>
                        )}
                    </div>
                </div>
                <div className="rounded-xl border border-dashed border-zinc-700 bg-[#0c0c0e] p-4 min-h-[160px] relative">
                    {items.length > 0 ? (
                        <div className="flex gap-3 flex-wrap">
                            {items.map(item => (
                                <div key={item.id} className="relative group">
                                    <div className="w-20 h-20 rounded-lg overflow-hidden border border-zinc-700">
                                        <img src={toThumbnailUrl(item.imageUrl || "", 200)} className="w-full h-full object-cover" />
                                    </div>
                                    <button
                                        onClick={() => setter(ids.filter(i => i !== item.id))}
                                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full py-4">
                            <div className="w-16 h-16 rounded-lg border border-dashed border-zinc-700 flex items-center justify-center mb-3">
                                <ImageIcon className="w-8 h-8 text-blue-500/60" />
                            </div>
                            <p className="text-sm text-zinc-400 mb-1">上传图片</p>
                            <p className="text-xs text-zinc-600">JPG、PNG格式，最大10MB</p>
                        </div>
                    )}
                    <Button
                        onClick={() => setActiveSelector(type)}
                        className="absolute bottom-4 right-4 bg-indigo-600 hover:bg-indigo-500 text-white text-sm h-9 px-4"
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
                    <DialogTitle>融图创作 - 分镜号{shotNumber}</DialogTitle>
                </VisuallyHidden>
                {/* Header */}
                <div className="flex-shrink-0 bg-[#1a1a22] px-6 py-4 flex items-center justify-center relative">
                    <div className="flex items-center gap-2">
                        <span className="text-lg font-bold">分镜号{shotNumber}</span>
                        <div className="w-5 h-5 rounded bg-blue-500/20 flex items-center justify-center">
                            <span className="text-blue-400 text-xs">i</span>
                        </div>
                    </div>
                    <div className="absolute right-6 flex items-center gap-2">
                        <Button variant="outline" size="sm" className="h-8 px-4 border-zinc-600 text-zinc-300 hover:text-white bg-transparent">
                            下一分镜
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 px-4 border-emerald-700 text-emerald-400 hover:text-emerald-300 bg-transparent">
                            视频创作
                        </Button>
                    </div>
                    <Button 
                        size="icon" variant="ghost" 
                        className="absolute right-2 top-2 h-8 w-8 text-zinc-500 hover:text-white" 
                        onClick={onClose}
                    >
                        <X className="w-4 h-4" />
                    </Button>
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 custom-scrollbar">
                    {/* 选择模型 */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-bold text-white">选择模型</span>
                            <Button variant="outline" size="sm" className="h-8 px-4 border-cyan-600 text-cyan-400 hover:text-cyan-300 bg-transparent">
                                COMFYUI定制
                            </Button>
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
                            <DropdownMenuContent className="bg-zinc-900 border-zinc-700/50 shadow-xl shadow-black/40 w-[--radix-dropdown-menu-trigger-width]">
                                {models.map(m => (
                                    <DropdownMenuItem
                                        key={m.value}
                                        onClick={() => setModel(m.value)}
                                        className={cn("py-3 text-zinc-200 focus:bg-zinc-800 focus:text-white cursor-pointer", model === m.value && "bg-emerald-500/10 text-emerald-300")}
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

                    {/* 场景 + 道具 */}
                    <div className="grid grid-cols-2 gap-4">
                        {renderRefBlock("scene", "场景参考图")}
                        {renderRefBlock("prop", "道具参考图")}
                    </div>

                    {/* 次太参考图 + 特效参考图 */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-sm font-bold text-white">次太参考图</span>
                                <span className="text-xs text-zinc-500">(共0/{MAX_PER_TYPE}张)</span>
                            </div>
                            <div className="rounded-xl border border-dashed border-zinc-700 bg-[#0c0c0e] p-4 min-h-[160px] relative">
                                <div className="flex flex-col items-center justify-center h-full py-4">
                                    <div className="w-16 h-16 rounded-lg border border-dashed border-zinc-700 flex items-center justify-center mb-3">
                                        <ImageIcon className="w-8 h-8 text-blue-500/60" />
                                    </div>
                                    <p className="text-sm text-zinc-400 mb-1">上传图片</p>
                                    <p className="text-xs text-zinc-600">JPG、PNG格式，最大10MB</p>
                                </div>
                                <Button className="absolute bottom-4 right-4 bg-indigo-600 hover:bg-indigo-500 text-white text-sm h-9 px-4">
                                    选择素材
                                </Button>
                            </div>
                        </div>
                        {renderRefBlock("effect", "特效参考图")}
                    </div>

                    {/* 提示词 */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-bold text-white">提示词</span>
                            <Button variant="outline" size="sm" className="h-8 px-4 border-cyan-600 text-cyan-400 hover:text-cyan-300 bg-transparent">
                                推荐提示词
                            </Button>
                        </div>
                        <p className="text-xs text-zinc-500 mb-2">台词提示: {dialogueHint || "null"}</p>
                        <Textarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder="输入提示词描述画面..."
                            className="bg-[#1e1e26] border-zinc-700 text-sm min-h-[140px] resize-none"
                        />
                    </div>

                    {/* 全局提示词 */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-white">全局提示词</span>
                                <span className="text-xs text-zinc-500">(非必填，输入后会追加到提示词中)</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button variant="outline" size="sm" className="h-8 px-4 border-cyan-600 text-cyan-400 hover:text-cyan-300 bg-transparent">
                                    选择风格
                                </Button>
                                <Button variant="outline" size="sm" className="h-8 px-4 border-cyan-600 text-cyan-400 hover:text-cyan-300 bg-transparent">
                                    更新全局提示词
                                </Button>
                            </div>
                        </div>
                        <Textarea
                            value={globalPrompt}
                            onChange={(e) => setGlobalPrompt(e.target.value)}
                            placeholder="请输入全局提示词"
                            className="bg-[#1e1e26] border-zinc-700 text-sm min-h-[140px] resize-none"
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
                        <DropdownMenuContent className="bg-zinc-900/95 backdrop-blur-xl border-zinc-700/50 shadow-xl shadow-black/20 text-white">
                            {["16:9", "9:16", "1:1", "4:3", "3:4"].map(r => (
                                <DropdownMenuItem 
                                    key={r} 
                                    onClick={() => {
                                        setAspectRatio(r);
                                        localStorage.setItem('storyboard_aspectRatio', r);
                                    }}
                                    className={cn(
                                        "cursor-pointer focus:bg-zinc-800 focus:text-white",
                                        aspectRatio === r && "bg-emerald-500/10 text-emerald-400"
                                    )}
                                >
                                    {r}
                                </DropdownMenuItem>
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
                        <DropdownMenuContent className="bg-zinc-900/95 backdrop-blur-xl border-zinc-700/50 shadow-xl shadow-black/20 text-white">
                            {[1, 2, 4].map(n => (
                                <DropdownMenuItem 
                                    key={n} 
                                    onClick={() => setCount(n)}
                                    className={cn(
                                        "cursor-pointer focus:bg-zinc-800 focus:text-white",
                                        count === n && "bg-emerald-500/10 text-emerald-400"
                                    )}
                                >
                                    {n}张
                                </DropdownMenuItem>
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
