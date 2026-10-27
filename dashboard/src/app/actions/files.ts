"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { projectFiles } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth/session";
import { FILE_LIMITS, isR2Folder, type R2Folder } from "@/lib/folder-names";
import { firstIssue, type Msg } from "@/lib/i18n";
import { canManageProjectFiles } from "@/lib/permissions";
import { getProjectAccess } from "@/lib/projects";
import { deleteObject, headObject, presignGet, presignPut, r2Enabled } from "@/lib/r2";

const refresh = () => revalidatePath("/", "layout");

const NAME = z
  .string()
  .trim()
  .min(1, "Pick a file.")
  .max(180, "Keep the file name short.")
  .refine((n) => !n.includes("/") && !n.includes("\\"), "The file name cannot contain a path.");

const PrepareSchema = z.object({
  projectId: z.uuid(),
  folder: z.string().refine(isR2Folder, "Pick a folder."),
  name: NAME,
  size: z.number().int().positive().max(FILE_LIMITS.maxFileBytes, "Keep each file under 100 MB."),
  mime: z.string().trim().max(200).optional(),
});

function safeName(name: string) {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "_").slice(0, 180);
}

async function usedBytes() {
  const [row] = await db.select({ total: sql<number>`coalesce(sum(${projectFiles.size}), 0)::int` }).from(projectFiles);
  return row.total;
}

export async function prepareUpload(input: unknown): Promise<{ url?: string; objectKey?: string; error?: Msg }> {
  const me = await requireUser();
  const parsed = PrepareSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  if (!r2Enabled()) return { error: "File storage is not set up yet. Add the R2 keys in .env.local." };
  const access = await getProjectAccess(me, parsed.data.projectId);
  if (!access) return { error: "Project not found." };
  if (!canManageProjectFiles(me, access.isMember)) return { error: "You cannot upload files to this project." };
  if ((await usedBytes()) + parsed.data.size > FILE_LIMITS.maxBucketBytes)
    return { error: "The 10 GB storage limit is full. Delete old files or upgrade the R2 plan." };

  const id = crypto.randomUUID();
  const objectKey = `projects/${parsed.data.projectId}/${parsed.data.folder}/${id}-${safeName(parsed.data.name)}`;
  try {
    const url = await presignPut(objectKey, parsed.data.mime || "application/octet-stream", parsed.data.size);
    return { url, objectKey };
  } catch (e) {
    console.error("R2 presign failed", e);
    return { error: "Could not start the upload. Check the R2 keys." };
  }
}

const ConfirmSchema = PrepareSchema.extend({ objectKey: z.string().min(10).max(500) });

export async function confirmUpload(input: unknown): Promise<{ error?: Msg; success?: Msg }> {
  const me = await requireUser();
  const parsed = ConfirmSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  if (!r2Enabled()) return { error: "File storage is not set up yet. Add the R2 keys in .env.local." };
  const { projectId, folder, name, size, mime, objectKey } = parsed.data;
  const access = await getProjectAccess(me, projectId);
  if (!access) return { error: "Project not found." };
  if (!canManageProjectFiles(me, access.isMember)) return { error: "You cannot upload files to this project." };
  const prefix = `projects/${projectId}/${folder}/`;
  if (!objectKey.startsWith(prefix)) return { error: "Invalid upload." };

  try {
    const head = await headObject(objectKey);
    if (head.ContentLength && Math.abs(head.ContentLength - size) > 1024)
      return { error: "The uploaded file does not match what was selected." };
  } catch {
    return { error: "The file did not arrive in storage. Try again." };
  }

  await db.insert(projectFiles).values({
    projectId,
    folder: folder as R2Folder,
    objectKey,
    name: safeName(name),
    size,
    mime: mime || null,
    uploadedBy: me.id,
  });
  await audit({
    userId: me.id,
    action: "upload",
    entity: "file",
    entityId: projectId,
    changes: { projectId, folder, name, size },
  });
  refresh();
  return { success: "File uploaded." };
}

export async function deleteProjectFile(fileId: string): Promise<{ error?: Msg; success?: Msg }> {
  const me = await requireUser();
  const id = z.uuid().safeParse(fileId);
  if (!id.success) return { error: "File not found." };
  const [file] = await db.select().from(projectFiles).where(eq(projectFiles.id, id.data));
  if (!file) return { error: "File not found." };
  const access = await getProjectAccess(me, file.projectId);
  if (!access) return { error: "File not found." };
  if (!canManageProjectFiles(me, access.isMember)) return { error: "You cannot delete files on this project." };

  try {
    if (r2Enabled()) await deleteObject(file.objectKey);
  } catch (e) {
    console.error("R2 delete failed", e);
  }
  await db.delete(projectFiles).where(and(eq(projectFiles.id, file.id), eq(projectFiles.projectId, file.projectId)));
  await audit({
    userId: me.id,
    action: "delete",
    entity: "file",
    entityId: file.id,
    changes: { projectId: file.projectId, name: file.name },
  });
  refresh();
  return { success: "File removed." };
}

export async function fileShareUrl(fileId: string): Promise<{ url?: string; error?: Msg }> {
  const me = await requireUser();
  const id = z.uuid().safeParse(fileId);
  if (!id.success) return { error: "File not found." };
  if (!r2Enabled()) return { error: "File storage is not set up yet. Add the R2 keys in .env.local." };
  const [file] = await db.select().from(projectFiles).where(eq(projectFiles.id, id.data));
  if (!file) return { error: "File not found." };
  if (!(await getProjectAccess(me, file.projectId))) return { error: "File not found." };
  try {
    const url = await presignGet(file.objectKey, file.name);
    return { url };
  } catch (e) {
    console.error("R2 share failed", e);
    return { error: "Could not create a link. Try again." };
  }
}
