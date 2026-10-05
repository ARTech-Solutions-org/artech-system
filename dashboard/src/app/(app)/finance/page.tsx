import { desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { financeEntries, projectFinance, projects } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/lib/auth/session";
import { outstanding, totalsByCurrency, type CurrencyTotals } from "@/lib/finance";
import { PROJECT_STATUS_LABELS } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { canViewBudget } from "@/lib/permissions";

export default async function FinancePage() {
  const me = await requireUser();
  if (!canViewBudget(me)) redirect("/");
  const { t, fmt } = await getI18n();

  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      clientName: projects.clientName,
      status: projects.status,
      budget: projectFinance.budget,
      currency: projectFinance.currency,
    })
    .from(projects)
    .leftJoin(projectFinance, eq(projectFinance.projectId, projects.id))
    .orderBy(desc(projects.createdAt));

  const entries = rows.length
    ? await db
        .select({
          projectId: financeEntries.projectId,
          kind: financeEntries.kind,
          amount: financeEntries.amount,
          currency: financeEntries.currency,
        })
        .from(financeEntries)
        .where(
          inArray(
            financeEntries.projectId,
            rows.map((r) => r.id),
          ),
        )
    : [];

  // Grand totals per currency across all projects.
  const grand: Record<string, { budget: number; received: number; expenses: number }> = {};
  const perProject = new Map<string, CurrencyTotals>();
  for (const r of rows) {
    const totals = totalsByCurrency(entries.filter((e) => e.projectId === r.id));
    perProject.set(r.id, totals);
    if (r.budget !== null && r.currency) {
      (grand[r.currency] ??= { budget: 0, received: 0, expenses: 0 }).budget += Number(r.budget);
    }
    for (const [c, totalsForCurrency] of Object.entries(totals)) {
      const g = (grand[c] ??= { budget: 0, received: 0, expenses: 0 });
      g.received += totalsForCurrency.received;
      g.expenses += totalsForCurrency.expenses;
    }
  }

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("Finance")}</h1>
        <p className="text-muted-foreground">{t("Budgets, payments received and expenses for every project.")}</p>
      </div>

      {Object.keys(grand).length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(grand).map(([c, g]) => (
            <Card key={c}>
              <CardHeader>
                <CardTitle>{c}</CardTitle>
                <CardDescription>{t("All projects")}</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-muted-foreground">{t("Budgets")}</span>
                <span className="text-end tabular-nums">{fmt.money(g.budget, c)}</span>
                <span className="text-muted-foreground">{t("Received")}</span>
                <span className="text-end tabular-nums">{fmt.money(g.received, c)}</span>
                <span className="text-muted-foreground">{t("Outstanding")}</span>
                <span className="text-end tabular-nums">{fmt.money(g.budget - g.received, c)}</span>
                <span className="text-muted-foreground">{t("Expenses")}</span>
                <span className="text-end tabular-nums">{fmt.money(g.expenses, c)}</span>
                <span className="font-medium">{t("Net (received − expenses)")}</span>
                <span className="text-end font-medium tabular-nums">{fmt.money(g.received - g.expenses, c)}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardContent>
          {rows.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground">{t("No projects yet.")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Project")}</TableHead>
                  <TableHead>{t("Status")}</TableHead>
                  <TableHead className="text-end">{t("Budget")}</TableHead>
                  <TableHead className="text-end">{t("Received")}</TableHead>
                  <TableHead className="text-end">{t("Outstanding")}</TableHead>
                  <TableHead className="text-end">{t("Expenses")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const c = r.currency ?? "EGP";
                  const totals = perProject.get(r.id)!;
                  const due = outstanding(r.budget, c, totals);
                  const others = Object.keys(totals).filter((k) => k !== c);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        <Link href={`/projects/${r.id}`} className="underline-offset-4 hover:underline">
                          {r.name}
                        </Link>
                        {r.clientName && <div className="text-xs text-muted-foreground">{r.clientName}</div>}
                        {others.length > 0 && (
                          <div className="text-xs text-muted-foreground">
                            {t("Also has {currencies} entries", { currencies: others.join(", ") })}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{t(PROJECT_STATUS_LABELS[r.status])}</Badge>
                      </TableCell>
                      <TableCell className="text-end tabular-nums">{fmt.money(r.budget, c)}</TableCell>
                      <TableCell className="text-end tabular-nums">{fmt.money(totals[c]?.received ?? 0, c)}</TableCell>
                      <TableCell
                        className={`text-end tabular-nums ${due !== null && due < 0 ? "text-destructive" : ""}`}
                      >
                        {due === null ? "—" : fmt.money(due, c)}
                      </TableCell>
                      <TableCell className="text-end tabular-nums">{fmt.money(totals[c]?.expenses ?? 0, c)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
