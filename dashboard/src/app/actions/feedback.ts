"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { feedbackComments, feedbackItems, projects } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth/session";
import { aiEnabled, newClientToken, roundFor, type SplitItem, splitFeedback } from "@/lib/feedback";
import { OPEN_FEEDBACK } from "@/lib/format";
import { firstIssue, type Msg } from "@/lib/i18n";
import { todayInCairo } from "@/lib/installations";
import { notifyDeadlineRequested, notifyFeedbackAssigned, notifyFeedbackDone, notifyScopeNeeded } from "@/lib/notify";
import {
  canAssign,
  canAssignFeedback,
  canDecideFeedback,
  canLogFeedback,
  canRequestDeadlineChange,
  canWorkOnFeedback,
  canWorkOnProject,
} from "@/lib/permissions";
import { getProjectAccess } from "@/lib/projects";
import type { FormState } from "./auth";

const refresh = () => revalidatePath("/", "layout");
const TYPES = ["design", "content", "technical", "new_request", "general"] as const;

const LogSchema = z.object({
  projectId: z.uuid("Invalid project."),
  source: z.enum(["whatsapp", "call", "email", "meeting", "site_visit"]),
  receivedOn: z.iso.date("Enter a valid date."),
  newRound: z.boolean(),
  assigneeId: z.union([z.literal(""), z.uuid()]).transform((v) => v || null),
  items: z
    .array(
      z.object({
        body: z.string().trim().max(2000, "Keep each item under 2000 characters."),
        type: z.enum(TYPES),
        priority: z.enum(["normal", "urgent"]),
      }),
    )
    .transform((list) => list.filter((i) => i.body))
    .pipe(z.array(z.any()).min(1, "Write what the client asked for.")),
});

export async function logFeedback(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireUser();
  const bodies = formData.getAll("body").map(String);
  const types = formData.getAll("type").map(String);
  const priorities = formData.getAll("priority").map(String);
  const parsed = LogSchema.safeParse({
    projectId: formData.get("projectId"),
    source: formData.get("source"),
    receivedOn: formData.get("receivedOn"),
    newRound: formData.get("newRound") === "on",
    assigneeId: formData.get("assigneeId") ?? "",
    items: bodies.map((body, i) => ({ body, type: types[i], priority: priorities[i] })),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  if (!canLogFeedback(me)) return { error: "Only Business, Operations or the super admin can log client feedback." };
  const { projectId, source, receivedOn, newRound, assigneeId } = parsed.data;
  const items = parsed.data.items as { body: string; type: (typeof TYPES)[number]; priority: "normal" | "urgent" }[];
  if (!(await getProjectAccess(me, projectId))) return { error: "Project not found." };

  const round = await roundFor(projectId, me.id, newRound);
  const created = await db
    .insert(feedbackItems)
    .values(
      items.map((i) => ({
        projectId,
        roundId: round.id,
        body: i.body,
        source,
        type: i.type,
        priority: i.priority,
        status: i.type === "new_request" ? ("awaiting_scope" as const) : ("new" as const),
        receivedOn,
        assigneeId,
        createdBy: me.id,
      })),
    )
    .returning({ id: feedbackItems.id, type: feedbackItems.type, body: feedbackItems.body });

  await audit({
    userId: me.id,
    action: "log",
    entity: "feedback",
    entityId: projectId,
    changes: { projectId, round: round.number, count: created.length, source },
  });
  notifyScopeNeeded(
    projectId,
    created.filter((c) => c.type === "new_request").map((c) => c.body),
    me,
  );
  if (assigneeId)
    notifyFeedbackAssigned(
      created.map((c) => c.id),
      me,
    );
  refresh();
  return {
    success: "Logged {count} item(s) in round {round}.",
    vars: { count: created.length, round: round.number },
  };
}

/** Quick capture: split one pasted client message into separate items for review before saving. */
export async function splitClientMessage(
  projectId: string,
  text: string,
): Promise<{ items?: SplitItem[]; error?: Msg }> {
  const me = await requireUser();
  if (!canLogFeedback(me)) return { error: "Only Business, Operations or the super admin can log client feedback." };
  if (!aiEnabled()) return { error: "Quick capture is not set up yet. Add an OpenAI or Gemini API key." };
  const message = text.trim().slice(0, 8000);
  if (message.length < 5) return { error: "Paste the client's message first." };
  const access = await getProjectAccess(me, projectId);
  if (!access) return { error: "Project not found." };
  try {
    const items = await splitFeedback(message, access.project.description);
    return items.length ? { items } : { error: "No change requests found in this message." };
  } catch (e) {
    console.error("Quick capture failed", e);
    return { error: "Quick capture failed. Try again, or add the items by hand." };
  }
}

const ChangeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("assign"), assigneeId: z.union([z.uuid(), z.null()]) }),
  z.object({ kind: z.literal("start") }),
  z.object({ kind: z.literal("done") }),
  z.object({ kind: z.literal("reopen") }),
  z.object({ kind: z.literal("approve") }),
  z.object({ kind: z.literal("reject"), reason: z.string().trim().max(1000) }),
  z.object({
    kind: z.literal("scope"),
    decision: z.enum(["included", "extra_cost", "rejected"]),
    note: z.string().trim().max(1000),
  }),
  z.object({
    kind: z.literal("deadline_request"),
    days: z.coerce.number().int("Whole days only.").min(1, "At least 1 day.").max(365, "At most 365 days."),
    note: z.string().trim().max(1000),
  }),
  z.object({ kind: z.literal("deadline_decide"), apply: z.boolean() }),
]);

