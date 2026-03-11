import type { ScriptWorkshopEpisodeScript } from "./types";

export function formatEpisodeToText(ep: ScriptWorkshopEpisodeScript): string {
  return ep.content;
}
