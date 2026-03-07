"use client";

import { Check, FileText, Palette, Film, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import { AiAgentWorkflow } from "../page";

interface Props {
  currentStep: number;
  workflow: AiAgentWorkflow;
  onStepChange?: (step: number) => void;
}

const STEPS = [
  { id: 1, name: "剧本输入", icon: FileText, description: "选择风格，AI分析剧本" },
  { id: 2, name: "资产管理", icon: Palette, description: "生成人物、场景素材" },
  { id: 3, name: "分镜管理", icon: Film, description: "编辑提示词，生成首帧" },
  { id: 4, name: "视频编辑", icon: Video, description: "生成视频，导出成片" },
];

export default function StepIndicator({ currentStep, workflow, onStepChange }: Props) {
  const getStepStatus = (stepId: number) => {
    if (stepId === 1 && workflow.step1Completed) return "completed";
    if (stepId === 2 && workflow.step2Completed) return "completed";
    if (stepId === 3 && workflow.step3Completed) return "completed";
    if (stepId === 4 && workflow.step4Completed) return "completed";
    if (stepId === currentStep) return "current";
    if (stepId < currentStep) return "completed";
    return "upcoming";
  };

  // 判断步骤是否可点击（已完成的步骤或当前步骤之前的步骤都可以点击）
  const isClickable = (stepId: number) => {
    return stepId <= currentStep || getStepStatus(stepId) === "completed";
  };

  const handleStepClick = (stepId: number) => {
    if (onStepChange && isClickable(stepId)) {
      onStepChange(stepId);
    }
  };

  return (
    <div className="relative border-b border-white/5 bg-black/10 backdrop-blur-sm">
      <div className="max-w-5xl mx-auto px-6 py-5">
        <div className="flex items-center justify-between">
          {STEPS.map((step, index) => {
            const status = getStepStatus(step.id);
            const Icon = step.icon;
            const clickable = isClickable(step.id);
            
            return (
              <div key={step.id} className="flex items-center flex-1">
                {/* Step Item */}
                <button
                  onClick={() => handleStepClick(step.id)}
                  disabled={!clickable}
                  className={cn(
                    "group flex items-center gap-4 px-4 py-3 rounded-2xl transition-all duration-300",
                    status === "current" && "bg-gradient-to-r from-purple-500/20 to-indigo-500/20 shadow-lg shadow-purple-500/10",
                    status === "upcoming" && "opacity-40",
                    clickable && "cursor-pointer hover:bg-white/5",
                    !clickable && "cursor-not-allowed"
                  )}
                >
                  {/* Icon Circle */}
                  <div className={cn(
                    "relative w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300",
                    status === "completed" && "bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-lg shadow-emerald-500/30",
                    status === "current" && "bg-gradient-to-br from-purple-500 to-indigo-600 shadow-lg shadow-purple-500/30",
                    status === "upcoming" && "bg-zinc-800/80 border border-zinc-700"
                  )}>
                    {status === "completed" ? (
                      <Check className="w-5 h-5 text-white" strokeWidth={3} />
                    ) : status === "current" ? (
                      <>
                        <Icon className="w-5 h-5 text-white" />
                        <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-purple-400 animate-pulse" />
                      </>
                    ) : (
                      <Icon className="w-5 h-5 text-zinc-500" />
                    )}
                  </div>
                  
                  {/* Text */}
                  <div className="text-left">
                    <div className={cn(
                      "text-sm font-semibold transition-colors",
                      status === "current" && "text-white",
                      status === "completed" && "text-emerald-400",
                      status === "upcoming" && "text-zinc-500"
                    )}>
                      {step.name}
                    </div>
                    <div className={cn(
                      "text-xs mt-0.5 transition-colors",
                      status === "current" ? "text-purple-300/80" : "text-zinc-600"
                    )}>
                      {step.description}
                    </div>
                  </div>
                </button>

                {/* Connector */}
                {index < STEPS.length - 1 && (
                  <div className="flex-1 mx-2 h-px relative">
                    <div className="absolute inset-0 bg-zinc-800" />
                    <div 
                      className={cn(
                        "absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500",
                        getStepStatus(step.id + 1) !== "upcoming" ? "w-full" : "w-0"
                      )} 
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
