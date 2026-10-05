"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { equipment, equipmentRequests, flagRecipients, flags, installations, projects, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth/session";
import { isUniqueViolation } from "@/lib/db-errors";
import { closeEquipmentRequest, createEquipmentRequest, refreshWaitlist } from "@/lib/equipment";
import type { ProjectStatus } from "@/lib/format";
import { firstIssue, isLocale, type Locale, type Msg } from "@/lib/i18n";
import {
  canAssign,
  canManageEquipment,
  canManageInstallation,
  canCancelFlag,
  canRequestEquipment,
  canResolveFlagPart,
  canWorkOnProject,
} from "@/lib/permissions";
import { notifyFlagCancelled, notifyFlagRaised, notifyFlagResolved, notifyStatus } from "@/lib/notify";
import { getProjectAccess } from "@/lib/projects";
import { hasArabic, translate } from "@/lib/translate";
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

const optionalUrl = z
  .union([z.literal(""), z.url({ protocol: /^https?$/, error: "Enter a full link starting with https://" })])
  .optional()
  .transform((v) => v || null);

const refresh = () => revalidatePath("/", "layout");
const formValues = (formData: FormData) => Object.fromEntries(formData) as Record<string, string>;

// Equipment requests

const RequestSchema = z
  .object({
    projectId: z.uuid("Invalid project."),
    equipmentId: z.uuid("Pick the equipment."),
    quantity: z.coerce.number().int("Whole units only.").min(1, "At least 1 unit."),
    neededFrom: optionalDate,
    neededUntil: optionalDate,
    notes: optionalText,
  })
  .refine((d) => !d.neededFrom || !d.neededUntil || d.neededFrom <= d.neededUntil, {
    message: "The end date must be after the start date.",
  });

export async function requestEquipment(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireUser();
  const values = formValues(formData);
  const parsed = RequestSchema.safeParse(values);
  if (!parsed.success) return { error: firstIssue(parsed.error), values };

  const access = await getProjectAccess(me, parsed.data.projectId);
  if (!access || !canRequestEquipment(me)) return { error: "You cannot request equipment for this project.", values };

  const result = await createEquipmentRequest({ ...parsed.data, requestedBy: me.id });
  if (!result) return { error: "Equipment not found.", values };

  await audit({
    userId: me.id,
    action: `equipment_${result.status}`,
    entity: "equipment_request",
    entityId: result.id,
    changes: parsed.data,
  });
  refresh();
  return result.status === "approved"
    ? {
        success: "Approved: {qty} × {item} reserved for this project.",
        vars: { qty: parsed.data.quantity, item: result.itemName },
      }
    : {
        success:
          "Waitlisted: only {free} {item} free right now. It will be approved automatically when units come back.",
        vars: { free: Math.max(result.free, 0), item: result.itemName },
      };
}

export async function closeRequest(formData: FormData) {
  const me = await requireUser();
  const id = z.uuid().parse(formData.get("id"));
  const outcome = z.enum(["returned", "cancelled"]).parse(formData.get("outcome"));

  const [request] = await db.select().from(equipmentRequests).where(eq(equipmentRequests.id, id));
  if (!request) throw new Error("Request not found.");
  const allowed = request.requestedBy === me.id || canAssign(me) || canManageInstallation(me) || canManageEquipment(me);
  if (!allowed) throw new Error("You cannot change this request.");

  const result = await closeEquipmentRequest(id, outcome);
  if (result) {
    await audit({
      userId: me.id,
      action: `equipment_${outcome}`,
      entity: "equipment_request",
      entityId: id,
      changes: { promoted: result.promoted },
    });
  }
  refresh();
}

// Equipment inventory

const EquipmentSchema = z.object({
  code: z.string().trim().min(1, "Enter a short code, e.g. MQ3-01.").toUpperCase(),
  name: z.string().trim().min(2, "Enter the name."),
  category: optionalText,
  quantity: z.coerce.number().int("Whole units only.").min(0, "Quantity can't be negative."),
  location: optionalText,
  status: z.enum(["active", "maintenance", "broken", "retired"]),
  notes: optionalText,
});

