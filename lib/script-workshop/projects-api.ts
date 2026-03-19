import api from "@/lib/api";
import type { ScriptWorkshopProjectRecord, ScriptWorkshopProjectSummary } from "./storage";

export async function listScriptWorkshopProjects(params?: { q?: string }): Promise<ScriptWorkshopProjectSummary[]> {
  const q = params?.q?.trim();
  const url = q ? `/script-workshop/projects?q=${encodeURIComponent(q)}` : "/script-workshop/projects";
  const res = await api.get<ScriptWorkshopProjectSummary[]>(url);
  return res.data || [];
}

export async function getScriptWorkshopProject(projectId: string): Promise<ScriptWorkshopProjectRecord> {
  const res = await api.get<ScriptWorkshopProjectRecord>(
    `/script-workshop/projects/${encodeURIComponent(projectId)}`
  );
  return res.data;
}

export async function upsertScriptWorkshopProject(
  projectId: string,
  record: ScriptWorkshopProjectRecord
): Promise<ScriptWorkshopProjectRecord> {
  const res = await api.put<ScriptWorkshopProjectRecord>(
    `/script-workshop/projects/${encodeURIComponent(projectId)}`,
    record
  );
  return res.data;
}

export async function deleteScriptWorkshopProject(projectId: string): Promise<void> {
  await api.delete(`/script-workshop/projects/${encodeURIComponent(projectId)}`);
}
