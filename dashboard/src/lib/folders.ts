import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { makeFolderKey } from "@/lib/folder-names";

export {
  ALL_DISK_FOLDERS,
  DISK_ONLY_FOLDERS,
  FILE_LIMITS,
  FOLDER_LABELS,
  R2_FOLDERS,
  formatBytes,
  isR2Folder,
  makeFolderKey,
  type R2Folder,
} from "@/lib/folder-names";

/** Sets `folderKey` once so renaming the project does not move files. */
export async function ensureFolderKey(project: {
  id: string;
  name: string;
  folderKey: string | null;
  createdAt: Date;
}) {
  if (project.folderKey) return project.folderKey;
  const key = makeFolderKey(project.name, project.createdAt, project.id);
  await db.update(projects).set({ folderKey: key }).where(eq(projects.id, project.id));
  return key;
}
