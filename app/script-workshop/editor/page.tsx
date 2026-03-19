"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast-provider";
import { ArrowLeft, Download, Loader2, PenTool, Settings2, Sparkles, Upload } from "lucide-react";
import api from "@/lib/api";
import {
  type ScriptWorkshopEpisodeOutline,
  type ScriptWorkshopEpisodeScript,
  type ScriptWorkshopOutlineResult,
  type ScriptWorkshopSettings,
  type NovelChapter,
  type NovelAdaptationGroup,
} from "@/lib/script-workshop/types";
import { extractFirstJsonObject, safeJsonParse, validateOutlineResult } from "@/lib/script-workshop/json";
import { retryWithValidation } from "@/lib/script-workshop/retry";
import { formatEpisodeToText } from "@/lib/script-workshop/format";
import { type ScriptWorkshopProjectRecord } from "@/lib/script-workshop/storage";
import { getScriptWorkshopProject, upsertScriptWorkshopProject } from "@/lib/script-workshop/projects-api";

function downloadText(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function formatCharCount(n: number): string {
  const v = Math.max(0, Math.floor(Number(n) || 0));
  if (v >= 10000) return `${(v / 10000).toFixed(1)}万字`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k字`;
  return `${v}字`;
}

function buildOutlineBatchPlan(totalEpisodes: number): number[] {
  const total = Math.max(0, Math.floor(Number(totalEpisodes) || 0));
  if (total <= 0) return [];

  // 15 集以内：一次性生成
  if (total <= 15) return [total];

  // 16-20：优先 10 + 剩余，避免出现 15 + 1 这种“第二次太短”的情况
  if (total <= 20) return [10, total - 10];

  // 21-30：两次生成，尽量均分（每次 10-15 集）
  if (total <= 30) {
    const first = Math.ceil(total / 2);
    return [first, total - first];
  }

  // 30+：每次最多 15 集，尽量均分，保证不会出现“第二次只剩 1-2 集”
  const batches = Math.ceil(total / 15);
  const base = Math.floor(total / batches);
  const rem = total % batches;
  return Array.from({ length: batches }, (_, i) => base + (i < rem ? 1 : 0));
}

function normalizeEpisodeOutlineForRequest(outline: ScriptWorkshopEpisodeOutline) {
  return {
    index: outline.index,
    title: outline.title,
    summary: outline.summary,
  };
}

function normalizeOutlineEpisodesFromReply(params: {
  episodes: any[];
  startIndex: number; // 1-based
}): ScriptWorkshopEpisodeOutline[] {
  const eps = Array.isArray(params.episodes) ? params.episodes : [];
  const start = Math.max(1, Math.floor(Number(params.startIndex) || 1));

  const coerceString = (v: any) => (typeof v === "string" ? v : v == null ? "" : String(v));
  const isPlainObject = (v: any) => typeof v === "object" && v !== null && !Array.isArray(v);

  return eps.map((raw, i) => {
    const index = start + i;

    if (typeof raw === "string") {
      return { index, title: `第${index}集`, summary: raw.trim() };
    }

    const o: any = isPlainObject(raw) ? raw : {};
    const titleRaw = o.title ?? o.chapterName ?? o.name ?? o["章节名称"] ?? o["章节名"] ?? o["章节标题"];
    const summaryRaw = o.summary ?? o.plot ?? o.story ?? o.content ?? o["剧情"];

    const title = coerceString(titleRaw).trim() || `第${index}集`;
    const summary = coerceString(summaryRaw).trim();

    return { index, title, summary };
  });
}

interface UserInferenceTemplate {
  id: number;
  templateName: string;
  description?: string | null;
  category?: string;
  isDefault?: boolean;
}

interface SystemPromptTemplate {
  templateCode: string;
  templateName: string;
  description?: string | null;
  category?: string;
}

type TemplateSel = { type: "system" | "user"; id: string };

// Script Workshop prompts: split categories so outline/script can use different template lists.
const SCRIPT_WORKSHOP_OUTLINE_TEMPLATE_CATEGORY = "SCRIPT_WORKSHOP_OUTLINE";
const SCRIPT_WORKSHOP_EPISODE_TEMPLATE_CATEGORY = "SCRIPT_WORKSHOP_EPISODE";
const SCRIPT_WORKSHOP_NOVEL_COMPRESS_CATEGORY = "SCRIPT_WORKSHOP_NOVEL_COMPRESS";
// Back-compat for existing DB data
const SCRIPT_WORKSHOP_LEGACY_TEMPLATE_CATEGORY = "SCRIPT_WORKSHOP";

export default function ScriptWorkshopPage() {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [projectId, setProjectId] = useState<string>("");
  const [projectCreatedAt, setProjectCreatedAt] = useState<string>(() => new Date().toISOString());

  const [projectTitle, setProjectTitle] = useState<string>("");
  const [sourceText, setSourceText] = useState<string>("");

  const [settings, setSettings] = useState<ScriptWorkshopSettings>({
    visualStyle: "anime",
    narrativeMode: "mixed",
    tone: "无",
    episodesCount: 10,
    episodeDurationSec: 90,
    avgShotSec: 3.5,
    platformPreset: "short_video",
    aspectRatio: "9:16",
  });

  const [outlines, setOutlines] = useState<ScriptWorkshopEpisodeOutline[] | null>(null);
  const [episodeScripts, setEpisodeScripts] = useState<Record<number, ScriptWorkshopEpisodeScript>>({});

  const [view, setView] = useState<"draft" | "episodes" | "novel">("draft");
  const [configOpen, setConfigOpen] = useState(false);
  const [selectedEpisodeIndex, setSelectedEpisodeIndex] = useState<number | null>(null);

  // 小说改编状态
  const [novelChapters, setNovelChapters] = useState<NovelChapter[]>([]);
  const [novelGroups, setNovelGroups] = useState<NovelAdaptationGroup[]>([]);
  const [novelCompressTemplateSel, setNovelCompressTemplateSel] = useState<TemplateSel | null>(null);
  const [systemNovelCompressTemplates, setSystemNovelCompressTemplates] = useState<SystemPromptTemplate[]>([]);
  const [userNovelCompressTemplates, setUserNovelCompressTemplates] = useState<UserInferenceTemplate[]>([]);
  const novelBatchCancelRef = useRef(false);
  const [novelBatchRunning, setNovelBatchRunning] = useState(false);

  /** 项目模式：normal=普通灵感，novel=小说改编 */
  const [projectMode, setProjectMode] = useState<"normal" | "novel">("normal");

  const [loadingOutline, setLoadingOutline] = useState(false);
  const [loadingEpisodeIndex, setLoadingEpisodeIndex] = useState<number | null>(null);
  const [batchGenerating, setBatchGenerating] = useState(false);
  const batchCancelRef = useRef(false);
  const [batchCancelling, setBatchCancelling] = useState(false);

  // Prompt templates are managed in DB (admin) and fetched at runtime.
  const [systemOutlinePromptTemplates, setSystemOutlinePromptTemplates] = useState<SystemPromptTemplate[]>([]);
  const [systemEpisodePromptTemplates, setSystemEpisodePromptTemplates] = useState<SystemPromptTemplate[]>([]);
  const [userOutlinePromptTemplates, setUserOutlinePromptTemplates] = useState<UserInferenceTemplate[]>([]);
  const [userEpisodePromptTemplates, setUserEpisodePromptTemplates] = useState<UserInferenceTemplate[]>([]);
  const [loadingPromptTemplates, setLoadingPromptTemplates] = useState(false);

  // Explicit template selection (stored per project). null => auto-select.
  const [outlinePromptTemplateSel, setOutlinePromptTemplateSel] = useState<TemplateSel | null>(null);
  const [episodePromptTemplateSel, setEpisodePromptTemplateSel] = useState<TemplateSel | null>(null);

  const [createUserTemplateOpen, setCreateUserTemplateOpen] = useState(false);
  const [creatingUserTemplate, setCreatingUserTemplate] = useState(false);
  const [newTemplateApplyTo, setNewTemplateApplyTo] = useState<"outline" | "episode">("outline");
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateDescription, setNewTemplateDescription] = useState("");
  const [newTemplatePrompt, setNewTemplatePrompt] = useState("");

  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  // 全文查看弹窗
  const [previewModal, setPreviewModal] = useState<{ title: string; content: string } | null>(null);

  const loadPromptTemplates = async () => {
    setLoadingPromptTemplates(true);
    try {
      const [sysOutlineRes, sysEpisodeRes, userOutlineRes, userEpisodeRes, sysNovelRes, userNovelRes] = await Promise.all([
        api.get<SystemPromptTemplate[]>(
          `/script-workshop/prompt-templates?category=${encodeURIComponent(SCRIPT_WORKSHOP_OUTLINE_TEMPLATE_CATEGORY)}`
        ),
        api.get<SystemPromptTemplate[]>(
          `/script-workshop/prompt-templates?category=${encodeURIComponent(SCRIPT_WORKSHOP_EPISODE_TEMPLATE_CATEGORY)}`
        ),
        api.get<UserInferenceTemplate[]>(
          `/ai-agent/user-inference-templates?category=${encodeURIComponent(SCRIPT_WORKSHOP_OUTLINE_TEMPLATE_CATEGORY)}`
        ),
        api.get<UserInferenceTemplate[]>(
          `/ai-agent/user-inference-templates?category=${encodeURIComponent(SCRIPT_WORKSHOP_EPISODE_TEMPLATE_CATEGORY)}`
        ),
        api.get<SystemPromptTemplate[]>(
          `/script-workshop/prompt-templates?category=${encodeURIComponent(SCRIPT_WORKSHOP_NOVEL_COMPRESS_CATEGORY)}`
        ),
        api.get<UserInferenceTemplate[]>(
          `/ai-agent/user-inference-templates?category=${encodeURIComponent(SCRIPT_WORKSHOP_NOVEL_COMPRESS_CATEGORY)}`
        ),
      ]);

      let sysOutline = sysOutlineRes.data || [];
      let sysEpisode = sysEpisodeRes.data || [];
      let userOutline = userOutlineRes.data || [];
      let userEpisode = userEpisodeRes.data || [];
      const sysNovel = sysNovelRes.data || [];
      const userNovel = userNovelRes.data || [];
      setSystemNovelCompressTemplates(sysNovel);
      setUserNovelCompressTemplates(userNovel);
      // 自动选第一个压缩模板
      if (!novelCompressTemplateSel) {
        if (sysNovel.length > 0) setNovelCompressTemplateSel({ type: "system", id: sysNovel[0].templateCode });
        else if (userNovel.length > 0) setNovelCompressTemplateSel({ type: "user", id: String(userNovel[0].id) });
      }

      const dedupeById = (list: UserInferenceTemplate[]) => {
        const seen = new Set<number>();
        return (list || []).filter((t) => {
          if (seen.has(t.id)) return false;
          seen.add(t.id);
          return true;
        });
      };

      // Back-compat: if DB still uses category=SCRIPT_WORKSHOP, try to pull it and split by code/name.
      if (sysOutline.length === 0 || sysEpisode.length === 0) {
        try {
          const legacySysRes = await api.get<SystemPromptTemplate[]>(
            `/script-workshop/prompt-templates?category=${encodeURIComponent(SCRIPT_WORKSHOP_LEGACY_TEMPLATE_CATEGORY)}`
          );
          const legacySys = legacySysRes.data || [];
          const legacyOutline = legacySys.filter((t) => /OUTLINE/i.test(t.templateCode) || /大纲/.test(t.templateName));
          const legacyEpisode = legacySys.filter((t) => /EPISODE/i.test(t.templateCode) || /脚本/.test(t.templateName));
          if (sysOutline.length === 0) sysOutline = legacyOutline;
          if (sysEpisode.length === 0) sysEpisode = legacyEpisode;
        } catch {
          // ignore
        }
      }

      if (userOutline.length === 0 || userEpisode.length === 0) {
        try {
          const legacyUserRes = await api.get<UserInferenceTemplate[]>(
            `/ai-agent/user-inference-templates?category=${encodeURIComponent(SCRIPT_WORKSHOP_LEGACY_TEMPLATE_CATEGORY)}`
          );
          const legacyUser = legacyUserRes.data || [];
          const legacyOutline = legacyUser.filter(
            (t) => /大纲/i.test(t.templateName) || String(t.templateName || "").toLowerCase().includes("outline")
          );
          const legacyEpisode = legacyUser.filter(
            (t) => /脚本/i.test(t.templateName) || String(t.templateName || "").toLowerCase().includes("episode")
          );
          const ambiguous = legacyUser.filter((t) => !legacyOutline.includes(t) && !legacyEpisode.includes(t));

          if (userOutline.length === 0) userOutline = dedupeById([...legacyOutline, ...ambiguous]);
          if (userEpisode.length === 0) userEpisode = dedupeById([...legacyEpisode, ...ambiguous]);
        } catch {
          // ignore
        }
      }

      setSystemOutlinePromptTemplates(sysOutline);
      setSystemEpisodePromptTemplates(sysEpisode);
      setUserOutlinePromptTemplates(userOutline);
      setUserEpisodePromptTemplates(userEpisode);
    } catch (err) {
      console.error("加载剧本工坊提示词模板失败", err);
      toast("加载剧本工坊提示词模板失败，请在后台配置后重试", "error");
      setSystemOutlinePromptTemplates([]);
      setSystemEpisodePromptTemplates([]);
      setUserOutlinePromptTemplates([]);
      setUserEpisodePromptTemplates([]);
    } finally {
      setLoadingPromptTemplates(false);
    }
  };

  const handleCreateUserTemplate = async () => {
    const name = newTemplateName.trim();
    const prompt = newTemplatePrompt.trim();
    if (!name) {
      toast("请填写模板名称", "error");
      return;
    }
    if (!prompt) {
      toast("请填写提示词内容", "error");
      return;
    }

    setCreatingUserTemplate(true);
    try {
      const category =
        newTemplateApplyTo === "outline"
          ? SCRIPT_WORKSHOP_OUTLINE_TEMPLATE_CATEGORY
          : SCRIPT_WORKSHOP_EPISODE_TEMPLATE_CATEGORY;

      const res = await api.post("/ai-agent/user-inference-templates", {
        category,
        templateName: name,
        description: newTemplateDescription.trim() || null,
        systemPrompt: prompt,
        isDefault: false,
      });

      const createdId = res.data?.id;
      toast("已创建模板", "success");

      setCreateUserTemplateOpen(false);
      setNewTemplateName("");
      setNewTemplateDescription("");
      setNewTemplatePrompt("");

      await loadPromptTemplates();

      if (createdId != null) {
        const sel: TemplateSel = { type: "user", id: String(createdId) };
        if (newTemplateApplyTo === "outline") {
          setOutlinePromptTemplateSel(sel);
        } else {
          setEpisodePromptTemplateSel(sel);
        }
      }
    } catch (err: any) {
      console.error("创建用户模板失败", err);
      toast(err?.response?.data?.error || err?.message || "创建模板失败", "error");
    } finally {
      setCreatingUserTemplate(false);
    }
  };

  const autoOutlineTemplateSel = useMemo<TemplateSel | null>(() => {
    // Default to the FIRST official (system) template.
    if (systemOutlinePromptTemplates.length > 0) {
      return { type: "system", id: systemOutlinePromptTemplates[0].templateCode };
    }

    // Fallbacks when system templates are missing.
    const defaultUser = userOutlinePromptTemplates.find((t) => t.isDefault);
    if (defaultUser) return { type: "user", id: String(defaultUser.id) };

    if (userOutlinePromptTemplates.length > 0) {
      return { type: "user", id: String(userOutlinePromptTemplates[0].id) };
    }

    return null;
  }, [userOutlinePromptTemplates, systemOutlinePromptTemplates]);

  const autoEpisodeTemplateSel = useMemo<TemplateSel | null>(() => {
    // Default to the FIRST official (system) template.
    if (systemEpisodePromptTemplates.length > 0) {
      return { type: "system", id: systemEpisodePromptTemplates[0].templateCode };
    }

    // Fallbacks when system templates are missing.
    const defaultUser = userEpisodePromptTemplates.find((t) => t.isDefault);
    if (defaultUser) return { type: "user", id: String(defaultUser.id) };

    if (userEpisodePromptTemplates.length > 0) {
      return { type: "user", id: String(userEpisodePromptTemplates[0].id) };
    }

    return null;
  }, [userEpisodePromptTemplates, systemEpisodePromptTemplates]);

  const effectiveOutlineTemplateSel = outlinePromptTemplateSel || autoOutlineTemplateSel;
  const effectiveEpisodeTemplateSel = episodePromptTemplateSel || autoEpisodeTemplateSel;

  // Prefer explicit defaults over showing "auto" in UI.
  useEffect(() => {
    if (outlinePromptTemplateSel) return;
    if (!autoOutlineTemplateSel) return;
    setOutlinePromptTemplateSel(autoOutlineTemplateSel);
  }, [outlinePromptTemplateSel, autoOutlineTemplateSel]);

  useEffect(() => {
    if (episodePromptTemplateSel) return;
    if (!autoEpisodeTemplateSel) return;
    setEpisodePromptTemplateSel(autoEpisodeTemplateSel);
  }, [episodePromptTemplateSel, autoEpisodeTemplateSel]);

  const hydratingRef = useRef(false);
  const projectRecordRef = useRef<ScriptWorkshopProjectRecord | null>(null);

  const applyProjectToState = (p: ScriptWorkshopProjectRecord) => {
    hydratingRef.current = true;
    projectRecordRef.current = p;
    setProjectId(p.id);
    setProjectCreatedAt(p.createdAt || new Date().toISOString());
    setProjectTitle(p.title || "");
    setSourceText(p.sourceText || "");
    setSettings(p.settings);
    setOutlines(p.outlines || null);
    setEpisodeScripts(p.episodeScripts || {});

    // Template selection (v2)
    const outlineSel =
      p.outlinePromptTemplate && typeof p.outlinePromptTemplate === "object" ? (p.outlinePromptTemplate as TemplateSel) : null;
    const episodeSel =
      p.episodePromptTemplate && typeof p.episodePromptTemplate === "object" ? (p.episodePromptTemplate as TemplateSel) : null;

    // Back-compat: v1 stored user template ids
    const legacyOutlineSel = typeof p.outlinePromptTemplateId === "number" ? ({ type: "user", id: String(p.outlinePromptTemplateId) } as TemplateSel) : null;
    const legacyEpisodeSel = typeof p.episodePromptTemplateId === "number" ? ({ type: "user", id: String(p.episodePromptTemplateId) } as TemplateSel) : null;

    setOutlinePromptTemplateSel(outlineSel || legacyOutlineSel);
    setEpisodePromptTemplateSel(episodeSel || legacyEpisodeSel);

    setLastSavedAt(p.updatedAt || null);

    // 项目模式
    const mode = p.mode === "novel" ? "novel" : "normal";
    setProjectMode(mode);

    // 小说改编数据
    setNovelChapters(p.novelChapters || []);
    setNovelGroups(p.novelAdaptationGroups || []);
    if (p.novelCompressTemplate) setNovelCompressTemplateSel(p.novelCompressTemplate as TemplateSel);

    // 根据模式决定初始视图
    let nextView: "draft" | "episodes" | "novel";
    if (mode === "novel") {
      // 小说改编模式：有分集脚本则进分集脚本，否则进章节改编
      nextView = Object.keys(p.episodeScripts || {}).length > 0 ? "episodes" : "novel";
    } else {
      // 普通模式：有大纲则进分集脚本，否则进灵感
      nextView = p.outlines && p.outlines.length > 0 ? "episodes" : "draft";
    }
    setView(nextView);
    setSelectedEpisodeIndex(p.outlines?.[0]?.index ?? null);

    // let state settle before enabling autosave
    setTimeout(() => {
      hydratingRef.current = false;
    }, 0);
  };

  const projectIdFromQuery = searchParams.get("projectId") || "";

  useEffect(() => {
    if (!projectIdFromQuery) {
      router.replace("/script-workshop");
      return;
    }

    (async () => {
      try {
        const found = await getScriptWorkshopProject(projectIdFromQuery);
        applyProjectToState(found);
      } catch (err: any) {
        console.error("加载剧本工坊项目失败", err);
        toast(err?.response?.data?.error || "未找到该项目，请从列表重新进入", "error");
        router.replace("/script-workshop");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectIdFromQuery]);

  useEffect(() => {
    loadPromptTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persistCurrent = async (patch?: Partial<ScriptWorkshopProjectRecord>) => {
    if (!projectId) return;

    const now = new Date().toISOString();
    const base = projectRecordRef.current;

    const record: ScriptWorkshopProjectRecord = {
      ...(base || {}),
      id: projectId,
      title: (projectTitle || "未命名剧本").trim() || "未命名剧本",
      sourceText,
      settings,
      createdAt: patch?.createdAt || projectCreatedAt || base?.createdAt || now,
      updatedAt: now,
      outlines: outlines || undefined,
      episodeScripts: Object.keys(episodeScripts).length ? episodeScripts : undefined,
      outlinePromptTemplate: outlinePromptTemplateSel || undefined,
      episodePromptTemplate: episodePromptTemplateSel || undefined,
      mode: projectMode,
      novelChapters: novelChapters.length ? novelChapters : undefined,
      novelAdaptationGroups: novelGroups.length ? novelGroups : undefined,
      novelCompressTemplate: novelCompressTemplateSel || undefined,
      ...patch,
    };

    // Keep latest snapshot so other pages' fields won't be dropped by subsequent saves.
    projectRecordRef.current = record;

    // Optimistic UI
    setLastSavedAt(now);

    try {
      const saved = await upsertScriptWorkshopProject(projectId, record);
      projectRecordRef.current = saved;
    } catch (err) {
      console.error("保存剧本工坊项目失败", err);
    }
  };

  const hasDraftContent = useMemo(() => {
    return Boolean(
      projectTitle.trim() ||
        sourceText.trim() ||
        (outlines && outlines.length > 0) ||
        Object.keys(episodeScripts).length > 0
    );
  }, [projectTitle, sourceText, outlines, episodeScripts]);

  useEffect(() => {
    if (hydratingRef.current) return;
    if (!hasDraftContent) return;
    if (batchGenerating || loadingOutline || loadingEpisodeIndex != null) return;

    const t = setTimeout(() => {
      void persistCurrent();
    }, 600);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    projectId,
    projectTitle,
    sourceText,
    settings,
    outlines,
    episodeScripts,
    outlinePromptTemplateSel,
    episodePromptTemplateSel,
    novelCompressTemplateSel,
    hasDraftContent,
    batchGenerating,
    loadingOutline,
    loadingEpisodeIndex,
  ]);

  const handleImportFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".txt,.md";
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = (evt.target?.result as string) || "";
        setSourceText(text);
        if (!projectTitle.trim()) {
          setProjectTitle(file.name.replace(/\.(txt|md)$/i, ""));
        }
        toast("已导入文本", "success");
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleGenerateOutline = async () => {
    if (!sourceText.trim()) {
      toast("请先输入构思/小说内容", "error");
      return;
    }

    const outlineSel = effectiveOutlineTemplateSel;
    if (!outlineSel?.id) {
      toast("未配置剧本工坊【分集大纲】模板，请在后台添加后重试", "error");
      return;
    }

    setLoadingOutline(true);
    try {
      const totalEpisodes = Math.max(1, Math.floor(Number(settings.episodesCount) || 0));
      const batchPlan = buildOutlineBatchPlan(totalEpisodes);
      if (batchPlan.length === 0) {
        throw new Error("集数配置不正确");
      }

      const allEpisodes: ScriptWorkshopEpisodeOutline[] = [];
      let startIndex = 1;

      for (let batchIdx = 0; batchIdx < batchPlan.length; batchIdx++) {
        const batchCount = batchPlan[batchIdx];
        const endIndex = startIndex + batchCount - 1;

        toast(`正在生成分集大纲：第${startIndex}-${endIndex}集...`, "info");

        const result = await retryWithValidation(
          async () => {
            const contextEpisodes = allEpisodes.slice(Math.max(0, allEpisodes.length - 10));

            const res = await api.post("/script-workshop/generate-outline", {
              template: outlineSel,
              sourceText,
              settings,
              totalEpisodesCount: totalEpisodes,
              startEpisodeIndex: startIndex,
              batchEpisodesCount: batchCount,
              previousEpisodes: contextEpisodes.length ? contextEpisodes.map(normalizeEpisodeOutlineForRequest) : undefined,
            });

            const reply: string = res.data?.reply || "";
            const jsonText = extractFirstJsonObject(reply) || reply;
            const parsed = safeJsonParse<ScriptWorkshopOutlineResult>(jsonText);

            if (!parsed.ok) {
              throw new Error(`AI 输出不是有效 JSON：${parsed.error}`);
            }

            const validation = validateOutlineResult(parsed.value);
            if (!validation.ok) {
              throw new Error(validation.error);
            }

            const rawEpisodes = Array.isArray(parsed.value.episodes) ? parsed.value.episodes : [];
            if (rawEpisodes.length < batchCount) {
              throw new Error(`episodes 数量不足：期望 ${batchCount}，实际 ${rawEpisodes.length}`);
            }

            return { ...parsed.value, episodes: rawEpisodes.slice(0, batchCount) };
          },
          (val) => validateOutlineResult(val),
          {
            maxAttempts: 2,
            onAttempt: (attempt, error) => {
              console.warn(`生成大纲第 ${attempt} 次尝试失败:`, error);
              if (attempt === 1) {
                toast(`AI输出格式不正确，正在重试...`, "info");
              }
            },
          }
        );

        const normalizedBatch = normalizeOutlineEpisodesFromReply({
          episodes: result.episodes || [],
          startIndex,
        });

        if (normalizedBatch.length !== batchCount) {
          throw new Error(`episodes 数量不匹配：期望 ${batchCount}，实际 ${normalizedBatch.length}`);
        }

        allEpisodes.push(...normalizedBatch);
        startIndex += batchCount;
      }

      setOutlines(allEpisodes);
      setEpisodeScripts({});
      setView("episodes");
      setSelectedEpisodeIndex(allEpisodes?.[0]?.index ?? null);
      void persistCurrent({ outlines: allEpisodes, episodeScripts: {} });
      toast("分集大纲已生成", "success");
    } catch (err: any) {
      console.error(err);
      toast(err?.message || "生成分集大纲失败", "error");
    } finally {
      setLoadingOutline(false);
    }
  };

  const handleGenerateEpisodeScript = async (outline: ScriptWorkshopEpisodeOutline) => {
    // 为了让输出更“短平快”，分集脚本优先使用本集 summary 作为输入（而不是整篇构思/小说）。
    // summary 为空时再回退到原始 sourceText。
    const effectiveSourceText = (outline.summary || "").trim() || sourceText;

    if (!effectiveSourceText.trim()) {
      toast(projectMode === "novel" ? "该集改编内容为空" : "请先输入构思/小说内容", "error");
      return;
    }

    const episodeSel = effectiveEpisodeTemplateSel;
    if (!episodeSel?.id) {
      toast("未配置剧本工坊【分集脚本】模板，请在后台添加后重试", "error");
      return;
    }

    setLoadingEpisodeIndex(outline.index);
    try {
      const res = await api.post("/script-workshop/generate-episode-script", {
        template: episodeSel,
        sourceText: effectiveSourceText,
        settings,
        outline: normalizeEpisodeOutlineForRequest(outline),
      });

      const reply: string = res.data?.reply || "";
      if (!reply.trim()) {
        throw new Error("AI 返回内容为空");
      }

      const episode: ScriptWorkshopEpisodeScript = { index: outline.index, content: reply.trim() };
      setEpisodeScripts((prev) => {
        const next = { ...prev, [episode.index]: episode };
        void persistCurrent({ episodeScripts: next });
        return next;
      });

      toast(`第${episode.index}集脚本已生成`, "success");
    } catch (err: any) {
      console.error(err);
      toast(err?.message || "生成脚本失败", "error");
    } finally {
      setLoadingEpisodeIndex(null);
    }
  };

  // LEGACY（已弃用）：曾用于把"剧本工坊"生成的脚本导入 `/scripts`（旧版分镜解析器）。
  // 需求：剧本工坊不再依赖旧版解析器。
  // const handlePublishToLegacyScripts = async (ep: ScriptWorkshopEpisodeScript) => {
  //   try {
  //     const content = formatEpisodeToText(ep, settings);
  //     const res = await api.post("/scripts", {
  //       title: `${projectTitle || ep.title}_第${ep.index}集`,
  //       content,
  //       userId: 1,
  //     });
  //     const id = res.data?.id;
  //     toast("已写入旧版分镜解析器（LEGACY scripts）", "success");
  //     if (id) {
  //       router.push(`/scripts/${id}`);
  //     }
  //   } catch (err: any) {
  //     console.error(err);
  //     toast(err?.response?.data?.error || err?.message || "写入失败", "error");
  //   }
  // };

  const handleBatchGenerateAll = async () => {
    if (!outlines || outlines.length === 0) {
      toast("请先生成分集大纲", "error");
      return;
    }

    const episodeSel = effectiveEpisodeTemplateSel;
    if (!episodeSel?.id) {
      toast("未配置剧本工坊【分集脚本】模板，请在后台添加后重试", "error");
      return;
    }

    batchCancelRef.current = false;
    setBatchCancelling(false);
    setBatchGenerating(true);

    const toGenerate = outlines.filter((o) => !episodeScripts[o.index]);
    if (toGenerate.length === 0) {
      router.push(`/script-workshop/pipeline/${encodeURIComponent(projectId)}`);
      return;
    }

    toast(`开始并发生成 ${toGenerate.length} 集脚本...`, "info");

    // 并发生成所有分集脚本
    const generateOne = async (outline: ScriptWorkshopEpisodeOutline) => {
      if (batchCancelRef.current) {
        throw new Error("已取消");
      }

      // 优先使用本集 summary 作为输入，避免“像长篇小说一样”越写越长。
      const effectiveSourceText = (outline.summary || "").trim() || sourceText;

      const result = await retryWithValidation(
        async () => {
          if (batchCancelRef.current) {
            throw new Error("已取消");
          }

          const res = await api.post("/script-workshop/generate-episode-script", {
            template: episodeSel,
            sourceText: effectiveSourceText,
            settings,
            outline: normalizeEpisodeOutlineForRequest(outline),
          });

          const reply: string = res.data?.reply || "";
          if (!reply.trim()) {
            throw new Error("AI 返回内容为空");
          }
          return { index: outline.index, content: reply.trim() };
        },
        (val) => (val.content ? { ok: true, value: val } : { ok: false, error: "内容为空" }),
        {
          maxAttempts: 3,
          onAttempt: (attempt, error) => {
            console.warn(`并发生成第${outline.index}集第 ${attempt} 次尝试失败:`, error);
          },
        }
      );

      const episode: ScriptWorkshopEpisodeScript = result;
      setEpisodeScripts((prev) => {
        const next = { ...prev, [episode.index]: episode };
        void persistCurrent({ episodeScripts: next });
        return next;
      });

      return { index: outline.index, success: true };
    };

    const results = await Promise.allSettled(toGenerate.map((outline) => generateOne(outline)));

    const successCount = results.filter((r) => r.status === "fulfilled").length;
    const failedResults = results
      .map((r, i) => ({ result: r, index: toGenerate[i].index }))
      .filter((r) => r.result.status === "rejected");

    // 显示失败的集数
    for (const { result, index } of failedResults) {
      if (result.status === "rejected") {
        const reason = result.reason?.message || "未知错误";
        if (reason !== "已取消") {
          console.error(`生成第${index}集失败:`, result.reason);
          toast(`第${index}集生成失败: ${reason}`, "error");
        }
      }
    }

    setLoadingEpisodeIndex(null);
    setBatchGenerating(false);
    setBatchCancelling(false);

    if (!batchCancelRef.current) {
      toast(`批量生成完成：成功 ${successCount} 集，失败 ${failedResults.length} 集`, "success");
    } else {
      toast(`已取消，成功 ${successCount} 集`, "info");
    }
  };

  const handleCancelBatchGenerate = () => {
    batchCancelRef.current = true;
    setBatchCancelling(true);
    toast("正在取消批量生成...", "info");
  };

  const buildNovelGroupCombinedText = (group: NovelAdaptationGroup) => {
    // 拼接该集的章节内容，超过3万字截断（保持与后端/提示词处理一致）
    const MAX_CHARS = 30000;
    const chaps = novelChapters.filter((c) => group.chapterIndexes.includes(c.index));
    let combined = chaps.map((c) => `【${c.title}】\n${c.content}`).join("\n\n");
    if (combined.length > MAX_CHARS) combined = combined.slice(0, MAX_CHARS) + "\n\n[内容已截断，超过3万字上限]";
    return combined;
  };

  // 改编单集小说内容
  const handleNovelCompressOne = async (groupIndex: number) => {
    const group = novelGroups[groupIndex];
    if (!group) return;

    const combined = buildNovelGroupCombinedText(group);

    const prevGroup = novelGroups[groupIndex - 1];
    const prevEpisodeTail = prevGroup?.compressedContent
      ? prevGroup.compressedContent.slice(-500)
      : undefined;

    // 更新状态为改编中
    setNovelGroups((prev) => prev.map((g, i) => i === groupIndex ? { ...g, compressStatus: "compressing", compressError: undefined } : g));

    try {
      const res = await api.post("/script-workshop/novel-adapt-episode", {
        template: novelCompressTemplateSel || undefined,
        chapterContent: combined,
        episodeIndex: group.episodeIndex,
        totalEpisodes: novelGroups.length,
        prevEpisodeTail,
      });

      const adapted = res.data?.content || "";
      setNovelGroups((prev) => {
        const updated = prev.map((g, i) =>
          i === groupIndex ? { ...g, compressStatus: "done" as const, compressedContent: adapted } : g
        );
        void persistCurrent({ novelAdaptationGroups: updated });
        return updated;
      });
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || "改编失败";
      setNovelGroups((prev) => prev.map((g, i) => i === groupIndex ? { ...g, compressStatus: "failed" as const, compressError: msg } : g));
      toast(`第${group.episodeIndex}集改编失败: ${msg}`, "error");
    }
  };

  // 按原文：不调用改编接口，直接将原文拼接内容作为“改编结果”，便于继续走分集脚本流程
  const handleNovelUseOriginalOne = (groupIndex: number) => {
    const group = novelGroups[groupIndex];
    if (!group) return;

    const combined = buildNovelGroupCombinedText(group);
    if (!combined.trim()) {
      toast(`第${group.episodeIndex}集原文内容为空`, "error");
      return;
    }

    setNovelGroups((prev) => {
      const updated = prev.map((g, i) =>
        i === groupIndex
          ? { ...g, compressStatus: "done" as const, compressError: undefined, compressedContent: combined }
          : g
      );
      void persistCurrent({ novelAdaptationGroups: updated });
      return updated;
    });
    toast(`第${group.episodeIndex}集已按原文设置为已改编`, "success");
  };

  // 批量改编所有集（并发）
  const handleNovelBatchCompress = async () => {
    if (novelBatchRunning) return;
    novelBatchCancelRef.current = false;
    setNovelBatchRunning(true);

    const pending = novelGroups
      .map((g, i) => ({ group: g, index: i }))
      .filter(({ group }) => group.compressStatus !== "done");

    if (pending.length === 0) {
      setNovelBatchRunning(false);
      return;
    }

    // 全部并发发出，prevEpisodeTail 使用当前已有的改编结果（已改编过的集才有）
    await Promise.all(
      pending.map(({ index }) => handleNovelCompressOne(index))
    );

    setNovelBatchRunning(false);
    if (!novelBatchCancelRef.current) {
      toast("全部集改编完成，可进入分集脚本查看", "success");
    }
  };

  // 改编完成后，把 compressedContent 作为 summary 填入 outlines（每集一条大纲），进入分集脚本
  const handleNovelToOutlines = () => {
    const doneGroups = novelGroups.filter((g) => g.compressStatus === "done" && g.compressedContent);
    if (doneGroups.length === 0) {
      toast("请先完成至少一集的内容改编", "error");
      return;
    }

    const newOutlines: ScriptWorkshopEpisodeOutline[] = doneGroups.map((g) => ({
      index: g.episodeIndex,
      title: `第${g.episodeIndex}集`,
      summary: g.compressedContent || "",
    }));

    setOutlines(newOutlines);
    setView("episodes");
    setSelectedEpisodeIndex(newOutlines[0]?.index ?? null);
    toast(`已将 ${doneGroups.length} 集压缩内容转为分集大纲，可开始生成脚本`, "success");
  };

  const canGoEpisodes = Boolean(outlines && outlines.length > 0);
  const scriptsCount = Object.keys(episodeScripts).length;
  const remainingScripts = useMemo(() => {
    if (!outlines) return 0;
    return outlines.filter((o) => !episodeScripts[o.index]).length;
  }, [outlines, episodeScripts]);
  const shouldSyncNovelOutlines = useMemo(() => {
    if (projectMode !== "novel") return false;
    const doneGroups = novelGroups.filter((g) => g.compressStatus === "done" && g.compressedContent);
    if (doneGroups.length === 0) return false;
    const outlineIndex = new Set((outlines || []).map((o) => o.index));
    return doneGroups.some((g) => !outlineIndex.has(g.episodeIndex));
  }, [projectMode, novelGroups, outlines]);

  useEffect(() => {
    if (!outlines || outlines.length === 0) {
      setSelectedEpisodeIndex(null);
      return;
    }
    if (selectedEpisodeIndex == null || !outlines.some((o) => o.index === selectedEpisodeIndex)) {
      setSelectedEpisodeIndex(outlines[0].index);
    }
  }, [outlines, selectedEpisodeIndex]);

  const selectedOutline = useMemo(() => {
    if (!outlines || outlines.length === 0) return null;
    if (selectedEpisodeIndex == null) return outlines[0];
    return outlines.find((o) => o.index === selectedEpisodeIndex) || outlines[0];
  }, [outlines, selectedEpisodeIndex]);

  const selectedEpisodeScript = useMemo(() => {
    if (!selectedOutline) return null;
    return episodeScripts[selectedOutline.index] || null;
  }, [episodeScripts, selectedOutline]);

  const selectedOutlineTemplateName = useMemo(() => {
    const sel = effectiveOutlineTemplateSel;
    if (!sel) return "未配置";

    const name =
      sel.type === "system"
        ? systemOutlinePromptTemplates.find((t) => t.templateCode === sel.id)?.templateName ||
          systemEpisodePromptTemplates.find((t) => t.templateCode === sel.id)?.templateName
        : userOutlinePromptTemplates.find((t) => String(t.id) === sel.id)?.templateName ||
          userEpisodePromptTemplates.find((t) => String(t.id) === sel.id)?.templateName;

    return name || "模板不存在";
  }, [
    effectiveOutlineTemplateSel,
    systemOutlinePromptTemplates,
    systemEpisodePromptTemplates,
    userOutlinePromptTemplates,
    userEpisodePromptTemplates,
  ]);

  const selectedEpisodeTemplateName = useMemo(() => {
    const sel = effectiveEpisodeTemplateSel;
    if (!sel) return "未配置";

    const name =
      sel.type === "system"
        ? systemEpisodePromptTemplates.find((t) => t.templateCode === sel.id)?.templateName ||
          systemOutlinePromptTemplates.find((t) => t.templateCode === sel.id)?.templateName
        : userEpisodePromptTemplates.find((t) => String(t.id) === sel.id)?.templateName ||
          userOutlinePromptTemplates.find((t) => String(t.id) === sel.id)?.templateName;

    return name || "模板不存在";
  }, [
    effectiveEpisodeTemplateSel,
    systemOutlinePromptTemplates,
    systemEpisodePromptTemplates,
    userOutlinePromptTemplates,
    userEpisodePromptTemplates,
  ]);

  const currentDisplayTitle = (projectTitle || "未命名剧本").trim() || "未命名剧本";

  return (
    <>
      <style jsx global>{`
        ::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        ::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.2);
        }
        ::-webkit-scrollbar-thumb {
          background: rgba(168, 85, 247, 0.3);
          border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: rgba(168, 85, 247, 0.5);
        }
        @keyframes swFadeUp {
          from {
            opacity: 0;
            transform: translate3d(0, 8px, 0);
          }
          to {
            opacity: 1;
            transform: translate3d(0, 0, 0);
          }
        }
        .sw-page-enter {
          animation: swFadeUp 420ms cubic-bezier(0.16, 1, 0.3, 1) both;
          will-change: transform, opacity;
        }
        .sw-view-enter {
          animation: swFadeUp 320ms cubic-bezier(0.16, 1, 0.3, 1) both;
          will-change: transform, opacity;
        }
        @media (prefers-reduced-motion: reduce) {
          .sw-page-enter,
          .sw-view-enter {
            animation: none !important;
            transform: none !important;
          }
        }
      `}</style>
      <div className="min-h-screen bg-black text-white">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(168,85,247,0.16),transparent_40%),radial-gradient(circle_at_80%_0%,rgba(34,211,238,0.10),transparent_35%),radial-gradient(circle_at_50%_100%,rgba(236,72,153,0.08),transparent_40%)]" />

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-black/55 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {/* Left-aligned back */}
            <Button
              variant="outline"
              size="sm"
              className="h-9 border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10"
              onClick={() => {
                if (hasDraftContent) void persistCurrent();
                router.push("/script-workshop");
              }}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              剧本列表
            </Button>

            <div className="hidden sm:block h-6 w-px bg-white/10 mx-1" />

            <div className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-500/25 flex items-center justify-center shrink-0">
              <PenTool className="w-4 h-4 text-purple-300" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold leading-tight truncate">剧本工坊 · 编辑</div>
              <div className="text-[11px] text-zinc-500 truncate" suppressHydrationWarning>
                {view === "novel" ? "01 章节改编" : view === "draft" ? "01 灵感&设置" : "02 分集脚本"}
                {lastSavedAt ? ` · 已保存 ${new Date(lastSavedAt).toLocaleTimeString()}` : ""}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 min-w-0">
            <Input
              value={projectTitle}
              onChange={(e) => setProjectTitle(e.target.value)}
              className="h-9 bg-black/40 border-white/10 text-sm min-w-[220px]"
              placeholder="未命名剧本"
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="border-white/10 text-zinc-300 hover:bg-white/10"
              onClick={() => setConfigOpen(true)}
            >
              <Settings2 className="w-4 h-4 mr-2" />
              参数/模板
            </Button>
          </div>
        </div>
      </header>

      {/* Config Dialog */}
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="bg-zinc-950 border-white/10 text-white max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg">参数与模板</DialogTitle>
            <DialogDescription>这里的设置会影响大纲/分集脚本生成效果</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <div className="text-xs text-zinc-400 mb-2">基础设置</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-zinc-500 block mb-1.5">视觉风格</label>
                    <Select
                      value={settings.visualStyle}
                      onValueChange={(v) => setSettings((s) => ({ ...s, visualStyle: v as any }))}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="anime">动漫短剧</SelectItem>
                        <SelectItem value="live_action">真人短剧</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500 block mb-1.5">叙事方式</label>
                    <Select
                      value={settings.narrativeMode}
                      onValueChange={(v) => setSettings((s) => ({ ...s, narrativeMode: v as any }))}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="narration_only">纯解说</SelectItem>
                        <SelectItem value="mixed">半解说</SelectItem>
                        <SelectItem value="dialogue_only">纯对话</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {projectMode === "normal" ? (
                    <div>
                      <label className="text-[10px] text-zinc-500 block mb-1.5">集数</label>
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        value={settings.episodesCount}
                        onChange={(e) =>
                          setSettings((s) => ({ ...s, episodesCount: Math.max(1, Number(e.target.value) || 1) }))
                        }
                        className="h-9 text-xs bg-black/50 border-white/10 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>
                  ) : null}
                  <div>
                    <label className="text-[10px] text-zinc-500 block mb-1.5">单集时长</label>
                    <Input
                      type="number"
                      min={1}
                      max={3600}
                      value={settings.episodeDurationSec}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          episodeDurationSec: Math.max(1, Math.min(3600, Number(e.target.value) || 1)),
                        }))
                      }
                      className="h-9 text-xs bg-black/50 border-white/10 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 border-white/10 text-zinc-300 hover:bg-white/10 text-[10px]"
                        onClick={() => setSettings((s) => ({ ...s, episodeDurationSec: 60 }))}
                      >
                        60s
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 border-white/10 text-zinc-300 hover:bg-white/10 text-[10px]"
                        onClick={() => setSettings((s) => ({ ...s, episodeDurationSec: 90 }))}
                      >
                        90s
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 border-white/10 text-zinc-300 hover:bg-white/10 text-[10px]"
                        onClick={() => setSettings((s) => ({ ...s, episodeDurationSec: 120 }))}
                      >
                        120s
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[10px] text-zinc-500 block mb-1.5">语言风格/题材（可选）</label>
                <Input
                  value={settings.tone}
                  onChange={(e) => setSettings((s) => ({ ...s, tone: e.target.value }))}
                  className="h-9 text-xs bg-black/50 border-white/10"
                  placeholder="例如：无 / 悬疑+反转 / 甜宠 / 搞笑"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 border-white/10 text-zinc-300 hover:bg-white/10 text-[10px]"
                    onClick={() => setSettings((s) => ({ ...s, tone: "无" }))}
                  >
                    无
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 border-white/10 text-zinc-300 hover:bg-white/10 text-[10px]"
                    onClick={() => setSettings((s) => ({ ...s, tone: "悬疑+反转" }))}
                  >
                    悬疑+反转
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 border-white/10 text-zinc-300 hover:bg-white/10 text-[10px]"
                    onClick={() => setSettings((s) => ({ ...s, tone: "甜宠" }))}
                  >
                    甜宠
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 border-white/10 text-zinc-300 hover:bg-white/10 text-[10px]"
                    onClick={() => setSettings((s) => ({ ...s, tone: "搞笑" }))}
                  >
                    搞笑
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 border-white/10 text-zinc-300 hover:bg-white/10 text-[10px]"
                    onClick={() => setSettings((s) => ({ ...s, tone: "热血" }))}
                  >
                    热血
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 border-white/10 text-zinc-300 hover:bg-white/10 text-[10px]"
                    onClick={() => setSettings((s) => ({ ...s, tone: "爽文" }))}
                  >
                    爽文
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-xs text-zinc-400">提示词模板</div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 border-white/10 text-zinc-300 hover:bg-white/10 text-[10px]"
                    onClick={() => setCreateUserTemplateOpen((v) => !v)}
                  >
                    新增
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-[10px] text-zinc-500 hover:text-white"
                    onClick={loadPromptTemplates}
                    disabled={loadingPromptTemplates}
                  >
                    {loadingPromptTemplates ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                    刷新
                  </Button>
                </div>
              </div>

              {createUserTemplateOpen && (
                <div className="rounded-xl border border-white/10 bg-black/30 p-3 space-y-3">
                  <div className="text-[11px] text-zinc-400">新增用户模板（仅自己可见）</div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] text-zinc-500 block mb-1.5">用途</label>
                      <Select
                        value={newTemplateApplyTo}
                        onValueChange={(v) => setNewTemplateApplyTo(v as "outline" | "episode")}
                      >
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="outline">分集大纲</SelectItem>
                          <SelectItem value="episode">分集脚本</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-500 block mb-1.5">名称</label>
                      <Input
                        value={newTemplateName}
                        onChange={(e) => setNewTemplateName(e.target.value)}
                        className="h-9 text-xs bg-black/50 border-white/10"
                        placeholder={newTemplateApplyTo === "outline" ? "我的大纲模板" : "我的脚本模板"}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] text-zinc-500 block mb-1.5">说明（可选）</label>
                    <Input
                      value={newTemplateDescription}
                      onChange={(e) => setNewTemplateDescription(e.target.value)}
                      className="h-9 text-xs bg-black/50 border-white/10"
                      placeholder="例如：更强反转/更少旁白/更密集镜头..."
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-zinc-500 block mb-1.5">提示词内容</label>
                    <Textarea
                      value={newTemplatePrompt}
                      onChange={(e) => setNewTemplatePrompt(e.target.value)}
                      className="min-h-[140px] bg-black/50 border-white/10 text-xs leading-relaxed resize-none focus:border-purple-500/50"
                      placeholder="直接写提示词即可（系统会自动拼接输入参数/原文/本集大纲；也兼容 {sourceText}/{episodeIndex} 等占位符）"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-white/10 text-zinc-300 hover:bg-white/10"
                      onClick={() => setCreateUserTemplateOpen(false)}
                      disabled={creatingUserTemplate}
                    >
                      取消
                    </Button>
                    <Button
                      size="sm"
                      className="bg-gradient-to-r from-purple-600 to-indigo-600"
                      onClick={handleCreateUserTemplate}
                      disabled={creatingUserTemplate}
                    >
                      {creatingUserTemplate ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                      保存模板
                    </Button>
                  </div>
                </div>
              )}

              {/* 分集大纲模板 */}
              {view !== "novel" && (
              <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-zinc-200">分集大纲模板</div>
                    <div className="text-xs text-zinc-500 mt-0.5">用于生成整体剧情大纲</div>
                  </div>
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-purple-500/10 border border-purple-500/20">
                    <div className="w-2 h-2 rounded-full bg-purple-400"></div>
                    <span className="text-[10px] text-purple-300 font-medium">{selectedOutlineTemplateName}</span>
                  </div>
                </div>
                <Select
                  value={
                    effectiveOutlineTemplateSel ? `${effectiveOutlineTemplateSel.type}:${effectiveOutlineTemplateSel.id}` : ""
                  }
                  onValueChange={(v) => {
                    const [type, id] = v.split(":");
                    if (type === "system" || type === "user") {
                      setOutlinePromptTemplateSel({ type: type as "system" | "user", id });
                    }
                  }}
                  disabled={
                    loadingPromptTemplates ||
                    (systemOutlinePromptTemplates.length === 0 && userOutlinePromptTemplates.length === 0)
                  }
                >
                  <SelectTrigger className="w-full focus:ring-purple-500/40 focus:border-purple-500/50">
                    <SelectValue placeholder="选择模板" />
                  </SelectTrigger>
                  <SelectContent>
                    {systemOutlinePromptTemplates.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>📦 系统模板</SelectLabel>
                        {systemOutlinePromptTemplates.map((t) => (
                          <SelectItem key={t.templateCode} value={`system:${t.templateCode}`}>
                            {t.templateName}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                    {userOutlinePromptTemplates.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>👤 我的模板</SelectLabel>
                        {userOutlinePromptTemplates.map((t) => (
                          <SelectItem key={t.id} value={`user:${t.id}`}>
                            {t.templateName}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                  </SelectContent>
                </Select>
              </div>
              )}

              {/* 分集脚本模板 */}
              <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-zinc-200">分集脚本模板</div>
                    <div className="text-xs text-zinc-500 mt-0.5">用于生成每集详细脚本</div>
                  </div>
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                    <span className="text-[10px] text-emerald-300 font-medium">{selectedEpisodeTemplateName}</span>
                  </div>
                </div>
                <Select
                  value={
                    effectiveEpisodeTemplateSel ? `${effectiveEpisodeTemplateSel.type}:${effectiveEpisodeTemplateSel.id}` : ""
                  }
                  onValueChange={(v) => {
                    const [type, id] = v.split(":");
                    if (type === "system" || type === "user") {
                      setEpisodePromptTemplateSel({ type: type as "system" | "user", id });
                    }
                  }}
                  disabled={
                    loadingPromptTemplates ||
                    (systemEpisodePromptTemplates.length === 0 && userEpisodePromptTemplates.length === 0)
                  }
                >
                  <SelectTrigger className="w-full focus:ring-emerald-500/40 focus:border-emerald-500/50">
                    <SelectValue placeholder="选择模板" />
                  </SelectTrigger>
                  <SelectContent>
                    {systemEpisodePromptTemplates.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>📦 系统模板</SelectLabel>
                        {systemEpisodePromptTemplates.map((t) => (
                          <SelectItem key={t.templateCode} value={`system:${t.templateCode}`}>
                            {t.templateName}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                    {userEpisodePromptTemplates.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>👤 我的模板</SelectLabel>
                        {userEpisodePromptTemplates.map((t) => (
                          <SelectItem key={t.id} value={`user:${t.id}`}>
                            {t.templateName}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {systemOutlinePromptTemplates.length === 0 &&
                systemEpisodePromptTemplates.length === 0 &&
                userOutlinePromptTemplates.length === 0 &&
                userEpisodePromptTemplates.length === 0 &&
                !loadingPromptTemplates && (
                  <div className="text-[10px] text-zinc-500">
                    暂无模板（请在后台添加 category=SCRIPT_WORKSHOP_OUTLINE / SCRIPT_WORKSHOP_EPISODE，或先执行默认模板的 SQL seed）
                  </div>
                )}

              {/* 小说改编模板 */}
              {projectMode === "novel" && (
                <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-zinc-200">小说改编模板</div>
                      <div className="text-xs text-zinc-500 mt-0.5">用于将多章节内容改编为一集故事</div>
                    </div>
                  </div>
                  <Select
                    value={novelCompressTemplateSel ? `${novelCompressTemplateSel.type}:${novelCompressTemplateSel.id}` : ""}
                    onValueChange={(v) => {
                      const [type, id] = v.split(":");
                      if (type === "system" || type === "user") setNovelCompressTemplateSel({ type: type as "system" | "user", id });
                    }}
                    disabled={loadingPromptTemplates || (systemNovelCompressTemplates.length === 0 && userNovelCompressTemplates.length === 0)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="选择压缩模板" />
                    </SelectTrigger>
                    <SelectContent>
                      {systemNovelCompressTemplates.length > 0 && (
                        <SelectGroup>
                          <SelectLabel>📦 系统模板</SelectLabel>
                          {systemNovelCompressTemplates.map((t) => (
                            <SelectItem key={t.templateCode} value={`system:${t.templateCode}`}>{t.templateName}</SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                      {userNovelCompressTemplates.length > 0 && (
                        <SelectGroup>
                          <SelectLabel>👤 我的模板</SelectLabel>
                          {userNovelCompressTemplates.map((t) => (
                            <SelectItem key={t.id} value={`user:${t.id}`}>{t.templateName}</SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                    </SelectContent>
                  </Select>
                  {systemNovelCompressTemplates.length === 0 && userNovelCompressTemplates.length === 0 && !loadingPromptTemplates && (
                    <div className="text-[10px] text-zinc-500">
                      暂无模板，请在后台添加 category=SCRIPT_WORKSHOP_NOVEL_COMPRESS 的模板
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-sm p-4 md:p-6 space-y-6 sw-page-enter">
          {/* Stepper */}
          <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
            {projectMode === "novel" ? (
              // 小说改编模式：章节改编 → 分集脚本 → 分镜导入
              <>
                <button
                  type="button"
                  onClick={() => setView("novel")}
                  className={`px-3 py-2 rounded-lg text-sm transition ${
                    view === "novel" ? "bg-white/10 text-white" : "text-zinc-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  01 章节改编
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (shouldSyncNovelOutlines) {
                      handleNovelToOutlines();
                      return;
                    }
                    setView("episodes");
                  }}
                  disabled={!canGoEpisodes}
                  className={`px-3 py-2 rounded-lg text-sm transition ${
                    view === "episodes" ? "bg-white/10 text-white" : "text-zinc-400 hover:text-white hover:bg-white/5"
                  } disabled:opacity-50 disabled:hover:bg-transparent`}
                >
                  02 分集脚本
                </button>
                <button
                  type="button"
                  onClick={() => { if (scriptsCount === 0) return; void persistCurrent(); router.push(`/script-workshop/pipeline/${encodeURIComponent(projectId)}`); }}
                  disabled={scriptsCount === 0}
                  className="px-3 py-2 rounded-lg text-sm transition text-zinc-400 hover:text-white hover:bg-white/5 disabled:opacity-50 disabled:hover:bg-transparent"
                  title={scriptsCount === 0 ? "请先生成至少一集脚本" : "进入分镜&导入"}
                >
                  03 分镜导入
                </button>
              </>
            ) : (
              // 普通模式：灵感 → 分集脚本 → 分镜导入
              <>
                <button
                  type="button"
                  onClick={() => setView("draft")}
                  className={`px-3 py-2 rounded-lg text-sm transition ${
                    view === "draft" ? "bg-white/10 text-white" : "text-zinc-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  01 灵感
                </button>
                <button
                  type="button"
                  onClick={() => setView("episodes")}
                  disabled={!canGoEpisodes}
                  className={`px-3 py-2 rounded-lg text-sm transition ${
                    view === "episodes" ? "bg-white/10 text-white" : "text-zinc-400 hover:text-white hover:bg-white/5"
                  } disabled:opacity-50 disabled:hover:bg-transparent`}
                >
                  02 分集脚本
                </button>
                <button
                  type="button"
                  onClick={() => { if (scriptsCount === 0) return; void persistCurrent(); router.push(`/script-workshop/pipeline/${encodeURIComponent(projectId)}`); }}
                  disabled={scriptsCount === 0}
                  className="px-3 py-2 rounded-lg text-sm transition text-zinc-400 hover:text-white hover:bg-white/5 disabled:opacity-50 disabled:hover:bg-transparent"
                  title={scriptsCount === 0 ? "请先生成至少一集脚本" : "进入分镜&导入"}
                >
                  03 分镜导入
                </button>
              </>
            )}
          </div>

          <div className="ml-auto text-xs text-zinc-500">
            {outlines ? (
              <span>
                大纲 {outlines.length} 集 · 已生成 {scriptsCount} 集脚本
              </span>
            ) : (
              <span>先写灵感，再生成大纲</span>
            )}
          </div>
        </div>

        {view === "novel" && (
          <div className="space-y-4 sw-view-enter">
            {/* 顶部操作栏 */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-4">
                <div>
                  <div className="text-sm font-semibold text-zinc-200">小说章节改编</div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    共 {novelChapters.length} 章 · {novelGroups.length} 集 ·{" "}
                    {novelGroups.filter((g) => g.compressStatus === "done").length} 集已改编
                  </div>
                </div>
                <div className="h-8 w-px bg-white/10" />
                <div className="text-xs text-zinc-400 space-y-0.5">
                  <div>单集时长：{settings.episodeDurationSec}s</div>
                  <div>改编模板：{novelCompressTemplateSel ? (
                    novelCompressTemplateSel.type === "system"
                      ? systemNovelCompressTemplates.find(t => t.templateCode === novelCompressTemplateSel.id)?.templateName || "系统模板"
                      : userNovelCompressTemplates.find(t => String(t.id) === novelCompressTemplateSel.id)?.templateName || "用户模板"
                  ) : "默认模板"}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-white/10 text-zinc-300 hover:bg-white/10"
                  onClick={() => setConfigOpen(true)}
                >
                  <Settings2 className="w-3.5 h-3.5 mr-1.5" />
                  参数配置
                </Button>
                {novelBatchRunning ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-white/10 text-zinc-400"
                    disabled
                  >
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    改编中...
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-white/10 text-zinc-300 hover:bg-white/10"
                    onClick={handleNovelBatchCompress}
                  >
                    <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                    一键改编全部
                  </Button>
                )}
                <Button
                  size="sm"
                  className="bg-purple-600 hover:bg-purple-500 text-white"
                  onClick={handleNovelToOutlines}
                  disabled={novelGroups.filter((g) => g.compressStatus === "done").length === 0}
                >
                  进入分集脚本 →
                </Button>
              </div>
            </div>

            {/* 无改编模板提示（使用内置默认模板，此提示仅供参考） */}
            {!novelCompressTemplateSel?.id && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/8 px-4 py-3 text-xs text-amber-300">
                未配置改编模板，将使用内置默认模板。如需自定义，请在后台添加 category=SCRIPT_WORKSHOP_NOVEL_COMPRESS 的模板
              </div>
            )}

            {/* 分集列表 */}
            <div className="space-y-3">
              {novelGroups.map((group, gi) => {
                const chaps = novelChapters.filter((c) => group.chapterIndexes.includes(c.index));
                const first = chaps[0];
                const last = chaps[chaps.length - 1];
                const chapRange = chaps.length === 1 ? first?.title : `${first?.title} ~ ${last?.title}`;
                const isCompressing = group.compressStatus === "compressing";
                const isDone = group.compressStatus === "done";
                const isFailed = group.compressStatus === "failed";

                return (
                  <div
                    key={group.episodeIndex}
                    className={`rounded-xl border p-4 space-y-3 transition-colors ${
                      isDone
                        ? "border-emerald-500/25 bg-emerald-500/5"
                        : isFailed
                        ? "border-red-500/25 bg-red-500/5"
                        : isCompressing
                        ? "border-purple-500/30 bg-purple-500/5"
                        : "border-white/10 bg-white/3"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-zinc-200">第{group.episodeIndex}集</span>
                          <span className="text-xs text-zinc-500 truncate">{chapRange}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                            isDone ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" :
                            isFailed ? "border-red-500/30 bg-red-500/10 text-red-300" :
                            isCompressing ? "border-purple-500/30 bg-purple-500/10 text-purple-300" :
                            "border-zinc-600 bg-zinc-800 text-zinc-400"
                          }`}>
                            {isDone ? "已改编" : isFailed ? "失败" : isCompressing ? "改编中..." : "待改编"}
                          </span>
                          <span className={`text-[10px] text-zinc-500 ${group.totalChars > 30000 ? "text-amber-400" : ""}`}>
                            {(group.totalChars / 10000).toFixed(1)}万字{group.totalChars > 30000 ? " ⚠" : ""}
                          </span>
                          {isDone && group.compressedContent ? (
                            <span className="text-[10px] text-zinc-500">
                              改编后 {formatCharCount(group.compressedContent.length)}
                            </span>
                          ) : null}
                        </div>
                        {isFailed && group.compressError && (
                          <div className="mt-1 text-xs text-red-400">{group.compressError}</div>
                        )}
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 border-white/10 text-zinc-300 hover:bg-white/10 text-xs"
                          disabled={isCompressing || novelBatchRunning}
                          onClick={() => handleNovelUseOriginalOne(gi)}
                        >
                          按原文
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 border-white/10 text-zinc-300 hover:bg-white/10 text-xs"
                          disabled={isCompressing || novelBatchRunning}
                          onClick={() => handleNovelCompressOne(gi)}
                        >
                          {isCompressing ? <Loader2 className="w-3 h-3 animate-spin" /> : isDone ? "重新改编" : "改编"}
                        </Button>
                      </div>
                    </div>

                    {isDone && group.compressedContent && (
                      <div className="rounded-lg bg-black/30 border border-white/8 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="text-[10px] text-zinc-500">
                            改编结果 · {formatCharCount(group.compressedContent.length)}（将作为该集大纲内容）
                          </div>
                          <button
                            type="button"
                            className="text-[10px] text-purple-400 hover:text-purple-300 transition-colors"
                            onClick={() => setPreviewModal({ title: `第${group.episodeIndex}集改编内容`, content: group.compressedContent! })}
                          >
                            查看全文
                          </button>
                        </div>
                        <div className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap max-h-28 overflow-y-auto pr-1">
                          {group.compressedContent}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {view === "draft" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sw-view-enter">
            <div className="lg:col-span-8">
              <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
                <div className="p-5 border-b border-white/10 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">构思 / 小说原文</div>
                    <div className="text-xs text-zinc-500 mt-1">写一句灵感也可以，越具体越好</div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-white/10 text-zinc-300 hover:bg-white/10"
                    onClick={handleImportFile}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    导入文件
                  </Button>
                </div>
                <div className="p-5">
                  <Textarea
                    value={sourceText}
                    onChange={(e) => setSourceText(e.target.value)}
                    className="min-h-[420px] bg-black/40 border-white/10 text-sm leading-relaxed resize-none focus:border-purple-500/50"
                    placeholder={
                      "示例：\n\n女主发现自己每晚12点会回到同一天，她要在10集内找出真凶。\n要求：每集1分30秒，节奏紧凑，冲突密集。"
                    }
                  />
                </div>
              </div>
            </div>

            <div className="lg:col-span-4 space-y-6">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="text-sm font-semibold">当前参数概览</div>
                <div className="mt-3 space-y-2 text-xs text-zinc-400">
                  <div className="flex items-center justify-between">
                    <span>风格</span>
                    <span className="text-zinc-200">{settings.visualStyle === "anime" ? "动漫" : "真人"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>叙事</span>
                    <span className="text-zinc-200">{settings.narrativeMode}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>集数</span>
                    <span className="text-zinc-200">{settings.episodesCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>单集时长</span>
                    <span className="text-zinc-200">{settings.episodeDurationSec}s</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>大纲模板</span>
                    <span className="text-zinc-200 truncate max-w-[180px]" title={selectedOutlineTemplateName}>
                      {selectedOutlineTemplateName}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>脚本模板</span>
                    <span className="text-zinc-200 truncate max-w-[180px]" title={selectedEpisodeTemplateName}>
                      {selectedEpisodeTemplateName}
                    </span>
                  </div>
                </div>

                <div className="mt-4">
                  <Button
                    variant="outline"
                    className="w-full border-white/10 text-zinc-300 hover:bg-white/10"
                    onClick={() => setConfigOpen(true)}
                  >
                    <Settings2 className="w-4 h-4 mr-2" />
                    调整
                  </Button>
                </div>
              </div>

              <Button
                onClick={handleGenerateOutline}
                disabled={loadingOutline || !sourceText.trim()}
                className="w-full h-12 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500"
              >
                {loadingOutline ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    生成大纲中...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    生成分集大纲
                  </>
                )}
              </Button>

              {outlines && outlines.length > 0 && (
                <Button
                  variant="outline"
                  className="w-full border-white/10 text-zinc-300 hover:bg-white/10"
                  onClick={() => setView("episodes")}
                >
                  继续：分集脚本（已生成大纲）
                </Button>
              )}
            </div>
          </div>
        )}

        {view === "episodes" && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 sw-view-enter">
            {/* Episode list */}
            <div className="xl:col-span-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
                <div className="p-5 border-b border-white/10">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold">分集列表</div>
                      <div className="text-xs text-zinc-500 mt-1">选择一集查看详情与脚本</div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-zinc-500 hover:text-white"
                      onClick={() => setView("draft")}
                    >
                      返回灵感
                    </Button>
                  </div>
                </div>

                <div className="max-h-[660px] overflow-y-auto custom-scrollbar p-2 space-y-1">
                  {!outlines || outlines.length === 0 ? (
                    <div className="text-sm text-zinc-500 p-4">暂无大纲，请先在第 1 步生成。</div>
                  ) : (
                    outlines.map((o) => {
                      const active = selectedOutline?.index === o.index;
                      const hasScript = Boolean(episodeScripts[o.index]);

                      return (
                        <button
                          key={o.index}
                          type="button"
                          onClick={() => setSelectedEpisodeIndex(o.index)}
                          className={`w-full text-left p-3 rounded-xl border transition ${
                            active
                              ? "bg-white/10 border-white/15"
                              : "bg-transparent border-transparent hover:bg-white/5 hover:border-white/10"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="w-9 h-9 rounded-lg bg-black/30 border border-white/10 flex items-center justify-center font-mono text-xs text-zinc-300 shrink-0">
                              {String(o.index).padStart(2, "0")}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <div className="truncate text-sm font-medium text-white">{o.title}</div>
                                <span
                                  className={`text-[10px] px-1.5 py-0.5 rounded border ${
                                    hasScript
                                      ? "text-emerald-300 border-emerald-500/30 bg-emerald-500/10"
                                      : "text-zinc-400 border-white/10 bg-white/5"
                                  }`}
                                >
                                  {hasScript ? "已生成" : "未生成"}
                                </span>
                              </div>
                              <div className="text-xs text-zinc-500 mt-1 line-clamp-2">{o.summary}</div>
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Episode detail */}
            <div className="xl:col-span-8">
              <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
                {!selectedOutline ? (
                  <div className="p-10 text-zinc-500">请选择一集</div>
                ) : (
                  <>
                    <div className="p-6 border-b border-white/10">
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="text-xs text-zinc-500">第 {selectedOutline.index} 集</div>
                            <div className="text-xl font-bold text-white mt-1">{selectedOutline.title}</div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              size="sm"
                              variant={selectedEpisodeScript ? "outline" : "secondary"}
                              onClick={() => handleGenerateEpisodeScript(selectedOutline)}
                              disabled={loadingEpisodeIndex === selectedOutline.index}
                              className={
                                selectedEpisodeScript
                                  ? "border-white/10 text-zinc-300 hover:bg-white/10"
                                  : "bg-purple-500/10 text-purple-300 hover:bg-purple-500/20"
                              }
                            >
                              {loadingEpisodeIndex === selectedOutline.index ? (
                                <>
                                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                  生成中
                                </>
                              ) : selectedEpisodeScript ? (
                                "重新生成"
                              ) : (
                                "生成脚本"
                              )}
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              className="border-white/10 text-zinc-300 hover:bg-white/10"
                              onClick={() => {
                                if (!selectedEpisodeScript) {
                                  toast("请先生成该集脚本", "info");
                                  return;
                                }
                                downloadText(
                                  `${currentDisplayTitle}_第${selectedEpisodeScript.index}集.md`,
                                  formatEpisodeToText(selectedEpisodeScript)
                                );
                              }}
                            >
                              <Download className="w-4 h-4 mr-2" />
                              下载MD
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-xs text-zinc-500">剧情摘要</span>
                              <button
                                type="button"
                                className="text-[10px] text-purple-400 hover:text-purple-300 transition-colors"
                                onClick={() => setPreviewModal({
                                  title: `第${selectedOutline.index}集 - 剧情摘要`,
                                  content: selectedOutline.summary,
                                })}
                              >
                                查看全文
                              </button>
                            </div>
                            <div className="text-sm text-zinc-400 leading-relaxed max-h-40 overflow-y-auto pr-1">
                              {selectedOutline.summary}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="p-6">
                      {selectedEpisodeScript ? (
                        <div className="space-y-2">
                          <div className="rounded-xl border border-white/10 bg-black/40 p-4 font-mono text-xs text-zinc-200 whitespace-pre-wrap leading-relaxed max-h-[260px] overflow-y-auto custom-scrollbar">
                            {formatEpisodeToText(selectedEpisodeScript)}
                          </div>
                          <div className="flex justify-end">
                            <button
                              type="button"
                              className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
                              onClick={() => setPreviewModal({
                                title: `第${selectedEpisodeScript.index}集脚本`,
                                content: formatEpisodeToText(selectedEpisodeScript),
                              })}
                            >
                              查看全文
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-white/10 bg-black/30 p-10 text-zinc-500">
                          该集还没有生成脚本。点击右上角"生成脚本"。
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
        </div>
      </main>

      {/* Sticky bottom command bar */}
      {outlines && outlines.length > 0 && (
        <div className="sticky bottom-0 z-30 border-t border-white/10 bg-black/60 backdrop-blur">
          <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
            <div className="text-sm text-zinc-400">
              {batchGenerating ? (
                <span className="flex items-center gap-2 text-purple-300">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {loadingEpisodeIndex ? `正在生成第 ${loadingEpisodeIndex} 集...` : "正在批量生成中..."}
                </span>
              ) : (
                <span>
                  共 {outlines.length} 集，已生成 {scriptsCount} 集
                  {remainingScripts > 0 ? `（剩余 ${remainingScripts} 集）` : "（已全部生成）"}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              {batchGenerating ? (
                <Button
                  variant="outline"
                  className="border-red-500/30 text-red-300 hover:bg-red-500/10"
                  onClick={handleCancelBatchGenerate}
                  disabled={batchCancelling}
                >
                  {batchCancelling ? "取消中..." : "取消生成"}
                </Button>
              ) : (
                <>
                  {remainingScripts > 0 && (
                    <Button
                      variant="outline"
                      className="border-purple-500/30 text-purple-300 hover:bg-purple-500/10"
                      onClick={handleBatchGenerateAll}
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      一键生成剩余脚本
                    </Button>
                  )}

                  <Button
                    className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white px-6"
                    disabled={scriptsCount === 0}
                    onClick={() => {
                      void persistCurrent();
                      router.push(`/script-workshop/pipeline/${encodeURIComponent(projectId)}`);
                    }}
                  >
                    下一步：分镜制作 & 导入
                    <Sparkles className="w-4 h-4 ml-2" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>

    {/* 全文预览弹窗 */}
    {previewModal && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
        onClick={() => setPreviewModal(null)}
      >
        <div
          className="relative w-full max-w-2xl max-h-[80vh] flex flex-col rounded-2xl border border-white/15 bg-[#0d1117] shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
            <div className="text-sm font-semibold text-zinc-200">{previewModal.title}</div>
            <button
              type="button"
              className="text-zinc-500 hover:text-zinc-200 transition-colors text-lg leading-none"
              onClick={() => setPreviewModal(null)}
            >
              ✕
            </button>
          </div>
          <div className="overflow-y-auto p-5 flex-1">
            <div className="font-mono text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed">
              {previewModal.content}
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
