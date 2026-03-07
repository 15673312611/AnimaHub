"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast-provider";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ImportDialog } from "../import-dialog";
import { DetailDialog } from "../detail-dialog";
import { ArrowLeft, CheckCircle2, Clapperboard, Loader2, PenTool, Play, Sparkles, Wand2, XCircle } from "lucide-react";
import api from "@/lib/api";
import { formatEpisodeToText } from "@/lib/script-workshop/format";
import type { DraftShot, ScriptWorkshopProjectRecord } from "@/lib/script-workshop/storage";
import {
  getScriptWorkshopProject,
  listScriptWorkshopProjects,
  upsertScriptWorkshopProject,
} from "@/lib/script-workshop/projects-api";
import type { ScriptWorkshopEpisodeScript } from "@/lib/script-workshop/types";

interface AnimeProject {
  id: number;
  title: string;
  description?: string | null;
  updatedAt?: string;
}

interface StoryboardTemplate {
  code: string;
  name: string;
  description?: string;
}

interface InferenceSystemTemplate {
  templateCode: string;
  templateName: string;
  description?: string;
}

interface PromptTemplateItem {
  templateCode: string;
  templateName: string;
  category?: string;
  description?: string;
}

interface UserInferenceTemplate {
  id: number;
  templateName: string;
  description?: string | null;
  category?: string;
  isDefault?: boolean;
}

type TemplateSel = { type: "system" | "user"; id: string };

// ===== 默认模板常量（避免重复定义）=====
const DEFAULT_STORYBOARD_TEMPLATE: StoryboardTemplate = {
  code: "storyboard_shots_default",
  name: "标准分镜模板(内置)",
  description: "生成基础分镜(仅镜头)，适合通用剧情",
};

const DEFAULT_SHOT_INFERENCE_TEMPLATE: PromptTemplateItem = {
  templateCode: "SHOT_PROMPTS_INFERENCE_STANDARD",
  templateName: "镜头提示词一体推理(内置默认)",
  description: "一次性推理生成 videoPrompt + firstFramePrompt + lastFramePrompt",
};

type EpisodeJobStatus =
  | "IDLE"
  | "CREATING_FRAGMENT"
  | "CREATING_WORKFLOW"
  | "SAVING_SCRIPT"
  | "ANALYZING_STORYBOARD"
  | "LOADING_SHOTS"
  | "INFERRING_PROMPTS"
  | "DONE"
  | "FAILED";

interface EpisodeJobState {
  status: EpisodeJobStatus;
  message?: string;
  fragmentId?: number;
  workflowId?: number;
  error?: string;
}


