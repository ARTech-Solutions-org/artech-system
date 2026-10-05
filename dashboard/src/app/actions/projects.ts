"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import {
  financeEntries,
  milestones,
  progressReviews,
  projectFinance,
  projectMembers,
  projects,
  projectSchedule,
  users,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth/session";
import { isUniqueViolation } from "@/lib/db-errors";
import { CURRENCIES } from "@/lib/format";
import {
  canAssign,
  canEditBrief,
  canEditBudget,
  canEditInstallationDate,
  canManageFinance,
} from "@/lib/permissions";
import { projectExists } from "@/lib/projects";
import type { FormState } from "./auth";

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => v || null);

const optionalDate = z
  .union([z.literal(""), z.iso.date("Enter a valid date.")])
  .optional()
  .transform((v) => v || null);

const amount = z.preprocess(
  (v) => (typeof v === "string" ? v.replace(/,/g, "").trim() : v),
  z.string().regex(/^\d+(\.\d{1,2})?$/, "Enter an amount like 15000 or 15000.50."),
);

const optionalAmount = z.preprocess(
  (v) => (typeof v === "string" ? v.replace(/,/g, "").trim() : v),
  z
    .union([z.literal(""), z.string().regex(/^\d+(\.\d{1,2})?$/, "Enter a budget like 15000 or 15000.50.")])
    .optional()
    .transform((v) => v || null),
);

const currency = z.enum(CURRENCIES, "Pick a currency.");
const projectId = z.uuid("Invalid project.");

const BriefSchema = z.object({
  name: z.string().trim().min(2, "Enter the project name."),
  clientName: optionalText,
  description: optionalText,
  refs: optionalText,
  design: optionalText,
  content: optionalText,
  otherData: optionalText,
});

const FinanceSchema = z.object({ budget: optionalAmount, currency, financeNotes: optionalText });

const ScheduleSchema = z.object({
  installationDate: optionalDate,
  locationLink: optionalText,
  scheduleNotes: optionalText,
});

// Every project page reads from several tables, so refresh the whole app tree after a change.
const refresh = () => revalidatePath("/", "layout");

const formValues = (formData: FormData) => Object.fromEntries(formData) as Record<string, string>;

// Brief

export async function createProject(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireUser();
  const values = formValues(formData);
  if (!canEditBrief(me)) return { error: "Only Business can create briefs.", values };

  const brief = BriefSchema.safeParse(values);
  if (!brief.success) return { error: brief.error.issues[0].message, values };

  const finance = canEditBudget(me) ? FinanceSchema.safeParse(values) : null;
  if (finance && !finance.success) return { error: finance.error.issues[0].message, values };
  const schedule = canEditInstallationDate(me) ? ScheduleSchema.safeParse(values) : null;
  if (schedule && !schedule.success) return { error: schedule.error.issues[0].message, values };

  let id: string;
  try {
    id = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(projects)
        .values({ ...brief.data, createdBy: me.id })
        .returning({ id: projects.id });
      if (finance?.data) {
        const f = finance.data;
        await tx.insert(projectFinance).values({
          projectId: created.id,
          budget: f.budget,
          currency: f.currency,
          notes: f.financeNotes,
          updatedBy: me.id,
        });
      }
      if (schedule?.data) {
        const s = schedule.data;
        await tx.insert(projectSchedule).values({
          projectId: created.id,
          installationDate: s.installationDate,
          locationLink: s.locationLink,
          notes: s.scheduleNotes,
          updatedBy: me.id,
        });
      }
      return created.id;
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { error: "A project with this name already exists.", values };
    throw e;
  }

  await audit({ userId: me.id, action: "create", entity: "project", entityId: id, changes: brief.data });
  refresh();
  redirect(`/projects/${id}`);
}

