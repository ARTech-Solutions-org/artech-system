import "server-only";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { projectFinance, projectMembers, projects, projectSchedule, users } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/session";
import { openFeedbackCount } from "@/lib/feedback";
import { canSeeAllProjects, canViewBudget, canViewInstallationDate } from "@/lib/permissions";

/** Projects the user may see, with restricted columns only for roles allowed to see them. */
export async function listProjects(me: CurrentUser) {
  const showBudget = canViewBudget(me);
  const showInstallation = canViewInstallationDate(me);

  const myProjectIds = db
    .select({ id: projectMembers.projectId })
    .from(projectMembers)
    .where(eq(projectMembers.userId, me.id));

  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      clientName: projects.clientName,
      status: projects.status,
      devDeadline: projects.devDeadline,
      createdAt: projects.createdAt,
      openFeedback: openFeedbackCount,
      ...(showBudget ? { budget: projectFinance.budget, currency: projectFinance.currency } : {}),
      ...(showInstallation ? { installationDate: projectSchedule.installationDate } : {}),
    })
    .from(projects)
    .leftJoin(projectFinance, eq(projectFinance.projectId, projects.id))
    .leftJoin(projectSchedule, eq(projectSchedule.projectId, projects.id))
    .where(canSeeAllProjects(me) ? undefined : inArray(projects.id, myProjectIds))
    .orderBy(desc(projects.createdAt));

  const members = rows.length
    ? await db
        .select({ projectId: projectMembers.projectId, name: users.name })
        .from(projectMembers)
        .innerJoin(users, eq(users.id, projectMembers.userId))
        .where(
          inArray(
            projectMembers.projectId,
            rows.map((r) => r.id),
          ),
        )
        .orderBy(asc(projectMembers.role), asc(users.name))
    : [];
  const team = (id: string) => members.filter((m) => m.projectId === id).map((m) => m.name);

  return { rows, team, showBudget, showInstallation };
}
