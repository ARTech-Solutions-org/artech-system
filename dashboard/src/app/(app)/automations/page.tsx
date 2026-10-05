import { desc, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { automationStatus, type N8nExecution } from "@/lib/n8n";
import { RunButtons } from "./run-buttons";

const RUN_OK: N8nExecution["status"][] = ["success", "running", "waiting", "new"];

export default async function AutomationsPage() {
  const me = await requireUser();
  if (!me.isSuperAdmin) notFound();
  const { t, fmt } = await getI18n();

  const [status, log, [week]] = await Promise.all([
    automationStatus(),
    db.select().from(notifications).orderBy(desc(notifications.id)).limit(30),
    db
      .select({
        sent: sql<number>`count(*) filter (where ${notifications.status} = 'sent')::int`,
        failed: sql<number>`count(*) filter (where ${notifications.status} = 'failed')::int`,
      })
      .from(notifications)
      .where(sql`${notifications.createdAt} > now() - interval '7 days'`),
  ]);
  const workflowName = new Map(status.workflows.map((w) => [w.id, w.name.replace("[Studio OS] ", "")]));
  const lastRun = (id: string) => status.executions.find((e) => e.workflowId === id);
  const runBadge = (e: N8nExecution | undefined) =>
    !e ? (
      <span className="text-muted-foreground">{t("Not run yet")}</span>
    ) : (
      <Badge variant={RUN_OK.includes(e.status) ? "secondary" : "destructive"}>
        {e.status === "success" ? t("Succeeded") : RUN_OK.includes(e.status) ? t("Running") : t("Failed")}
      </Badge>
    );

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("Automations")}</h1>
        <p className="text-muted-foreground">{t("Email notifications and scheduled jobs run by n8n.")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("Email")}</CardTitle>
          <CardDescription>
            {t("Sender: {from}", { from: process.env.MAIL_FROM ?? "—" })}
            {" · "}
            {t("Last 7 days: {sent} sent, {failed} failed", { sent: week.sent, failed: week.failed })}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            {t(
              'Until the real sender is set, emails go to the local test inbox at http://localhost:8025. To switch, add the SMTP settings to dashboard/.env.local and run npm run n8n:setup, or edit the "Studio OS Email" credential in n8n.',
            )}
          </p>
          <RunButtons />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("n8n workflows")}</CardTitle>
          {status.error && (
            <CardDescription className="text-destructive">
              {t("n8n is not reachable: {error}", { error: status.error })}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {status.workflows.length === 0 && !status.error ? (
            <p className="text-sm text-muted-foreground">
              {t("No Studio OS workflows in n8n. Run npm run n8n:setup.")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Workflow")}</TableHead>
                  <TableHead>{t("State")}</TableHead>
                  <TableHead>{t("Last run")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {status.workflows.map((w) => {
                  const run = lastRun(w.id);
                  return (
                    <TableRow key={w.id}>
                      <TableCell className="font-medium">{workflowName.get(w.id)}</TableCell>
                      <TableCell>
                        <Badge variant={w.active ? "secondary" : "destructive"}>
                          {w.active ? t("Active") : t("Inactive")}
                        </Badge>
                      </TableCell>
                      <TableCell className="flex items-center gap-2">
                        {runBadge(run)}
                        {run && <span className="text-muted-foreground">{fmt.dateTime(new Date(run.startedAt))}</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {status.executions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("Recent runs")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("When")}</TableHead>
                  <TableHead>{t("Workflow")}</TableHead>
                  <TableHead>{t("Result")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {status.executions.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-muted-foreground">{fmt.dateTime(new Date(e.startedAt))}</TableCell>
                    <TableCell>{workflowName.get(e.workflowId)}</TableCell>
                    <TableCell>{runBadge(e)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("Email log")}</CardTitle>
          <CardDescription>{t("The last 30 emails the dashboard handed to n8n.")}</CardDescription>
        </CardHeader>
        <CardContent>
          {log.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("No emails yet.")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("When")}</TableHead>
                  <TableHead>{t("To")}</TableHead>
                  <TableHead>{t("Subject")}</TableHead>
                  <TableHead>{t("Result")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {log.map((n) => (
                  <TableRow key={n.id} className="align-top">
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {fmt.dateTime(n.createdAt)}
                    </TableCell>
                    <TableCell dir="ltr" className="text-start">
                      {n.email}
                    </TableCell>
                    <TableCell className="max-w-xs whitespace-normal" dir="auto">
                      {n.subject}
                    </TableCell>
                    <TableCell className="max-w-xs whitespace-normal">
                      <Badge variant={n.status === "failed" ? "destructive" : "secondary"}>
                        {n.status === "sent" ? t("Sent") : n.status === "failed" ? t("Failed") : t("Pending")}
                      </Badge>
                      {n.error && (
                        <p dir="ltr" className="mt-1 text-xs break-words text-destructive">
                          {n.error}
                        </p>
                      )}
                    </TableCell>
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