export async function updateBrief(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireUser();
  const values = formValues(formData);
  if (!canEditBrief(me)) return { error: "Only Business can edit briefs.", values };

  const id = projectId.safeParse(values.projectId);
  const brief = BriefSchema.safeParse(values);
  if (!id.success) return { error: id.error.issues[0].message, values };
  if (!brief.success) return { error: brief.error.issues[0].message, values };

  try {
    const updated = await db
      .update(projects)
      .set(brief.data)
      .where(eq(projects.id, id.data))
      .returning({ id: projects.id });
    if (!updated.length) return { error: "Project not found.", values };
  } catch (e) {
    if (isUniqueViolation(e)) return { error: "A project with this name already exists.", values };
    throw e;
  }

  await audit({ userId: me.id, action: "update_brief", entity: "project", entityId: id.data, changes: brief.data });
  refresh();
  return { success: "Brief saved.", values };
}

// Finance

export async function saveFinance(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireUser();
  const values = formValues(formData);
  if (!canEditBudget(me)) return { error: "You cannot edit the budget.", values };

  const id = projectId.safeParse(values.projectId);
  const parsed = FinanceSchema.safeParse(values);
  if (!id.success) return { error: id.error.issues[0].message, values };
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  if (!(await projectExists(id.data))) return { error: "Project not found.", values };

  const row = {
    budget: parsed.data.budget,
    currency: parsed.data.currency,
    notes: parsed.data.financeNotes,
    updatedBy: me.id,
  };
  await db
    .insert(projectFinance)
    .values({ projectId: id.data, ...row })
    .onConflictDoUpdate({ target: projectFinance.projectId, set: row });

  await audit({ userId: me.id, action: "update_budget", entity: "project", entityId: id.data, changes: row });
  refresh();
  return { success: "Budget saved.", values };
}

const FinanceEntrySchema = z.object({
  projectId,
  kind: z.enum(["payment", "expense"], "Pick payment or expense."),
  amount,
  currency,
  entryDate: z.iso.date("Enter the date."),
  description: z.string().trim().min(2, "Describe the entry."),
  reference: optionalText,
});

export async function addFinanceEntry(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireUser();
  const values = formValues(formData);
  if (!canManageFinance(me)) return { error: "Only Accounting can record payments and expenses.", values };

  const parsed = FinanceEntrySchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  if (!(await projectExists(parsed.data.projectId))) return { error: "Project not found.", values };

  const [created] = await db
    .insert(financeEntries)
    .values({ ...parsed.data, createdBy: me.id })
    .returning({ id: financeEntries.id });

  await audit({
    userId: me.id,
    action: `add_${parsed.data.kind}`,
    entity: "finance_entry",
    entityId: created.id,
    changes: parsed.data,
  });
  refresh();
  return { success: parsed.data.kind === "payment" ? "Payment recorded." : "Expense recorded." };
}

export async function deleteFinanceEntry(formData: FormData) {
  const me = await requireUser();
  if (!canManageFinance(me)) throw new Error("Only Accounting can delete finance entries.");
  const id = z.uuid().parse(formData.get("id"));

  const [deleted] = await db.delete(financeEntries).where(eq(financeEntries.id, id)).returning();
  if (deleted) await audit({ userId: me.id, action: "delete", entity: "finance_entry", entityId: id, changes: deleted });
  refresh();
}

// Schedule

export async function saveSchedule(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireUser();
  const values = formValues(formData);
  if (!canEditInstallationDate(me)) return { error: "Only Business can set the installation date.", values };

  const id = projectId.safeParse(values.projectId);
  const parsed = ScheduleSchema.safeParse(values);
  if (!id.success) return { error: id.error.issues[0].message, values };
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  if (!(await projectExists(id.data))) return { error: "Project not found.", values };

  const row = {
    installationDate: parsed.data.installationDate,
    locationLink: parsed.data.locationLink,
    notes: parsed.data.scheduleNotes,
    updatedBy: me.id,
  };
  await db
    .insert(projectSchedule)
    .values({ projectId: id.data, ...row })
    .onConflictDoUpdate({ target: projectSchedule.projectId, set: row });

  await audit({ userId: me.id, action: "update_schedule", entity: "project", entityId: id.data, changes: row });
  refresh();
  return { success: "Installation details saved.", values };
}

