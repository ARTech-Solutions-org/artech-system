import "server-only";
import { and, eq, inArray, or, type SQL } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/db";
import {
  feedbackItems,
  flagRecipients,
  flags,
  installations,
  projectMembers,
  projects,
  projectSchedule,
  users,
} from "@/db/schema";
import { ALL_DISK_FOLDERS } from "@/lib/folder-names";
import { FLAG_TYPE_LABELS } from "@/lib/format";
import { type OutgoingEmail, type Recipient, sendEmails } from "@/lib/mail";

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
      raisedBy: flags.raisedBy,
      cancelReason: flags.resolution,
      createdAt: flags.createdAt,
    })
    .from(flags)
    .leftJoin(projects, eq(projects.id, flags.projectId))
    .where(eq(flags.id, flagId));
  const parts = await db
    .select({
      userId: users.id,
      name: users.name,
      department: users.department,
      status: flagRecipients.status,
      resolution: flagRecipients.resolution,
    })
    .from(flagRecipients)
    .innerJoin(users, eq(users.id, flagRecipients.userId))
    .where(eq(flagRecipients.flagId, flagId));
  return { ...f, parts };
}

type FlagInfo = Awaited<ReturnType<typeof flagInfo>>;
type T = Parameters<OutgoingEmail["content"]>[0];

const FLAGS_LINK = (t: T) => ({ label: t("Open requests"), path: "/requests" });
const flagTitle = (t: T, f: FlagInfo) =>
  f.projectName
    ? t("{type} on {project}", { type: t(FLAG_TYPE_LABELS[f.type]), project: f.projectName })
    : t(FLAG_TYPE_LABELS[f.type]);

/** Active heads of the recipients' departments, without `exceptId`. */
async function headsOf(parts: FlagInfo["parts"], exceptId: string) {
  const departments = [...new Set(parts.map((p) => p.department).filter((d) => d !== null))];
  if (!departments.length) return [];
  return recipients(and(eq(users.isHead, true), inArray(users.department, departments)), exceptId);
}

const unique = (list: Recipient[]) => [...new Map(list.map((r) => [r.id, r])).values()];

export function notifyFlagRaised(flagId: string, by: { id: string; name: string }) {
  later(async () => {
    const f = await flagInfo(flagId);
    const ids = new Set(f.parts.map((p) => p.userId));
    const direct = await recipients(inArray(users.id, [...ids]), by.id);
    const heads = (await headsOf(f.parts, by.id)).filter((h) => !h.id || !ids.has(h.id));
    const names = f.parts.map((p) => p.name).join(", ");
    return [
      ...direct.map((recipient): OutgoingEmail => ({
        event: "flag_raised",
        recipient,
        projectId: f.projectId ?? undefined,
        content: (t) => ({
          subject: t("{by} sent you a request: {title}", { by: by.name, title: flagTitle(t, f) }),
          lines: [
            t("{by} needs something from you:", { by: by.name }),
            f.details,
            ...(f.parts.length > 1 ? [t("Also sent to: {names}", { names })] : []),
            t("Resolve your part on the Requests page once it's done."),
          ],
          link: FLAGS_LINK(t),
        }),
      })),
      ...unique(heads).map((recipient): OutgoingEmail => ({
        event: "flag_raised_head",
        recipient,
        projectId: f.projectId ?? undefined,
        content: (t) => ({
          subject: t("Request for your team: {title}", { title: flagTitle(t, f) }),
          lines: [t("{by} sent a request to {names}:", { by: by.name, names }), f.details],
          link: FLAGS_LINK(t),
        }),
      })),
    ];
  });
}

export function notifyFlagResolved(
  flagId: string,
  partUserId: string,
  by: { id: string; name: string },
  allDone: boolean,
) {
  later(async () => {
    const f = await flagInfo(flagId);
    const part = f.parts.find((p) => p.userId === partUserId);
    if (!part) return [];
    const done = f.parts.filter((p) => p.status === "resolved").length;
    const list = await recipients(inArray(users.id, [f.raisedBy, partUserId]), by.id);
    return list.map((recipient): OutgoingEmail => ({
      event: allDone ? "flag_resolved" : "flag_part_resolved",
      recipient,
      projectId: f.projectId ?? undefined,
      content: (t) => ({
        subject: allDone
          ? t("Request resolved: {title}", { title: flagTitle(t, f) })
          : t("{name} resolved their part: {title}", { name: part.name, title: flagTitle(t, f) }),
        lines: [
          by.id === partUserId
            ? t("{by} resolved their part:", { by: by.name })
            : t("{by} resolved {name}'s part:", { by: by.name, name: part.name }),
          part.resolution ?? "",
          allDone
            ? t("Every part is done, so the request is closed.")
            : t("{done} of {total} part(s) done.", { done, total: f.parts.length }),
          t("The request:"),
          f.details,
        ],
        link: FLAGS_LINK(t),
      }),
    }));
  });
}

