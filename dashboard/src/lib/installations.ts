import "server-only";
import { asc, eq, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { installations, projects, projectSchedule, users } from "@/db/schema";
import type { T } from "@/lib/i18n";

/** Every project that is not cancelled, with what Operations needs to plan its installation. */
export function listInstallations() {
  return db
    .select({
      id: projects.id,
      name: projects.name,
      clientName: projects.clientName,
      status: projects.status,
      devDeadline: projects.devDeadline,
      installationDate: projectSchedule.installationDate,
      locationLink: projectSchedule.locationLink,
      leadName: users.name,
      guideReady: sql<boolean>`coalesce(coalesce(${installations.steps}, ${installations.stepsAr}) is not null and ${installations.demoVideoUrl} is not null, false)`,
      equipmentUnits: sql<number>`coalesce((
        select sum(er.quantity) from equipment_requests er
        where er.project_id = "projects"."id" and er.status = 'approved'
      ), 0)::int`,
    })
    .from(projects)
    .leftJoin(projectSchedule, eq(projectSchedule.projectId, projects.id))
    .leftJoin(installations, eq(installations.projectId, projects.id))
    .leftJoin(users, eq(users.id, installations.leadTechnicianId))
    .where(notInArray(projects.status, ["cancelled"]))
    .orderBy(asc(projectSchedule.installationDate), asc(projects.name));
}

export type InstallationRow = Awaited<ReturnType<typeof listInstallations>>[number];

/** Today's date in Cairo as `YYYY-MM-DD`. */
export const todayInCairo = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });

/** Whole days from `today` to `date`, both `YYYY-MM-DD`. */
export const daysBetween = (today: string, date: string) =>
  Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);

export function whenLabel(t: T, days: number) {
  if (days === 0) return t("Today");
  if (days === 1) return t("Tomorrow");
  return days > 0 ? t("In {count} days", { count: days }) : t("{count} days ago", { count: -days });
}
