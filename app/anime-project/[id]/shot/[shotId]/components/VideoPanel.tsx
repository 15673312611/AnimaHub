"use client";

import type { ShotData } from "../page";

interface Props {
  shot: ShotData;
  isEditing: boolean;
  editData: any;
  setEditData: (fn: (prev: any) => any) => void;
  onUpdate: () => void;
}

// NOTE: Legacy/unused UI. Kept as a small stub so `next build` typecheck passes.
export default function VideoPanel(props: Props) {
  return (
    <div className="p-4 rounded-lg bg-zinc-900/40 border border-white/5 text-sm text-zinc-300">
      <div className="font-medium">VideoPanel (stub)</div>
      <div className="text-xs text-zinc-500 mt-1">
        shotId: {props.shot.id} · status: {props.shot.videoStatus}
      </div>
    </div>
  );
}
