import "server-only";
import { and, eq, inArray, isNotNull, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { equipment, equipmentRequests, flags, installations, projects, projectSchedule, users } from "@/db/schema";
import { ACTIVE_STATUSES, PROJECT_STATUS_LABELS, type ProjectStatus } from "@/lib/format";
import type { Msg } from "@/lib/i18n";
import { daysBetween, todayInCairo } from "@/lib/installations";
import { type OutgoingEmail, sendEmails } from "@/lib/mail";
import { heads, projectDevelopers, projectPath, recipients, techHeads } from "@/lib/notify";

const IN_DEVELOPMENT: ProjectStatus[] = ["assigned", "in_development", "internal_review"];
const NOT_INSTALLED_YET: ProjectStatus[] = ["brief_submitted", ...IN_DEVELOPMENT, "ready_for_installation"];
const DEADLINE_REMINDER_DAYS = [3, 1];
const INSTALLATION_REMINDER_DAYS = 2;

const unique = <T extends { email: string }>(list: T[]) => [...new Map(list.map((r) => [r.email, r])).values()];

/** Every morning: deadlines coming up or missed, installations in 2 days or missed, equipment still held. */
export async function runDaily() {
  const today = todayInCairo();
  const emails: OutgoingEmail[] = [];

  const devProjects = await db
    .select({ id: projects.id, name: projects.name, status: projects.status, devDeadline: projects.devDeadline })
    .from(projects)
    .where(and(inArray(projects.status, IN_DEVELOPMENT), isNotNull(projects.devDeadline)));
  const techHeadList = await recipients(techHeads());

  for (const p of devProjects) {
    const days = daysBetween(today, p.devDeadline!);
    const link = { label: "Open project" as const, path: projectPath(p.id) };
    if (DEADLINE_REMINDER_DAYS.includes(days)) {
      for (const recipient of await projectDevelopers(p.id)) {
        emails.push({
          event: "deadline_soon",
          dedupeKey: `deadline_soon:${p.id}:${today}`,
          recipient,
          projectId: p.id,
          content: (t, fmt) => ({
            subject:
              days === 1
                ? t("{project}: dev deadline is tomorrow", { project: p.name })
                : t("{project}: dev deadline in {count} days", { project: p.name, count: days }),
            lines: [
              t("The development deadline for {project} is {date}.", {
                project: p.name,
                date: fmt.date(p.devDeadline),
              }),
            ],
            link: { label: t(link.label), path: link.path },
          }),
        });
      }
    } else if (days < 0) {
      const to = unique([...(await projectDevelopers(p.id)), ...techHeadList]);
      for (const recipient of to) {
        emails.push({
          event: "deadline_overdue",
          dedupeKey: `deadline_overdue:${p.id}:${today}`,
          recipient,
          projectId: p.id,
          content: (t, fmt) => ({
            subject: t("{project} is past its dev deadline", { project: p.name }),
            lines: [
              t("The development deadline was {date} ({count} days ago).", {
                date: fmt.date(p.devDeadline),
                count: -days,
              }),
              t("Current status: {status}", { status: t(PROJECT_STATUS_LABELS[p.status]) }),
            ],
            link: { label: t(link.label), path: link.path },
          }),
        });
      }
    }
  }

  const scheduled = await db
    .select({
      id: projects.id,
      name: projects.name,
      clientName: projects.clientName,
      status: projects.status,
      installationDate: projectSchedule.installationDate,
      locationLink: projectSchedule.locationLink,
      leadName: users.name,
      guideReady: sql<boolean>`coalesce(coalesce(${installations.steps}, ${installations.stepsAr}) is not null and ${installations.demoVideoUrl} is not null, false)`,
    })
    .from(projects)
    .innerJoin(projectSchedule, eq(projectSchedule.projectId, projects.id))
    .leftJoin(installations, eq(installations.projectId, projects.id))
    .leftJoin(users, eq(users.id, installations.leadTechnicianId))
    .where(and(isNotNull(projectSchedule.installationDate), inArray(projects.status, NOT_INSTALLED_YET)));
  const operations = await recipients(eq(users.department, "operations"));
  const planners = await recipients(and(eq(users.isHead, true), inArray(users.department, ["operations", "business"])));

  for (const p of scheduled) {
    const days = daysBetween(today, p.installationDate!);
    if (days === INSTALLATION_REMINDER_DAYS) {
      for (const recipient of operations) {
        emails.push({
          event: "installation_soon",
          dedupeKey: `installation_soon:${p.id}:${today}`,
          recipient,
          projectId: p.id,
          content: (t, fmt) => ({
            subject: t("{project}: installation in {count} days", { project: p.name, count: days }),
            lines: [
              t("Installation on {date}.", { date: fmt.date(p.installationDate, { weekday: "long" }) }),
              ...(p.clientName ? [t("Client: {client}", { client: p.clientName })] : []),
              ...(p.locationLink ? [t("Location: {location}", { location: p.locationLink })] : []),
              t("Lead technician: {name}", { name: p.leadName ?? t("Not assigned") }),
              ...(p.status !== "ready_for_installation"
                ? [t("Warning: the Tech Head has not approved it for installation yet.")]
                : []),
              ...(p.guideReady ? [] : [t("Warning: the installation guide is not ready yet.")]),
            ],
            link: { label: t("Open project"), path: projectPath(p.id) },
          }),
        });
      }
    } else if (days < 0) {
      for (const recipient of planners) {
        emails.push({
          event: "installation_overdue",
          dedupeKey: `installation_overdue:${p.id}:${today}`,
          recipient,
          projectId: p.id,
          content: (t, fmt) => ({
            subject: t("{project}: installation date has passed", { project: p.name }),
            lines: [
              t("The installation was planned for {date}, but the project is still {status}.", {
                date: fmt.date(p.installationDate),
                status: t(PROJECT_STATUS_LABELS[p.status]),
              }),
              t("Update the installation date or the status."),
            ],
            link: { label: t("Open project"), path: projectPath(p.id) },
          }),
        });
      }
    }
  }

  const held = await db
    .select({
      projectId: projects.id,
      projectName: projects.name,
      status: projects.status,
      item: equipment.name,
      quantity: equipmentRequests.quantity,
      requestedBy: equipmentRequests.requestedBy,
    })
    .from(equipmentRequests)
    .innerJoin(projects, eq(projects.id, equipmentRequests.projectId))
    .innerJoin(equipment, eq(equipment.id, equipmentRequests.equipmentId))
    .where(
      and(eq(equipmentRequests.status, "approved"), inArray(projects.status, ["installed", "completed", "cancelled"])),
    );
  const opsHeads = await recipients(and(eq(users.department, "operations"), eq(users.isHead, true)));

  for (const projectId of new Set(held.map((h) => h.projectId))) {
    const rows = held.filter((h) => h.projectId === projectId);
    const { projectName, status } = rows[0];
    const requesters = await recipients(inArray(users.id, [...new Set(rows.map((r) => r.requestedBy))]));
    const items = rows.map((r) => `${r.quantity} × ${r.item}`).join(", ");
    for (const recipient of unique([...requesters, ...opsHeads])) {
      emails.push({
        event: "equipment_return",
        dedupeKey: `equipment_return:${projectId}:${today}`,
        recipient,
        projectId,
        content: (t) => ({
          subject: t("Return equipment from {project}", { project: projectName }),
          lines: [
            t("{project} is {status}, but this equipment is still reserved for it: {items}", {
              project: projectName,
              status: t(PROJECT_STATUS_LABELS[status]),
              items,
            }),
            t("Mark it as returned on the project page so others can use it."),
          ],
          link: { label: t("Open project"), path: projectPath(projectId) },
        }),
      });
    }
  }

  const result = await sendEmails(emails);
  return { date: today, emails: emails.length, ...result };
}

/** Sunday morning: one summary per head and super admin. */
export async function runWeekly() {
  const today = todayInCairo();
  const [statusCounts, upcoming, overdue, [openFlags], [inUse]] = await Promise.all([
    db
      .select({ status: projects.status, count: sql<number>`count(*)::int` })
      .from(projects)
      .where(notInArray(projects.status, ["completed", "cancelled"]))
      .groupBy(projects.status),
    db
      .select({ name: projects.name, date: projectSchedule.installationDate, status: projects.status })
      .from(projects)
      .innerJoin(projectSchedule, eq(projectSchedule.projectId, projects.id))
      .where(
        and(
          sql`${projectSchedule.installationDate} between ${today}::date and ${today}::date + 7`,
          notInArray(projects.status, ["cancelled", "completed", "installed"]),
        ),
      )
      .orderBy(projectSchedule.installationDate),
    db
      .select({ name: projects.name, devDeadline: projects.devDeadline })
      .from(projects)
      .where(and(inArray(projects.status, IN_DEVELOPMENT), sql`${projects.devDeadline} < ${today}::date`)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(flags)
      .where(eq(flags.status, "open")),
    db
      .select({ units: sql<number>`coalesce(sum(${equipmentRequests.quantity}), 0)::int` })
      .from(equipmentRequests)
      .where(eq(equipmentRequests.status, "approved")),
  ]);

  const order = Object.keys(PROJECT_STATUS_LABELS) as ProjectStatus[];
  const counts = statusCounts.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
  const active = counts.filter((c) => ACTIVE_STATUSES.includes(c.status)).reduce((n, c) => n + c.count, 0);

  const emails: OutgoingEmail[] = (await recipients(heads())).map((recipient) => ({
    event: "weekly_summary",
    dedupeKey: `weekly_summary:${today}`,
    recipient,
    content: (t, fmt) => {
      const section = (title: Msg, list: string[]) => (list.length ? ["", t(title), ...list.map((l) => `• ${l}`)] : []);
      return {
        subject: t("Studio OS weekly summary: {date}", { date: fmt.date(today) }),
        lines: [
          t("Active projects: {count}", { count: active }),
          ...counts.map((c) => `• ${t(PROJECT_STATUS_LABELS[c.status])}: ${c.count}`),
          ...section(
            "Installations in the next 7 days:",
            upcoming.map(
              (u) => `${fmt.date(u.date, { weekday: "short" })}: ${u.name} (${t(PROJECT_STATUS_LABELS[u.status])})`,
            ),
          ),
          ...section(
            "Past their dev deadline:",
            overdue.map((o) => `${o.name} (${fmt.date(o.devDeadline)})`),
          ),
          "",
          t("Open flags: {count}", { count: openFlags.count }),
          t("Equipment in use: {count} unit(s)", { count: inUse.units }),
        ],
        link: { label: t("Open dashboard"), path: "/" },
      };
    },
  }));

  const result = await sendEmails(emails);
  return { date: today, emails: emails.length, ...result };
}
