import "server-only";
import { and, eq, inArray, or, type SQL } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/db";
import { flags, installations, projectMembers, projects, projectSchedule, users } from "@/db/schema";
import { FLAG_TYPE_LABELS } from "@/lib/format";
import { type OutgoingEmail, type Recipient, sendEmails } from "@/lib/mail";
import { DEPARTMENT_LABELS } from "@/lib/permissions";

const recipientColumns = { id: users.id, name: users.name, email: users.email, locale: users.locale };

/** Active users matching `where`, without duplicates and without `exceptId` (whoever triggered the event). */
export async function recipients(where: SQL | undefined, exceptId?: string): Promise<Recipient[]> {
  const rows = await db
    .select(recipientColumns)
    .from(users)
    .where(and(eq(users.status, "active"), where));
  return rows.filter((r) => r.id !== exceptId);
}

export const techHeads = () => and(eq(users.department, "development"), eq(users.isHead, true));
export const heads = () => or(eq(users.isHead, true), eq(users.isSuperAdmin, true));

export async function projectDevelopers(projectId: string, exceptId?: string) {
  const rows = await db
    .select(recipientColumns)
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(and(eq(projectMembers.projectId, projectId), eq(users.status, "active")));
  return rows.filter((r) => r.id !== exceptId);
}

export const projectPath = (id: string) => `/projects/${id}`;

/** Sends after the response is streamed, so a slow or failing mail server never blocks the person clicking. */
function later(build: () => Promise<OutgoingEmail[]>) {
  after(async () => {
    try {
      await sendEmails(await build());
    } catch (e) {
      console.error("Notification failed", e);
    }
  });
}

async function projectInfo(id: string) {
  const [p] = await db
    .select({
      id: projects.id,
      name: projects.name,
      clientName: projects.clientName,
      devDeadline: projects.devDeadline,
      createdBy: projects.createdBy,
      installationDate: projectSchedule.installationDate,
      locationLink: projectSchedule.locationLink,
    })
    .from(projects)
    .leftJoin(projectSchedule, eq(projectSchedule.projectId, projects.id))
    .where(eq(projects.id, id));
  return p;
}

export function notifyAssigned(projectId: string, userIds: string[], by: { id: string; name: string }) {
  if (!userIds.length) return;
  later(async () => {
    const p = await projectInfo(projectId);
    const to = await recipients(inArray(users.id, userIds), by.id);
    return to.map((recipient) => ({
      event: "assigned",
      recipient,
      projectId,
      content: (t, fmt) => ({
        subject: t("You've been added to {project}", { project: p.name }),
        lines: [
          t("{by} added you to {project}.", { by: by.name, project: p.name }),
          ...(p.clientName ? [t("Client: {client}", { client: p.clientName })] : []),
          t("Dev deadline: {date}", { date: fmt.date(p.devDeadline) }),
        ],
        link: { label: t("Open project"), path: projectPath(projectId) },
      }),
    }));
  });
}

export function notifyStatus(projectId: string, to: string, by: { id: string; name: string }) {
  later(async () => {
    const p = await projectInfo(projectId);
    const link = (t: (k: "Open project") => string) => ({ label: t("Open project"), path: projectPath(projectId) });

    if (to === "internal_review") {
      const list = await recipients(techHeads(), by.id);
      return list.map((recipient) => ({
        event: "review_requested",
        recipient,
        projectId,
        content: (t) => ({
          subject: t("{project} is ready for your review", { project: p.name }),
          lines: [
            t("{by} moved {project} to internal review.", { by: by.name, project: p.name }),
            t("Check the build and the installation guide, then approve it for installation."),
          ],
          link: link(t),
        }),
      }));
    }

    if (to === "ready_for_installation") {
      const [guide] = await db.select().from(installations).where(eq(installations.projectId, projectId));
      const list = await recipients(eq(users.department, "operations"), by.id);
      return list.map((recipient) => ({
        event: "ready_for_installation",
        recipient,
        projectId,
        content: (t, fmt) => ({
          subject: t("{project} is ready for installation", { project: p.name }),
          lines: [
            t("{by} approved {project} for installation.", { by: by.name, project: p.name }),
            t("Installation date: {date}", { date: fmt.date(p.installationDate) }),
            ...(p.locationLink ? [t("Location: {location}", { location: p.locationLink })] : []),
            ...(guide?.demoVideoUrl ? [t("Demo video: {url}", { url: guide.demoVideoUrl })] : []),
          ],
          link: link(t),
        }),
      }));
    }

    if (to === "installed") {
      const list = await recipients(
        or(
          and(eq(users.department, "business"), eq(users.isHead, true)),
          p.createdBy ? eq(users.id, p.createdBy) : undefined,
        ),
        by.id,
      );
      return list.map((recipient) => ({
        event: "installed",
        recipient,
        projectId,
        content: (t) => ({
          subject: t("{project} was installed", { project: p.name }),
          lines: [t("{by} marked {project} as installed.", { by: by.name, project: p.name })],
          link: link(t),
        }),
      }));
    }
    return [];
  });
}

async function flagInfo(flagId: string) {
  const [f] = await db
    .select({
      id: flags.id,
      projectId: flags.projectId,
      projectName: projects.name,
      type: flags.type,
      details: flags.details,
      ownerDepartment: flags.ownerDepartment,
      raisedBy: flags.raisedBy,
      resolution: flags.resolution,
    })
    .from(flags)
    .innerJoin(projects, eq(projects.id, flags.projectId))
    .where(eq(flags.id, flagId));
  return f;
}

export function notifyFlagRaised(flagId: string, by: { id: string; name: string }) {
  later(async () => {
    const f = await flagInfo(flagId);
    // Developers only see their own projects, so a flag for Development goes to the Tech Head and the project team.
    const list =
      f.ownerDepartment === "development"
        ? [...(await recipients(techHeads(), by.id)), ...(await projectDevelopers(f.projectId, by.id))]
        : await recipients(eq(users.department, f.ownerDepartment), by.id);
    const unique = [...new Map(list.map((r) => [r.id, r])).values()];
    return unique.map((recipient) => ({
      event: "flag_raised",
      recipient,
      projectId: f.projectId,
      content: (t) => ({
        subject: t("New flag on {project}: {type}", { project: f.projectName, type: t(FLAG_TYPE_LABELS[f.type]) }),
        lines: [
          t("{by} raised a flag for {department}:", {
            by: by.name,
            department: t(DEPARTMENT_LABELS[f.ownerDepartment]),
          }),
          f.details,
        ],
        link: { label: t("Open project"), path: projectPath(f.projectId) },
      }),
    }));
  });
}

export function notifyFlagResolved(flagId: string, by: { id: string; name: string }) {
  later(async () => {
    const f = await flagInfo(flagId);
    const list = await recipients(eq(users.id, f.raisedBy), by.id);
    return list.map((recipient) => ({
      event: "flag_resolved",
      recipient,
      projectId: f.projectId,
      content: (t) => ({
        subject: t("Your flag on {project} was resolved", { project: f.projectName }),
        lines: [t("{by} resolved it:", { by: by.name }), f.resolution ?? "", t("Your flag:"), f.details],
        link: { label: t("Open project"), path: projectPath(f.projectId) },
      }),
    }));
  });
}
