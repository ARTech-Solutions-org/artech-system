import Link from "next/link";
import type { T } from "@/lib/i18n";
import { PROJECT_TAB_LABELS, projectHref, type ProjectTab } from "@/lib/project-tabs";

export function ProjectTabs({
  projectId,
  tabs,
  active,
  t,
}: {
  projectId: string;
  tabs: ProjectTab[];
  active: ProjectTab;
  t: T;
}) {
  return (
    <nav aria-label={t("Project")} className="sticky top-0 z-10 -mx-1 bg-background/90 py-1 backdrop-blur">
      <div className="flex flex-wrap gap-1 rounded-2xl bg-card p-1.5 ring-1 ring-border">
        {tabs.map((tab) => {
          const on = tab === active;
          return (
            <Link
              key={tab}
              href={projectHref(projectId, tab)}
              scroll={false}
              aria-current={on ? "page" : undefined}
              className={`shrink-0 rounded-xl px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${
                on ? "bg-white font-medium text-black" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t(PROJECT_TAB_LABELS[tab])}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
