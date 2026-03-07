"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast-provider";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { DraftShot } from "@/lib/script-workshop/storage";

interface DetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  episodeIndex: number;
  shots: DraftShot[];
  onUpdateShot: (episodeIndex: number, shotIndex: number, patch: Partial<DraftShot>) => void;
  onRegenerateShot: (episodeIndex: number, shotIndex: number, target?: "all" | "video" | "frames") => Promise<void>;
}

function shotTitle(shot: DraftShot | null): string {
  if (!shot) return "-";
  const text = String(shot.action || shot.dialogue || "").trim();
  return text || `Shot #${shot.index}`;
}

export function DetailDialog({
  open,
  onOpenChange,
  episodeIndex,
  shots,
  onUpdateShot,
  onRegenerateShot,
}: DetailDialogProps) {
  const { toast } = useToast();
  const confirm = useConfirm();

  const [query, setQuery] = useState("");
  const [selectedShotIndex, setSelectedShotIndex] = useState<number>(shots[0]?.index ?? 1);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelectedShotIndex(shots[0]?.index ?? 1);
  }, [open, shots]);

  const filteredShots = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return shots;
    return shots.filter((s) => {
      const hay = `${s.index} ${s.action || ""} ${s.dialogue || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [query, shots]);

  const selectedShot = useMemo(
    () => shots.find((s) => s.index === selectedShotIndex) || shots[0] || null,
    [shots, selectedShotIndex]
  );

  const updateShot = (patch: Partial<DraftShot>) => {
    if (!selectedShot) return;
    onUpdateShot(episodeIndex, selectedShot.index, patch);
  };

  const doRegenerate = async (target: "all" | "video" | "frames") => {
    if (!selectedShot) return;

    if (target === "all") {
      const ok = await confirm({
        title: "确认重新生成镜头",
        description: `将覆盖第 ${selectedShot.index} 镜头当前提示词，是否继续？`,
        confirmText: "确认覆盖并生成",
        cancelText: "取消",
        variant: "warning",
      });
      if (!ok) {
        toast("已取消重新生成", "info");
        return;
      }
    }

    const key = `${target}:${selectedShot.index}`;
    setBusyKey(key);
    try {
      await onRegenerateShot(episodeIndex, selectedShot.index, target);
    } catch (err) {
      console.error(err);
      toast("重新生成失败", "error");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[85vh] p-0 bg-zinc-950 border-white/10 text-white overflow-hidden">
        <DialogHeader className="px-5 py-4 border-b border-white/10">
          <DialogTitle>第 {episodeIndex} 集分镜详情</DialogTitle>
        </DialogHeader>

        {shots.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-zinc-500">暂无分镜</div>
        ) : (
          <div className="grid grid-cols-12 h-full min-h-0">
            <aside className="col-span-12 md:col-span-4 lg:col-span-3 border-r border-white/10 flex flex-col min-h-0">
              <div className="p-3 border-b border-white/10">
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜索镜头..."
                  className="h-8 text-xs bg-black/40 border-white/10"
                />
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {filteredShots.map((s) => {
                  const active = selectedShot?.index === s.index;
                  return (
                    <button
                      key={s.index}
                      type="button"
                      onClick={() => setSelectedShotIndex(s.index)}
                      className={`w-full text-left rounded-lg border px-3 py-2 text-xs transition ${
                        active
                          ? "bg-white/10 border-white/20"
                          : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20"
                      }`}
                    >
                      <div className="font-mono text-zinc-400">#{s.index}</div>
                      <div className="text-zinc-200 line-clamp-2">{shotTitle(s)}</div>
                    </button>
                  );
                })}
              </div>
            </aside>

            <section className="col-span-12 md:col-span-8 lg:col-span-9 flex flex-col min-h-0">
              <div className="px-4 py-3 border-b border-white/10 flex flex-wrap items-center gap-2">
                <div className="text-sm text-zinc-300 mr-auto">
                  当前镜头: #{selectedShot?.index ?? "-"}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 border-white/10 bg-white/5"
                  onClick={() => void doRegenerate("video")}
                  disabled={!selectedShot || busyKey !== null}
                >
                  重新推理视频词
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 border-white/10 bg-white/5"
                  onClick={() => void doRegenerate("frames")}
                  disabled={!selectedShot || busyKey !== null}
                >
                  重新推理首尾帧
                </Button>
                <Button
                  size="sm"
                  className="h-8"
                  onClick={() => void doRegenerate("all")}
                  disabled={!selectedShot || busyKey !== null}
                >
                  重新生成
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
                <div className="space-y-2">
                  <div className="text-xs text-zinc-400">Action</div>
                  <Textarea
                    value={selectedShot?.action || ""}
                    onChange={(e) => updateShot({ action: e.target.value })}
                    className="bg-black/40 border-white/10 min-h-[90px]"
                  />
                </div>

                <div className="space-y-2">
                  <div className="text-xs text-zinc-400">Dialogue</div>
                  <Textarea
                    value={selectedShot?.dialogue || ""}
                    onChange={(e) => updateShot({ dialogue: e.target.value })}
                    className="bg-black/40 border-white/10 min-h-[90px]"
                  />
                </div>

                <div className="space-y-2">
                  <div className="text-xs text-zinc-400">Video Prompt</div>
                  <Textarea
                    value={selectedShot?.videoPrompt || ""}
                    onChange={(e) => updateShot({ videoPrompt: e.target.value })}
                    className="bg-black/40 border-white/10 min-h-[120px]"
                  />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="text-xs text-zinc-400">First Frame Prompt</div>
                    <Textarea
                      value={selectedShot?.firstFramePrompt || ""}
                      onChange={(e) => updateShot({ firstFramePrompt: e.target.value })}
                      className="bg-black/40 border-white/10 min-h-[120px]"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="text-xs text-zinc-400">Last Frame Prompt</div>
                    <Textarea
                      value={selectedShot?.lastFramePrompt || ""}
                      onChange={(e) => updateShot({ lastFramePrompt: e.target.value })}
                      className="bg-black/40 border-white/10 min-h-[120px]"
                    />
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        <DialogFooter className="px-5 py-3 border-t border-white/10">
          <Button variant="outline" className="border-white/10 bg-white/5" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

