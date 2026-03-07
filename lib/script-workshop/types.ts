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

export interface ScriptWorkshopShot {
  index: number; // 1-based
  durationSec: number;
  visual: string;
  narration?: string;
  dialogue?: string;
  sfx?: string;
}

export interface ScriptWorkshopEpisodeScript {
  index: number; // 1-based
  title: string;
  characters: string[];
  shots: ScriptWorkshopShot[];
  cliffhanger: string;
}

export interface ScriptWorkshopOutlineResult {
  type: "outline";
  settings: ScriptWorkshopSettings;
  episodes: ScriptWorkshopEpisodeOutline[];
}

export interface ScriptWorkshopEpisodeScriptResult {
  type: "episode_script";
  settings: ScriptWorkshopSettings;
  episode: ScriptWorkshopEpisodeScript;
}
