"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast-provider";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { MoreHorizontal, PenTool, Plus } from "lucide-react";
import { newProjectId, type ScriptWorkshopProjectRecord } from "@/lib/script-workshop/storage";
import {
  deleteScriptWorkshopProject,
  listScriptWorkshopProjects,
  upsertScriptWorkshopProject,
} from "@/lib/script-workshop/projects-api";
import type { ScriptWorkshopSettings } from "@/lib/script-workshop/types";
import NovelImportDialog from "./novel-import-dialog";
import type { NovelChapter, NovelAdaptationGroup } from "@/lib/script-workshop/types";

const DEFAULT_SETTINGS: ScriptWorkshopSettings = {
  visualStyle: "anime",
  narrativeMode: "mixed",
  tone: "无",
  episodesCount: 10,
  episodeDurationSec: 90,
  avgShotSec: 3.5,
  platformPreset: "short_video",
  aspectRatio: "9:16",
};

function formatRelativeTime(value?: string): string {
  if (!value) return "-";
  const ts = new Date(value).getTime();
  if (Number.isNaN(ts)) return "-";

  const diff = Date.now() - ts;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return "刚刚";
  if (diff < hour) return `${Math.max(1, Math.floor(diff / minute))} 分钟前`;
  if (diff < day) return `${Math.max(1, Math.floor(diff / hour))} 小时前`;
  if (diff < 30 * day) return `${Math.max(1, Math.floor(diff / day))} 天前`;

  return new Date(ts).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

export default function ScriptWorkshopListPage() {
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();

  const [projects, setProjects] = useState<ScriptWorkshopProjectRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [novelImportOpen, setNovelImportOpen] = useState(false);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const list = await listScriptWorkshopProjects();
      setProjects(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error("load projects failed", err);
      toast("加载剧本工坊项目失败", "error");
      setProjects([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProjects();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => {
      const hay = `${p.title} ${p.sourceText || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [projects, search]);

  const handleCreate = async () => {
    const title = newTitle.trim();
    if (!title) {
      toast("请输入剧本标题", "error");
      return;
    }

    const id = newProjectId();
    const now = new Date().toISOString();
    const record: ScriptWorkshopProjectRecord = {
      id,
      title,
      sourceText: "",
      settings: DEFAULT_SETTINGS,
      createdAt: now,
      updatedAt: now,
      outlines: [],
      episodeScripts: {},
    };

    try {
      await upsertScriptWorkshopProject(id, record);
      setCreateOpen(false);
      setNewTitle("");
      router.push(`/script-workshop/editor?projectId=${encodeURIComponent(id)}`);
    } catch (err) {
      console.error("create project failed", err);
      toast("创建失败，请稍后重试", "error");
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: "确认删除剧本",
      description: "删除后不可恢复，确定继续吗？",
      confirmText: "删除",
      cancelText: "取消",
      variant: "danger",
    });
    if (!ok) return;

    try {
      await deleteScriptWorkshopProject(id);
      await loadProjects();
      toast("已删除", "success");
    } catch (err) {
      console.error("delete project failed", err);
      toast("删除失败，请稍后重试", "error");
    }
  };

  const handleNovelImport = async (params: {
    title: string;
    chapters: NovelChapter[];
    groups: NovelAdaptationGroup[];
    episodesCount: number;
  }) => {
    const id = newProjectId();
    const now = new Date().toISOString();
    const record: ScriptWorkshopProjectRecord = {
      id,
      title: params.title,
      sourceText: "",
      settings: {
        ...DEFAULT_SETTINGS,
        episodesCount: params.episodesCount,
      },
      createdAt: now,
      updatedAt: now,
      mode: "novel",
      outlines: [],
      episodeScripts: {},
      novelChapters: params.chapters,
      novelAdaptationGroups: params.groups,
    };

    try {
      await upsertScriptWorkshopProject(id, record);
      setNovelImportOpen(false);
      router.push(`/script-workshop/editor?projectId=${encodeURIComponent(id)}`);
    } catch (err) {
      console.error("create novel project failed", err);
      toast("创建失败，请稍后重试", "error");
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#04060a] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[22%] top-[10%] h-72 w-72 rounded-full bg-purple-700/7 blur-[145px]" />
        <div className="absolute right-[18%] top-[16%] h-80 w-80 rounded-full bg-cyan-500/5 blur-[160px]" />
        <div className="absolute bottom-[-220px] left-1/2 h-[420px] w-[620px] -translate-x-1/2 rounded-full bg-[#5a1632]/14 blur-[190px]" />
      </div>

      <main className="relative w-full px-4 pb-10 pt-3">
        <section className="mb-3 rounded-lg border border-[#252937] bg-[linear-gradient(100deg,rgba(28,21,42,0.42),rgba(7,13,21,0.82)_56%,rgba(6,17,19,0.74))] px-4 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0 max-w-[760px]">
              <div className="mb-1 flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-md border border-purple-400/20 bg-purple-500/10">
                  <PenTool className="h-3.5 w-3.5 text-purple-300/90" />
                </div>
                <h1 className="truncate text-[19px] font-semibold tracking-tight text-zinc-100/95">
                  剧本工坊 · 剧本列表
                </h1>
              </div>
              <p className="text-[11px] leading-4 text-zinc-400/65">新增时只需要填名称，其他参数进编辑页再调</p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="h-8 rounded-md border-[#2b313d] bg-[#0b1118]/85 px-3 text-[13px] text-zinc-300 hover:bg-[#121924] hover:text-zinc-100"
                onClick={() => setNovelImportOpen(true)}
              >
                小说改编
              </Button>
              <Button
                onClick={() => setCreateOpen(true)}
                className="h-8 rounded-md border border-[#2b313d] bg-[#0b1118]/85 px-3 text-[13px] text-zinc-200 hover:bg-[#121924] hover:text-white"
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                新增剧本
              </Button>
            </div>
          </div>
        </section>

        <section className="rounded-[22px] border border-[#2b2f3c] bg-[linear-gradient(108deg,rgba(39,23,58,0.28),rgba(9,16,29,0.74)_50%,rgba(5,14,22,0.86)_92%)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_20px_52px_rgba(0,0,0,0.5)]">
          <div className="mb-5 flex items-start gap-3">
            <div className="flex-1">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索剧本名称 / ID"
                className="h-10 rounded-md border-[#292e39] bg-[#090e16]/92 px-3 text-[14px] text-zinc-100 placeholder:text-zinc-500"
              />
            </div>
            <div className="w-14 pt-1 text-right text-[12px] leading-5 text-zinc-500">
              <div>显示</div>
              <div>
                {filtered.length}/{projects.length}
              </div>
            </div>
          </div>

          <div className="min-h-[240px]">
            {loading ? <div className="py-16 text-center text-sm text-zinc-500">加载中...</div> : null}

            {!loading && filtered.length === 0 ? (
              <div className="py-16 text-center text-sm text-zinc-500">暂无项目</div>
            ) : null}

            {!loading && filtered.length > 0 ? (
              <div className="flex flex-wrap gap-3.5">
                {filtered.map((p) => {
                  const episodesCount = p.settings?.episodesCount || 0;
                  const completedCount = Object.keys(p.episodeScripts || {}).length;
                  const progress = episodesCount > 0 ? Math.round((completedCount / episodesCount) * 100) : 0;
                  const isCompleted = progress === 100;

                  const visualStyleLabel =
                    p.settings?.visualStyle === "anime"
                      ? "动漫"
                      : p.settings?.visualStyle === "live_action"
                        ? "实拍"
                        : "动漫";
                  const narrativeModeLabel =
                    p.settings?.narrativeMode === "mixed"
                      ? "混合"
                      : p.settings?.narrativeMode === "narration_only"
                        ? "旁白"
                        : "对话";
                  const aspectRatioLabel = p.settings?.aspectRatio || "9:16";
                  const toneLabel = p.settings?.tone || "悬疑+反转";
                  const summary = p.sourceText?.trim() || "暂无剧情简介，点击卡片进入后可补充更完整的故事信息。";

                  return (
                    <article
                      key={p.id}
                      className="group relative w-full max-w-[380px] cursor-pointer rounded-[16px] border border-[#383a46] bg-[linear-gradient(156deg,rgba(27,20,40,0.8),rgba(12,13,22,0.92)_58%,rgba(9,11,18,0.94))] px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] transition-all duration-200 hover:border-[#575c72] hover:shadow-[0_14px_24px_rgba(7,8,14,0.68)]"
                      onClick={() => {
                        const hasScripts = Object.keys(p.episodeScripts || {}).length > 0;
                        if (hasScripts) {
                          router.push(`/script-workshop/pipeline/${encodeURIComponent(p.id)}`);
                        } else {
                          router.push(`/script-workshop/editor?projectId=${encodeURIComponent(p.id)}`);
                        }
                      }}
                    >
                      <button
                        className="absolute right-3 top-3 rounded-md p-0.5 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDelete(p.id);
                        }}
                        title="删除剧本"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>

                      <div className="mb-2.5 flex items-start gap-2.5">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-purple-400/18 bg-purple-500/10">
                          <PenTool className="h-3 w-3 text-purple-300/90" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="mb-0.5 flex items-center gap-2">
                            <h3 className="truncate text-[23px] font-semibold leading-tight tracking-[-0.01em] text-zinc-100">
                              {p.title || "未命名项目"}
                            </h3>
                            {isCompleted ? (
                              <span className="rounded-full border border-emerald-400/30 bg-emerald-500/14 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                                完成
                              </span>
                            ) : null}
                          </div>
                          <p className="text-[12px] leading-4 text-zinc-500">
                            {completedCount}/{episodesCount} 集 · 更新 {formatRelativeTime(p.updatedAt)}
                          </p>
                        </div>
                      </div>

                      <div className="mb-3 flex flex-wrap gap-1.5 text-[10px] font-medium text-zinc-300/95">
                        <span className="rounded-full border border-[#3a3d49] bg-[#2a2d38]/52 px-2 py-[1px]">{visualStyleLabel}·{narrativeModeLabel}</span>
                        <span className="rounded-full border border-[#3a3d49] bg-[#2a2d38]/52 px-2 py-[1px]">短视频·{aspectRatioLabel}</span>
                        <span className="rounded-full border border-[#3a3d49] bg-[#2a2d38]/52 px-2 py-[1px]">{toneLabel}</span>
                      </div>

                      <p className="mb-4 line-clamp-2 min-h-[44px] text-[12px] leading-[1.72] text-zinc-400/85">{summary}</p>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-zinc-500">进度</span>
                          <span className="font-medium text-zinc-300">
                            {progress}% · {completedCount}/{episodesCount}
                          </span>
                        </div>
                        <div className="h-[8px] overflow-hidden rounded-full bg-[#262a36]">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-[#a24ad0] via-[#6d69e3] to-[#1ea2c4]"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : null}
          </div>
        </section>
      </main>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md overflow-hidden border border-[#3a4456] bg-[linear-gradient(160deg,rgba(16,21,34,0.98),rgba(11,16,27,0.98))] p-0 text-white shadow-[0_24px_60px_rgba(0,0,0,0.55)]">
          <div className="h-1 w-full bg-gradient-to-r from-[#7c3aed] via-[#8b5cf6] to-[#a78bfa]" />

          <DialogHeader className="gap-2 border-b border-white/10 px-6 pb-5 pt-6">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-white/5">
                <PenTool className="h-4 w-4 text-zinc-100" />
              </div>
              <DialogTitle className="text-[18px] font-semibold tracking-tight text-zinc-100">新增剧本项目</DialogTitle>
            </div>
            <DialogDescription className="pl-[42px] text-[13px] leading-5 text-zinc-400">
              输入项目标题后即可创建，后续可在编辑页继续完善内容。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-6 pb-6 pt-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="script-workshop-title" className="text-[13px] font-medium text-zinc-200">
                  项目标题
                </label>
                <span className="text-[11px] text-zinc-500">{newTitle.trim().length}/40</span>
              </div>
              <Input
                id="script-workshop-title"
                autoFocus
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="例如：末日重生计划"
                maxLength={40}
                className="h-11 border-[#3f4b62] bg-[#0a111d]/88 text-[14px] text-zinc-100 placeholder:text-zinc-500 focus-visible:border-[#8b5cf6] focus-visible:ring-[#8b5cf6]/35"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleCreate();
                  }
                }}
              />
              <p className="text-[11px] text-zinc-400/75">建议 4-16 个字，便于后续检索和管理。</p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                variant="outline"
                className="h-9 rounded-md border-[#3b4558] bg-[#111926]/88 px-4 text-[13px] text-zinc-300 hover:bg-[#1a2433] hover:text-zinc-100"
                onClick={() => setCreateOpen(false)}
              >
                取消
              </Button>
              <Button
                onClick={() => void handleCreate()}
                disabled={!newTitle.trim()}
                className="h-9 rounded-md bg-gradient-to-r from-[#6d28d9] via-[#7c3aed] to-[#8b5cf6] px-4 text-[13px] font-semibold text-white hover:brightness-105 disabled:opacity-40"
              >
                创建并进入编辑
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <NovelImportDialog
        open={novelImportOpen}
        onOpenChange={setNovelImportOpen}
        onConfirm={handleNovelImport}
      />
    </div>
  );
}
