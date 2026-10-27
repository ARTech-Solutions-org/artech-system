import { and, asc, eq, inArray, sql } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { projectMembers, projects } from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { feedbackForBusiness, myOpenFeedback, openFeedbackCount } from "@/lib/feedback";
import { ACTIVE_STATUSES, FEEDBACK_STATUS_LABELS, PROJECT_STATUS_LABELS } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { daysBetween, listInstallations, todayInCairo, whenLabel } from "@/lib/installations";
import { canDecideFeedback, canManageInstallation, canSeeAllProjects, roleTitle } from "@/lib/permissions";
import { projectHref } from "@/lib/project-tabs";
import { Overview } from "./overview";

type Check = { name: string; ok: boolean; detail: string };

async function systemChecks(): Promise<Check[]> {
  const postgres = db
    .execute<{ version: string }>(sql`select version()`)
    .then((rows): Check => ({ name: "Postgres", ok: true, detail: rows[0].version.split(" on ")[0] }))
    .catch((e: Error): Check => ({ name: "Postgres", ok: false, detail: e.message }));
  const mail: Promise<Check> = process.env.SMTP_HOST
    ? Promise.resolve({ name: "Email", ok: true, detail: process.env.SMTP_HOST })
    : process.env.N8N_URL
      ? fetch(`${process.env.N8N_URL}/healthz`, { signal: AbortSignal.timeout(3000) })
          .then((res): Check => ({ name: "n8n", ok: res.ok, detail: res.ok ? "OK" : `HTTP ${res.status}` }))
          .catch((e: Error): Check => ({ name: "n8n", ok: false, detail: e.message }))
      : Promise.resolve({ name: "Email", ok: false, detail: "SMTP_HOST is not set" });
  return Promise.all([postgres, mail]);
}

export default async function Home() {
  const me = await requireUser();
  const { t, fmt } = await getI18n();
  const operate = canManageInstallation(me);

  const today = todayInCairo();
  const decide = canDecideFeedback(me);
  const [checks, myProjects, upcoming, myFeedback, businessFeedback] = await Promise.all([
    me.isSuperAdmin ? systemChecks() : Promise.resolve([]),
    db
      .select({
        id: projects.id,
        name: projects.name,
        clientName: projects.clientName,
        status: projects.status,
        devDeadline: projects.devDeadline,
        role: projectMembers.role,
        nextMilestone: sql<string | null>`(
          select m.title from milestones m
          where m.project_id = "projects"."id" and m.status = 'pending'
          order by m.due_date nulls last, m.created_at limit 1
        )`,
        openFlags: sql<number>`(
          select count(*) from flags f where f.project_id = "projects"."id" and f.status = 'open'
        )::int`,
        openFeedback: openFeedbackCount,
      })
      .from(projectMembers)
      .innerJoin(projects, eq(projects.id, projectMembers.projectId))
      .where(and(eq(projectMembers.userId, me.id), inArray(projects.status, ACTIVE_STATUSES)))
      .orderBy(asc(projects.devDeadline)),
    operate
      ? listInstallations().then((rows) =>
          rows.filter((r) => r.installationDate && !["installed", "completed"].includes(r.status)).slice(0, 6),
        )
      : Promise.resolve([]),
    myOpenFeedback(me.id),
    decide ? feedbackForBusiness() : Promise.resolve([]),
  ]);

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <PageHeader kicker={t("Studio")} title={t("Welcome, {name}", { name: me.name })} description={t(roleTitle(me))} />

      {canSeeAllProjects(me) && <Overview />}

      <div className="grid gap-4 lg:grid-cols-2">
        {myProjects.length > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t("My projects")}</CardTitle>
              <Link href="/projects" className="text-sm text-muted-foreground hover:underline">
                {t("Projects")}
              </Link>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border">
                {myProjects.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                    <div className="min-w-0">
                      <Link href={`/projects/${p.id}`} className="font-medium underline-offset-4 hover:underline">
                        {p.name}
                      </Link>
                      <div className="text-muted-foreground">
                        {t(PROJECT_STATUS_LABELS[p.status])}
                        {p.nextMilestone && ` · ${t("next: {milestone}", { milestone: p.nextMilestone })}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {p.openFeedback > 0 && (
                        <Badge variant="outline">{t("{count} feedback", { count: p.openFeedback })}</Badge>
                      )}
                      {p.openFlags > 0 && (
                        <Badge variant="destructive">{t("{count} request(s)", { count: p.openFlags })}</Badge>
                      )}
                      <span className="text-muted-foreground">{t("Due {date}", { date: fmt.date(p.devDeadline) })}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {upcoming.length > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t("Upcoming installations")}</CardTitle>
              <Link href="/installations" className="text-sm text-muted-foreground hover:underline">
                {t("Calendar")}
              </Link>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border">
                {upcoming.map((r) => {
                  const days = daysBetween(today, r.installationDate!);
                  return (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                      <div>
                        <Link href={projectHref(r.id, "installation")} className="font-medium underline-offset-4 hover:underline">
                          {r.name}
                        </Link>
                        <div className="text-muted-foreground">
                          {t(PROJECT_STATUS_LABELS[r.status])}
                          {r.leadName && ` · ${r.leadName}`}
                        </div>
                      </div>
                      <div className="text-end">
                        <div>{fmt.date(r.installationDate, { weekday: "short" })}</div>
                        <div className={`text-xs ${days < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                          {whenLabel(t, days)}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        )}

        {myFeedback.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>{t("Client feedback for you")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border">
                {myFeedback.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={projectHref(f.projectId, "feedback", `feedback-${f.id}`)}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {f.projectName}
                      </Link>
                      <div className="line-clamp-2 text-muted-foreground">{f.body}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {f.priority === "urgent" && <Badge variant="destructive">{t("Urgent")}</Badge>}
                      <Badge variant="outline">{t(FEEDBACK_STATUS_LABELS[f.status])}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {businessFeedback.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>{t("Client feedback waiting for Business")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border">
                {businessFeedback.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={projectHref(f.projectId, "feedback", `feedback-${f.id}`)}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {f.projectName}
                      </Link>
                      <div className="line-clamp-2 text-muted-foreground">{f.body}</div>
                    </div>
                    <Badge variant={f.status === "awaiting_scope" ? "destructive" : "outline"}>
                      {f.status === "awaiting_scope" ? t("Decide scope") : t("Confirm with client")}
                    </Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {checks.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>{t("System status")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border">
                {checks.map((c) => (
                  <li key={c.name} className="flex justify-between gap-4 py-2.5">
                    <span className="font-medium">{c.name}</span>
                    <span dir="ltr" className={c.ok ? "text-muted-foreground" : "text-destructive"}>
                      {c.detail}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
