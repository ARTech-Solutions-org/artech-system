import { and, asc, eq, inArray, sql } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { projectMembers, projects } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { ACTIVE_STATUSES, formatDate, PROJECT_STATUS_LABELS } from "@/lib/format";
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
    .then((res): Check => ({ name: "n8n", ok: res.ok, detail: res.ok ? "Reachable" : `HTTP ${res.status}` }))
    .catch((e: Error): Check => ({ name: "n8n", ok: false, detail: e.message }));
  return Promise.all([postgres, n8n]);
}

export default async function Home() {
  const me = await requireUser();

  const access: [string, boolean][] = [
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
    ["Run installations", canManageInstallation(me)],
    ["Manage team members", canManageAnyUsers(me)],
  ];

  const [checks, myProjects] = await Promise.all([
    me.isSuperAdmin ? systemChecks() : Promise.resolve([]),
    db
      .select({
        id: projects.id,
        name: projects.name,
        status: projects.status,
        devDeadline: projects.devDeadline,
        role: projectMembers.role,
        nextMilestone: sql<string | null>`(
          select m.title || coalesce(' · ' || to_char(m.due_date, 'DD Mon'), '')
          from milestones m
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
  ]);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Welcome, {me.name}</h1>
        <p className="text-muted-foreground">{roleTitle(me)}</p>
      </div>

      {myProjects.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>My projects</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {myProjects.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <div>
                    <Link href={`/projects/${p.id}`} className="font-medium underline-offset-4 hover:underline">
                      {p.name}
                    </Link>
                    {p.role === "lead" && <Badge variant="secondary" className="ml-2">Lead</Badge>}
                    <div className="text-muted-foreground">
                      {PROJECT_STATUS_LABELS[p.status]}
                      {p.nextMilestone && ` · next: ${p.nextMilestone}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {p.openFlags > 0 && <Badge variant="destructive">{p.openFlags} flag(s)</Badge>}
                    <span className="text-muted-foreground">Due {formatDate(p.devDeadline)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Your access</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {access.map(([label, allowed]) => (
              <li key={label} className={allowed ? "" : "text-muted-foreground line-through"}>
                {allowed ? "✓" : "✗"} {label}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {checks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>System status</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {checks.map((c) => (
                <li key={c.name} className="flex justify-between gap-4 py-2">
                  <span className="font-medium">{c.name}</span>
                  <span className={c.ok ? "text-green-600" : "text-destructive"}>{c.detail}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
