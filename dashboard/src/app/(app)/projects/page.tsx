import { Download } from "lucide-react";
import Link from "next/link";
import { selectClass } from "@/components/form-message";
import { PageHeader } from "@/components/page-header";
import { ProjectCard } from "@/components/project-card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { PROJECT_STATUS_LABELS } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { canEditBrief, canExportProjects, canSeeAllProjects } from "@/lib/permissions";
import { listProjects } from "@/lib/project-list";

export default async function ProjectsPage() {
  const me = await requireUser();
  const { t, fmt, locale } = await getI18n();
  const { rows, team, showBudget, showInstallation } = await listProjects(me);
  const teamOf = (id: string) => team(id).join(locale === "ar" ? "، " : ", ");

  return (
    <div className="flex max-w-6xl flex-col gap-8">
      <PageHeader
        title={t("Projects")}
        description={canSeeAllProjects(me) ? t("All projects") : t("Projects you are assigned to")}
        actions={
          <>
            {rows.length > 0 && canExportProjects(me) && (
              <form action="/projects/export" method="get" className="flex items-center gap-2">
                {showInstallation ? (
                  <select
                    name="by"
                    defaultValue="created"
                    aria-label={t("Arrange quarters by")}
                    className={`${selectClass} w-auto`}
                  >
                    <option value="created">{t("Quarters by brief date")}</option>
                    <option value="installation">{t("Quarters by installation date")}</option>
                  </select>
                ) : (
                  <input type="hidden" name="by" value="created" />
                )}
                <button type="submit" className={buttonVariants({ variant: "outline" })}>
                  <Download />
                  {t("Download Excel")}
                </button>
              </form>
            )}
            {canEditBrief(me) && (
              <Link href="/projects/new" className={buttonVariants()}>
                {t("New brief")}
              </Link>
            )}
          </>
        }
      />

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-card py-16 text-center text-muted-foreground">
          {t("No projects yet.")}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => (
            <ProjectCard
              key={p.id}
              href={`/projects/${p.id}`}
              name={p.name}
              client={p.clientName}
              statusLabel={t(PROJECT_STATUS_LABELS[p.status])}
              statusVariant={p.status === "brief_submitted" ? "outline" : "secondary"}
              meta={[
                { label: t("Team"), value: teamOf(p.id) || "—" },
                { label: t("Dev deadline"), value: fmt.date(p.devDeadline) },
                ...(showInstallation ? [{ label: t("Installation"), value: fmt.date(p.installationDate) }] : []),
                ...(showBudget
                  ? [{ label: t("Budget"), value: fmt.money(p.budget, p.currency ?? "EGP") }]
                  : []),
              ]}
              badges={
                p.openFeedback > 0 ? (
                  <Badge variant="outline">{t("{count} open", { count: p.openFeedback })}</Badge>
                ) : null
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
