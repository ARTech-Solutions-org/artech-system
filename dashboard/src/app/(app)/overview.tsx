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

  const tiles: { label: Msg; value: string | number; href: string; tone: string }[] = [
    { label: "Active projects", value: active, href: "/projects", tone: "bg-brand-black text-white" },
    { label: "Open requests", value: openFlags.count, href: "/requests", tone: "bg-brand-graphite text-white" },
    {
      label: "Past dev deadline",
      value: overdue,
      href: "/projects",
      tone: overdue > 0 ? "bg-destructive text-white" : "bg-card ring-1 ring-border",
    },
    {
      label: "Equipment in use",
      value: `${units.inUse} / ${units.total}`,
      href: "/equipment",
      tone: "bg-card ring-1 ring-border",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Overview")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tiles.map((tile) => (
            <Link
              key={tile.label}
              href={tile.href}
              className={`rounded-md px-4 py-5 text-center transition-opacity hover:opacity-90 ${tile.tone}`}
            >
              <div className="text-3xl font-light" dir="ltr">
                {tile.value}
              </div>
              <div className="mt-1 text-xs opacity-80">{t(tile.label)}</div>
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
