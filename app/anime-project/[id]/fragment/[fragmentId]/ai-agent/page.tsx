/**
 * ⚠️ 【已弃用 - DEPRECATED】
 * 此页面将被完全重写，当前版本已标记为弃用
 * 
 * 弃用原因:
 * - 步骤式流程不够灵活
 * - 缺少专业的镜头编辑界面
 * - 右侧抽屉式交互缺失
 * - 整体布局和细节不够专业
 * 
 * 新版本设计文档: .kiro/specs/ai-agent-redesign/requirements.md
 * 
 * 请勿修改此文件，等待新版本完成后替换
 */

"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast-provider";
import api from "@/lib/api";
import Link from "next/link";
import { useAiAgentWebSocket, AiAgentWebSocketMessage } from "@/lib/useWebSocket";

// 步骤组件
import Step1Script from "./components/Step1Script";
import Step2Assets from "./components/Step2Assets";
import Step3Shots from "./components/Step3Shots";
import Step4Videos from "./components/Step4Videos";
import StepIndicator from "./components/StepIndicator";

export interface AiAgentWorkflow {
  id: number;
  projectId: number;
  fragmentId: number;
  title: string;
  styleType: string;
  customStyle: string | null;
  scriptContent: string | null;
  maxShots: number;
  aiAnalysisStatus: string;
  currentStep: number;
  step1Completed: boolean;
  step2Completed: boolean;
  step3Completed: boolean;
  step4Completed: boolean;
  characterTotal: number;
  characterCompleted: number;
  sceneTotal: number;
  sceneCompleted: number;
  shotTotal: number;
  shotImageCompleted: number;
  shotVideoCompleted: number;
  // 素材风格模板 ID
  characterStyleTemplateId: number | null;
  sceneStyleTemplateId: number | null;
  itemStyleTemplateId: number | null;
  characters: AiAgentCharacter[];
  scenes: AiAgentScene[];
  shots: AiAgentShot[];
}

export interface AiAgentCharacter {
  id: number;
  name: string;
  identity: string | null;
  coreFeatures: string | null;
  prompt: string | null;
  appearInShots: number[];
  imageUrl: string | null;
  imageStatus: string;
  sortOrder: number;
}

export interface AiAgentScene {
  id: number;
  name: string;
  type: string | null;
  spaceFeatures: string | null;
  prompt: string | null;
  usedInShots: number[];
  imageUrl: string | null;
  imageStatus: string;
  sortOrder: number;
}

export interface AiAgentShot {
  id: number;
  shotMode: string; // normal=图生视频, first_last=首尾帧模式
  sortOrder: number;
  description: string | null;
  dialogue: string | null;
  duration: number;
  refCharacterIds: number[];
  refSceneId: number | null;
  firstFramePrompt: string | null;
  cameraMovement: string | null;
  videoPrompt: string | null;
  endState: string | null;
  userFirstFramePrompt: string | null;
  userVideoPrompt: string | null;
  firstFrameUrl: string | null;
  endFrameUrl: string | null; // 尾帧图片URL（首尾帧模式）
  firstFrameStatus: string;
  videoUrl: string | null;
  videoStatus: string;
  lastFrameUrl: string | null;
  status: string;
}

