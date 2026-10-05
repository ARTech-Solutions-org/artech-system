import { Download } from "lucide-react";
import Link from "next/link";
import { selectClass } from "@/components/form-message";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
    <div className="flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("Projects")}</h1>
          <p className="text-muted-foreground">
            {canSeeAllProjects(me) ? t("All projects") : t("Projects you are assigned to")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
        </div>
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
                      <TableCell className="text-end tabular-nums">
                        {fmt.money(p.budget, p.currency ?? "EGP")}
                      </TableCell>
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