export function notifyFlagReminder(flagId: string, by: { id: string; name: string }) {
  later(async () => {
    const f = await flagInfo(flagId);
    const open = f.parts.filter((p) => p.status === "open");
    const openIds = new Set(open.map((p) => p.userId));
    const direct = await recipients(inArray(users.id, [...openIds]), by.id);
    const heads = (await headsOf(open, by.id)).filter((h) => !h.id || !openIds.has(h.id));
    const waitingOn = open.map((p) => p.name).join(", ");
    const sentAt = (fmt: Parameters<OutgoingEmail["content"]>[1]) => fmt.dateTime(f.createdAt);
    return [
      ...direct.map((recipient): OutgoingEmail => ({
        event: "flag_reminder",
        recipient,
        projectId: f.projectId ?? undefined,
        content: (t, fmt) => ({
          subject: t("Reminder: {by} is still waiting on your request: {title}", {
            by: by.name,
            title: flagTitle(t, f),
          }),
          lines: [
            t("{by} sent you this request on {date} and is still waiting:", { by: by.name, date: sentAt(fmt) }),
            f.details,
            t("Resolve your part on the Requests page once it's done."),
          ],
          link: FLAGS_LINK(t),
        }),
      })),
      ...unique(heads).map((recipient): OutgoingEmail => ({
        event: "flag_reminder_head",
        recipient,
        projectId: f.projectId ?? undefined,
        content: (t, fmt) => ({
          subject: t("Reminder for your team: {title}", { title: flagTitle(t, f) }),
          lines: [
            t("{by} is still waiting on {names} since {date}:", { by: by.name, names: waitingOn, date: sentAt(fmt) }),
            f.details,
          ],
          link: FLAGS_LINK(t),
        }),
      })),
    ];
  });
}

export function notifyFlagCancelled(flagId: string, by: { id: string; name: string }) {
  later(async () => {
    const f = await flagInfo(flagId);
    const open = f.parts.filter((p) => p.status === "open");
    const list = unique([
      ...(await recipients(
        inArray(
          users.id,
          open.map((p) => p.userId),
        ),
        by.id,
      )),
      ...(await headsOf(open, by.id)),
    ]);
    return list.map((recipient): OutgoingEmail => ({
      event: "flag_cancelled",
      recipient,
      projectId: f.projectId ?? undefined,
      content: (t) => ({
        subject: t("Request cancelled: {title}", { title: flagTitle(t, f) }),
        lines: [
          t("{by} cancelled this request. No action is needed.", { by: by.name }),
          ...(f.cancelReason ? [t("Reason: {reason}", { reason: f.cancelReason })] : []),
          t("The request:"),
          f.details,
        ],
        link: FLAGS_LINK(t),
      }),
    }));
  });
}

// Client feedback

async function feedbackInfo(itemId: string) {
  const [i] = await db
    .select({
      id: feedbackItems.id,
      body: feedbackItems.body,
      projectId: feedbackItems.projectId,
      projectName: projects.name,
      projectCreatedBy: projects.createdBy,
      devDeadline: projects.devDeadline,
      createdBy: feedbackItems.createdBy,
      assigneeId: feedbackItems.assigneeId,
      extraDays: feedbackItems.extraDays,
      deadlineNote: feedbackItems.deadlineNote,
    })
    .from(feedbackItems)
    .innerJoin(projects, eq(projects.id, feedbackItems.projectId))
    .where(eq(feedbackItems.id, itemId));
  return i;
}

const feedbackLink = (t: T, projectId: string) => ({
  label: t("Open project"),
  path: `${projectPath(projectId)}#feedback`,
});

/** Business heads plus whoever wrote the project's brief. */
async function projectBusiness(projectId: string, exceptId?: string) {
  const [p] = await db.select({ createdBy: projects.createdBy }).from(projects).where(eq(projects.id, projectId));
  return unique(
    await recipients(
      or(
        and(eq(users.department, "business"), eq(users.isHead, true)),
        p?.createdBy ? eq(users.id, p.createdBy) : undefined,
      ),
      exceptId,
    ),
  );
}

/** One email per assignee, listing every item of the batch assigned to them. */
export function notifyFeedbackAssigned(itemIds: string[], by: { id: string; name: string }) {
  if (!itemIds.length) return;
  later(async () => {
    const items = (await Promise.all(itemIds.map(feedbackInfo))).filter((i) => i?.assigneeId);
    const emails: OutgoingEmail[] = [];
    for (const assigneeId of new Set(items.map((i) => i.assigneeId!))) {
      const mine = items.filter((i) => i.assigneeId === assigneeId);
      const { projectId, projectName } = mine[0];
      for (const recipient of await recipients(eq(users.id, assigneeId), by.id)) {
        emails.push({
          event: "feedback_assigned",
          recipient,
          projectId,
          content: (t: T) => ({
            subject: t("Client feedback for you on {project}", { project: projectName }),
            lines: [
              t("{by} assigned you this client feedback:", { by: by.name }),
              ...mine.map((i) => (mine.length > 1 ? `• ${i.body}` : i.body)),
            ],
            link: feedbackLink(t, projectId),
          }),
        });
      }
    }
    return emails;
  });
}

