import { sql } from "drizzle-orm";
import { db } from "@/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import {
  canAssign,
  canEditBrief,
  canEditBudget,
  canEditInstallationDate,
  canManageAnyUsers,
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

  const checks = me.isSuperAdmin ? await systemChecks() : [];

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Welcome, {me.name}</h1>
        <p className="text-muted-foreground">{roleTitle(me)}</p>
      </div>

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
