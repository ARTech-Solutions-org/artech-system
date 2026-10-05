import { asc, desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { projectFinance, projectMembers, projects, projectSchedule, users } from "@/db/schema";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/lib/auth/session";
import { PROJECT_STATUS_LABELS } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { canEditBrief, canSeeAllProjects, canViewBudget, canViewInstallationDate } from "@/lib/permissions";

export default async function ProjectsPage() {
  const me = await requireUser();
  const { t, fmt, locale } = await getI18n();
  const showBudget = canViewBudget(me);
  const showInstallation = canViewInstallationDate(me);

  const myProjectIds = db
    .select({ id: projectMembers.projectId })
    .from(projectMembers)
    .where(eq(projectMembers.userId, me.id));

  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      clientName: projects.clientName,
      status: projects.status,
      devDeadline: projects.devDeadline,
      createdAt: projects.createdAt,
      // Restricted columns are only selected for roles allowed to see them.
      ...(showBudget ? { budget: projectFinance.budget, currency: projectFinance.currency } : {}),
      ...(showInstallation ? { installationDate: projectSchedule.installationDate } : {}),
    })
    .from(projects)
    .leftJoin(projectFinance, eq(projectFinance.projectId, projects.id))
    .leftJoin(projectSchedule, eq(projectSchedule.projectId, projects.id))
    .where(canSeeAllProjects(me) ? undefined : inArray(projects.id, myProjectIds))
    .orderBy(desc(projects.createdAt));

  const members = rows.length
    ? await db
        .select({ projectId: projectMembers.projectId, name: users.name, role: projectMembers.role })
        .from(projectMembers)
        .innerJoin(users, eq(users.id, projectMembers.userId))
        .where(
          inArray(
            projectMembers.projectId,
            rows.map((r) => r.id),
          ),
        )
        .orderBy(asc(projectMembers.role), asc(users.name))
    : [];
  const teamOf = (id: string) =>
    members
      .filter((m) => m.projectId === id)
      .map((m) => m.name)
      .join(locale === "ar" ? "، " : ", ");

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("Projects")}</h1>
          <p className="text-muted-foreground">
            {canSeeAllProjects(me) ? t("All projects") : t("Projects you are assigned to")}
          </p>
        </div>
        {canEditBrief(me) && (
          <Link href="/projects/new" className={buttonVariants()}>
            {t("New brief")}
          </Link>
        )}
      </div>

      <Card>
        <CardContent>
          {rows.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground">{t("No projects yet.")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Project")}</TableHead>
                  <TableHead>{t("Client")}</TableHead>
                  <TableHead>{t("Status")}</TableHead>
                  <TableHead>{t("Team")}</TableHead>
                  <TableHead>{t("Dev deadline")}</TableHead>
                  {showInstallation && <TableHead>{t("Installation")}</TableHead>}
                  {showBudget && <TableHead className="text-end">{t("Budget")}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      <Link href={`/projects/${p.id}`} className="underline-offset-4 hover:underline">
                        {p.name}
                      </Link>
                    </TableCell>
                    <TableCell>{p.clientName ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={p.status === "brief_submitted" ? "outline" : "secondary"}>
                        {t(PROJECT_STATUS_LABELS[p.status])}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-48 truncate">{teamOf(p.id) || "—"}</TableCell>
                    <TableCell>{fmt.date(p.devDeadline)}</TableCell>
                    {showInstallation && <TableCell>{fmt.date(p.installationDate)}</TableCell>}
                    {showBudget && (
                      <TableCell className="text-end tabular-nums">{fmt.money(p.budget, p.currency ?? "EGP")}</TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
