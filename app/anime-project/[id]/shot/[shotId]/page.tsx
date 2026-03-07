import { redirect } from "next/navigation";

// 类型定义（供本路由下组件复用）
export interface CharacterData {
  id: number;
  name: string;
  imageUrl: string | null;
}

export interface SceneData {
  id: number;
  name: string;
  imageUrl: string | null;
}

export interface ShotData {
  id: number;
  shotMode: string;
  sortOrder: number;
  description: string | null;
  dialogue: string | null;
  duration: number;
  refCharacterIds: number[];
  refSceneId: number | null;
  firstFramePrompt: string | null;
  userFirstFramePrompt: string | null;
  firstFrameUrl: string | null;
  endFrameUrl: string | null;
  firstFrameStatus: string;
  videoPrompt: string | null;
  userVideoPrompt: string | null;
  videoUrl: string | null;
  videoStatus: string;
}

export interface WorkflowData {
  id: number;
  projectId: number;
  fragmentId: number;
  title: string;
  characters: CharacterData[];
  scenes: SceneData[];
  shots: ShotData[];
}

// 该路由当前未在新 UI 中使用：直接回到项目页
export default function ShotRedirectPage({
  params,
}: {
  params: { id: string; shotId: string };
}) {
  redirect(`/anime-project/${params.id}`);
}