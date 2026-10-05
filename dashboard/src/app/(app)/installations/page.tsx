import Link from "next/link";
import { redirect } from "next/navigation";
import { LinkedText } from "@/components/linked-text";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/lib/auth/session";
import { PROJECT_STATUS_LABELS, type ProjectStatus } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { daysBetween, type InstallationRow, listInstallations, todayInCairo, whenLabel } from "@/lib/installations";
import { canViewInstallationDate } from "@/lib/permissions";

const STATUS_STYLES: Partial<Record<ProjectStatus, string>> = {
  ready_for_installation: "bg-blue-100 text-blue-900",
  installing: "bg-amber-100 text-amber-900",
  installed: "bg-green-100 text-green-900",
  completed: "bg-green-100 text-green-900",
};
const statusStyle = (s: ProjectStatus) => STATUS_STYLES[s] ?? "bg-muted text-foreground";

const DONE: ProjectStatus[] = ["installed", "completed"];

const pad = (n: number) => String(n).padStart(2, "0");

function parseMonth(value: unknown, today: string): { year: number; month: number } {
  const m = typeof value === "string" ? /^(\d{4})-(\d{2})$/.exec(value) : null;
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return { year: Number(m[1]), month: Number(m[2]) - 1 };
  return {
    year: Number(today.slice(0, 4)),
    month: Number(today.slice(5, 7)) - 1,
  };
}

export default async function InstallationsPage({ searchParams }: PageProps<"/installations">) {
  const me = await requireUser();
  if (!canViewInstallationDate(me)) redirect("/");
  const { t, fmt } = await getI18n();

  const today = todayInCairo();
  const { year, month } = parseMonth((await searchParams).month, today);
  const monthKey = `${year}-${pad(month + 1)}`;
  const prev = month === 0 ? `${year - 1}-12` : `${year}-${pad(month)}`;
  const next = month === 11 ? `${year + 1}-01` : `${year}-${pad(month + 2)}`;

  const rows = await listInstallations();
  const installing = rows.filter((r) => r.status === "installing");
  const thisMonth = rows.filter((r) => r.installationDate?.startsWith(monthKey));
  const unscheduled = rows.filter((r) => !r.installationDate && !DONE.includes(r.status));

  // Weeks start on Saturday.
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const offset = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 1) % 7;
  const cells: (number | null)[] = [
    ...Array<null>(offset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7) cells.push(null);
  const weekdays = Array.from({ length: 7 }, (_, i) => fmt.weekday(new Date(Date.UTC(2026, 0, 3 + i))));
  const byDay = new Map<number, InstallationRow[]>();
  for (const r of thisMonth) {
    const day = Number(r.installationDate!.slice(8, 10));
    byDay.set(day, [...(byDay.get(day) ?? []), r]);
  }

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("Installations")}</h1>
        <p className="text-muted-foreground">{t("Real installation dates. Hidden from developers.")}</p>
      </div>

      {installing.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("Installing now")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {installing.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <Link href={`/projects/${r.id}`} className="font-medium underline-offset-4 hover:underline">
                    {r.name}
                  </Link>
                  <span className="text-muted-foreground">
                    {r.leadName ?? t("No lead technician")} · {fmt.date(r.installationDate)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-lg">{fmt.monthYear(year, month)}</CardTitle>
          <div className="flex gap-2">
            <Link href={`/installations?month=${prev}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              {t("Previous month")}
            </Link>
            <Link href="/installations" className={buttonVariants({ variant: "outline", size: "sm" })}>
              {t("This month")}
            </Link>
            <Link href={`/installations?month=${next}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              {t("Next month")}
            </Link>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="overflow-x-auto">
            <div className="grid min-w-2xl grid-cols-7 overflow-hidden rounded-lg border text-sm">
              {weekdays.map((w) => (
                <div
                  key={w}
                  className="border-b bg-muted/50 px-2 py-1.5 text-center text-xs font-medium text-muted-foreground"
                >
                  {w}
                </div>
              ))}
              {cells.map((day, i) => {
                const date = day ? `${monthKey}-${pad(day)}` : null;
                return (
                  <div
                    key={i}
                    className={`min-h-24 border-b border-e p-1.5 ${i % 7 === 6 ? "border-e-0" : ""} ${
                      day ? "" : "bg-muted/30"
                    }`}
                  >
                    {day && (
                      <>
                        <div
                          className={`mb-1 text-xs ${
                            date === today
                              ? "inline-flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground"
                              : "text-muted-foreground"
                          }`}
                        >
                          {day}
                        </div>
                        <div className="flex flex-col gap-1">
                          {byDay.get(day)?.map((r) => (
                            <Link
                              key={r.id}
                              href={`/projects/${r.id}`}
                              title={t(PROJECT_STATUS_LABELS[r.status])}
                              dir="auto"
                              className={`truncate rounded px-1.5 py-0.5 text-xs font-medium hover:underline ${statusStyle(r.status)}`}
                            >
                              {r.name}
                            </Link>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {thisMonth.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">{t("No installations this month.")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Date")}</TableHead>
                  <TableHead>{t("Project")}</TableHead>
                  <TableHead>{t("Status")}</TableHead>
                  <TableHead>{t("Lead technician")}</TableHead>
                  <TableHead>{t("Guide and demo")}</TableHead>
                  <TableHead>{t("Equipment")}</TableHead>
                  <TableHead>{t("Location")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {thisMonth.map((r) => {
                  const days = daysBetween(today, r.installationDate!);
                  const late = days < 0 && !DONE.includes(r.status);
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div>{fmt.date(r.installationDate, { weekday: "short" })}</div>
                        <div className={`text-xs ${late ? "text-destructive" : "text-muted-foreground"}`}>
                          {DONE.includes(r.status) ? "" : whenLabel(t, days)}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        <Link href={`/projects/${r.id}`} className="underline-offset-4 hover:underline">
                          {r.name}
                        </Link>
                        {r.clientName && (
                          <div className="text-xs font-normal text-muted-foreground">{r.clientName}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${statusStyle(r.status)}`}>
                          {t(PROJECT_STATUS_LABELS[r.status])}
                        </span>
                      </TableCell>
                      <TableCell>{r.leadName ?? "—"}</TableCell>
                      <TableCell>
                        {r.guideReady ? (
                          <Badge variant="secondary">{t("Ready")}</Badge>
                        ) : (
                          <Badge variant="outline">{t("Missing")}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.equipmentUnits ? t("{count} unit(s)", { count: r.equipmentUnits }) : "—"}
                      </TableCell>
                      <TableCell className="max-w-48 whitespace-normal">
                        <LinkedText text={r.locationLink} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("Not scheduled yet ({count})", { count: unscheduled.length })}</CardTitle>
          <CardDescription>
            {t("Projects without a real installation date. Business sets it on the project page.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {unscheduled.length === 0 ? (
            <p className="py-2 text-center text-sm text-muted-foreground">{t("Every project has a date.")}</p>
          ) : (
            <ul className="divide-y">
              {unscheduled.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <Link href={`/projects/${r.id}`} className="font-medium underline-offset-4 hover:underline">
                    {r.name}
                  </Link>
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${statusStyle(r.status)}`}>
                      {t(PROJECT_STATUS_LABELS[r.status])}
                    </span>
                    {t("Dev deadline {date}", {
                      date: fmt.date(r.devDeadline),
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
