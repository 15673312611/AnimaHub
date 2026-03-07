"use client";

import type { ShotData } from "../page";

interface Props {
  shots: ShotData[];
  currentShotId: number;
  onSelect: (shotId: number) => void;
}

// NOTE: Legacy/unused UI. Kept as a small stub so `next build` typecheck passes.
export default function ShotList(props: Props) {
  return (
    <div className="flex-1 overflow-y-auto p-2 space-y-1">
      {props.shots.map((shot) => {
        const isActive = shot.id === props.currentShotId;

        return (
          <button
            key={shot.id}
            type="button"
            onClick={() => props.onSelect(shot.id)}
            className={[
              "w-full p-2 rounded-lg text-left border transition-colors",
              isActive
                ? "bg-purple-500/20 border-purple-500/30"
                : "hover:bg-white/5 border-transparent",
            ].join(" ")}
          >
            <div className="text-sm text-zinc-200">镜头 {shot.sortOrder}</div>
            <div className="text-[10px] text-zinc-500">ID: {shot.id}</div>
          </button>
        );
      })}
    </div>
  );
}