export default function AiAgentPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  
  const projectId = Number(params.id);
  const fragmentId = Number(params.fragmentId);
  
  const [workflow, setWorkflow] = useState<AiAgentWorkflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(1);

  // 根据工作流状态计算应该显示的步骤
  const calculateCurrentStep = (wf: AiAgentWorkflow): number => {
    // 如果第4步完成，显示第4步
    if (wf.step4Completed) return 4;
    // 如果第3步完成，显示第4步
    if (wf.step3Completed) return 4;
    // 如果第2步完成，显示第3步
    if (wf.step2Completed) return 3;
    // 如果第1步完成，显示第2步
    if (wf.step1Completed) return 2;
    // 否则显示第1步
    return 1;
  };

  const fetchWorkflow = useCallback(async (isInitial = false, prevWorkflow?: AiAgentWorkflow | null) => {
    try {
      const res = await api.get(`/ai-agent/workflows/by-fragment`, {
        params: { projectId, fragmentId }
      });
      
      if (res.data) {
        const newWorkflow = res.data as AiAgentWorkflow;
        console.log("📦 Workflow loaded:", {
          step1Completed: newWorkflow.step1Completed,
          aiAnalysisStatus: newWorkflow.aiAnalysisStatus,
          isInitial
        });
        
        setWorkflow(newWorkflow);
        
        // 初始加载时自动跳转到最新步骤
        if (isInitial) {
          const targetStep = calculateCurrentStep(newWorkflow);
          console.log("🎯 Initial load, jumping to step:", targetStep);
          setCurrentStep(targetStep);
        }
        // 轮询时检测：如果第一步刚完成（之前未完成，现在完成了），自动跳转到第二步
        else if (prevWorkflow && !prevWorkflow.step1Completed && newWorkflow.step1Completed) {
          console.log("✅ Step 1 just completed, auto jumping to step 2");
          setCurrentStep(2);
        }
      } else {
        const createRes = await api.post(`/ai-agent/workflows`, {
          projectId,
          fragmentId,
          title: "AI Agent 工作流"
        });
        setWorkflow(createRes.data);
        setCurrentStep(1);
      }
    } catch (error: any) {
      if (error.response?.status === 404 || !error.response?.data) {
        try {
          const createRes = await api.post(`/ai-agent/workflows`, {
            projectId,
            fragmentId,
            title: "AI Agent 工作流"
          });
          setWorkflow(createRes.data);
          setCurrentStep(1);
        } catch (createError) {
          toast("创建工作流失败", "error");
        }
      } else {
        toast("加载工作流失败", "error");
      }
    } finally {
      setLoading(false);
    }
  }, [projectId, fragmentId, toast]);

  // 包装 fetchWorkflow 供子组件调用（轮询模式）
  const handleUpdate = useCallback(() => {
    fetchWorkflow(false, workflow);
  }, [fetchWorkflow, workflow]);

  // WebSocket 消息处理
  const handleWebSocketMessage = useCallback((message: AiAgentWebSocketMessage) => {
    console.log("📥 AI Agent WebSocket 消息:", message.type, message);
    
    // 收到任何消息都刷新数据
    fetchWorkflow(false, workflow);
    
    // 处理失败消息，显示 toast
    if (message.type.includes("FAILED") && message.error) {
      toast(message.error, "error");
    }
  }, [fetchWorkflow, workflow, toast]);

  // 订阅 WebSocket
  useAiAgentWebSocket(workflow?.id || null, handleWebSocketMessage, handleUpdate);

  useEffect(() => {
    fetchWorkflow(true); // 初始加载，自动跳转到最新步骤
  }, [fetchWorkflow]);

  useEffect(() => {
    if (!workflow) return;
    
    const hasGenerating = 
      workflow.aiAnalysisStatus === "ANALYZING" ||
      workflow.characters?.some(c => c.imageStatus === "GENERATING") ||
      workflow.scenes?.some(s => s.imageStatus === "GENERATING") ||
      workflow.shots?.some(s => s.firstFrameStatus === "GENERATING" || s.videoStatus === "GENERATING");
    
    if (!hasGenerating) return;
    
    // 轮询作为 WebSocket 的备用方案，降低频率到 10 秒
    const interval = setInterval(() => fetchWorkflow(false, workflow), 10000);
    return () => clearInterval(interval);
  }, [workflow, fetchWorkflow]);

  const handleStepChange = (step: number) => {
    // 允许回退到之前的步骤
    if (step < currentStep) {
      setCurrentStep(step);
      return;
    }
    // 前进时需要验证
    if (step > 1 && !workflow?.step1Completed) {
      toast("请先完成第一步", "error");
      return;
    }
    if (step > 2 && !workflow?.step2Completed) {
      toast("请先完成第二步", "error");
      return;
    }
    if (step > 3 && !workflow?.step3Completed) {
      toast("请先完成第三步", "error");
      return;
    }
    setCurrentStep(step);
  };

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 text-white">
        <div className="flex flex-col items-center gap-6">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-purple-500/20 blur-xl animate-pulse" />
            <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-white animate-pulse" />
            </div>
          </div>
          <div className="text-center">
            <p className="text-lg font-medium text-white mb-1">AI Agent 启动中</p>
            <p className="text-sm text-zinc-500">正在初始化智能创作工作流...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 text-white">
        <p className="text-zinc-500">工作流不存在</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 text-white flex flex-col">
      {/* 背景装饰 */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative h-16 border-b border-white/5 bg-black/20 backdrop-blur-xl px-6 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <Link href={`/anime-project/${projectId}/fragment/${fragmentId}`}>
            <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white hover:bg-white/5 rounded-xl">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-semibold bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
                AI Agent 在线
              </h1>
              <p className="text-xs text-zinc-500">智能创作工作流</p>
            </div>
          </div>
        </div>
      </header>

      {/* Step Indicator */}
      <StepIndicator 
        currentStep={currentStep} 
        workflow={workflow}
        onStepChange={handleStepChange}
      />

      {/* Main Content */}
      <div className="relative flex-1 overflow-hidden">
        {currentStep === 1 && (
          <Step1Script 
            workflow={workflow} 
            onUpdate={handleUpdate}
            onNext={() => setCurrentStep(2)}
          />
        )}
        {currentStep === 2 && (
          <Step2Assets 
            workflow={workflow} 
            onUpdate={handleUpdate}
            onNext={() => setCurrentStep(3)}
            onBack={() => setCurrentStep(1)}
          />
        )}
        {currentStep === 3 && (
          <Step3Shots 
            workflow={workflow} 
            onUpdate={handleUpdate}
            onNext={() => setCurrentStep(4)}
            onBack={() => setCurrentStep(2)}
          />
        )}
        {currentStep === 4 && (
          <Step4Videos 
            workflow={workflow} 
            onUpdate={handleUpdate}
            onBack={() => setCurrentStep(3)}
          />
        )}
      </div>
    </div>
  );
}
