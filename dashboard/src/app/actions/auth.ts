"use server";

import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, deleteCurrentSession, deleteUserSessions, requireUser } from "@/lib/auth/session";

/** `values` echoes submitted fields back so a form can keep them after an error (React resets forms after actions). */
export type FormState =
  | { error?: string; success?: string; email?: string; values?: Record<string, string> }
  | undefined;

const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000;
const failures = new Map<string, { count: number; since: number }>();

function isLockedOut(key: string) {
  const f = failures.get(key);
  if (!f) return false;
  if (Date.now() - f.since > WINDOW_MS) {
    failures.delete(key);
    return false;
  }
  return f.count >= MAX_FAILURES;
}

function recordFailure(key: string) {
  const f = failures.get(key);
  if (!f || Date.now() - f.since > WINDOW_MS) failures.set(key, { count: 1, since: Date.now() });
  else f.count += 1;
}

const LoginSchema = z.object({
  email: z.string().trim().min(1, "Enter your email."),
  password: z.string().min(1, "Enter your password."),
});

export async function login(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = LoginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const email = parsed.data.email.toLowerCase();
  if (isLockedOut(email)) return { error: "Too many failed attempts. Try again in 15 minutes.", email };

  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash, status: users.status })
    .from(users)
    .where(eq(sql`lower(${users.email})`, email))
    .limit(1);

  const valid = await verifyPassword(parsed.data.password, user?.passwordHash ?? null);
  if (!user || !valid) {
    recordFailure(email);
    return { error: "Wrong email or password.", email };
  }
  if (user.status !== "active") {
    return { error: "This account is not active. Contact your department head.", email };
  }

  failures.delete(email);
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  await createSession(user.id);
  await audit({ userId: user.id, action: "login", entity: "user", entityId: user.id });
  redirect("/");
}

export async function logout() {
  await deleteCurrentSession();
  redirect("/login");
}

const ChangePasswordSchema = z
  .object({
    current: z.string().min(1, "Enter your current password."),
    next: z.string().min(8, "New password must be at least 8 characters."),
    confirm: z.string(),
  })
  .refine((d) => d.next === d.confirm, { message: "New passwords do not match." })
  .refine((d) => d.next !== d.current, { message: "New password must be different from the current one." });

export async function changePassword(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireUser({ allowPasswordChange: true });
  const parsed = ChangePasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const [row] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, me.id));
  if (!(await verifyPassword(parsed.data.current, row?.passwordHash ?? null))) {
    return { error: "Current password is wrong." };
  }

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(parsed.data.next), mustChangePassword: false })
    .where(eq(users.id, me.id));
  await deleteUserSessions(me.id);
  await createSession(me.id);
  await audit({ userId: me.id, action: "change_password", entity: "user", entityId: me.id });

  if (me.mustChangePassword) redirect("/");
  return { success: "Password updated." };
}