export async function saveEquipment(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireUser();
  const values = formValues(formData);
  if (!canManageEquipment(me))
    return { error: "Only the Tech Head or Operations Manager can manage equipment.", values };

  const id = z
    .union([z.literal(""), z.uuid()])
    .optional()
    .safeParse(values.id ?? "");
  const parsed = EquipmentSchema.safeParse(values);
  if (!id.success) return { error: "Invalid equipment.", values };
  if (!parsed.success) return { error: firstIssue(parsed.error), values };

  let equipmentId: string;
  try {
    if (id.data) {
      const updated = await db
        .update(equipment)
        .set(parsed.data)
        .where(eq(equipment.id, id.data))
        .returning({ id: equipment.id });
      if (!updated.length) return { error: "Equipment not found.", values };
      equipmentId = id.data;
    } else {
      const [created] = await db.insert(equipment).values(parsed.data).returning({ id: equipment.id });
      equipmentId = created.id;
    }
  } catch (e) {
    if (isUniqueViolation(e)) return { error: "Another item already uses this code.", values };
    throw e;
  }

  const promoted = await refreshWaitlist(equipmentId);
  await audit({
    userId: me.id,
    action: id.data ? "update" : "create",
    entity: "equipment",
    entityId: equipmentId,
    changes: { ...parsed.data, promoted },
  });
  refresh();
  if (!id.data) return { success: "{name} added.", vars: { name: parsed.data.name } };
  return promoted.length
    ? { success: "Saved. {count} waitlisted request(s) approved.", vars: { count: promoted.length }, values }
    : { success: "Saved.", values };
}

// Flags

const FlagSchema = z.object({
  projectId: z
    .union([z.literal(""), z.uuid("Invalid project.")])
    .optional()
    .transform((v) => v || null),
  type: z.enum(["blocked", "needs_data", "needs_assets", "other"], "Pick the flag type."),
  recipients: z.array(z.uuid()).min(1, "Pick at least one person to send the flag to."),
  details: z.string().trim().min(5, "Describe what is needed."),
});

export async function raiseFlag(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireUser();
  const picked = [...new Set(formData.getAll("recipients").map(String))].filter((id) => id !== me.id);
  const values = { ...formValues(formData), recipients: picked.join(",") };
  const parsed = FlagSchema.safeParse({ ...values, recipients: picked });
  if (!parsed.success) return { error: firstIssue(parsed.error), values };
  const { recipients, ...flag } = parsed.data;

  if (flag.projectId && !(await getProjectAccess(me, flag.projectId))) {
    return { error: "You cannot raise flags on this project.", values };
  }
  const people = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, recipients), eq(users.status, "active")));
  if (people.length !== recipients.length) return { error: "Pick at least one person to send the flag to.", values };

  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(flags)
      .values({ ...flag, raisedBy: me.id })
      .returning({ id: flags.id });
    await tx.insert(flagRecipients).values(recipients.map((userId) => ({ flagId: row.id, userId })));
    return row;
  });
  await audit({ userId: me.id, action: "raise", entity: "flag", entityId: created.id, changes: parsed.data });
  notifyFlagRaised(created.id, me);
  refresh();
  return { success: "Flag sent." };
}

