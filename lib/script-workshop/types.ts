export type ScriptWorkshopVisualStyle = "anime" | "live_action";

export type ScriptWorkshopNarrativeMode =
  | "narration_only"
  | "mixed"
  | "dialogue_only";

export interface ScriptWorkshopSettings {
  visualStyle: ScriptWorkshopVisualStyle;
  narrativeMode: ScriptWorkshopNarrativeMode;
  tone: string; // free text (e.g. 悬疑/反转/甜宠/热血)

  episodesCount: number; // user input
  episodeDurationSec: number; // default 60/90/120
  avgShotSec: number; // default 3 or 4 (we also use 3.5 as derived)

  // Short-video defaults (can expand later)
  platformPreset: "short_video" | "youtube";
  aspectRatio: "9:16" | "16:9";
}

export interface ScriptWorkshopEpisodeOutline {
  index: number; // 1-based
  title: string;
  hook: string;
  summary: string;
  cliffhanger: string;
  estimatedShots: number;
}

export interface ScriptWorkshopEpisodeScript {
  index: number; // 1-based
  content: string; // AI 原始输出内容
}

export interface ScriptWorkshopOutlineResult {
  type: "outline";
  settings: ScriptWorkshopSettings;
  episodes: ScriptWorkshopEpisodeOutline[];
}

export interface ScriptWorkshopEpisodeScriptResult {
  index: number;
  content: string;
}

// 小说改编相关类型
export interface NovelChapter {
  index: number;       // 1-based
  title: string;       // 章节标题，如"第一章 开始"
  content: string;     // 章节正文
  charCount: number;   // 字符数
}

export interface NovelAdaptationGroup {
  episodeIndex: number;          // 对应第几集，1-based
  chapterIndexes: number[];      // 包含哪些章节的 index（1-based）
  totalChars: number;            // 合并后总字数
  compressedContent?: string;    // AI 压缩后的内容
  compressStatus?: "idle" | "compressing" | "done" | "failed";
  compressError?: string;
}
