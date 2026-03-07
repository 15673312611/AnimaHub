import type { ScriptWorkshopEpisodeOutline, ScriptWorkshopSettings } from "./types";

type TemplateVars = Record<string, string | number>;

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function estimateShotsPerEpisode(settings: Pick<ScriptWorkshopSettings, "episodeDurationSec" | "avgShotSec">) {
  const avg = settings.avgShotSec || 3.5;
  const dur = settings.episodeDurationSec || 90;
  return clampInt(dur / avg, 8, 60);
}

function renderTemplate(template: string, vars: TemplateVars): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    // Avoid relying on replaceAll polyfills; split/join is universally supported.
    out = out.split(`{${key}}`).join(String(value));
  }
  return out;
}

function getNarrativeModeLabel(mode: ScriptWorkshopSettings["narrativeMode"]) {
  switch (mode) {
    case "narration_only":
      return "纯解说";
    case "mixed":
      return "半解说";
    case "dialogue_only":
      return "纯对话";
    default:
      return String(mode);
  }
}

function buildSettingsContextBlock(params: {
  sourceText: string;
  settings: ScriptWorkshopSettings;
  shotsPerEpisode: number;
}) {
  const { sourceText, settings, shotsPerEpisode } = params;

  const visualStyleLabel = settings.visualStyle === "anime" ? "动漫短剧" : "真人短剧";
  const narrativeModeLabel = getNarrativeModeLabel(settings.narrativeMode);
  const platformLabel = settings.platformPreset === "short_video" ? "短视频" : "YouTube";

  return [
    "## 输入参数",
    `- 风格：${visualStyleLabel}`,
    `- 叙事方式：${narrativeModeLabel}`,
    `- 语气/题材：${settings.tone || "悬疑+反转"}`,
    `- 平台：${platformLabel}`,
    `- 画面比例：${settings.aspectRatio}`,
    `- 集数：${settings.episodesCount}`,
    `- 单集时长：${settings.episodeDurationSec}s`,
    `- 平均镜头秒数：${settings.avgShotSec}s`,
    `- 建议镜头数/集：${shotsPerEpisode}`,
    "",
    "## 故事素材/原文",
    sourceText,
  ].join("\n");
}

function buildEpisodeOutlineContextBlock(outline: ScriptWorkshopEpisodeOutline, shotsPerEpisode: number) {
  return [
    "## 本集大纲",
    `- 集数：${outline.index}`,
    `- 标题：${outline.title}`,
    `- 开头钩子：${outline.hook}`,
    `- 剧情摘要：${outline.summary}`,
    `- 结尾悬念：${outline.cliffhanger}`,
    `- 建议镜头数：${shotsPerEpisode}`,
  ].join("\n");
}

function shouldAppendSettingsContext(template: string) {
  // If template already contains the params/source sections or uses the placeholders, don't append to avoid duplicates.
  const t = template || "";
  return !(
    t.includes("## 输入参数") ||
    t.includes("## 故事素材") ||
    t.includes("{sourceText}") ||
    t.includes("{visualStyleLabel}") ||
    t.includes("{platformLabel}") ||
    t.includes("{episodesCount}")
  );
}

function shouldAppendEpisodeOutlineContext(template: string) {
  const t = template || "";
  return !(t.includes("## 本集大纲") || t.includes("{episodeSummary}") || t.includes("{episodeTitle}") || t.includes("{episodeIndex}"));
}

export function renderOutlinePromptFromTemplate(params: {
  template: string;
  sourceText: string;
  settings: ScriptWorkshopSettings;
}): string {
  const { template, sourceText, settings } = params;
  const shotsPerEpisode = estimateShotsPerEpisode(settings);

  const visualStyleLabel = settings.visualStyle === "anime" ? "动漫短剧" : "真人短剧";
  const platformLabel = settings.platformPreset === "short_video" ? "短视频" : "YouTube";
  const narrativeModeLabel = getNarrativeModeLabel(settings.narrativeMode);

  const rendered = renderTemplate(template, {
    visualStyleLabel,
    narrativeMode: settings.narrativeMode,
    narrativeModeLabel,
    tone: settings.tone || "悬疑+反转",
    platformLabel,
    aspectRatio: settings.aspectRatio,
    episodesCount: settings.episodesCount,
    episodeDurationSec: settings.episodeDurationSec,
    avgShotSec: settings.avgShotSec,
    shotsPerEpisode,
    sourceText,
  }).trim();

  const parts = [rendered];
  if (shouldAppendSettingsContext(template)) {
    parts.push(buildSettingsContextBlock({ sourceText, settings, shotsPerEpisode }));
  }

  return parts.filter(Boolean).join("\n\n").trim();
}

export function renderEpisodeScriptPromptFromTemplate(params: {
  template: string;
  sourceText: string;
  settings: ScriptWorkshopSettings;
  outline: ScriptWorkshopEpisodeOutline;
}): string {
  const { template, sourceText, settings, outline } = params;

  const shotsPerEpisode = outline.estimatedShots || estimateShotsPerEpisode(settings);
  const visualStyleLabel = settings.visualStyle === "anime" ? "动漫短剧" : "真人短剧";
  const platformLabel = settings.platformPreset === "short_video" ? "短视频" : "YouTube";
  const narrativeModeLabel = getNarrativeModeLabel(settings.narrativeMode);

  const rendered = renderTemplate(template, {
    episodeIndex: outline.index,
    episodeTitle: outline.title,
    episodeHook: outline.hook,
    episodeSummary: outline.summary,
    episodeCliffhanger: outline.cliffhanger,

    visualStyleLabel,
    narrativeMode: settings.narrativeMode,
    narrativeModeLabel,
    tone: settings.tone || "悬疑+反转",
    platformLabel,
    aspectRatio: settings.aspectRatio,

    episodesCount: settings.episodesCount,
    episodeDurationSec: settings.episodeDurationSec,
    avgShotSec: settings.avgShotSec,
    shotsPerEpisode,

    sourceText,
  }).trim();

  const parts = [rendered];

  if (shouldAppendEpisodeOutlineContext(template)) {
    parts.push(buildEpisodeOutlineContextBlock(outline, shotsPerEpisode));
  }

  if (shouldAppendSettingsContext(template)) {
    parts.push(buildSettingsContextBlock({ sourceText, settings, shotsPerEpisode }));
  }

  return parts.filter(Boolean).join("\n\n").trim();
}
