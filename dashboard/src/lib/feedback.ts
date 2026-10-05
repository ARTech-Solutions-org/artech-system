import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { feedbackComments, feedbackItems, feedbackRounds, projects, users } from "@/db/schema";
import { OPEN_FEEDBACK } from "@/lib/format";

const creator = alias(users, "creator");
const assignee = alias(users, "assignee");
const doer = alias(users, "doer");
const approver = alias(users, "approver");
const decider = alias(users, "decider");

/** Every round, item and comment of a project, with the names of the people involved. */
export async function loadProjectFeedback(projectId: string) {
  const [rounds, items] = await Promise.all([
    db
      .select()
      .from(feedbackRounds)
      .where(eq(feedbackRounds.projectId, projectId))
      .orderBy(desc(feedbackRounds.number)),
    db
      .select({
        item: feedbackItems,
        createdByName: creator.name,
        assigneeName: assignee.name,
        doneByName: doer.name,
        approvedByName: approver.name,
        scopeDecidedByName: decider.name,
      })
      .from(feedbackItems)
      .leftJoin(creator, eq(creator.id, feedbackItems.createdBy))
      .leftJoin(assignee, eq(assignee.id, feedbackItems.assigneeId))
      .leftJoin(doer, eq(doer.id, feedbackItems.doneBy))
      .leftJoin(approver, eq(approver.id, feedbackItems.approvedBy))
      .leftJoin(decider, eq(decider.id, feedbackItems.scopeDecidedBy))
      .where(eq(feedbackItems.projectId, projectId))
      .orderBy(asc(feedbackItems.createdAt)),
  ]);

  const comments = items.length
    ? await db
        .select({
          id: feedbackComments.id,
          itemId: feedbackComments.itemId,
          body: feedbackComments.body,
          createdAt: feedbackComments.createdAt,
          clientName: feedbackComments.clientName,
          authorName: users.name,
        })
        .from(feedbackComments)
        .leftJoin(users, eq(users.id, feedbackComments.userId))
        .where(
          inArray(
            feedbackComments.itemId,
            items.map((i) => i.item.id),
          ),
        )
        .orderBy(asc(feedbackComments.createdAt))
    : [];

  return {
    rounds,
    items: items.map((r) => ({ ...r, comments: comments.filter((c) => c.itemId === r.item.id) })),
  };
}

export type LoadedFeedback = Awaited<ReturnType<typeof loadProjectFeedback>>["items"][number];

/** People an item can be assigned to. */
export function feedbackAssignees() {
  return db
    .select({ id: users.id, name: users.name, department: users.department })
    .from(users)
    .where(eq(users.status, "active"))
    .orderBy(asc(users.name));
}

/** `count(*)` of open feedback per project, for lists. */
export const openFeedbackCount = sql<number>`(
  select count(*) from feedback_items fi
  where fi.project_id = "projects"."id" and fi.status in ('awaiting_scope', 'new', 'in_progress', 'done')
)::int`;

/** Open items assigned to this person, newest first. */
export function myOpenFeedback(userId: string) {
  return db
    .select({
      id: feedbackItems.id,
      body: feedbackItems.body,
      status: feedbackItems.status,
      priority: feedbackItems.priority,
      receivedOn: feedbackItems.receivedOn,
      projectId: projects.id,
      projectName: projects.name,
    })
    .from(feedbackItems)
    .innerJoin(projects, eq(projects.id, feedbackItems.projectId))
    .where(and(eq(feedbackItems.assigneeId, userId), inArray(feedbackItems.status, ["new", "in_progress"])))
    .orderBy(desc(feedbackItems.priority), asc(feedbackItems.receivedOn));
}

/** Items waiting on Business: scope decisions, and finished work to confirm with the client. */
export function feedbackForBusiness() {
  return db
    .select({
      id: feedbackItems.id,
      body: feedbackItems.body,
      status: feedbackItems.status,
      projectId: projects.id,
      projectName: projects.name,
    })
    .from(feedbackItems)
    .innerJoin(projects, eq(projects.id, feedbackItems.projectId))
    .where(inArray(feedbackItems.status, ["awaiting_scope", "done"]))
    .orderBy(asc(feedbackItems.status), asc(feedbackItems.updatedAt))
    .limit(20);
}

export const isOpenFeedback = (status: string) => (OPEN_FEEDBACK as string[]).includes(status);

export const newClientToken = () => randomBytes(18).toString("base64url");

/** The latest round, or round 1 when the project has none yet. Pass `fresh` to always start a new round. */
export async function roundFor(
  projectId: string,
  userId: string | null,
  fresh = false,
): Promise<typeof feedbackRounds.$inferSelect> {
  const [latest] = await db
    .select()
    .from(feedbackRounds)
    .where(eq(feedbackRounds.projectId, projectId))
    .orderBy(desc(feedbackRounds.number))
    .limit(1);
  if (latest && !fresh) return latest;
  const [created] = await db
    .insert(feedbackRounds)
    .values({ projectId, number: (latest?.number ?? 0) + 1, createdBy: userId })
    .onConflictDoNothing()
    .returning();
  // A parallel request created the same round number first.
  return created ?? (await roundFor(projectId, userId, false));
}

// Quick capture: an AI model splits one long client message into separate items.

export type SplitItem = {
  body: string;
  type: "design" | "content" | "technical" | "new_request" | "general";
  urgent: boolean;
};

export const aiEnabled = () => !!(process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY);

const PROMPT = `You help a creative-technology studio manage client feedback.
Split the client's message into separate, actionable change requests. Keep each one short and in the language the client used.
Classify each as "design", "content", "technical", "new_request" (something new that was not part of the original project) or "general".
Mark "urgent" true only when the client clearly says it is urgent.
Ignore greetings and small talk. Answer only with JSON: {"items":[{"body":"...","type":"...","urgent":false}]}`;

export async function splitFeedback(text: string, projectBrief: string | null): Promise<SplitItem[]> {
  const user = `${projectBrief ? `Project brief:\n${projectBrief.slice(0, 2000)}\n\n` : ""}Client message:\n${text}`;
  let raw: string;
  if (process.env.OPENAI_API_KEY) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: PROMPT },
          { role: "user", content: user },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
    raw = (await res.json()).choices[0].message.content;
  } else {
    const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": process.env.GEMINI_API_KEY!, "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: PROMPT }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
    raw = (await res.json()).candidates[0].content.parts[0].text;
  }

  const TYPES = ["design", "content", "technical", "new_request", "general"];
  const parsed = JSON.parse(raw) as { items?: { body?: unknown; type?: unknown; urgent?: unknown }[] };
  return (parsed.items ?? [])
    .filter((i) => typeof i.body === "string" && i.body.trim())
    .slice(0, 30)
    .map((i) => ({
      body: (i.body as string).trim().slice(0, 2000),
      type: (TYPES.includes(i.type as string) ? i.type : "general") as SplitItem["type"],
      urgent: i.urgent === true,
    }));
}