export function notifyFeedbackDone(itemId: string, by: { id: string; name: string }) {
  later(async () => {
    const i = await feedbackInfo(itemId);
    const to = unique([
      ...(i.createdBy ? await recipients(eq(users.id, i.createdBy), by.id) : []),
      ...(await projectBusiness(i.projectId, by.id)),
    ]);
    return to.map((recipient) => ({
      event: "feedback_done",
      recipient,
      projectId: i.projectId,
      content: (t: T) => ({
        subject: t("Ready for the client: feedback on {project}", { project: i.projectName }),
        lines: [
          t("{by} finished this client feedback:", { by: by.name }),
          i.body,
          t("Check it with the client, then mark it as client approved."),
        ],
        link: feedbackLink(t, i.projectId),
      }),
    }));
  });
}

export function notifyScopeNeeded(projectId: string, bodies: string[], by: { id: string; name: string } | null) {
  if (!bodies.length) return;
  later(async () => {
    const p = await projectInfo(projectId);
    return (await projectBusiness(projectId, by?.id)).map((recipient) => ({
      event: "feedback_scope",
      recipient,
      projectId,
      content: (t: T) => ({
        subject: t("New request on {project}: decide the scope", { project: p.name }),
        lines: [
          t(
            "The client asked for something that is not in the brief. Decide if it is included, costs extra, or is rejected:",
          ),
          ...bodies,
        ],
        link: feedbackLink(t, projectId),
      }),
    }));
  });
}

export function notifyDeadlineRequested(itemId: string, by: { id: string; name: string }) {
  later(async () => {
    const i = await feedbackInfo(itemId);
    const to = await recipients(techHeads(), by.id);
    return to.map((recipient) => ({
      event: "feedback_deadline",
      recipient,
      projectId: i.projectId,
      content: (t: T, fmt) => ({
        subject: t("{project}: client feedback needs {count} more days", {
          project: i.projectName,
          count: i.extraDays ?? 0,
        }),
        lines: [
          t("{by} says this client feedback adds {count} days to the dev deadline ({date}):", {
            by: by.name,
            count: i.extraDays ?? 0,
            date: fmt.date(i.devDeadline),
          }),
          i.body,
          ...(i.deadlineNote ? [t("Reason: {reason}", { reason: i.deadlineNote })] : []),
          t("Apply or decline it on the project page."),
        ],
        link: feedbackLink(t, i.projectId),
      }),
    }));
  });
}

export function notifyClientFeedback(projectId: string, clientName: string, bodies: string[]) {
  later(async () => {
    const p = await projectInfo(projectId);
    return (await projectBusiness(projectId)).map((recipient) => ({
      event: "feedback_from_client",
      recipient,
      projectId,
      content: (t: T) => ({
        subject: t("{client} sent feedback on {project}", { client: clientName, project: p.name }),
        lines: [t("New feedback from the client link:"), ...bodies, t("Review it and assign it to someone.")],
        link: feedbackLink(t, projectId),
      }),
    }));
  });
}

export function notifyClientReopened(itemId: string, clientName: string, comment: string) {
  later(async () => {
    const i = await feedbackInfo(itemId);
    const ids = [i.assigneeId, i.createdBy].filter((v) => v !== null);
    const to = unique([
      ...(ids.length ? await recipients(inArray(users.id, ids)) : []),
      ...(await projectBusiness(i.projectId)),
    ]);
    return to.map((recipient) => ({
      event: "feedback_reopened",
      recipient,
      projectId: i.projectId,
      content: (t: T) => ({
        subject: t("{client} says it's not right yet: {project}", { client: clientName, project: i.projectName }),
        lines: [i.body, t("Client's comment: {comment}", { comment })],
        link: feedbackLink(t, i.projectId),
      }),
    }));
  });
}

/** Asks n8n to mkdir the project's folders on the office disk. No-op if n8n is off. */
export function notifyProjectFolders(project: { id: string; name: string; folderKey: string }) {
  after(async () => {
    const base = (process.env.N8N_URL ?? "").replace(/\/$/, "");
    const secret = process.env.AUTOMATION_SECRET;
    if (!base || !secret) return;
    const [year, ...rest] = project.folderKey.split("/");
    try {
      await fetch(`${base}/webhook/studio-os-folders`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-studio-secret": secret },
        body: JSON.stringify({
          projectId: project.id,
          name: project.name,
          year,
          slug: rest.join("/") || project.folderKey,
          folderKey: project.folderKey,
          folders: ALL_DISK_FOLDERS,
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      console.error("Create folders webhook failed", e);
    }
  });
}
