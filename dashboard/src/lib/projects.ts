import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { projectMembers, projects, users } from "@/db/schema";
import { canSeeAllProjects, type Viewer } from "@/lib/permissions";

export async function isProjectMember(projectId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: projectMembers.userId })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
  return !!row;
}

/** Returns the project only if the viewer may see it, plus whether they are on its team. */
export async function getProjectAccess(me: Viewer, projectId: string) {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) return null;
  const isMember = await isProjectMember(projectId, me.id);
  if (!canSeeAllProjects(me) && !isMember) return null;
  return { project, isMember };
}

export async function getVisibleProject(me: Viewer, projectId: string) {
  return (await getProjectAccess(me, projectId))?.project ?? null;
}

export async function projectExists(projectId: string): Promise<boolean> {
  const [row] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId));
  return !!row;
}

/** Active members of the Development department, i.e. people who can be assigned to projects. */
export function listDevelopers() {
  return db
    .select({ id: users.id, name: users.name, isHead: users.isHead })
    .from(users)
    .where(and(eq(users.department, "development"), eq(users.status, "active")))
    .orderBy(asc(users.name));
}