/** Resolves one recipient's part; the flag closes when every part is resolved. */
export async function resolveFlag(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireUser();
  const id = z.uuid().safeParse(formData.get("id"));
  const userId = z.uuid().safeParse(formData.get("userId"));
  const resolution = z.string().trim().min(2, "Say how it was resolved.").safeParse(formData.get("resolution"));
  if (!id.success || !userId.success) return { error: "Invalid flag." };
  if (!resolution.success) return { error: firstIssue(resolution.error) };

  const [part] = await db
    .select({ status: flagRecipients.status, flagStatus: flags.status, department: users.department })
    .from(flagRecipients)
    .innerJoin(flags, eq(flags.id, flagRecipients.flagId))
    .innerJoin(users, eq(users.id, flagRecipients.userId))
    .where(and(eq(flagRecipients.flagId, id.data), eq(flagRecipients.userId, userId.data)));
  if (!part || part.flagStatus !== "open" || part.status !== "open") return { error: "This flag is already resolved." };
  if (!canResolveFlagPart(me, { id: userId.data, department: part.department })) {
    return { error: "You cannot resolve this flag." };
  }

  const allDone = await db.transaction(async (tx) => {
    const now = new Date();
    await tx
      .update(flagRecipients)
      .set({ status: "resolved", resolution: resolution.data, resolvedBy: me.id, resolvedAt: now })
      .where(and(eq(flagRecipients.flagId, id.data), eq(flagRecipients.userId, userId.data)));
    const open = await tx.$count(
      flagRecipients,
      and(eq(flagRecipients.flagId, id.data), eq(flagRecipients.status, "open")),
    );
    if (open === 0) {
      await tx
        .update(flags)
        .set({ status: "resolved", resolvedBy: me.id, resolvedAt: now })
        .where(eq(flags.id, id.data));
    }
    return open === 0;
  });
  await audit({
    userId: me.id,
    action: "resolve",
    entity: "flag",
    entityId: id.data,
    changes: { recipient: userId.data, resolution: resolution.data, flagClosed: allDone },
  });
  notifyFlagResolved(id.data, userId.data, me, allDone);
  refresh();
  return { success: allDone ? "Resolved. Every part is done, so the flag is closed." : "Your part is resolved." };
}

export async function cancelFlag(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireUser();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "Invalid flag." };
  const reason = String(formData.get("reason") ?? "").trim() || null;

  const [flag] = await db.select().from(flags).where(eq(flags.id, id.data));
  if (!flag || flag.status !== "open") return { error: "This flag is already closed." };
  if (!canCancelFlag(me, flag)) return { error: "Only the person who sent this flag can cancel it." };

  await db
    .update(flags)
    .set({ status: "cancelled", resolution: reason, resolvedBy: me.id, resolvedAt: new Date() })
    .where(eq(flags.id, id.data));
  await audit({ userId: me.id, action: "cancel", entity: "flag", entityId: id.data, changes: { reason } });
  notifyFlagCancelled(id.data, me);
  refresh();
  return { success: "Flag cancelled." };
}

// Installation guide (developers)

const GuideSchema = z.object({
  projectId: z.uuid("Invalid project."),
  steps: optionalText,
  stepsAr: optionalText,
  demoVideoUrl: optionalUrl,
});

export async function translateText(
  text: string,
  to: Locale,
): Promise<{ text: string; error?: undefined } | { error: Msg; text?: undefined }> {
  await requireUser();
  const source = z.string().trim().min(1).max(5000).safeParse(text);
  if (!source.success || !isLocale(to)) return { error: "Write something to translate first." };
  try {
    return { text: await translate(source.data, to) };
  } catch {
    return { error: "Translation is not available right now. Try again or write it yourself." };
  }
}

export async function saveGuide(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireUser();
  const values = formValues(formData);
  const parsed = GuideSchema.safeParse(values);
  if (!parsed.success) return { error: firstIssue(parsed.error), values };

  const access = await getProjectAccess(me, parsed.data.projectId);
  if (!access || !canWorkOnProject(me, access.isMember)) {
    return { error: "Only developers on this project can edit the guide.", values };
  }

  let { steps, stepsAr } = parsed.data;
  if (steps && !stepsAr && hasArabic(steps)) [steps, stepsAr] = [null, steps];
  if (stepsAr && !steps && !hasArabic(stepsAr)) [steps, stepsAr] = [stepsAr, null];
  let translationFailed = false;
  try {
    if (steps && !stepsAr) stepsAr = await translate(steps, "ar");
    else if (stepsAr && !steps) steps = await translate(stepsAr, "en");
  } catch {
    translationFailed = true;
  }

  const row = { steps, stepsAr, demoVideoUrl: parsed.data.demoVideoUrl, updatedBy: me.id };
  await db
    .insert(installations)
    .values({ projectId: parsed.data.projectId, ...row })
    .onConflictDoUpdate({ target: installations.projectId, set: row });
  await audit({
    userId: me.id,
    action: "update_guide",
    entity: "project",
    entityId: parsed.data.projectId,
    changes: row,
  });
  refresh();
  const saved = { ...values, steps: steps ?? "", stepsAr: stepsAr ?? "" };
  return translationFailed
    ? {
        success: "Guide saved, but the auto-translation failed. Use the Translate button or write both languages.",
        values: saved,
      }
    : { success: "Installation guide saved.", values: saved };
}

