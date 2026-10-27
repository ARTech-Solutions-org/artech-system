import { and, asc, desc, eq, inArray, type SQL } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { auditLog, projects, users } from "@/db/schema";
import { selectClass } from "@/components/form-message";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/lib/auth/session";
import type { Msg } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";

const PAGE_SIZE = 50;

const ACTION_LABELS: Record<string, Msg> = {
  "project.create": "Created project",
  "project.update_brief": "Edited brief",
  "project.update_budget": "Edited budget",
  "project.update_schedule": "Edited installation date",
  "project.add_members": "Assigned developers",
  "project.set_lead": "Changed lead developer",
  "project.remove_member": "Removed developer",
  "project.set_dev_deadline": "Set dev deadline",
  "project.update_guide": "Edited installation guide",
  "project.update_installation": "Edited installation report",
  "project.status": "Changed status",
  "finance_entry.add_payment": "Recorded payment",
  "finance_entry.add_expense": "Recorded expense",
  "finance_entry.delete": "Deleted finance entry",
  "progress_review.create": "Added progress date",
  "progress_review.delete": "Deleted progress date",
  "milestone.create": "Added milestone",
  "milestone.complete": "Completed milestone",
  "milestone.reopen": "Reopened milestone",
  "milestone.delete": "Deleted milestone",
  "flag.raise": "Raised request",
  "flag.resolve": "Resolved request",
  "flag.cancel": "Cancelled request",
  "flag.remind": "Sent a request reminder",
  "equipment.create": "Added equipment",
  "equipment.update": "Edited equipment",
  "supplier.create": "Added a supplier",
  "supplier.update": "Edited a supplier",
  "supplier.delete": "Removed a supplier",
  "feedback.log": "Logged client feedback",
  "feedback.assign": "Assigned client feedback",
  "feedback.start": "Started client feedback",
  "feedback.done": "Finished client feedback",
  "feedback.reopen": "Reopened client feedback",
  "feedback.approve": "Confirmed client approval",
  "feedback.reject": "Decided not to do client feedback",
  "feedback.scope": "Decided feedback scope",
  "feedback.deadline_request": "Asked for more time",
  "feedback.deadline_decide": "Decided a deadline request",
  "feedback.client_submit": "Client sent feedback",
  "feedback.client_approve": "Client approved an item",
  "feedback.client_reopen": "Client asked for more changes",
  "project.client_link_on": "Turned on the client link",
  "project.client_link_off": "Turned off the client link",
  "file.upload": "Uploaded a project file",
  "file.delete": "Removed a project file",
  "equipment_request.equipment_approved": "Equipment approved",
  "equipment_request.equipment_waitlisted": "Equipment waitlisted",
  "equipment_request.equipment_returned": "Equipment returned",
  "equipment_request.equipment_cancelled": "Equipment request cancelled",
  "user.login": "Signed in",
  "user.change_password": "Changed password",
  "user.create": "Created user",
  "user.update": "Edited user",
  "user.disable": "Disabled user",
  "user.enable": "Enabled user",
  "user.reset_password": "Reset password",
  "automation.automation_daily": "Daily reminders ran",
  "automation.automation_weekly": "Weekly summary ran",
  "automation.automation_monthly": "Monthly completed-projects report ran",
};

const ENTITY_FILTERS: { value: string; label: Msg; entities: string[] }[] = [
  { value: "projects", label: "Projects", entities: ["project", "milestone", "progress_review", "flag"] },
  { value: "finance", label: "Finance", entities: ["finance_entry"] },
  { value: "equipment", label: "Equipment", entities: ["equipment", "equipment_request"] },
  { value: "users", label: "Users", entities: ["user"] },
  { value: "automations", label: "Automations", entities: ["automation"] },
];

const formatValue = (v: unknown) => {
  const text = typeof v === "string" ? v : JSON.stringify(v);
  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
};

