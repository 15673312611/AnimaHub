"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast-provider";
import { 
  Loader2, Sparkles, ChevronRight, Film, Clapperboard, Camera, 
  Wand2, Users, MapPin, PenTool
} from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { AiAgentWorkflow } from "../page";

interface Props {
  workflow: AiAgentWorkflow;
  onUpdate: () => void;
  onNext: () => void;
}

const STYLE_OPTIONS = [
  { id: "2d_anime", name: "二维动漫", icon: Film, gradient: "from-pink-500 to-rose-500" },
  { id: "3d_anime", name: "三维动漫", icon: Clapperboard, gradient: "from-blue-500 to-cyan-500" },
  { id: "realistic", name: "真人电影", icon: Camera, gradient: "from-amber-500 to-orange-500" },
];

export default function Step1Script({ workflow, onUpdate, onNext }: Props) {
  const { toast } = useToast();
  
  const [styleType, setStyleType] = useState(workflow.styleType || "2d_anime");
  const [customStyle, setCustomStyle] = useState(workflow.customStyle || "");
  const [scriptContent, setScriptContent] = useState(workflow.scriptContent || "");
  const [maxShots, setMaxShots] = useState(workflow.maxShots || 30);
  const [localAnalyzing, setLocalAnalyzing] = useState(false);
  
  // 分析状态：本地状态或后端状态
  const isAnalyzing = localAnalyzing || workflow.aiAnalysisStatus === "ANALYZING";
  const isCompleted = workflow.step1Completed && workflow.aiAnalysisStatus === "COMPLETED";
  
  // 当后端状态变化时，同步清除本地状态
  useEffect(() => {
    if (workflow.aiAnalysisStatus !== "ANALYZING") {
      setLocalAnalyzing(false);
    }
  }, [workflow.aiAnalysisStatus]);

  const handleAnalyze = async () => {
    if (!scriptContent.trim()) {
      toast("请输入剧本内容", "error");
      return;
    }
    
    // 立即显示加载状态
    setLocalAnalyzing(true);
    
    // 先保存再分析
    try {
      await api.put(`/ai-agent/workflows/${workflow.id}/step1`, {
        styleType,
        customStyle: styleType === "custom" ? customStyle : null,
        scriptContent,
        maxShots
      });
    } catch (error) {
      toast("保存失败", "error");
      setLocalAnalyzing(false);
      return;
    }
    
    try {
      await api.post(`/ai-agent/workflows/${workflow.id}/analyze`);
      toast("AI 正在分析剧本...", "success");
      onUpdate(); // 触发父组件刷新，开始轮询
    } catch (error: any) {
      toast(error.response?.data?.error || "分析失败", "error");
      setLocalAnalyzing(false);
    }
  };

  const handleNext = () => {
    if (!workflow.step1Completed) {
      toast("请先完成 AI 分析", "error");
      return;
    }
    onNext();
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto p-6 flex flex-col gap-5">
        
        {/* 顶部设置栏：风格 + 分镜数 */}
        <div className="flex items-center gap-4 p-4 rounded-xl bg-zinc-900/30 border border-zinc-800/50">
          {/* 风格选择 */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-400 whitespace-nowrap">风格：</span>
            <div className="flex gap-1.5">
              {STYLE_OPTIONS.map((style) => {
                const Icon = style.icon;
                const isSelected = styleType === style.id;
                return (
                  <button
                    key={style.id}
                    onClick={() => setStyleType(style.id)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                      isSelected 
                        ? "bg-purple-500/20 text-purple-400 border border-purple-500/30" 
                        : "bg-zinc-800/50 text-zinc-400 border border-zinc-700/50 hover:bg-zinc-800"
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {style.name}
                  </button>
                );
              })}
              <button
                onClick={() => setStyleType("custom")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                  styleType === "custom" 
                    ? "bg-purple-500/20 text-purple-400 border border-purple-500/30" 
                    : "bg-zinc-800/50 text-zinc-400 border border-zinc-700/50 hover:bg-zinc-800"
                )}
              >
                <PenTool className="w-3.5 h-3.5" />
                自定义
              </button>
            </div>
          </div>

          {/* 自定义风格输入 */}
          {styleType === "custom" && (
            <Input
              value={customStyle}
              onChange={(e) => setCustomStyle(e.target.value)}
              placeholder="输入自定义风格..."
              className="flex-1 h-8 text-xs bg-black/30 border-zinc-700 rounded-lg"
            />
          )}

          {/* 分隔线 */}
          <div className="w-px h-6 bg-zinc-700" />

          {/* 最大分镜数 */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-400 whitespace-nowrap">分镜上限：</span>
            <Input
              type="number"
              value={maxShots}
              onChange={(e) => setMaxShots(Number(e.target.value))}
              min={1}
              max={100}
              className="w-16 h-8 text-xs text-center bg-black/30 border-zinc-700 rounded-lg"
            />
          </div>
        </div>

        {/* 剧本内容 - 主要区域 */}
        <div className="flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                <Wand2 className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-sm font-medium text-white">剧本内容</span>
              <span className="text-xs text-zinc-500">AI 将分析剧本，自动提取人物、场景并生成分镜</span>
            </div>
            <span className={cn(
              "text-xs px-2 py-1 rounded-lg",
              scriptContent.length > 100 ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-800 text-zinc-500"
            )}>
              {scriptContent.length} 字
            </span>
          </div>
          
          <Textarea
            value={scriptContent}
            onChange={(e) => setScriptContent(e.target.value)}
            placeholder={`支持输入：小说片段、剧本、故事大纲、分镜脚本等任何形式的内容

AI 会智能分析并提取人物、场景，自动生成分镜。如果你提供的是专业分镜脚本，AI 会尽量保留原有设计。

示例1 - 小说片段：
林动缓缓睁开双眼，入目的是一片苍茫的天地。他站在悬崖之巅，衣袂飘飘，目光深邃地望向远方的云海。
"父亲，我一定会找到你的。"他低声说道，声音中带着坚定。

示例2 - 分镜脚本：
【镜头1】全景，山巅，清晨
画面：云雾缭绕的山巅，朝阳初升
人物：李逍遥站在悬崖边，白衣飘飘
动作：缓缓转身，目光坚定
对白：这一次，我一定要找到她...`}
            className="h-[500px] bg-zinc-900/30 border-zinc-800 focus:border-purple-500 rounded-xl resize-none text-sm leading-relaxed p-4"
          />
        </div>

        {/* 分析结果 */}
        {isCompleted && (
          <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <span className="font-medium text-emerald-400">AI 分析完成</span>
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-rose-500/10 flex items-center justify-center">
                    <Users className="w-3.5 h-3.5 text-rose-400" />
                  </div>
                  <span className="text-sm"><span className="text-white font-semibold">{workflow.characterTotal}</span> <span className="text-zinc-500">人物</span></span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-sky-500/10 flex items-center justify-center">
                    <MapPin className="w-3.5 h-3.5 text-sky-400" />
                  </div>
                  <span className="text-sm"><span className="text-white font-semibold">{workflow.sceneTotal}</span> <span className="text-zinc-500">场景</span></span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-purple-500/10 flex items-center justify-center">
                    <Film className="w-3.5 h-3.5 text-purple-400" />
                  </div>
                  <span className="text-sm"><span className="text-white font-semibold">{workflow.shotTotal}</span> <span className="text-zinc-500">分镜</span></span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            onClick={handleAnalyze}
            disabled={isAnalyzing || !scriptContent.trim()}
            className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 rounded-xl px-6 shadow-lg shadow-purple-500/25"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                AI 分析中...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                {isCompleted ? "重新分析" : "AI 分析剧本"}
              </>
            )}
          </Button>
          
          {isCompleted && (
            <Button 
              onClick={handleNext} 
              className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 rounded-xl px-6 shadow-lg shadow-emerald-500/25"
            >
              下一步
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