// Installation team and report (Operations)

const InstallationSchema = z.object({
  projectId: z.uuid("Invalid project."),
  leadTechnicianId: z
    .union([z.literal(""), z.uuid()])
    .optional()
    .transform((v) => v || null),
  installNotes: optionalText,
});

export async function saveInstallation(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireUser();
  const values = formValues(formData);
  if (!canManageInstallation(me)) return { error: "Only Operations can update the installation.", values };

  const parsed = InstallationSchema.safeParse(values);
  if (!parsed.success) return { error: firstIssue(parsed.error), values };
  if (!(await getProjectAccess(me, parsed.data.projectId))) return { error: "Project not found.", values };

  if (parsed.data.leadTechnicianId) {
    const [tech] = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(eq(users.id, parsed.data.leadTechnicianId), eq(users.department, "operations"), eq(users.status, "active")),
      );
    if (!tech) return { error: "Pick an active member of Operations.", values };
  }

  const row = { leadTechnicianId: parsed.data.leadTechnicianId, notes: parsed.data.installNotes, updatedBy: me.id };
  await db
    .insert(installations)
    .values({ projectId: parsed.data.projectId, ...row })
    .onConflictDoUpdate({ target: installations.projectId, set: row });
  await audit({
    userId: me.id,
    action: "update_installation",
    entity: "project",
    entityId: parsed.data.projectId,
    changes: row,
  });
  refresh();
  return { success: "Installation details saved.", values };
}

// Status

type Moves = Partial<Record<ProjectStatus, ProjectStatus[]>>;
const DEV_MOVES: Moves = {
  assigned: ["in_development"],
  in_development: ["internal_review"],
};
const HEAD_MOVES: Moves = {
  internal_review: ["ready_for_installation", "in_development"],
  ready_for_installation: ["in_development"],
};
const OPS_MOVES: Moves = {
  ready_for_installation: ["installing"],
  installing: ["installed", "ready_for_installation"],
};

export async function moveStatus(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireUser();
  const id = z.uuid().safeParse(formData.get("projectId"));
  const to = z
    .enum(["in_development", "internal_review", "ready_for_installation", "installing", "installed"])
    .safeParse(formData.get("to"));
  if (!id.success || !to.success) return { error: "Invalid status change." };

  const access = await getProjectAccess(me, id.data);
  if (!access) return { error: "You cannot change this project's status." };
  const from = access.project.status;

  const allowed = [
    ...(canWorkOnProject(me, access.isMember) ? (DEV_MOVES[from] ?? []) : []),
    ...(canAssign(me) ? (HEAD_MOVES[from] ?? []) : []),
    ...(canManageInstallation(me) ? (OPS_MOVES[from] ?? []) : []),
  ];
  if (!allowed.includes(to.data)) return { error: "That status change isn't allowed from here." };

  if (to.data === "ready_for_installation" && from === "internal_review") {
    const [guide] = await db.select().from(installations).where(eq(installations.projectId, id.data));
    if (!(guide?.steps || guide?.stepsAr) || !guide.demoVideoUrl) {
      return { error: "Add the installation steps and the demo video link first." };
    }
  }

  await db.transaction(async (tx) => {
    await tx.update(projects).set({ status: to.data }).where(eq(projects.id, id.data));
    const now = new Date();
    const install =
      to.data === "installing"
        ? { status: "in_progress" as const, startedAt: now, completedAt: null }
        : to.data === "installed"
          ? { status: "done" as const, completedAt: now }
          : from === "installing"
            ? { status: "scheduled" as const, startedAt: null }
            : null;
    if (install) {
      await tx
        .insert(installations)
        .values({ projectId: id.data, ...install, updatedBy: me.id })
        .onConflictDoUpdate({ target: installations.projectId, set: { ...install, updatedBy: me.id } });
    }
  });
  await audit({
    userId: me.id,
    action: "status",
    entity: "project",
    entityId: id.data,
    changes: { from, to: to.data },
  });
  notifyStatus(id.data, to.data, me);
  refresh();
  return { success: "Status updated." };
}