export default async function ActivityPage({ searchParams }: PageProps<"/activity">) {
  const me = await requireUser();
  if (!me.isSuperAdmin) notFound();
  const { t, fmt } = await getI18n();
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const kind = one(params.kind);
  const person = one(params.user);
  const page = Math.max(1, Number(one(params.page)) || 1);

  const where: SQL[] = [];
  const filter = ENTITY_FILTERS.find((f) => f.value === kind);
  if (filter) where.push(inArray(auditLog.entity, filter.entities));
  if (/^[0-9a-f-]{36}$/.test(person)) where.push(eq(auditLog.userId, person));

  const [rows, people] = await Promise.all([
    db
      .select({
        id: auditLog.id,
        action: auditLog.action,
        entity: auditLog.entity,
        entityId: auditLog.entityId,
        changes: auditLog.changes,
        createdAt: auditLog.createdAt,
        userName: users.name,
      })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.userId))
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(auditLog.id))
      .limit(PAGE_SIZE + 1)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ id: users.id, name: users.name }).from(users).orderBy(asc(users.name)),
  ]);
  const hasMore = rows.length > PAGE_SIZE;
  const shown = rows.slice(0, PAGE_SIZE);

  const projectIdOf = (r: (typeof shown)[number]) => {
    if (r.entity === "project") return r.entityId;
    const fromChanges = (r.changes as Record<string, unknown> | null)?.projectId;
    return typeof fromChanges === "string" ? fromChanges : null;
  };
  const projectIds = [...new Set(shown.map(projectIdOf).filter((id): id is string => !!id))];
  const projectNames = new Map(
    projectIds.length
      ? (
          await db
            .select({ id: projects.id, name: projects.name })
            .from(projects)
            .where(inArray(projects.id, projectIds))
        ).map((p) => [p.id, p.name])
      : [],
  );
  const userNames = new Map(people.map((p) => [p.id, p.name]));

  const pageHref = (p: number) => {
    const q = new URLSearchParams({ ...(kind && { kind }), ...(person && { user: person }), page: String(p) });
    return `/activity?${q}`;
  };

  return (
    <div className="flex max-w-6xl flex-col gap-8">
      <PageHeader title={t("Activity")} description={t("Every change made in the dashboard: who, what and when.")} />

      <form className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5 text-sm">
          {t("Area")}
          <select name="kind" defaultValue={kind} className={selectClass}>
            <option value="">{t("Everything")}</option>
            {ENTITY_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {t(f.label)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          {t("Person")}
          <select name="user" defaultValue={person} className={selectClass}>
            <option value="">{t("Everyone")}</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="outline">
          {t("Filter")}
        </Button>
      </form>

      <Card>
        <CardContent>
          {shown.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground">{t("No activity yet.")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("When")}</TableHead>
                  <TableHead>{t("Who")}</TableHead>
                  <TableHead>{t("What")}</TableHead>
                  <TableHead>{t("Details")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((r) => {
                  const label = ACTION_LABELS[`${r.entity}.${r.action}`];
                  const projectId = projectIdOf(r);
                  const changes = Object.entries((r.changes as Record<string, unknown> | null) ?? {}).filter(
                    ([k, v]) => k !== "projectId" && v !== null && v !== "",
                  );
                  return (
                    <TableRow key={r.id} className="align-top">
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {fmt.dateTime(r.createdAt)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{r.userName ?? t("System")}</TableCell>
                      <TableCell>
                        <div>{label ? t(label) : `${r.entity} · ${r.action}`}</div>
                        {projectId && projectNames.has(projectId) && (
                          <Link
                            href={`/projects/${projectId}`}
                            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                          >
                            {projectNames.get(projectId)}
                          </Link>
                        )}
                        {r.entity === "user" && r.entityId && r.action !== "login" && (
                          <Link
                            href={`/users/${r.entityId}`}
                            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                          >
                            {userNames.get(r.entityId) ?? r.entityId}
                          </Link>
                        )}
                      </TableCell>
                      <TableCell className="max-w-md">
                        {changes.length > 0 && (
                          <details>
                            <summary className="cursor-pointer text-xs text-muted-foreground">
                              {t("{count} field(s)", { count: changes.length })}
                            </summary>
                            <dl dir="ltr" className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                              {changes.map(([k, v]) => (
                                <div key={k} className="contents">
                                  <dt className="text-muted-foreground">{k}</dt>
                                  <dd className="break-words whitespace-pre-wrap">{formatValue(v)}</dd>
                                </div>
                              ))}
                            </dl>
                          </details>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        {page > 1 && (
          <Link href={pageHref(page - 1)} className="text-sm underline-offset-4 hover:underline">
            {t("Newer")}
          </Link>
        )}
        {hasMore && (
          <Link href={pageHref(page + 1)} className="text-sm underline-offset-4 hover:underline">
            {t("Older")}
          </Link>
        )}
      </div>
    </div>
  );
}
