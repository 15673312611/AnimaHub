// Shared types for the storyboard workbench page.
//
// NOTE: These are purely compile-time types (no runtime exports needed).

export interface WorkflowData {
  id: number;
  projectId: number;
  fragmentId: number;
  title: string;
  styleType: string;
  customStyle: string | null;
  scriptContent: string | null;
  maxShots: number;
  aiAnalysisStatus: string;
  currentStep: number;
  step1Completed: boolean;
  step2Completed: boolean;
  step3Completed: boolean;
  step4Completed: boolean;
  // 素材风格模板 ID（引用 ai_prompt_template 表）
  characterStyleTemplateId: number | null;
  sceneStyleTemplateId: number | null;
  itemStyleTemplateId: number | null;
  // 关联数据
  characters: CharacterData[];
  scenes: SceneData[];
  items: ItemData[];
  shots: ShotData[];
}

export interface CharacterData {
  id: number;
  name: string;
  identity: string | null;
  /** @deprecated 已废弃，不再使用 */
  coreFeatures: string | null;
  prompt: string | null;
  appearInShots: number[];
  imageUrl: string | null;
  imageStatus: string;
  /** 角色风格提示词（可选，如果设置则生成时不拼接全局画风） */
  stylePrompt: string | null;
  /** 角色风格参考图URL（可选） */
  styleRefImage: string | null;
  sortOrder: number;
}

export interface SceneData {
  id: number;
  name: string;
  type: string | null;
  /** @deprecated 已废弃，不再使用 */
  spaceFeatures: string | null;
  prompt: string | null;
  usedInShots: number[];
  imageUrl: string | null;
  imageStatus: string;
  /** 场景风格提示词（可选） */
  stylePrompt: string | null;
  /** 场景风格参考图URL（可选） */
  styleRefImage: string | null;
  sortOrder: number;
}

export interface ItemData {
  id: number;
  name: string;
  type: string | null;
  prompt: string | null;
  usedInShots: number[];
  imageUrl: string | null;
  imageStatus: string;
  /** 道具风格提示词（可选） */
  stylePrompt: string | null;
  /** 道具风格参考图URL（可选） */
  styleRefImage: string | null;
  sortOrder: number;
}

export interface ShotData {
  id: number;
  shotMode: string;
  sortOrder: number;
  description: string | null;
  dialogue: string | null;
  refCharacterIds: number[];
  refSceneId: number | null;
  firstFramePrompt: string | null;
  lastFramePrompt: string | null; // 尾帧提示词（首尾帧模式下使用）
  cameraMovement: string | null;
  videoPrompt: string | null;
  endState: string | null;
  userFirstFramePrompt: string | null;
  userVideoPrompt: string | null;
  firstFrameUrl: string | null;
  endFrameUrl: string | null;
  firstFrameStatus: string;
  videoUrl: string | null;
  videoStatus: string;
  lastFrameUrl: string | null;
  status: string;
}
