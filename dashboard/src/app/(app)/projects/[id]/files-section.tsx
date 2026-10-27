import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { projectFiles, users } from "@/db/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DISK_ONLY_FOLDERS, FILE_LIMITS, FOLDER_LABELS, R2_FOLDERS, formatBytes } from "@/lib/folder-names";
import { ensureFolderKey } from "@/lib/folders";
import { getI18n } from "@/lib/i18n/server";
import { canManageProjectFiles, type Viewer } from "@/lib/permissions";
import { r2Enabled } from "@/lib/r2";
import { FileRowActions, UploadFileForm } from "./files-forms";

export async function FilesSection({
  me,
  project,
  isMember,
}: {
  me: Viewer;
  project: { id: string; name: string; folderKey: string | null; createdAt: Date };
  isMember: boolean;
}) {
  const { t, fmt } = await getI18n();
  const manage = canManageProjectFiles(me, isMember);
  const storageOn = r2Enabled();
  const folderKey = await ensureFolderKey(project);

  const [files, [usage]] = await Promise.all([
    db
      .select({
        id: projectFiles.id,
        folder: projectFiles.folder,
        name: projectFiles.name,
        size: projectFiles.size,
        createdAt: projectFiles.createdAt,
        uploader: users.name,
      })
      .from(projectFiles)
      .leftJoin(users, eq(users.id, projectFiles.uploadedBy))
      .where(eq(projectFiles.projectId, project.id))
      .orderBy(asc(projectFiles.folder), asc(projectFiles.createdAt)),
    db.select({ total: sql<number>`coalesce(sum(${projectFiles.size}), 0)::int` }).from(projectFiles),
  ]);

  return (
    <Card id="files" className="scroll-mt-20">
      <CardHeader>
        <CardTitle>{t("Files")}</CardTitle>
        <CardDescription>
          {t("Shared files live in cloud storage (R2). Heavy working files stay on the office disk.")}{" "}
          {t("Used {used} of {max}.", {
            used: formatBytes(usage.total),
            max: formatBytes(FILE_LIMITS.maxBucketBytes),
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <p className="text-sm text-muted-foreground">{t("Office disk folder: {path}", { path: folderKey })}</p>

        {storageOn && manage && <UploadFileForm projectId={project.id} />}
        {!storageOn && (
          <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
            {t("Uploads are off until R2 keys are added to .env.local. Folders still appear below.")}
          </p>
        )}

        {R2_FOLDERS.map((folder) => {
          const inFolder = files.filter((f) => f.folder === folder);
          return (
            <section key={folder} className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">
                {t(FOLDER_LABELS[folder])}
                <span className="ms-2 font-normal text-muted-foreground">
                  {inFolder.length ? t("{count} file(s)", { count: inFolder.length }) : t("Empty")}
                </span>
              </h3>
              {inFolder.length > 0 && (
                <ul className="divide-y rounded-lg border">
                  {inFolder.map((f) => (
                    <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <div className="font-medium">{f.name}</div>
                        <div className="text-muted-foreground">
                          {formatBytes(f.size)}
                          {f.uploader ? ` · ${f.uploader}` : ""} · {fmt.dateTime(f.createdAt)}
                        </div>
                      </div>
                      {manage && storageOn && <FileRowActions fileId={f.id} />}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}

        <section className="flex flex-col gap-1 text-sm">
          <h3 className="font-semibold">{t("Office disk only")}</h3>
          <p className="text-muted-foreground">
            {t("Copy Unreal, C4D and Premiere files here in Explorer. They are not uploaded to R2.")}
          </p>
          <ul className="list-inside list-disc text-muted-foreground">
            {DISK_ONLY_FOLDERS.map((f) => (
              <li key={f}>
                {t(FOLDER_LABELS[f])}
                <span className="ms-1 font-mono text-xs">
                  {folderKey}/{f}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </CardContent>
    </Card>
  );
}
