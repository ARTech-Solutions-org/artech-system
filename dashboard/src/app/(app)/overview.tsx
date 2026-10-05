import { and, asc, eq, inArray, ne, notInArray, sql } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { equipment, flags, projects } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PROJECT_STATUS_LABELS, type ProjectStatus } from "@/lib/format";
import type { Msg } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { daysBetween, todayInCairo, whenLabel } from "@/lib/installations";

const IN_DEVELOPMENT: ProjectStatus[] = ["assigned", "in_development", "internal_review"];
const PIPELINE = Object.keys(PROJECT_STATUS_LABELS).filter((s) => s !== "cancelled") as ProjectStatus[];

/** Company-wide numbers for everyone who sees all projects. */
export async function Overview() {
  const { t, fmt } = await getI18n();
  const today = todayInCairo();

  const [counts, [openFlags], deadlines, [units]] = await Promise.all([
    db
      .select({ status: projects.status, count: sql<number>`count(*)::int` })
      .from(projects)
      .where(ne(projects.status, "cancelled"))
      .groupBy(projects.status),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(flags)
      .where(eq(flags.status, "open")),
    db
      .select({ id: projects.id, name: projects.name, status: projects.status, devDeadline: projects.devDeadline })
      .from(projects)
      .where(and(inArray(projects.status, IN_DEVELOPMENT), sql`${projects.devDeadline} <= ${today}::date + 14`))
      .orderBy(asc(projects.devDeadline)),
    db
      .select({
        total: sql<number>`coalesce(sum(${equipment.quantity}), 0)::int`,
        inUse: sql<number>`coalesce((select sum(quantity) from equipment_requests where status = 'approved'), 0)::int`,
      })
      .from(equipment)
      .where(notInArray(equipment.status, ["retired"])),
  ]);

  const countOf = (s: ProjectStatus) => counts.find((c) => c.status === s)?.count ?? 0;
  const overdue = deadlines.filter((d) => daysBetween(today, d.devDeadline!) < 0).length;
  const active = (["assigned", "in_development", "internal_review", "ready_for_installation", "installing"] as const)
    .map(countOf)
    .reduce((a, b) => a + b, 0);

  const tiles: { label: Msg; value: string | number; href: string; alert?: boolean }[] = [
    { label: "Active projects", value: active, href: "/projects" },
    { label: "Open requests", value: openFlags.count, href: "/requests", alert: openFlags.count > 0 },
    { label: "Past dev deadline", value: overdue, href: "/projects", alert: overdue > 0 },
    { label: "Equipment in use", value: `${units.inUse} / ${units.total}`, href: "/equipment" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Overview")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tiles.map((tile) => (
            <Link key={tile.label} href={tile.href} className="rounded-lg border p-3 hover:bg-muted/50">
              <div className={`text-2xl font-semibold ${tile.alert ? "text-destructive" : ""}`} dir="ltr">
                {tile.value}
              </div>
              <div className="text-xs text-muted-foreground">{t(tile.label)}</div>
            </Link>
          ))}
        </div>

        <div>
          <div className="mb-2 text-sm font-medium">{t("Pipeline")}</div>
          <div className="flex flex-wrap gap-2 text-sm">
            {PIPELINE.map((s) => (
              <span key={s} className={`rounded-md border px-2 py-1 ${countOf(s) ? "" : "text-muted-foreground"}`}>
                {t(PROJECT_STATUS_LABELS[s])} <span className="font-semibold">{countOf(s)}</span>
              </span>
            ))}
          </div>
        </div>

        {deadlines.length > 0 && (
          <div>
            <div className="mb-2 text-sm font-medium">{t("Dev deadlines in the next 2 weeks")}</div>
            <ul className="divide-y text-sm">
              {deadlines.slice(0, 8).map((d) => {
                const days = daysBetween(today, d.devDeadline!);
                return (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div>
                      <Link href={`/projects/${d.id}`} className="font-medium underline-offset-4 hover:underline">
                        {d.name}
                      </Link>
                      <div className="text-muted-foreground">{t(PROJECT_STATUS_LABELS[d.status])}</div>
                    </div>
                    <div className="text-end">
                      <div>{fmt.date(d.devDeadline)}</div>
                      <div className={`text-xs ${days < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                        {whenLabel(t, days)}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