const ProgressReviewSchema = z.object({
  projectId,
  title: z.string().trim().min(2, "Enter what will be shown."),
  reviewDate: z.iso.date("Enter the date."),
  notes: optionalText,
});

export async function addProgressReview(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireUser();
  const values = formValues(formData);
  if (!canEditInstallationDate(me)) return { error: "Only Business can set progress dates.", values };

  const parsed = ProgressReviewSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  if (!(await projectExists(parsed.data.projectId))) return { error: "Project not found.", values };

  const [created] = await db
    .insert(progressReviews)
    .values({ ...parsed.data, createdBy: me.id })
    .returning({ id: progressReviews.id });
  await audit({ userId: me.id, action: "create", entity: "progress_review", entityId: created.id, changes: parsed.data });
  refresh();
  return { success: "Progress date added." };
}

export async function deleteProgressReview(formData: FormData) {
  const me = await requireUser();
  if (!canEditInstallationDate(me)) throw new Error("Only Business can remove progress dates.");
  const id = z.uuid().parse(formData.get("id"));

  const [deleted] = await db.delete(progressReviews).where(eq(progressReviews.id, id)).returning();
  if (deleted) await audit({ userId: me.id, action: "delete", entity: "progress_review", entityId: id, changes: deleted });
  refresh();
}

// Team (Tech Head)

export async function addMembers(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireUser();
  if (!canAssign(me)) return { error: "Only the Tech Head can assign developers." };

  const id = projectId.safeParse(formData.get("projectId"));
  const picked = z.array(z.uuid()).safeParse(formData.getAll("developers"));
  const lead = z.union([z.literal(""), z.uuid()]).optional().safeParse(formData.get("lead") ?? "");
  if (!id.success || !picked.success || !lead.success) return { error: "Invalid selection." };
  if (!picked.data.length) return { error: "Pick at least one developer." };
  if (lead.data && !picked.data.includes(lead.data)) return { error: "The lead must be one of the selected developers." };

  const [project] = await db
    .select({ status: projects.status, assignedAt: projects.assignedAt })
    .from(projects)
    .where(eq(projects.id, id.data));
  if (!project) return { error: "Project not found." };

  const valid = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, picked.data), eq(users.department, "development"), eq(users.status, "active")));
  if (valid.length !== picked.data.length) return { error: "Only active developers can be assigned." };

  await db.transaction(async (tx) => {
    const existing = await tx
      .select({ userId: projectMembers.userId, role: projectMembers.role })
      .from(projectMembers)
      .where(eq(projectMembers.projectId, id.data));
    const leadId = lead.data || (existing.some((m) => m.role === "lead") ? null : picked.data[0]);

    if (leadId) {
      await tx.update(projectMembers).set({ role: "member" }).where(eq(projectMembers.projectId, id.data));
    }
    await tx
      .insert(projectMembers)
      .values(
        picked.data.map((userId) => ({
          projectId: id.data,
          userId,
          role: userId === leadId ? ("lead" as const) : ("member" as const),
          addedBy: me.id,
        })),
      )
      .onConflictDoNothing();
    if (leadId) {
      await tx
        .update(projectMembers)
        .set({ role: "lead" })
        .where(and(eq(projectMembers.projectId, id.data), eq(projectMembers.userId, leadId)));
    }
    if (project.status === "brief_submitted") {
      await tx
        .update(projects)
        .set({ status: "assigned", assignedBy: me.id, assignedAt: project.assignedAt ?? new Date() })
        .where(eq(projects.id, id.data));
    }
  });

  await audit({
    userId: me.id,
    action: "add_members",
    entity: "project",
    entityId: id.data,
    changes: { developers: picked.data, lead: lead.data || null },
  });
  refresh();
  return { success: project.status === "brief_submitted" ? "Project assigned." : "Developers added." };
}

