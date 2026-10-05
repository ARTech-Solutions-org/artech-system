import "server-only";
import { and, eq, inArray, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { flags, projectMembers } from "@/db/schema";
import { canSeeAllProjects, type Viewer } from "@/lib/permissions";

/** Open flags the viewer should act on or follow: their department's, plus the ones they raised. */
export function myOpenFlagsWhere(me: Viewer): SQL | undefined {
  const open = eq(flags.status, "open");
  if (me.isSuperAdmin) return open;
  const mine = me.department
    ? or(eq(flags.ownerDepartment, me.department), eq(flags.raisedBy, me.id))
    : eq(flags.raisedBy, me.id);
  if (canSeeAllProjects(me)) return and(open, mine);
  const myProjects = db
    .select({ id: projectMembers.projectId })
    .from(projectMembers)
    .where(eq(projectMembers.userId, me.id));
  return and(open, mine, inArray(flags.projectId, myProjects));
}

export async function countMyOpenFlags(me: Viewer): Promise<number> {
  return db.$count(flags, myOpenFlagsWhere(me));
}
