import type {
  ScriptWorkshopEpisodeScript,
  ScriptWorkshopEpisodeOutline,
  ScriptWorkshopSettings,
} from "./types";

export interface DraftShot {
  index: number;
  action?: string;
  dialogue?: string;
  duration?: number;
  durationSec?: number;
  videoPrompt?: string;
  firstFramePrompt?: string;
  lastFramePrompt?: string;
}

export interface ScriptWorkshopProjectRecord {
  id: string;
  title: string;
  sourceText: string;
  settings: ScriptWorkshopSettings;
  createdAt: string;
  updatedAt: string;

  outlines?: ScriptWorkshopEpisodeOutline[];
  episodeScripts?: Record<number, ScriptWorkshopEpisodeScript>; // key = episode index

  // ===== Script generation templates (admin-managed) =====
  // New (v2): supports both system templates (ai_prompt_template) and user templates (user_inference_template)
  outlinePromptTemplate?: {
    type: "system" | "user";
    id: string; // system templateCode | user template id
  };
  episodePromptTemplate?: {
    type: "system" | "user";
    id: string; // system templateCode | user template id
  };

  // Legacy (v1): user templates only
  outlinePromptTemplateId?: number;
  episodePromptTemplateId?: number;

  // ===== Pipeline: Script Workshop -> Anime Project =====
  animeProjectId?: number;
  animeProjectTitle?: string;
  animeProjectDescription?: string;

  storyboardTemplate?: {
    type: "system" | "user";
    id: string; // system templateCode | user template id
  };

  videoInferenceTemplate?: {
    type: "system" | "user";
    id: string; // templateCode | user template id
  };

  firstFrameInferenceTemplate?: {
    type: "system" | "user";
    id: string; // templateCode | user template id
  };

  // New: single-shot inference template to generate video + first/last frame prompts in ONE call
  shotPromptsInferenceTemplate?: {
    type: "system" | "user";
    id: string; // templateCode | user template id
  };

  episodeImports?: Record<
    number,
    {
      fragmentId: number;
      workflowId: number;
      status: "CREATED" | "STORYBOARD_DONE" | "INFER_DONE" | "FAILED";
      updatedAt: string;
      error?: string;
    }
  >;

  // New: JSON drafts for storyboard/inference BEFORE import to real DB
  episodeDrafts?: Record<
    number,
    {
      shots: any[]; // DraftShot[]
      updatedAt: string;
      status: "DRAFTING" | "DRAFTED" | "FAILED";
      error?: string;
    }
  >;
}

const STORAGE_KEY = "script_workshop_projects_v1";

export function loadProjectsFromStorage(): ScriptWorkshopProjectRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as ScriptWorkshopProjectRecord[];
  } catch {
    return [];
  }
}

export function saveProjectsToStorage(projects: ScriptWorkshopProjectRecord[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

export function upsertProject(project: ScriptWorkshopProjectRecord) {
  const projects = loadProjectsFromStorage();
  const idx = projects.findIndex((p) => p.id === project.id);

  // Always move the latest-updated project to the top for a "recent drafts" UX.
  if (idx >= 0) {
    projects.splice(idx, 1);
  }
  projects.unshift(project);

  saveProjectsToStorage(projects);
}

export function deleteProject(projectId: string) {
  const projects = loadProjectsFromStorage();
  saveProjectsToStorage(projects.filter((p) => p.id !== projectId));
}

export function newProjectId() {
  return `sw_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
