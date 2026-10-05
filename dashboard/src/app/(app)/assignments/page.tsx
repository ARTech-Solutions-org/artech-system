import { asc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { projectMembers, projects, projectSchedule } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/lib/auth/session";
import { ACTIVE_STATUSES, PROJECT_STATUS_LABELS } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { canAssign } from "@/lib/permissions";
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
        role: projectMembers.role,
        projectId: projects.id,
        name: projects.name,
        status: projects.status,
        devDeadline: projects.devDeadline,
      })
      .from(projectMembers)
      .innerJoin(projects, eq(projects.id, projectMembers.projectId))
      .where(inArray(projects.status, ACTIVE_STATUSES))
      .orderBy(asc(projects.devDeadline)),
  ]);

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("Assignments")}</h1>
        <p className="text-muted-foreground">{t("New briefs waiting for developers, and who is working on what.")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("Waiting for assignment ({count})", { count: queue.length })}</CardTitle>
          <CardDescription>{t("Open a brief to assign developers, set the deadline and milestones.")}</CardDescription>
        </CardHeader>
        <CardContent>
          {queue.length === 0 ? (
            <p className="py-4 text-center text-muted-foreground">{t("No briefs waiting.")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Project")}</TableHead>
                  <TableHead>{t("Client")}</TableHead>
                  <TableHead>{t("Submitted")}</TableHead>
                  <TableHead>{t("Installation")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      <Link href={`/projects/${p.id}`} className="underline-offset-4 hover:underline">
                        {p.name}
                      </Link>
                    </TableCell>
                    <TableCell>{p.clientName ?? "—"}</TableCell>
                    <TableCell>{fmt.dateTime(p.createdAt)}</TableCell>
                    <TableCell>{fmt.date(p.installationDate)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("Team workload")}</CardTitle>
          <CardDescription>{t("Active projects per developer, nearest deadline first.")}</CardDescription>
        </CardHeader>
        <CardContent>
          {developers.length === 0 ? (
            <p className="py-4 text-center text-muted-foreground">{t("No developers yet. Add them from Users.")}</p>
          ) : (
            <ul className="divide-y">
              {developers.map((d) => {
                const work = active.filter((a) => a.userId === d.id);
                return (
                  <li key={d.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="font-medium">
                      {d.name}
                      {d.isHead && <span className="font-normal text-muted-foreground"> ({t("Tech Head")})</span>}
                      <div className="text-sm font-normal text-muted-foreground">
                        {t("{count} active project(s)", { count: work.length })}
                      </div>
                    </div>
                    <ul className="flex flex-col gap-1 text-sm sm:items-end">
                      {work.map((w) => (
                        <li key={w.projectId} className="flex items-center gap-2">
                          <Link href={`/projects/${w.projectId}`} className="underline-offset-4 hover:underline">
                            {w.name}
                          </Link>
                          {w.role === "lead" && <Badge variant="secondary">{t("Lead")}</Badge>}
                          <span className="text-muted-foreground">
                            {t(PROJECT_STATUS_LABELS[w.status])} · {t("Due {date}", { date: fmt.date(w.devDeadline) })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
