"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { equipment, equipmentRequests, flags, installations, projects } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth/session";
import { isUniqueViolation } from "@/lib/db-errors";
import { closeEquipmentRequest, createEquipmentRequest, refreshWaitlist } from "@/lib/equipment";
import type { ProjectStatus } from "@/lib/format";
import {
  canAssign,
  canManageEquipment,
  canManageInstallation,
  canRaiseFlag,
  canRequestEquipment,
  canResolveFlag,
  canWorkOnProject,
  DEPARTMENTS,
} from "@/lib/permissions";
import { getProjectAccess } from "@/lib/projects";
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
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };

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
    ? { success: `Approved: ${parsed.data.quantity} × ${result.itemName} reserved for this project.` }
    : {
        success: `Waitlisted: only ${Math.max(result.free, 0)} ${result.itemName} free right now. It will be approved automatically when units come back.`,
      };
}

export async function closeRequest(formData: FormData) {
  const me = await requireUser();
  const id = z.uuid().parse(formData.get("id"));
  const outcome = z.enum(["returned", "cancelled"]).parse(formData.get("outcome"));

  const [request] = await db.select().from(equipmentRequests).where(eq(equipmentRequests.id, id));
  if (!request) throw new Error("Request not found.");
  const allowed =
    request.requestedBy === me.id || canAssign(me) || canManageInstallation(me) || canManageEquipment(me);
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
  if (!canManageEquipment(me)) return { error: "Only the Tech Head or Operations Manager can manage equipment.", values };

  const id = z.union([z.literal(""), z.uuid()]).optional().safeParse(values.id ?? "");
  const parsed = EquipmentSchema.safeParse(values);
  if (!id.success) return { error: "Invalid equipment.", values };
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };

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
  return id.data
    ? { success: promoted.length ? `Saved. ${promoted.length} waitlisted request(s) approved.` : "Saved.", values }
    : { success: `${parsed.data.name} added.` };
}

// Flags

const FlagSchema = z.object({
  projectId: z.uuid("Invalid project."),
  type: z.enum(["blocked", "needs_data", "needs_assets", "other"], "Pick the flag type."),
  ownerDepartment: z.enum(DEPARTMENTS, "Pick who needs to act."),
  details: z.string().trim().min(5, "Describe what is needed."),
});

export async function raiseFlag(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireUser();
  const values = formValues(formData);
  const parsed = FlagSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };

  const access = await getProjectAccess(me, parsed.data.projectId);
  if (!access || !canRaiseFlag(me)) return { error: "You cannot raise flags on this project.", values };

  const [created] = await db
    .insert(flags)
    .values({ ...parsed.data, raisedBy: me.id })
    .returning({ id: flags.id });
  await audit({ userId: me.id, action: "raise", entity: "flag", entityId: created.id, changes: parsed.data });
  refresh();
  return { success: "Flag raised." };
}

export async function resolveFlag(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireUser();
  const id = z.uuid().safeParse(formData.get("id"));
  const resolution = z.string().trim().min(2, "Say how it was resolved.").safeParse(formData.get("resolution"));
  if (!id.success) return { error: "Invalid flag." };
  if (!resolution.success) return { error: resolution.error.issues[0].message };

  const [flag] = await db.select().from(flags).where(eq(flags.id, id.data));
  if (!flag || flag.status !== "open") return { error: "This flag is already resolved." };
  if (!(await getProjectAccess(me, flag.projectId)) || !canResolveFlag(me, flag)) {
    return { error: "You cannot resolve this flag." };
  }

  await db
    .update(flags)
    .set({ status: "resolved", resolution: resolution.data, resolvedBy: me.id, resolvedAt: new Date() })
    .where(eq(flags.id, id.data));
  await audit({ userId: me.id, action: "resolve", entity: "flag", entityId: id.data, changes: { resolution: resolution.data } });
  refresh();
  return { success: "Flag resolved." };
}

// Installation guide

const GuideSchema = z.object({
  projectId: z.uuid("Invalid project."),
  steps: optionalText,
  demoVideoUrl: optionalUrl,
});

export async function saveGuide(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireUser();
  const values = formValues(formData);
  const parsed = GuideSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };

  const access = await getProjectAccess(me, parsed.data.projectId);
  if (!access || !canWorkOnProject(me, access.isMember)) {
    return { error: "Only developers on this project can edit the guide.", values };
  }

  const row = { steps: parsed.data.steps, demoVideoUrl: parsed.data.demoVideoUrl, updatedBy: me.id };
  await db
    .insert(installations)
    .values({ projectId: parsed.data.projectId, ...row })
    .onConflictDoUpdate({ target: installations.projectId, set: row });
  await audit({ userId: me.id, action: "update_guide", entity: "project", entityId: parsed.data.projectId, changes: row });
  refresh();
  return { success: "Installation guide saved.", values };
}

// Status

const DEV_MOVES: Partial<Record<ProjectStatus, ProjectStatus[]>> = {
  assigned: ["in_development"],
  in_development: ["internal_review"],
};
const HEAD_MOVES: Partial<Record<ProjectStatus, ProjectStatus[]>> = {
  internal_review: ["ready_for_installation", "in_development"],
  ready_for_installation: ["in_development"],
};

export async function moveStatus(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireUser();
  const id = z.uuid().safeParse(formData.get("projectId"));
  const to = z
    .enum(["in_development", "internal_review", "ready_for_installation"])
    .safeParse(formData.get("to"));
  if (!id.success || !to.success) return { error: "Invalid status change." };

  const access = await getProjectAccess(me, id.data);
  if (!access || !canWorkOnProject(me, access.isMember)) return { error: "You cannot change this project's status." };
  const from = access.project.status;

  const allowed = [...(DEV_MOVES[from] ?? []), ...(canAssign(me) ? (HEAD_MOVES[from] ?? []) : [])];
  if (!allowed.includes(to.data)) return { error: "That status change isn't allowed from here." };

  if (to.data === "ready_for_installation") {
    const [guide] = await db.select().from(installations).where(eq(installations.projectId, id.data));
    if (!guide?.steps || !guide.demoVideoUrl) {
      return { error: "Add the installation steps and the demo video link first." };
    }
  }

  await db.update(projects).set({ status: to.data }).where(eq(projects.id, id.data));
  await audit({ userId: me.id, action: "status", entity: "project", entityId: id.data, changes: { from, to: to.data } });
  refresh();
  return { success: "Status updated." };
}
