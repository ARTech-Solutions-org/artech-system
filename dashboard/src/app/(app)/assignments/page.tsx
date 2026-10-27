import { asc, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { projectMembers, projects, projectSchedule } from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { ProjectCard } from "@/components/project-card";
import { requireUser } from "@/lib/auth/session";
import { ACTIVE_STATUSES, PROJECT_STATUS_LABELS } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { canAssign } from "@/lib/permissions";
import { projectHref } from "@/lib/project-tabs";
import { listDevelopers } from "@/lib/projects";

export default async function AssignmentsPage() {
  const me = await requireUser();
  if (!canAssign(me)) redirect("/");
  const { t, fmt } = await getI18n();

  const [queue, developers, active] = await Promise.all([
    db
      .select({
        id: projects.id,
        name: projects.name,
        clientName: projects.clientName,
        createdAt: projects.createdAt,
        installationDate: projectSchedule.installationDate,
      })
      .from(projects)
      .leftJoin(projectSchedule, eq(projectSchedule.projectId, projects.id))
      .where(eq(projects.status, "brief_submitted"))
      .orderBy(asc(projects.createdAt)),
    listDevelopers(),
    db
      .select({
        userId: projectMembers.userId,
        projectId: projects.id,
        name: projects.name,
        clientName: projects.clientName,
        status: projects.status,
        devDeadline: projects.devDeadline,
      })
      .from(projectMembers)
      .innerJoin(projects, eq(projects.id, projectMembers.projectId))
      .where(inArray(projects.status, ACTIVE_STATUSES))
      .orderBy(asc(projects.devDeadline)),
  ]);

  return (
    <div className="flex max-w-6xl flex-col gap-10">
      <PageHeader
        title={t("Assignments")}
        description={t("New briefs waiting for developers, and who is working on what.")}
      />

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="font-heading text-xl font-semibold tracking-tight">
            {t("Waiting for assignment ({count})", { count: queue.length })}
          </h2>
          <p className="page-lede">{t("Open a brief to assign developers, set the deadline and milestones.")}</p>
        </div>
        {queue.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-card py-12 text-center text-muted-foreground">
            {t("No briefs waiting.")}
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {queue.map((p) => (
              <ProjectCard
                key={p.id}
                href={projectHref(p.id, "development")}
                name={p.name}
                client={p.clientName}
                statusLabel={t("Brief submitted")}
                statusVariant="outline"
                meta={[
                  { label: t("Submitted"), value: fmt.dateTime(p.createdAt) },
                  { label: t("Installation"), value: fmt.date(p.installationDate) },
                ]}
              />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-8">
        <div>
          <h2 className="font-heading text-xl font-semibold tracking-tight">{t("Team workload")}</h2>
          <p className="page-lede">{t("Active projects per developer, nearest deadline first.")}</p>
        </div>
        {developers.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-card py-12 text-center text-muted-foreground">
            {t("No developers yet. Add them from Users.")}
          </p>
        ) : (
          developers.map((d) => {
            const work = active.filter((a) => a.userId === d.id);
            return (
              <div key={d.id} className="flex flex-col gap-4">
                <div>
                  <h3 className="font-heading text-lg font-semibold tracking-tight">
                    {d.name}
                    {d.isHead && <span className="ms-2 text-sm font-normal text-muted-foreground">{t("Tech Head")}</span>}
                  </h3>
                  <p className="text-sm text-muted-foreground">{t("{count} active project(s)", { count: work.length })}</p>
                </div>
                {work.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-border bg-card py-10 text-center text-sm text-muted-foreground">
                    {t("No active projects.")}
                  </p>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {work.map((w) => (
                      <ProjectCard
                        key={w.projectId}
                        href={projectHref(w.projectId, "development")}
                        name={w.name}
                        client={w.clientName}
                        statusLabel={t(PROJECT_STATUS_LABELS[w.status])}
                        meta={[{ label: t("Dev deadline"), value: fmt.date(w.devDeadline) }]}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
