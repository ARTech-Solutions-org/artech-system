import type { Msg } from "@/lib/i18n";
import type { Viewer } from "@/lib/permissions";

export const PROJECT_TABS = [
  "brief",
  "feedback",
  "files",
  "development",
  "requests",
  "equipment",
  "installation",
  "finance",
] as const;

export type ProjectTab = (typeof PROJECT_TABS)[number];

export const PROJECT_TAB_LABELS = {
  brief: "Brief",
  feedback: "Feedback",
  files: "Files",
  development: "Development",
  requests: "Requests",
  equipment: "Equipment",
  installation: "Installation",
  finance: "Finance",
} as const satisfies Record<ProjectTab, Msg>;

/** In-app project URL. Omit `tab` so the viewer's role default applies. */
export function projectHref(id: string, tab?: ProjectTab, hash?: string): string {
  const search = tab ? `?tab=${tab}` : "";
  return `/projects/${id}${search}${hash ? `#${hash}` : ""}`;
}

export function defaultProjectTab(v: Viewer): ProjectTab {
  if (v.isSuperAdmin) return "brief";
  if (v.department === "accounting") return "finance";
  if (v.department === "operations") return "installation";
  if (v.department === "development") return "development";
  if (v.department === "business") return "brief";
  return "brief";
}

export function visibleProjectTabs(opts: { showFinance: boolean; showSchedule: boolean }): ProjectTab[] {
  const tabs: ProjectTab[] = ["brief", "feedback", "files", "development", "requests", "equipment"];
  if (opts.showSchedule) tabs.push("installation");
  if (opts.showFinance) tabs.push("finance");
  return tabs;
}

export function resolveProjectTab(requested: unknown, visible: ProjectTab[], fallback: ProjectTab): ProjectTab {
  const tab = typeof requested === "string" && visible.includes(requested as ProjectTab) ? (requested as ProjectTab) : null;
  if (tab) return tab;
  if (visible.includes(fallback)) return fallback;
  return visible[0] ?? "brief";
}
