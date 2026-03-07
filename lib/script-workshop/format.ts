import type { ScriptWorkshopEpisodeScript, ScriptWorkshopSettings } from "./types";

export function formatEpisodeToText(ep: ScriptWorkshopEpisodeScript, settings: ScriptWorkshopSettings) {
  const styleLabel = settings.visualStyle === "anime" ? "动漫短剧" : "真人短剧";
  const modeLabel =
    settings.narrativeMode === "narration_only"
      ? "纯解说"
      : settings.narrativeMode === "mixed"
        ? "半解说"
        : "纯对话";

  const lines: string[] = [];
  lines.push(`# ${ep.title}（第${ep.index}集）`);
  lines.push(`风格：${styleLabel} / ${modeLabel} / ${settings.tone || "默认"}`);
  lines.push(`画面比例：${settings.aspectRatio} / 每集时长≈${settings.episodeDurationSec}s / 平均镜头≈${settings.avgShotSec}s`);
  lines.push("");

  if (ep.characters?.length) {
    lines.push(`人物：${ep.characters.join("、")}`);
    lines.push("");
  }

  ep.shots.forEach((s) => {
    lines.push(`【镜头${s.index}】${s.durationSec}s`);
    lines.push(`画面：${s.visual}`);
    if (typeof s.narration === "string" && s.narration.trim()) {
      lines.push(`旁白：${s.narration}`);
    }
    if (typeof s.dialogue === "string" && s.dialogue.trim()) {
      lines.push(`对白：${s.dialogue}`);
    }
    if (typeof s.sfx === "string" && s.sfx.trim()) {
      lines.push(`音效：${s.sfx}`);
    }
    lines.push("");
  });

  lines.push(`【结尾悬念】${ep.cliffhanger}`);
  return lines.join("\n");
}
