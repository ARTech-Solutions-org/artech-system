import "server-only";
import { and, asc, desc, eq, inArray, ne, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { flagRecipients, flags, projectMembers, projects, users } from "@/db/schema";
import { canSeeAllProjects, type Viewer } from "@/lib/permissions";

/** Parts `me` can act on: their own, or (for a head) anyone's in their department. */
function actionableParts(me: Viewer) {
  const team = me.isHead && me.department ? sql` or u.department = ${me.department}` : sql``;
  return sql`(r.user_id = ${me.id}${team})`;
}

/** Flags `me` is involved in: sent by them, sent to them, or (for a head) sent to their team. Super admins see all. */
export function visibleFlagsWhere(me: Viewer): SQL | undefined {
  if (me.isSuperAdmin) return undefined;
  return sql`(${flags.raisedBy} = ${me.id} or exists (
    select 1 from ${flagRecipients} r join ${users} u on u.id = r.user_id
    where r.flag_id = ${flags.id} and ${actionableParts(me)}
  ))`;
}

/** Open flags waiting on `me` (or their team, for heads). Super admins count every open flag. */
function waitingOnMeWhere(me: Viewer): SQL | undefined {
  const open = eq(flags.status, "open");
  if (me.isSuperAdmin) return open;
  return and(
    open,
    sql`exists (
      select 1 from ${flagRecipients} r join ${users} u on u.id = r.user_id
      where r.flag_id = ${flags.id} and r.status = 'open' and ${actionableParts(me)}
    )`,
  );
}

export async function countMyOpenFlags(me: Viewer): Promise<number> {
  return db.$count(flags, waitingOnMeWhere(me));
}

export type FlagPart = {
  userId: string;
  name: string;
  email: string;
  department: (typeof users.$inferSelect)["department"];
  status: (typeof flagRecipients.$inferSelect)["status"];
  resolution: string | null;
  resolvedByName: string | null;
  resolvedAt: Date | null;
};

/** Flags matching `where` with their sender, project and every recipient's part. */
export async function loadFlags(where: SQL | undefined) {
  const raiser = alias(users, "raiser");
  const closer = alias(users, "closer");
  const rows = await db
    .select({
      id: flags.id,
      type: flags.type,
      details: flags.details,
      status: flags.status,
      raisedBy: flags.raisedBy,
      raisedByName: raiser.name,
      createdAt: flags.createdAt,
      projectId: flags.projectId,
      projectName: projects.name,
      cancelReason: flags.resolution,
      closedByName: closer.name,
      closedAt: flags.resolvedAt,
      lastRemindedAt: flags.lastRemindedAt,
    })
    .from(flags)
    .innerJoin(raiser, eq(raiser.id, flags.raisedBy))
    .leftJoin(closer, eq(closer.id, flags.resolvedBy))
    .leftJoin(projects, eq(projects.id, flags.projectId))
    .where(where)
    .orderBy(desc(flags.createdAt));
  if (!rows.length) return [];

  const resolver = alias(users, "resolver");
  const parts = await db
    .select({
      flagId: flagRecipients.flagId,
      userId: users.id,
      name: users.name,
      email: users.email,
      department: users.department,
      status: flagRecipients.status,
      resolution: flagRecipients.resolution,
      resolvedByName: resolver.name,
      resolvedAt: flagRecipients.resolvedAt,
    })
    .from(flagRecipients)
    .innerJoin(users, eq(users.id, flagRecipients.userId))
    .leftJoin(resolver, eq(resolver.id, flagRecipients.resolvedBy))
    .where(
      inArray(
        flagRecipients.flagId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(users.name));

  return rows.map((r) => ({ ...r, parts: parts.filter((p) => p.flagId === r.id) as FlagPart[] }));
}

export type LoadedFlag = Awaited<ReturnType<typeof loadFlags>>[number];

/** Everyone a flag can be sent to: active users other than `me`. */
export function flagPeople(me: Viewer) {
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      department: users.department,
      isHead: users.isHead,
      isSuperAdmin: users.isSuperAdmin,
    })
    .from(users)
    .where(and(eq(users.status, "active"), ne(users.id, me.id)))
    .orderBy(asc(users.name));
}

/** Projects `me` can attach a flag to. */
export function flagProjects(me: Viewer) {
  const mine = db.select({ id: projectMembers.projectId }).from(projectMembers).where(eq(projectMembers.userId, me.id));
  return db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(ne(projects.status, "cancelled"), canSeeAllProjects(me) ? undefined : inArray(projects.id, mine)))
    .orderBy(asc(projects.name));
}
