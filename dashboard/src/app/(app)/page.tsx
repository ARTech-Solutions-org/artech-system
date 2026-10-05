import { and, asc, eq, inArray, sql } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { projectMembers, projects } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { ACTIVE_STATUSES, PROJECT_STATUS_LABELS } from "@/lib/format";
import type { Msg } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { daysBetween, listInstallations, todayInCairo, whenLabel } from "@/lib/installations";
import {
  canAssign,
  canEditBrief,
  canEditBudget,
  canEditInstallationDate,
  canManageAnyUsers,
  canManageFinance,
  canManageInstallation,
  canRaiseFlag,
  canRequestEquipment,
  canSeeAllProjects,
  canViewBudget,
  canViewInstallationDate,
  canWriteInstallationGuide,
  roleTitle,
} from "@/lib/permissions";

type Check = { name: string; ok: boolean; detail: string };

async function systemChecks(): Promise<Check[]> {
  const postgres = db
    .execute<{ version: string }>(sql`select version()`)
    .then((rows): Check => ({ name: "Postgres", ok: true, detail: rows[0].version.split(" on ")[0] }))
    .catch((e: Error): Check => ({ name: "Postgres", ok: false, detail: e.message }));
  const n8n = fetch(`${process.env.N8N_URL}/healthz`, { signal: AbortSignal.timeout(3000) })
    .then((res): Check => ({ name: "n8n", ok: res.ok, detail: res.ok ? "OK" : `HTTP ${res.status}` }))
    .catch((e: Error): Check => ({ name: "n8n", ok: false, detail: e.message }));
  return Promise.all([postgres, n8n]);
}

export default async function Home() {
  const me = await requireUser();
  const { t, fmt } = await getI18n();
  const operate = canManageInstallation(me);

  const access: [Msg, boolean][] = [
    [canSeeAllProjects(me) ? "See all projects" : "See only projects you are assigned to", true],
    ["Create and edit briefs", canEditBrief(me)],
    [canEditBudget(me) ? "View and edit budgets" : "View budgets", canViewBudget(me)],
    ["Record payments and expenses", canManageFinance(me)],
    [
      canEditInstallationDate(me) ? "View and edit real installation dates" : "View real installation dates",
      canViewInstallationDate(me),
    ],
    ["Assign developers, deadlines and milestones", canAssign(me)],
    ["Request equipment", canRequestEquipment(me)],
    ["Raise flags", canRaiseFlag(me)],
    ["Write installation steps and demo videos", canWriteInstallationGuide(me)],
    ["Run installations", operate],
    ["Manage team members", canManageAnyUsers(me)],
  ];

  const today = todayInCairo();
  const [checks, myProjects, upcoming] = await Promise.all([
    me.isSuperAdmin ? systemChecks() : Promise.resolve([]),
    db
      .select({
        id: projects.id,
        name: projects.name,
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
      })
      .from(projectMembers)
      .innerJoin(projects, eq(projects.id, projectMembers.projectId))
      .where(and(eq(projectMembers.userId, me.id), inArray(projects.status, ACTIVE_STATUSES)))
      .orderBy(asc(projects.devDeadline)),
    operate
      ? listInstallations().then((rows) =>
          rows
            .filter((r) => r.installationDate && !["installed", "completed"].includes(r.status))
            .slice(0, 6),
        )
      : Promise.resolve([]),
  ]);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("Welcome, {name}", { name: me.name })}</h1>
        <p className="text-muted-foreground">{t(roleTitle(me))}</p>
      </div>

      {upcoming.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{t("Upcoming installations")}</CardTitle>
            <Link href="/installations" className="text-sm text-muted-foreground hover:underline">
              {t("Calendar")}
            </Link>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {upcoming.map((r) => {
                const days = daysBetween(today, r.installationDate!);
                return (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <div>
                      <Link href={`/projects/${r.id}`} className="font-medium underline-offset-4 hover:underline">
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

      {myProjects.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("My projects")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {myProjects.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <div>
                    <Link href={`/projects/${p.id}`} className="font-medium underline-offset-4 hover:underline">
                      {p.name}
                    </Link>
                    {p.role === "lead" && (
                      <Badge variant="secondary" className="ms-2">
                        {t("Lead")}
                      </Badge>
                    )}
                    <div className="text-muted-foreground">
                      {t(PROJECT_STATUS_LABELS[p.status])}
                      {p.nextMilestone && ` · ${t("next: {milestone}", { milestone: p.nextMilestone })}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {p.openFlags > 0 && (
                      <Badge variant="destructive">{t("{count} flag(s)", { count: p.openFlags })}</Badge>
                    )}
                    <span className="text-muted-foreground">{t("Due {date}", { date: fmt.date(p.devDeadline) })}</span>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("Your access")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {access.map(([label, allowed]) => (
              <li key={label} className={allowed ? "" : "text-muted-foreground line-through"}>
                {allowed ? "✓" : "✗"} {t(label)}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {checks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("System status")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {checks.map((c) => (
                <li key={c.name} className="flex justify-between gap-4 py-2">
                  <span className="font-medium">{c.name}</span>
                  <span dir="ltr" className={c.ok ? "text-green-600" : "text-destructive"}>
                    {c.detail}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