export async function setLead(formData: FormData) {
  const me = await requireUser();
  if (!canAssign(me)) throw new Error("Only the Tech Head can change the lead.");
  const id = z.uuid().parse(formData.get("projectId"));
  const userId = z.uuid().parse(formData.get("userId"));

  await db.transaction(async (tx) => {
    await tx.update(projectMembers).set({ role: "member" }).where(eq(projectMembers.projectId, id));
    await tx
      .update(projectMembers)
      .set({ role: "lead" })
      .where(and(eq(projectMembers.projectId, id), eq(projectMembers.userId, userId)));
  });
  await audit({ userId: me.id, action: "set_lead", entity: "project", entityId: id, changes: { lead: userId } });
  refresh();
}

export async function removeMember(formData: FormData) {
  const me = await requireUser();
  if (!canAssign(me)) throw new Error("Only the Tech Head can remove developers.");
  const id = z.uuid().parse(formData.get("projectId"));
  const userId = z.uuid().parse(formData.get("userId"));

  await db.transaction(async (tx) => {
    await tx
      .delete(projectMembers)
      .where(and(eq(projectMembers.projectId, id), eq(projectMembers.userId, userId)));
    const remaining = await tx
      .select({ userId: projectMembers.userId })
      .from(projectMembers)
      .where(eq(projectMembers.projectId, id));
    // With nobody left, send the brief back to the Tech Head's queue.
    if (!remaining.length) {
      await tx
        .update(projects)
        .set({ status: "brief_submitted", assignedBy: null, assignedAt: null })
        .where(and(eq(projects.id, id), eq(projects.status, "assigned")));
    }
  });
  await audit({ userId: me.id, action: "remove_member", entity: "project", entityId: id, changes: { userId } });
  refresh();
}

export async function setDevDeadline(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireUser();
  if (!canAssign(me)) return { error: "Only the Tech Head can set the development deadline." };

  const id = projectId.safeParse(formData.get("projectId"));
  const deadline = optionalDate.safeParse(formData.get("devDeadline") ?? "");
  if (!id.success) return { error: id.error.issues[0].message };
  if (!deadline.success) return { error: deadline.error.issues[0].message };

  const updated = await db
    .update(projects)
    .set({ devDeadline: deadline.data })
    .where(eq(projects.id, id.data))
    .returning({ id: projects.id });
  if (!updated.length) return { error: "Project not found." };

  await audit({
    userId: me.id,
    action: "set_dev_deadline",
    entity: "project",
    entityId: id.data,
    changes: { devDeadline: deadline.data },
  });
  refresh();
  return { success: "Deadline saved." };
}

// Milestones (Tech Head)

const MilestoneSchema = z.object({
  projectId,
  title: z.string().trim().min(2, "Enter the milestone."),
  dueDate: optionalDate,
});

export async function addMilestone(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireUser();
  const values = formValues(formData);
  if (!canAssign(me)) return { error: "Only the Tech Head can add milestones.", values };

  const parsed = MilestoneSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  if (!(await projectExists(parsed.data.projectId))) return { error: "Project not found.", values };

  const [created] = await db
    .insert(milestones)
    .values({ ...parsed.data, createdBy: me.id })
    .returning({ id: milestones.id });
  await audit({ userId: me.id, action: "create", entity: "milestone", entityId: created.id, changes: parsed.data });
  refresh();
  return { success: "Milestone added." };
}

export async function toggleMilestone(formData: FormData) {
  const me = await requireUser();
  if (!canAssign(me)) throw new Error("Only the Tech Head can update milestones.");
  const id = z.uuid().parse(formData.get("id"));
  const done = formData.get("done") === "true";

  await db
    .update(milestones)
    .set({ status: done ? "done" : "pending", completedAt: done ? new Date() : null })
    .where(eq(milestones.id, id));
  await audit({ userId: me.id, action: done ? "complete" : "reopen", entity: "milestone", entityId: id });
  refresh();
}

export async function deleteMilestone(formData: FormData) {
  const me = await requireUser();
  if (!canAssign(me)) throw new Error("Only the Tech Head can remove milestones.");
  const id = z.uuid().parse(formData.get("id"));

  const [deleted] = await db.delete(milestones).where(eq(milestones.id, id)).returning();
  if (deleted) await audit({ userId: me.id, action: "delete", entity: "milestone", entityId: id, changes: deleted });
  refresh();
}
