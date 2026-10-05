"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { hashPassword } from "@/lib/auth/password";
import { isUniqueViolation } from "@/lib/db-errors";
import { deleteUserSessions, requireUser } from "@/lib/auth/session";
import { firstIssue } from "@/lib/i18n";
import { canManageUser, canManageUsersIn, canSetHead, DEPARTMENTS, type Viewer } from "@/lib/permissions";
import type { FormState } from "./auth";

const tempPassword = z.string().min(8, "Temporary password must be at least 8 characters.");

const CreateUserSchema = z.object({
  name: z.string().trim().min(2, "Enter the full name."),
  email: z.email("Enter a valid email.").trim().toLowerCase(),
  phone: z.string().trim().optional(),
  department: z.enum(DEPARTMENTS, "Pick a department."),
  isHead: z.literal("on").optional(),
  password: tempPassword,
});

export async function createUser(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireUser();
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const values = { ...raw, password: "" };
  const parsed = CreateUserSchema.safeParse(raw);
  if (!parsed.success) return { error: firstIssue(parsed.error), values };
  const d = parsed.data;

  if (!canManageUsersIn(me, d.department)) {
    return { error: "You can only add members to your own department.", values };
  }
  const isHead = d.isHead === "on";
  if (isHead && !canSetHead(me)) return { error: "Only the super admin can appoint department heads.", values };

  try {
    const [created] = await db
      .insert(users)
      .values({
        name: d.name,
        email: d.email,
        phone: d.phone || null,
        department: d.department,
        isHead,
        status: "active",
        mustChangePassword: true,
        passwordHash: await hashPassword(d.password),
        approvedBy: me.id,
        approvedAt: new Date(),
      })
      .returning({ id: users.id });
    await audit({
      userId: me.id,
      action: "create",
      entity: "user",
      entityId: created.id,
      changes: { name: d.name, email: d.email, department: d.department, isHead },
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { error: "A user with this email already exists.", values };
    throw e;
  }

  revalidatePath("/users");
  return {
    success: "{name} added. Share the temporary password; they will be asked to change it on first login.",
    vars: { name: d.name },
  };
}

async function loadManageableTarget(me: Viewer, targetId: string) {
  const [target] = await db
    .select({
      id: users.id,
      name: users.name,
      department: users.department,
      isHead: users.isHead,
      isSuperAdmin: users.isSuperAdmin,
    })
    .from(users)
    .where(eq(users.id, targetId));
  if (!target || !canManageUser(me, target)) return null;
  return target;
}

const UpdateUserSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(2, "Enter the full name."),
  email: z.email("Enter a valid email.").trim().toLowerCase(),
  phone: z.string().trim().optional(),
  department: z.enum(DEPARTMENTS).optional(),
  isHead: z.literal("on").optional(),
});

export async function updateUser(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireUser();
  const parsed = UpdateUserSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const d = parsed.data;

  const target = await loadManageableTarget(me, d.id);
  if (!target) return { error: "You cannot edit this user." };

  const changes: Partial<typeof users.$inferInsert> = { name: d.name, email: d.email, phone: d.phone || null };
  if (canSetHead(me) && !target.isSuperAdmin) {
    if (d.department) changes.department = d.department;
    changes.isHead = d.isHead === "on";
  }

  try {
    await db.update(users).set(changes).where(eq(users.id, d.id));
  } catch (e) {
    if (isUniqueViolation(e)) return { error: "A user with this email already exists." };
    throw e;
  }
  await audit({ userId: me.id, action: "update", entity: "user", entityId: d.id, changes });

  revalidatePath("/users");
  return { success: "Saved." };
}

export async function setUserStatus(formData: FormData) {
  const me = await requireUser();
  const id = z.uuid().parse(formData.get("id"));
  const status = z.enum(["active", "disabled"]).parse(formData.get("status"));
  if (id === me.id) throw new Error("You cannot change your own status.");

  const target = await loadManageableTarget(me, id);
  if (!target) throw new Error("You cannot manage this user.");

  await db.update(users).set({ status }).where(eq(users.id, id));
  if (status === "disabled") await deleteUserSessions(id);
  await audit({ userId: me.id, action: status === "disabled" ? "disable" : "enable", entity: "user", entityId: id });

  revalidatePath("/users");
}

export async function resetPassword(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireUser();
  const id = z.uuid().safeParse(formData.get("id"));
  const password = tempPassword.safeParse(formData.get("password"));
  if (!id.success) return { error: "Invalid user." };
  if (!password.success) return { error: firstIssue(password.error) };
  if (id.data === me.id) return { error: "Use the Account page to change your own password." };

  const target = await loadManageableTarget(me, id.data);
  if (!target) return { error: "You cannot manage this user." };

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(password.data), mustChangePassword: true })
    .where(eq(users.id, id.data));
  await deleteUserSessions(id.data);
  await audit({ userId: me.id, action: "reset_password", entity: "user", entityId: id.data });

  return { success: "Password reset for {name}. They must change it on next login.", vars: { name: target.name } };
}