export type FeedbackChange = z.input<typeof ChangeSchema>;

export async function changeFeedback(itemId: string, input: FeedbackChange): Promise<FormState> {
  const me = await requireUser();
  const id = z.uuid().safeParse(itemId);
  const parsed = ChangeSchema.safeParse(input);
  if (!id.success) return { error: "Item not found." };
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const change = parsed.data;

  const [item] = await db.select().from(feedbackItems).where(eq(feedbackItems.id, id.data));
  if (!item) return { error: "Item not found." };
  const access = await getProjectAccess(me, item.projectId);
  if (!access) return { error: "Item not found." };
  const work = canWorkOnFeedback(me, access.isMember, item);
  const open = (OPEN_FEEDBACK as string[]).includes(item.status);
  const now = new Date();

  let set: Partial<typeof feedbackItems.$inferInsert>;
  let success: Msg = "Saved.";
  switch (change.kind) {
    case "assign": {
      const self = change.assigneeId === me.id && canWorkOnProject(me, access.isMember);
      if (!canAssignFeedback(me) && !self) return { error: "You can't assign this item." };
      if (!open) return { error: "This item is already closed." };
      set = { assigneeId: change.assigneeId };
      break;
    }
    case "start":
      if (!work) return { error: "Only the developers on this project can update this item." };
      if (item.status !== "new") return { error: "This item can't be started now." };
      set = { status: "in_progress", assigneeId: item.assigneeId ?? me.id };
      break;
    case "done":
      if (!work) return { error: "Only the developers on this project can update this item." };
      if (item.status !== "new" && item.status !== "in_progress")
        return { error: "This item can't be marked done now." };
      set = { status: "done", doneBy: me.id, doneAt: now };
      success = "Marked done. Business will confirm with the client.";
      break;
    case "reopen":
      if (!work && !canDecideFeedback(me)) return { error: "You can't reopen this item." };
      if (item.status !== "done" && item.status !== "client_approved")
        return { error: "Only finished items can be reopened." };
      set = { status: "in_progress", approvedAt: null, approvedBy: null };
      break;
    case "approve":
      if (!canDecideFeedback(me)) return { error: "Only Business can confirm the client approved." };
      if (item.status !== "done") return { error: "Only items marked done can be approved." };
      set = { status: "client_approved", approvedBy: me.id, approvedAt: now };
      break;
    case "reject":
      if (!canDecideFeedback(me)) return { error: "Only Business can decide not to do an item." };
      if (!open) return { error: "This item is already closed." };
      set = { status: "rejected", rejectReason: change.reason || null };
      break;
    case "scope":
      if (!canDecideFeedback(me)) return { error: "Only Business can decide the scope." };
      if (item.status !== "awaiting_scope") return { error: "The scope of this item is already decided." };
      if (change.decision === "extra_cost" && !change.note)
        return { error: "Write the extra cost or what was agreed with the client." };
      set = {
        status: change.decision === "rejected" ? "rejected" : "new",
        scopeDecision: change.decision,
        scopeNote: change.note || null,
        scopeDecidedBy: me.id,
        scopeDecidedAt: now,
        ...(change.decision === "rejected" ? { rejectReason: change.note || null } : {}),
      };
      break;
    case "deadline_request":
      if (!canRequestDeadlineChange(me, access.isMember))
        return { error: "Only the developers on this project can ask for more time." };
      if (!open) return { error: "This item is already closed." };
      set = {
        extraDays: change.days,
        deadlineNote: change.note || null,
        deadlineDecision: null,
        deadlineDecidedBy: null,
      };
      success = "Sent to the Tech Head.";
      break;
    case "deadline_decide":
      if (!canAssign(me)) return { error: "Only the Tech Head can change the dev deadline." };
      if (!item.extraDays || item.deadlineDecision) return { error: "There is no open deadline request on this item." };
      set = { deadlineDecision: change.apply ? "applied" : "declined", deadlineDecidedBy: me.id };
      break;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(feedbackItems)
      .set(set)
      .where(and(eq(feedbackItems.id, item.id), eq(feedbackItems.status, item.status)));
    if (change.kind === "deadline_decide" && change.apply) {
      await tx
        .update(projects)
        .set({
          devDeadline: sql`coalesce(${projects.devDeadline}, ${todayInCairo()}::date) + ${item.extraDays}::int`,
        })
        .where(eq(projects.id, item.projectId));
    }
  });
  await audit({
    userId: me.id,
    action: change.kind,
    entity: "feedback",
    entityId: item.id,
    changes: { ...change, projectId: item.projectId },
  });

  if (change.kind === "assign" && change.assigneeId && change.assigneeId !== item.assigneeId)
    notifyFeedbackAssigned([item.id], me);
  if (change.kind === "done") notifyFeedbackDone(item.id, me);
  if (change.kind === "deadline_request") notifyDeadlineRequested(item.id, me);
  refresh();
  return { success };
}

