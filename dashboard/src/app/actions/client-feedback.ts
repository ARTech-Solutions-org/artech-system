"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { feedbackComments, feedbackItems, projects } from "@/db/schema";
import { audit } from "@/lib/audit";
import { roundFor } from "@/lib/feedback";
import { firstIssue } from "@/lib/i18n";
import { todayInCairo } from "@/lib/installations";
import { notifyClientFeedback, notifyClientReopened } from "@/lib/notify";
import type { FormState } from "./auth";

const WINDOW_MS = 10 * 60_000;
const MAX_PER_WINDOW = 20;
const hits = new Map<string, number[]>();

function rateLimited(token: string) {
  const now = Date.now();
  const recent = (hits.get(token) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(token, recent);
  return recent.length > MAX_PER_WINDOW;
}

async function projectByToken(token: unknown) {
  const parsed = z.string().min(20).max(64).safeParse(token);
  if (!parsed.success) return null;
  const [p] = await db
    .select({ id: projects.id, createdBy: projects.createdBy })
    .from(projects)
    .where(eq(projects.clientToken, parsed.data));
  return p ? { ...p, token: parsed.data } : null;
}

const clientName = z.string().trim().min(1, "Write your name.").max(100, "Keep your name short.");

const SubmitSchema = z.object({
  name: clientName,
  body: z.string().trim().min(3, "Write your comments.").max(4000, "Keep it under 4000 characters."),
});

export async function submitClientFeedback(_: FormState, formData: FormData): Promise<FormState> {
  const project = await projectByToken(formData.get("token"));
  if (!project) return { error: "This link is no longer active." };
  const values = { name: String(formData.get("name") ?? ""), body: String(formData.get("body") ?? "") };
  const parsed = SubmitSchema.safeParse(values);
  if (!parsed.success) return { error: firstIssue(parsed.error), values };
  if (rateLimited(project.token)) return { error: "Too many messages. Please try again later.", values };

  const round = await roundFor(project.id, project.createdBy);
  const [item] = await db
    .insert(feedbackItems)
    .values({
      projectId: project.id,
      roundId: round.id,
      body: parsed.data.body,
      source: "client_link",
      type: "general",
      status: "new",
      receivedOn: todayInCairo(),
      clientName: parsed.data.name,
      createdBy: project.createdBy,
    })
    .returning({ id: feedbackItems.id });
  await audit({
    userId: null,
    action: "client_submit",
    entity: "feedback",
    entityId: item.id,
    changes: { projectId: project.id, client: parsed.data.name },
  });
  notifyClientFeedback(project.id, parsed.data.name, [parsed.data.body]);
  revalidatePath("/", "layout");
  return { success: "Thank you. We received your comments.", values: { name: parsed.data.name, body: "" } };
}

const ReplySchema = z.object({
  itemId: z.uuid(),
  name: clientName,
  comment: z.string().trim().max(2000, "Keep it under 2000 characters."),
  approve: z.boolean(),
});

/** The client either approves an item that is ready, or says it still isn't right. */
export async function replyToItem(_: FormState, formData: FormData): Promise<FormState> {
  const project = await projectByToken(formData.get("token"));
  if (!project) return { error: "This link is no longer active." };
  const parsed = ReplySchema.safeParse({
    itemId: formData.get("itemId"),
    name: formData.get("name") ?? "",
    comment: formData.get("comment") ?? "",
    approve: formData.get("approve") === "yes",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { itemId, name, comment, approve } = parsed.data;
  if (!approve && !comment) return { error: "Tell us what still needs to change." };
  if (rateLimited(project.token)) return { error: "Too many messages. Please try again later." };

  const updated = await db
    .update(feedbackItems)
    .set(
      approve
        ? { status: "client_approved", approvedBy: null, approvedAt: new Date() }
        : { status: "in_progress", doneAt: null, doneBy: null },
    )
    .where(and(eq(feedbackItems.id, itemId), eq(feedbackItems.projectId, project.id), eq(feedbackItems.status, "done")))
    .returning({ id: feedbackItems.id });
  if (!updated.length) return { error: "This item is not waiting for your review." };

  if (comment) await db.insert(feedbackComments).values({ itemId, clientName: name, body: comment });
  await audit({
    userId: null,
    action: approve ? "client_approve" : "client_reopen",
    entity: "feedback",
    entityId: itemId,
    changes: { projectId: project.id, client: name },
  });
  if (!approve) notifyClientReopened(itemId, name, comment);
  revalidatePath("/", "layout");
  return { success: approve ? "Thank you for approving." : "Thanks. We'll work on it again." };
}
