"use client";

import type { WorkflowData } from "../page";

interface Props {
  workflow: WorkflowData;
  currentShotId: number;
  projectId: number;
  onUpdate: () => void;
  onBack: () => void;
  onShotChange: (shotId: number) => void;
}

// NOTE: Legacy/unused UI. Kept as a small stub so `next build` typecheck passes.
export default function ShotWorkbench(props: Props) {
  const currentShot = props.workflow.shots.find((s) => s.id === props.currentShotId);

  return (
    <div className="min-h-screen w-full bg-zinc-950 text-white p-6">
      <button
        type="button"
        onClick={props.onBack}
        className="text-xs text-zinc-400 hover:text-white"
      >
        返回
      </button>

      <div className="mt-4 rounded-lg border border-white/5 bg-zinc-900/40 p-4">
        <div className="font-medium">ShotWorkbench (stub)</div>
        <div className="text-xs text-zinc-500 mt-1">
          shotId: {props.currentShotId}
          {currentShot ? ` · sortOrder: ${currentShot.sortOrder}` : ""}
        </div>
        <p className="text-xs text-zinc-500 mt-2">
          This UI is currently not wired in the new project flow; the route redirects to the project page.
        </p>
      </div>
    </div>
  );
}
