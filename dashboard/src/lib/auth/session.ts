import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import type { Viewer } from "@/lib/permissions";

export const SESSION_COOKIE = "studio_session";
const SESSION_DAYS = 30;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const userAgent = (await headers()).get("user-agent");

  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt, userAgent });

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    // Requires HTTPS; enable once the dashboard is served over HTTPS.
    secure: process.env.COOKIE_SECURE === "true",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function deleteCurrentSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
  store.delete(SESSION_COOKIE);
}

export async function deleteUserSessions(userId: string) {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export type CurrentUser = Viewer & {
  name: string;
  email: string;
  mustChangePassword: boolean;
};

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      department: users.department,
      isHead: users.isHead,
      isSuperAdmin: users.isSuperAdmin,
      mustChangePassword: users.mustChangePassword,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, new Date()), eq(users.status, "active")))
    .limit(1);

  return row ?? null;
});

/** Use in every page and server action. Redirects to /login when signed out. */
export async function requireUser(opts: { allowPasswordChange?: boolean } = {}): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword && !opts.allowPasswordChange) redirect("/account?required=1");
  return user;
}