export async function addFeedbackComment(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireUser();
  const itemId = z.uuid().safeParse(formData.get("itemId"));
  const body = z
    .string()
    .trim()
    .min(1, "Write a comment.")
    .max(2000, "Keep it under 2000 characters.")
    .safeParse(formData.get("body") ?? "");
  if (!itemId.success) return { error: "Item not found." };
  if (!body.success) return { error: firstIssue(body.error) };
  const [item] = await db
    .select({ projectId: feedbackItems.projectId })
    .from(feedbackItems)
    .where(eq(feedbackItems.id, itemId.data));
  if (!item || !(await getProjectAccess(me, item.projectId))) return { error: "Item not found." };

  await db.insert(feedbackComments).values({ itemId: itemId.data, userId: me.id, body: body.data });
  refresh();
  return { success: "Comment added." };
}

/** Turns the client's feedback link on (a new secret link each time) or off. */
export async function setClientLink(projectId: string, on: boolean): Promise<FormState> {
  const me = await requireUser();
  if (!canDecideFeedback(me)) return { error: "Only Business can manage the client link." };
  const id = z.uuid().safeParse(projectId);
  if (!id.success || !(await getProjectAccess(me, id.data))) return { error: "Project not found." };
  await db
    .update(projects)
    .set({ clientToken: on ? newClientToken() : null })
    .where(eq(projects.id, id.data));
  await audit({
    userId: me.id,
    action: on ? "client_link_on" : "client_link_off",
    entity: "project",
    entityId: id.data,
  });
  refresh();
  return { success: on ? "Client link created." : "Client link turned off." };
}