export default function ScriptWorkshopPipelinePage({ params }: { params: Promise<{ projectId: string }> }) {
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();

  // Next.js 15: params 是 Promise，需要用 React.use() 解包
  const resolvedParams = use(params);
  const projectId = resolvedParams.projectId ? decodeURIComponent(resolvedParams.projectId) : "";

  // ===== Import & Detail State =====
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importTargetEpisodeIndex, setImportTargetEpisodeIndex] = useState<number | null>(null); // null = all

  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [detailEpisodeIndex, setDetailEpisodeIndex] = useState<number | null>(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const cancelRef = useRef(false);
  
  // ===== Hydration Guard =====
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // ===== Project State =====
  const [projects, setProjects] = useState<ScriptWorkshopProjectRecord[]>([]);
  // Initialize with the ID from the URL params
  const [selectedSwProjectId, setSelectedSwProjectId] = useState<string>(projectId);

  const swProject = useMemo(() => {
    return projects.find((p) => p.id === selectedSwProjectId) || null;
  }, [projects, selectedSwProjectId]);

  const episodes: ScriptWorkshopEpisodeScript[] = useMemo(() => {
    const map = swProject?.episodeScripts || {};
    return Object.values(map).sort((a, b) => a.index - b.index);
  }, [swProject]);

  // ===== Storyboard template selection =====
  const [storyboardTab, setStoryboardTab] = useState<"system" | "user">("system");
  const [storyboardSystemTemplates, setStoryboardSystemTemplates] = useState<StoryboardTemplate[]>([]);
  const [storyboardUserTemplates, setStoryboardUserTemplates] = useState<UserInferenceTemplate[]>([]);
  const [loadingStoryboardTemplates, setLoadingStoryboardTemplates] = useState(false);
  const [storyboardTemplate, setStoryboardTemplate] = useState<TemplateSel>({ type: "system", id: "" });

  // ===== Single-shot inference template (Video Prompt + First/Last Frame in ONE call) =====
  const [shotInferenceTab, setShotInferenceTab] = useState<"system" | "user">("system");
  const [shotInferenceSystemTemplates, setShotInferenceSystemTemplates] = useState<PromptTemplateItem[]>([]);
  const [shotInferenceUserTemplates, setShotInferenceUserTemplates] = useState<UserInferenceTemplate[]>([]);
  const [shotInferenceTemplate, setShotInferenceTemplate] = useState<TemplateSel>({ type: "system", id: "" });

  const [loadingInferenceTemplates, setLoadingInferenceTemplates] = useState(false);

  // ===== Episode Job Tracking =====
  const [episodeJobs, setEpisodeJobs] = useState<Record<number, EpisodeJobState>>({});

  // ===== Anime Projects (for import dialog) =====
  const [animeProjects, setAnimeProjects] = useState<AnimeProject[]>([]);
  const [loadingAnimeProjects, setLoadingAnimeProjects] = useState(false);


  // Keep latest state accessible from long-running async flows.
  const projectsRef = useRef<ScriptWorkshopProjectRecord[]>([]);
  const selectedIdRef = useRef<string>(selectedSwProjectId);

  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  useEffect(() => {
    selectedIdRef.current = selectedSwProjectId;
  }, [selectedSwProjectId]);

  const getCurrentSwProject = () => {
    return projectsRef.current.find((p) => p.id === selectedIdRef.current) || null;
  };

  const persistSwProject = async (patch: Partial<ScriptWorkshopProjectRecord>) => {
    const current = getCurrentSwProject();
    if (!current) return;

    const now = new Date().toISOString();
    const next: ScriptWorkshopProjectRecord = {
      ...current,
      updatedAt: now,
      ...patch,
    };

    // Optimistic update
    setProjects((prev) => prev.map((p) => (p.id === next.id ? next : p)));

    try {
      const saved = await upsertScriptWorkshopProject(next.id, next);
      setProjects((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
    } catch (err) {
      console.error("保存剧本工坊项目失败", err);
      toast("保存失败，请稍后重试", "error");
    }
  };

  const loadSwProjects = async () => {
    try {
      const list = await listScriptWorkshopProjects();
      setProjects(list || []);

      const currentId = selectedIdRef.current;
      if (!currentId) {
        setSelectedSwProjectId(list[0]?.id || "");
        return;
      }

      const exists = (list || []).some((p) => p.id === currentId);
      if (!exists) {
        try {
          const one = await getScriptWorkshopProject(currentId);
          setProjects([one, ...(list || [])]);
        } catch {
          setSelectedSwProjectId((list || [])[0]?.id || "");
        }
      }
    } catch (err) {
      console.error("加载剧本工坊项目失败", err);
      toast("加载项目失败，请稍后重试", "error");
      setProjects([]);
    }
  };

  useEffect(() => {
    void loadSwProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // If navigated with params, select it.
    if (projectId && projectId !== selectedSwProjectId) {
      setSelectedSwProjectId(projectId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    // init defaults
    if (!swProject) return;

    if (swProject.storyboardTemplate?.id) {
      setStoryboardTemplate(swProject.storyboardTemplate);
      setStoryboardTab(swProject.storyboardTemplate.type);
    }

    if (swProject.shotPromptsInferenceTemplate?.id) {
      setShotInferenceTemplate(swProject.shotPromptsInferenceTemplate);
      setShotInferenceTab(swProject.shotPromptsInferenceTemplate.type);
    }
  }, [swProject]);

  // When switching projects, reset the on-page job list (status UI only; persisted mappings live in the project record).
  useEffect(() => {
    setEpisodeJobs({});
  }, [selectedSwProjectId]);

  const loadAnimeProjects = async () => {
    setLoadingAnimeProjects(true);
    try {
      const res = await api.get<AnimeProject[]>("/projects");
      setAnimeProjects(res.data || []);
    } catch (e) {
      console.error("加载项目列表失败", e);
      setAnimeProjects([]);
    } finally {
      setLoadingAnimeProjects(false);
    }
  };

  const loadStoryboardTemplates = async () => {
    setLoadingStoryboardTemplates(true);
    try {
      // 并行加载系统模板和用户模板
      const [systemRes, userRes] = await Promise.allSettled([
        api.get<PromptTemplateItem[]>("/script-workshop/prompt-templates?category=STORYBOARD"),
        api.get<UserInferenceTemplate[]>("/ai-agent/user-inference-templates?category=STORYBOARD"),
      ]);

      // 处理系统模板
      let systemList: StoryboardTemplate[] = [DEFAULT_STORYBOARD_TEMPLATE];
      if (systemRes.status === "fulfilled" && systemRes.value.data?.length) {
        systemList = systemRes.value.data.map((t) => ({
          code: t.templateCode,
          name: t.templateName,
          description: t.description,
        }));
      }
      setStoryboardSystemTemplates(systemList);
      if (!storyboardTemplate.id && systemList.length > 0) {
        setStoryboardTemplate({ type: "system", id: systemList[0].code });
      }

      // 处理用户模板
      const userList = userRes.status === "fulfilled" ? userRes.value.data || [] : [];
      setStoryboardUserTemplates(userList);
      if (storyboardTab === "user" && !storyboardTemplate.id && userList.length > 0) {
        setStoryboardTemplate({ type: "user", id: String(userList[0].id) });
      }
    } catch (e) {
      console.error("加载分镜模板失败", e);
      setStoryboardSystemTemplates([DEFAULT_STORYBOARD_TEMPLATE]);
      setStoryboardUserTemplates([]);
    } finally {
      setLoadingStoryboardTemplates(false);
    }
  };

  const loadInferenceTemplates = async () => {
    setLoadingInferenceTemplates(true);
    try {
      // 并行加载系统模板和用户模板
      const [systemRes, userRes] = await Promise.allSettled([
        api.get<PromptTemplateItem[]>("/script-workshop/prompt-templates?category=SHOT_PROMPTS_INFERENCE"),
        api.get<UserInferenceTemplate[]>("/ai-agent/user-inference-templates?category=SHOT_PROMPTS_INFERENCE"),
      ]);

      // 处理系统模板
      let systemList: PromptTemplateItem[] = [DEFAULT_SHOT_INFERENCE_TEMPLATE];
      if (systemRes.status === "fulfilled" && systemRes.value.data?.length) {
        systemList = systemRes.value.data;
      }
      setShotInferenceSystemTemplates(systemList);
      if (!shotInferenceTemplate.id && systemList.length > 0) {
        setShotInferenceTemplate({ type: "system", id: systemList[0].templateCode });
      }

      // 处理用户模板
      const userList = userRes.status === "fulfilled" ? userRes.value.data || [] : [];
      setShotInferenceUserTemplates(userList);
      if (shotInferenceTab === "user" && !shotInferenceTemplate.id && userList.length > 0) {
        setShotInferenceTemplate({ type: "user", id: String(userList[0].id) });
      }
    } catch (e) {
      console.error("加载推理模板失败", e);
      setShotInferenceSystemTemplates([DEFAULT_SHOT_INFERENCE_TEMPLATE]);
      setShotInferenceUserTemplates([]);
    } finally {
      setLoadingInferenceTemplates(false);
    }
  };

  // 并行加载所有初始化数据
  useEffect(() => {
    void Promise.all([
      loadAnimeProjects(),
      loadStoryboardTemplates(),
      loadInferenceTemplates(),
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== Job Helpers =====
  const updateEpisodeJob = (episodeIndex: number, patch: Partial<EpisodeJobState>) => {
    setEpisodeJobs((prev) => ({
      ...prev,
      [episodeIndex]: {
        ...(prev[episodeIndex] || { status: "IDLE" }),
        ...patch,
      },
    }));
  };

  const handleCancel = () => {
    cancelRef.current = true;
    toast("正在停止...", "info");
  };

  const progressStats = useMemo(() => {
    const values = Object.values(episodeJobs);
    return {
      total: episodes.length,
      done: values.filter((j) => j.status === "DONE").length,
      inProgress: values.filter((j) => j.status !== "IDLE" && j.status !== "DONE" && j.status !== "FAILED").length,
      failed: values.filter((j) => j.status === "FAILED").length,
    };
  }, [episodeJobs, episodes.length]);

  // ===== Draft Generation Logic =====
  const generateDraftEpisode = async (ep: ScriptWorkshopEpisodeScript) => {
    const current = getCurrentSwProject();
    if (!current) throw new Error("未选择项目");

    if (!storyboardTemplate.id) throw new Error("请选择分镜模板");

    updateEpisodeJob(ep.index, { status: "CREATING_FRAGMENT", message: "正在生成分镜..." });

    // 获取剧本内容
    const scriptContent = formatEpisodeToText(ep, current.settings);

    // 调用后端 API，后端已经处理好 JSON 解析和字段标准化
    const sbRes = await api.post("/script-workshop/generate-storyboard", {
      template: storyboardTemplate,
      scriptContent,
    });

    // 后端直接返回结构化的 shots 数组
    const shots = sbRes.data?.shots;
    if (!shots || !Array.isArray(shots) || shots.length === 0) {
      throw new Error(sbRes.data?.error || "AI未返回有效分镜数据");
    }

    if (cancelRef.current) {
      updateEpisodeJob(ep.index, { status: "FAILED", error: "已取消" });
      return;
    }

    // 保存 Draft
    const latest = getCurrentSwProject();
    void persistSwProject({
        episodeDrafts: {
            ...((latest?.episodeDrafts || {}) as any),
            [ep.index]: {
                shots,
                status: "DRAFTED",
                updatedAt: new Date().toISOString()
            }
        }
    });

    updateEpisodeJob(ep.index, { status: "DONE", message: `生成完成 (${shots.length} 镜头)` });
  };

  const handleGenerateEpisode = async (ep: ScriptWorkshopEpisodeScript) => {
    // Allow concurrent single-episode generation (no global lock)
    const job = episodeJobs[ep.index];
    const isWorking = Boolean(job && job.status !== "IDLE" && job.status !== "DONE" && job.status !== "FAILED");
    if (isWorking) return;
    
    cancelRef.current = false;
    try {
      await generateDraftEpisode(ep);
    } catch (e: any) {
      const errMsg = e?.response?.data?.error || e?.message || "生成失败";
      updateEpisodeJob(ep.index, { status: "FAILED", error: errMsg });
      toast(errMsg, "error");
    }
  };

  const handleGenerateAllEpisodes = async () => {
    if (isGenerating) return;

    const current = getCurrentSwProject();
    if (!current) {
      toast("未选择剧本", "error");
      return;
    }
    if (!storyboardTemplate.id) {
      toast("请选择分镜模板", "error");
      return;
    }
    if (episodes.length === 0) {
      toast("暂无分集脚本", "error");
      return;
    }

    // Filter out episodes that already have drafts or are currently generating
    const pendingEpisodes = episodes.filter((ep) => {
      const job = episodeJobs[ep.index];
      const isWorking = Boolean(job && job.status !== "IDLE" && job.status !== "DONE" && job.status !== "FAILED");
      const draft = current.episodeDrafts?.[ep.index];
      const hasDraft = Boolean(draft?.shots && draft.shots.length > 0);
      return !isWorking && !hasDraft;
    });

    if (pendingEpisodes.length === 0) {
      toast("没有待生成的集数（都已生成或正在生成中）", "info");
      return;
    }

    cancelRef.current = false;
    setIsGenerating(true);
    toast(`开始并发生成 ${pendingEpisodes.length} 集...`, "info");

    try {
      // Concurrency limit (e.g. 5) to avoid browser connection limits or server overload
      const CONCURRENCY = 5;
      const results: { index: number; success: boolean }[] = [];
      
      for (let i = 0; i < pendingEpisodes.length; i += CONCURRENCY) {
        if (cancelRef.current) break;
        const chunk = pendingEpisodes.slice(i, i + CONCURRENCY);
        
        await Promise.all(
          chunk.map(async (ep) => {
            if (cancelRef.current) return;
            try {
              await generateDraftEpisode(ep);
              results.push({ index: ep.index, success: true });
            } catch (e: any) {
              const errMsg = e?.response?.data?.error || e?.message || "生成失败";
              updateEpisodeJob(ep.index, { status: "FAILED", error: errMsg });
              results.push({ index: ep.index, success: false });
            }
          })
        );
      }

      if (cancelRef.current) {
        toast("已停止批量生成", "info");
      } else {
        const successCount = results.filter((r) => r.success).length;
        const failedCount = results.filter((r) => !r.success).length;
        toast(`批量生成完成：成功 ${successCount}，失败 ${failedCount}`, successCount > 0 ? "success" : "error");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  // ===== Import Logic =====
  /**
   * 批量导入分镜到目标项目（单请求）
   * 后端负责创建 fragment/workflow/shots；前端只发起一次请求并同步本地导入映射。
   */
  const handleImport = async (targetProjectId: number, targetProjectTitle: string) => {
    if (!swProject) return;

    // 筛选要导入的集数
    const targets = importTargetEpisodeIndex
      ? ([episodes.find((e) => e.index === importTargetEpisodeIndex)].filter(Boolean) as ScriptWorkshopEpisodeScript[])
      : episodes;

    // 过滤出有有效 draft 的集数
    const validTargets = targets.filter((ep) => {
      const draft = swProject.episodeDrafts?.[ep.index];
      return draft?.shots && draft.shots.length > 0;
    });

    if (validTargets.length === 0) {
      toast("没有可导入的集数（需要先生成分镜）", "error");
      return;
    }

    toast(`开始导入 ${validTargets.length} 集到项目: ${targetProjectTitle}...`, "info");

    // 标记所有目标为“导入中”
    validTargets.forEach((ep) => {
      updateEpisodeJob(ep.index, { status: "CREATING_WORKFLOW", message: "正在导入..." });
    });

    try {
      const episodesToImport = validTargets.map((ep) => ({
        index: ep.index,
        title: ep.title || `第${ep.index}集`,
        // 把原始分集脚本内容写入 workflow.scriptContent，避免导入后在分镜页提取角色/场景时报“没有剧本”。
        scriptContent: formatEpisodeToText(ep, swProject.settings),
        shots: (swProject.episodeDrafts![ep.index].shots || []).map((s: any, idx: number) => ({
          index: s.index ?? idx + 1,
          action: s.action || s.description || "",
          dialogue: s.dialogue || "",
          durationSec: s.durationSec || s.duration || 5,
          videoPrompt: s.videoPrompt || "",
          firstFramePrompt: s.firstFramePrompt || "",
          lastFramePrompt: s.lastFramePrompt || "",
        })),
      }));

      const batchRes = await api.post("/script-workshop/batch-import", {
        projectId: targetProjectId,
        source: {
          swProjectId: swProject.id,
          swProjectTitle: swProject.title,
        },
        episodes: episodesToImport,
      });

      const results = Array.isArray(batchRes.data?.results) ? batchRes.data.results : [];
      const resultMap = new Map<number, any>();
      for (const r of results) {
        if (typeof r?.episodeIndex === "number") {
          resultMap.set(r.episodeIndex, r);
        }
      }

      let successCount = 0;
      let failedCount = 0;

      const latest = getCurrentSwProject();
      const nextImports: any = { ...((latest?.episodeImports || {}) as any) };

      // 按 validTargets 做一次完整对账，避免后端少返回导致 UI “悬空”。
      for (const ep of validTargets) {
        const r = resultMap.get(ep.index);
        if (!r) {
          failedCount++;
          updateEpisodeJob(ep.index, { status: "FAILED", error: "导入失败（后端未返回结果）" });
          continue;
        }

        if (r.status === "SUCCESS") {
          successCount++;
          nextImports[ep.index] = {
            fragmentId: r.fragmentId,
            workflowId: r.workflowId,
            status: "INFER_DONE",
            updatedAt: new Date().toISOString(),
          };
          updateEpisodeJob(ep.index, { status: "DONE", message: "导入成功" });
        } else {
          failedCount++;
          updateEpisodeJob(ep.index, { status: "FAILED", error: r.error || "导入失败" });
        }
      }

      void persistSwProject({ episodeImports: nextImports });
      toast(`批量导入完成：成功 ${successCount}，失败 ${failedCount}`, successCount > 0 ? "success" : "error");
    } catch (e: any) {
      const errMsg = e?.response?.data?.error || e?.response?.data?.message || e?.message || "导入失败";
      validTargets.forEach((ep) => {
        updateEpisodeJob(ep.index, { status: "FAILED", error: errMsg });
      });
      toast(errMsg, "error");
    }
  };

  // ===== Detail Logic =====
  const handleUpdateDraftShot = (epIndex: number, shotIndex: number, patch: any) => {
      const current = getCurrentSwProject();
      if (!current) return;
      
      const drafts = current.episodeDrafts || {};
      const epDraft = drafts[epIndex];
      if (!epDraft) return;
      
      const newShots = epDraft.shots.map((s: any) => s.index === shotIndex ? { ...s, ...patch } : s);
      
      void persistSwProject({
          episodeDrafts: {
              ...drafts,
              [epIndex]: {
                  ...epDraft,
                  shots: newShots,
                  updatedAt: new Date().toISOString()
              }
          }
      });
  };


  const getDraftShotContext = (epIndex: number, shotIndex: number) => {
    const current = getCurrentSwProject();
    const epDraft = current?.episodeDrafts?.[epIndex];
    const shots = ((epDraft?.shots || []) as DraftShot[]).slice().sort((a, b) => (a.index || 0) - (b.index || 0));
    const pos = shots.findIndex((s) => s.index === shotIndex);
    if (pos < 0) return null;
    return {
      prev: pos > 0 ? shots[pos - 1] : null,
      curr: shots[pos],
      next: pos < shots.length - 1 ? shots[pos + 1] : null,
    };
  };

  const inferShotPromptsForDraftShot = async (
    ctx: { prev: DraftShot | null; curr: DraftShot; next: DraftShot | null },
    target: "all" | "video" | "frames"
  ) => {
    const res = await api.post("/script-workshop/infer-shot-prompts", {
      template: shotInferenceTemplate,
      target,
      context: {
        prev: ctx.prev,
        curr: ctx.curr,
        next: ctx.next,
      },
    });

    return {
      videoPrompt: String(res.data?.videoPrompt || ""),
      firstFramePrompt: String(res.data?.firstFramePrompt || ""),
      lastFramePrompt: String(res.data?.lastFramePrompt || ""),
    };
  };

  const handleRegenerateShot = async (epIndex: number, shotIndex: number, target: "all" | "video" | "frames" = "all") => {
    const ctx = getDraftShotContext(epIndex, shotIndex);
    if (!ctx) return;

    const res = await inferShotPromptsForDraftShot(ctx, target);

    if (target === "video") {
      handleUpdateDraftShot(epIndex, shotIndex, { videoPrompt: res.videoPrompt });
      toast("视频提示词已推理", "success");
      return;
    }

    if (target === "frames") {
      handleUpdateDraftShot(epIndex, shotIndex, {
        firstFramePrompt: res.firstFramePrompt,
        lastFramePrompt: res.lastFramePrompt,
      });
      toast("首尾帧提示词已推理", "success");
      return;
    }

    handleUpdateDraftShot(epIndex, shotIndex, {
      videoPrompt: res.videoPrompt,
      firstFramePrompt: res.firstFramePrompt,
      lastFramePrompt: res.lastFramePrompt,
    });

    toast("镜头提示词已重新生成", "success");
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(168,85,247,0.16),transparent_40%),radial-gradient(circle_at_80%_0%,rgba(34,211,238,0.10),transparent_35%),radial-gradient(circle_at_50%_100%,rgba(236,72,153,0.08),transparent_40%)]" />

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-black/55 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {/* Left-aligned back controls */}
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="h-9 border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10"
                onClick={() => {
                  const id = selectedSwProjectId;
                  router.push(id ? `/script-workshop/editor?projectId=${encodeURIComponent(id)}` : "/script-workshop");
                }}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                返回编辑
              </Button>

              <Button
                variant="ghost"
                size="sm"
                className="h-9 text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
                onClick={() => router.push("/script-workshop")}
              >
                剧本列表
              </Button>
            </div>

            <div className="hidden sm:block h-6 w-px bg-white/10 mx-1" />

            {/* Title */}
            <div className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-500/25 flex items-center justify-center shrink-0">
              <PenTool className="w-4 h-4 text-purple-300" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold leading-tight truncate">剧本工坊 · 分镜制作</div>
              <div className="text-[11px] text-zinc-500 truncate" suppressHydrationWarning>
                {mounted ? (swProject ? `${swProject.title} · ${episodes.length} 集` : "请选择剧本") : "加载中..."}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isGenerating ? (
              <Button
                variant="outline"
                onClick={handleCancel}
                className="border-red-900/30 bg-red-900/10 text-red-400 hover:bg-red-900/20"
              >
                <XCircle className="w-4 h-4 mr-2" />
                停止生成
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => void handleGenerateAllEpisodes()}
                  disabled={!swProject || episodes.length === 0 || !storyboardTemplate.id}
                  className="border-purple-500/20 bg-purple-500/10 text-purple-200 hover:bg-purple-500/15"
                >
                  <Play className="w-4 h-4 mr-2" />
                  批量生成分镜
                </Button>

                <Button
                  variant="outline"
                  onClick={() => {
                    setImportTargetEpisodeIndex(null);
                    setImportDialogOpen(true);
                  }}
                  disabled={!swProject || episodes.length === 0}
                  className="bg-white/10 hover:bg-white/20 border-white/10"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  批量导入全部
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <ImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImport={handleImport}
        defaultTitle={swProject?.animeProjectTitle}
        defaultDescription={swProject?.animeProjectDescription}
      />

      {detailEpisodeIndex !== null && swProject?.episodeDrafts?.[detailEpisodeIndex] && (
        <DetailDialog
          open={detailDialogOpen}
          onOpenChange={(v) => {
            setDetailDialogOpen(v);
            if (!v) setDetailEpisodeIndex(null);
          }}
          episodeIndex={detailEpisodeIndex}
          shots={swProject.episodeDrafts[detailEpisodeIndex].shots}
          onUpdateShot={handleUpdateDraftShot}
          onRegenerateShot={handleRegenerateShot}
        />
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-6 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column - Configuration */}
          <div className="lg:col-span-4 space-y-6">
            {/* Project Info Card */}
            <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-purple-500/5 via-transparent to-pink-500/5 p-5">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(168,85,247,0.08),transparent_50%)]" />
              
              <div className="relative">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                    <Clapperboard className="w-4 h-4 text-purple-300" />
                  </div>
                  <div className="text-sm font-semibold text-zinc-200">当前剧本</div>
                </div>
                
                <div className="text-lg font-bold bg-gradient-to-r from-white to-zinc-300 bg-clip-text text-transparent mb-1" suppressHydrationWarning>
                  {mounted ? (swProject?.title || "未命名剧本") : "加载中..."}
                </div>
                <div className="text-xs text-zinc-500 mb-4" suppressHydrationWarning>
                  {mounted ? `${episodes.length} 个分集脚本` : "-"}
                </div>
                
                <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent my-4" />
                
                <div className="text-xs text-zinc-400 space-y-1.5">
                  <p className="flex items-start gap-2">
                    <span className="text-purple-400 mt-0.5">•</span>
                    <span>先在左侧选择模板，再点击各集的“生成分镜”。</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <span className="text-purple-400 mt-0.5">•</span>
                    <span>生成后可在详情里编辑，确认后再“导入到项目”。</span>
                  </p>
                </div>
              </div>
            </div>

            {/* AI Model Configuration */}
            <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-500/5 via-transparent to-blue-500/5 p-5 space-y-4">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_80%,rgba(34,211,238,0.08),transparent_50%)]" />
              
              <div className="relative flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                  <Wand2 className="w-4 h-4 text-cyan-300" />
                </div>
                <div className="text-sm font-semibold text-zinc-200">AI 模板配置</div>
              </div>

              <div className="relative space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-xs text-zinc-500">分镜模板</label>
                  <div className="flex text-[10px] bg-black/30 border border-white/10 rounded overflow-hidden">
                    <button onClick={() => setStoryboardTab("system")} className={`px-2 py-1 transition-colors ${storyboardTab==="system"?"bg-white/10 text-white":"text-zinc-500 hover:text-zinc-300"}`}>系统</button>
                    <button onClick={() => setStoryboardTab("user")} className={`px-2 py-1 transition-colors ${storyboardTab==="user"?"bg-white/10 text-white":"text-zinc-500 hover:text-zinc-300"}`}>我的</button>
                  </div>
                </div>
                
                <Select
                    value={storyboardTemplate.id || ""}
                    onValueChange={(val) => {
                        const next = { type: storyboardTab, id: val };
                        setStoryboardTemplate(next);
                        void persistSwProject({ storyboardTemplate: next });
                    }}
                >
                  <SelectTrigger className="bg-black/40 border-white/10 text-zinc-300">
                    <SelectValue placeholder="请选择..." />
                  </SelectTrigger>
                  <SelectContent>
                    {storyboardTab === "system" ? (
                        storyboardSystemTemplates.map(t => <SelectItem key={t.code} value={t.code}>{t.name}</SelectItem>)
                    ) : (
                        storyboardUserTemplates.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.templateName}</SelectItem>)
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="h-px w-full bg-white/10" />

              <div className="relative space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-zinc-500">单镜头推理模板（首尾帧 + 视频，一次生成）</label>
                  {loadingInferenceTemplates ? <div className="text-[10px] text-zinc-600">加载中...</div> : null}
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-xs text-zinc-500">推理模板</label>
                    <div className="flex text-[10px] bg-black/30 border border-white/10 rounded overflow-hidden">
                      <button
                        onClick={() => setShotInferenceTab("system")}
                        className={`px-2 py-1 transition-colors ${
                          shotInferenceTab === "system" ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300"
                        }`}
                      >
                        系统
                      </button>
                      <button
                        onClick={() => setShotInferenceTab("user")}
                        className={`px-2 py-1 transition-colors ${
                          shotInferenceTab === "user" ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300"
                        }`}
                      >
                        我的
                      </button>
                    </div>
                  </div>

                  <Select
                    value={shotInferenceTemplate.id || ""}
                    onValueChange={(val) => {
                      const next = { type: shotInferenceTab, id: val };
                      setShotInferenceTemplate(next);
                      void persistSwProject({ shotPromptsInferenceTemplate: next });
                    }}
                  >
                    <SelectTrigger className="bg-black/40 border-white/10 text-zinc-300">
                      <SelectValue placeholder={loadingInferenceTemplates ? "加载中..." : "请选择..."} />
                    </SelectTrigger>
                    <SelectContent>
                      {shotInferenceTab === "system" ? (
                        shotInferenceSystemTemplates.map((t) => (
                          <SelectItem key={t.templateCode} value={t.templateCode}>
                            {t.templateName}
                          </SelectItem>
                        ))
                      ) : (
                        shotInferenceUserTemplates.map((t) => (
                          <SelectItem key={t.id} value={String(t.id)}>
                            {t.templateName}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>

                  <div className="text-[10px] text-zinc-600">用于详情弹窗的“推理 / 重新生成”按钮，不影响批量生成分镜。</div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Episode Queue */}
          <div className="lg:col-span-8 space-y-6">
            {/* Progress Stats */}
            {episodes.length > 0 && (
              <div className="rounded-2xl bg-zinc-900/40 border border-white/5 p-1 backdrop-blur-xl">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3 bg-white/[0.02] rounded-xl border border-white/[0.02]">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-white/10 shadow-inner">
                      <Sparkles className="w-4 h-4 text-purple-300" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white tracking-tight">生产队列</div>
                      <div className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider">Production Queue</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/40 border border-white/5">
                      <span className="text-[10px] text-zinc-500 font-bold">TOTAL</span>
                      <span className="text-xs font-mono text-white">{progressStats.total}</span>
                    </div>
                    
                    {progressStats.done > 0 && (
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 shadow-[0_0_10px_-4px_rgba(16,185,129,0.3)]">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-[10px] text-emerald-400 font-bold">DONE</span>
                        <span className="text-xs font-mono text-emerald-300">{progressStats.done}</span>
                      </div>
                    )}
                    
                    {progressStats.inProgress > 0 && (
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 shadow-[0_0_10px_-4px_rgba(245,158,11,0.3)]">
                        <Loader2 className="w-3 h-3 text-amber-400 animate-spin" />
                        <span className="text-[10px] text-amber-400 font-bold">RUNNING</span>
                        <span className="text-xs font-mono text-amber-300">{progressStats.inProgress}</span>
                      </div>
                    )}
                    
                    {progressStats.failed > 0 && (
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 shadow-[0_0_10px_-4px_rgba(239,68,68,0.3)]">
                        <XCircle className="w-3 h-3 text-red-400" />
                        <span className="text-[10px] text-red-400 font-bold">FAILED</span>
                        <span className="text-xs font-mono text-red-300">{progressStats.failed}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Episode Grid */}
            {episodes.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-20 flex flex-col items-center justify-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-300 mb-4">
                  <Sparkles className="w-5 h-5" />
                </div>
                <p className="text-sm text-zinc-400 font-medium">暂无分集脚本</p>
                <p className="text-xs text-zinc-600 mt-1">请先在编辑页生成分集大纲和脚本</p>
                <Button
                  variant="outline"
                  className="mt-4 border-white/10 text-zinc-300 hover:bg-white/10"
                  onClick={() => {
                      const id = selectedSwProjectId;
                      router.push(id ? `/script-workshop/editor?projectId=${encodeURIComponent(id)}` : "/script-workshop");
                  }}
                >
                  前往编辑
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {episodes.map((ep) => {
                  const job = episodeJobs[ep.index];
                  const draft = swProject?.episodeDrafts?.[ep.index];
                  const imported = swProject?.episodeImports?.[ep.index];
                  
                  // Status logic
                  const isWorking = Boolean(job && job.status !== "IDLE" && job.status !== "DONE" && job.status !== "FAILED");
                  const hasDraft = Boolean(draft?.shots && draft.shots.length > 0);
                  const isImported = imported?.status === "INFER_DONE";
                  
                  // Visual Logic
                  let accentColor = "zinc"; // default
                  let statusLabel = "等待生成";
                  let statusIcon = <div className="w-1.5 h-1.5 rounded-full bg-zinc-600" />;
                  
                  if (isImported) {
                    accentColor = "emerald";
                    statusLabel = "已导入项目";
                    statusIcon = <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
                  } else if (isWorking) {
                    accentColor = "amber";
                    statusLabel = job?.message || "正在生成...";
                    statusIcon = <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />;
                  } else if (hasDraft) {
                    accentColor = "purple";
                    statusLabel = "分镜已就绪";
                    statusIcon = <div className="w-1.5 h-1.5 rounded-full bg-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.8)]" />;
                  } else if (job?.status === "FAILED") {
                    accentColor = "red";
                    statusLabel = "生成失败";
                    statusIcon = <XCircle className="w-3.5 h-3.5 text-red-400" />;
                  }

                  // Dynamic Classes based on accent color
                  const borderClass = {
                    zinc: "border-white/5 hover:border-white/10",
                    emerald: "border-emerald-500/20 hover:border-emerald-500/40 shadow-[0_0_20px_-10px_rgba(16,185,129,0.1)]",
                    amber: "border-amber-500/20 hover:border-amber-500/40 shadow-[0_0_20px_-10px_rgba(245,158,11,0.1)]",
                    purple: "border-purple-500/20 hover:border-purple-500/40 shadow-[0_0_20px_-10px_rgba(168,85,247,0.1)]",
                    red: "border-red-500/20 hover:border-red-500/40",
                  }[accentColor];

                  const bgGradient = {
                    zinc: "bg-gradient-to-b from-zinc-900 to-black",
                    emerald: "bg-gradient-to-b from-emerald-950/10 to-black",
                    amber: "bg-gradient-to-b from-amber-950/10 to-black",
                    purple: "bg-gradient-to-b from-purple-950/10 to-black",
                    red: "bg-gradient-to-b from-red-950/10 to-black",
                  }[accentColor];

                  return (
                    <div 
                      key={ep.index} 
                      className={`group relative flex flex-col justify-between rounded-2xl border transition-all duration-300 hover:-translate-y-1 ${borderClass} ${bgGradient}`}
                    >
                      {/* Large Background Watermark */}
                      <div className="absolute right-2 top-2 text-[6rem] font-black text-white/[0.02] leading-none pointer-events-none select-none font-sans tracking-tighter">
                        {String(ep.index).padStart(2, '0')}
                      </div>

                      {/* Header Area */}
                      <div className="relative p-5 pb-3 z-10">
                        <div className="flex items-center justify-between mb-3">
                           <div className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider border ${
                             accentColor === 'zinc' ? 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400' :
                             accentColor === 'emerald' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                             accentColor === 'amber' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                             accentColor === 'purple' ? 'bg-purple-500/10 border-purple-500/20 text-purple-400' :
                             'bg-red-500/10 border-red-500/20 text-red-400'
                           }`}>
                             EPISODE {String(ep.index).padStart(2, '0')}
                           </div>
                           
                           {/* Status Indicator */}
                           <div className="flex items-center gap-1.5">
                             {statusIcon}
                             <span className={`text-[10px] font-medium ${
                               accentColor === 'zinc' ? 'text-zinc-500' :
                               accentColor === 'emerald' ? 'text-emerald-400/80' :
                               accentColor === 'amber' ? 'text-amber-400/80' :
                               accentColor === 'purple' ? 'text-purple-400/80' :
                               'text-red-400/80'
                             }`}>
                               {statusLabel}
                             </span>
                           </div>
                        </div>

                        <h3 className="text-base font-bold text-white line-clamp-1 group-hover:text-purple-200 transition-colors" title={ep.title}>
                          {ep.title}
                        </h3>
                        
                        {/* 进度条装饰（仅生成中显示） */}
                        {isWorking && (
                          <div className="absolute bottom-0 left-5 right-5 h-0.5 bg-zinc-800 overflow-hidden rounded-full mt-3">
                            <div className="h-full bg-amber-500/50 w-1/3 animate-[shimmer_1.5s_infinite] rounded-full" />
                          </div>
                        )}
                      </div>

                      {/* Actions Area - Separated by subtle line */}
                      <div className="relative mt-auto p-4 pt-4 border-t border-white/5 z-10 bg-white/[0.01]">
                        {hasDraft ? (
                          <div className="grid grid-cols-2 gap-3">
                            <Button 
                              size="sm" 
                              className="bg-zinc-800/50 hover:bg-zinc-700/50 text-zinc-300 hover:text-white border border-white/5 hover:border-white/10 text-xs h-9 transition-all shadow-sm"
                              onClick={() => {
                                setDetailEpisodeIndex(ep.index);
                                setDetailDialogOpen(true);
                              }}
                            >
                              <PenTool className="w-3 h-3 mr-1.5 opacity-70" />
                              查看详情
                            </Button>
                            <Button 
                              size="sm" 
                              className={`text-xs h-9 border transition-all shadow-md ${
                                isImported 
                                ? "bg-emerald-950/30 border-emerald-500/20 text-emerald-400 hover:bg-emerald-900/40" 
                                : "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 border-transparent text-white shadow-purple-900/20"
                              }`}
                              disabled={isImported}
                              onClick={() => {
                                if (isImported) return;
                                setImportTargetEpisodeIndex(ep.index);
                                setImportDialogOpen(true);
                              }}
                            >
                              {isImported ? (
                                <>
                                  <CheckCircle2 className="w-3 h-3 mr-1.5" /> 已导入
                                </>
                              ) : (
                                <>
                                  <Sparkles className="w-3 h-3 mr-1.5" /> 导入项目
                                </>
                              )}
                            </Button>
                          </div>
                        ) : (
                          <Button 
                            size="sm" 
                            className="w-full bg-zinc-800/30 hover:bg-zinc-700/50 text-zinc-400 hover:text-zinc-200 border border-white/5 hover:border-white/10 text-xs h-9 transition-all group-hover:border-purple-500/30 group-hover:text-purple-200 group-hover:bg-purple-500/10"
                            onClick={() => void handleGenerateEpisode(ep)}
                            disabled={isWorking}
                          >
                            {isWorking ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
                                生成中...
                              </>
                            ) : (
                              <>
                                <Play className="w-3.5 h-3.5 mr-2 opacity-70 group-hover:text-purple-400 group-hover:fill-purple-400/20" />
                                生成分镜
                              </>
                            )}
                          </Button>
                        )}
                        
                        {/* Re-run hidden action */}
                        {hasDraft && !isImported && (
                           <div className="absolute -top-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-all duration-300">
                              <button
                                onClick={async (e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const confirmed = await confirm({
                                    title: "重新生成将覆盖当前分镜",
                                    description: `第 ${ep.index} 集的分镜手动修改会被覆盖，且不可撤销。确认要重新生成吗？`,
                                    confirmText: "确认重新生成",
                                    cancelText: "取消",
                                    variant: "warning",
                                  });
                                  if (!confirmed) {
                                    toast("已取消重新生成", "info");
                                    return;
                                  }
                                  void handleGenerateEpisode(ep);
                                }}
                                className="px-3 py-0.5 rounded-full bg-zinc-900 border border-zinc-700 text-[10px] text-zinc-400 hover:text-white hover:border-zinc-500 shadow-xl flex items-center gap-1 whitespace-nowrap"
                              >
                                <Wand2 className="w-2.5 h-2.5" /> 重新生成(覆盖)
                              </button>
                           </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
