"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { useToast } from "@/components/ui/toast-provider";
import api from "@/lib/api";
import { useAiAgentWebSocket, type AiAgentWebSocketMessage } from "@/lib/useWebSocket";
import StoryboardWorkbench from "./components/StoryboardWorkbench";
import type { WorkflowData } from "./types";
import { dispatchShotVideoUpdated, persistShotVideoFailure } from "./shotSlotVideoStorage";

function isLikelyMojibake(text: string): boolean {
  if (!text) return false;
  // 使用异常 Unicode 区段判断乱码，避免硬编码乱码字形
  return /[\uFFFD\u02A0-\u02FF\u0370-\u03FF\u0590-\u06FF]/.test(text);
}

function normalizeDisplayText(value: unknown, fallback = ""): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return fallback;
  return isLikelyMojibake(text) ? fallback : text;
}

function sanitizeWorkflowPayload(data: WorkflowData): WorkflowData {
  return {
    ...data,
    title: normalizeDisplayText(data.title, "AI Agent 工作流"),
  };
}

export default function StoryboardPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();

  const projectId = Number(params.id);
  const fragmentId = Number(params.fragmentId);

  const [workflow, setWorkflow] = useState<WorkflowData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchWorkflow = useCallback(async () => {
    try {
      const res = await api.get(`/ai-agent/workflows/by-fragment`, {
        params: { projectId, fragmentId },
      });

      if (res.data) {
        setWorkflow(sanitizeWorkflowPayload(res.data));
      } else {
        const createRes = await api.post(`/ai-agent/workflows`, {
          projectId,
          fragmentId,
          title: "AI Agent 工作流",
        });
        setWorkflow(sanitizeWorkflowPayload(createRes.data));
      }
    } catch (error: any) {
      if (error.response?.status === 404) {
        try {
          const createRes = await api.post(`/ai-agent/workflows`, {
            projectId,
            fragmentId,
            title: "AI Agent 工作流",
          });
          setWorkflow(sanitizeWorkflowPayload(createRes.data));
        } catch {
          toast("创建工作流失败", "error");
        }
      } else {
        toast("加载工作流失败", "error");
      }
    } finally {
      setLoading(false);
    }
  }, [projectId, fragmentId, toast]);

  const fetchWorkflowRef = useRef(fetchWorkflow);
  fetchWorkflowRef.current = fetchWorkflow;

  // WebSocket 消息处理
  const handleWebSocketMessage = useCallback((message: AiAgentWebSocketMessage) => {
    console.log("WebSocket:", message.type);

    // 首帧更新：通知 ShotCard 重新拉取槽位
    if (
      message.type === "AI_AGENT_SHOT_FIRSTFRAME_COMPLETED" &&
      message.shotId
    ) {
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("ai-agent-shot-image-updated", {
            detail: { shotId: message.shotId },
          })
        );
      }
    }

    // 视频更新：通知 ShotCard 刷新
    if (message.type === "AI_AGENT_SHOT_VIDEO_COMPLETED" && message.shotId) {
      try {
        dispatchShotVideoUpdated(message.shotId);
        setTimeout(() => {
          try {
            dispatchShotVideoUpdated(message.shotId!);
          } catch (err) {
            console.error("通知 ShotCard 刷新视频槽位失败", err);
          }
        }, 1200);
      } catch (e) {
        console.error("通知 ShotCard 刷新视频槽位失败", e);
      }
    }

    // 视频失败：写入本地 pending 失败记录，供 ShotCard 展示
    if (
      message.shotId &&
      message.type.includes("SHOT_VIDEO") &&
      message.type.includes("FAILED")
    ) {
      console.log("[WebSocket] 收到视频失败消息:", {
        type: message.type,
        shotId: message.shotId,
        slotIndex: (message as any).slotIndex,
        imageUrl: message.imageUrl || "(未提供)",
        error: message.error,
        taskId: (message as any).taskId,
        fullMessage: message,
      });
      try {
        const slotIndex = (message as any)?.slotIndex;
        persistShotVideoFailure({
          shotId: message.shotId,
          imageUrl: message.imageUrl,
          errorMessage: message.error || "视频生成失败",
          slotIndex: typeof slotIndex === "number" ? slotIndex : undefined,
        });
      } catch (e) {
        console.error("处理视频失败消息异常", e);
      }
    }

    // 任务取消：清理 pending 状态并刷新
    if (message.type === "AI_AGENT_TASK_CANCELLED" && message.targetId) {
      try {
        dispatchShotVideoUpdated(message.targetId);
      } catch (e) {
        console.error("处理任务取消消息失败", e);
      }
    }

    fetchWorkflowRef.current();

    if (message.type.includes("FAILED") && !message.type.includes("SHOT_VIDEO") && message.error) {
      toast(normalizeDisplayText(message.error, "执行失败"), "error");
    }
  }, [toast]);

  useAiAgentWebSocket(workflow?.id || null, handleWebSocketMessage, fetchWorkflow);

  useEffect(() => {
    fetchWorkflow();
  }, [fetchWorkflow]);

  // 轮询兜底
  useEffect(() => {
    if (!workflow) return;
    const hasGenerating =
      workflow.aiAnalysisStatus === "ANALYZING" ||
      workflow.characters?.some(c => c.imageStatus === "GENERATING") ||
      workflow.scenes?.some(s => s.imageStatus === "GENERATING") ||
      workflow.shots?.some(s => s.firstFrameStatus === "GENERATING" || s.videoStatus === "GENERATING");

    if (!hasGenerating) return;
    const interval = setInterval(fetchWorkflow, 8000);
    return () => clearInterval(interval);
  }, [workflow, fetchWorkflow]);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#1a1a1a] text-white">
        <div className="flex flex-col items-center gap-6">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-emerald-500/20 blur-xl animate-pulse" />
            <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-white animate-pulse" />
            </div>
          </div>
          <p className="text-zinc-400">加载分镜台...</p>
        </div>
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#1a1a1a] text-white">
        <p className="text-zinc-500">未找到工作流</p>
      </div>
    );
  }

  return (
    <StoryboardWorkbench
      workflow={workflow}
      projectId={projectId}
      fragmentId={fragmentId}
      onUpdate={fetchWorkflow}
      onBack={() => router.push(`/anime-project/${projectId}`)}
    />
  );
}
