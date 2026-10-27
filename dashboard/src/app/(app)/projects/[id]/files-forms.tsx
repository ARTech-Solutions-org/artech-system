"use client";

import { Check, Copy, Trash2, Upload } from "lucide-react";
import { useState, useTransition } from "react";
import { confirmUpload, deleteProjectFile, fileShareUrl, prepareUpload } from "@/app/actions/files";
import { FormMessage, selectClass } from "@/components/form-message";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { FOLDER_LABELS, type R2Folder } from "@/lib/folder-names";
import type { FormState } from "@/app/actions/auth";

const R2 = [
  "00-brief",
  "01-client-assets",
  "02-brand",
  "03-design",
  "04-content",
  "05-preview",
  "06-delivery",
] as const satisfies R2Folder[];

export function UploadFileForm({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const [folder, setFolder] = useState<R2Folder>("01-client-assets");
  const [state, setState] = useState<FormState>(undefined);
  const [progress, setProgress] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const onFiles = (list: FileList | null) => {
    if (!list?.length) return;
    const files = [...list];
    start(async () => {
      setState(undefined);
      for (const [i, file] of files.entries()) {
        setProgress(t("Uploading {name} ({n} of {total})…", { name: file.name, n: i + 1, total: files.length }));
        const prep = await prepareUpload({
          projectId,
          folder,
          name: file.name,
          size: file.size,
          mime: file.type || "application/octet-stream",
        });
        if (prep.error || !prep.url || !prep.objectKey) {
          setState({ error: prep.error });
          setProgress(null);
          return;
        }
        const put = await fetch(prep.url, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type || "application/octet-stream" },
        });
        if (!put.ok) {
          setState({ error: "The upload to storage failed. Check R2 CORS for this site." });
          setProgress(null);
          return;
        }
        const done = await confirmUpload({
          projectId,
          folder,
          name: file.name,
          size: file.size,
          mime: file.type || "application/octet-stream",
          objectKey: prep.objectKey,
        });
        if (done.error) {
          setState({ error: done.error });
          setProgress(null);
          return;
        }
      }
      setProgress(null);
      setState({ success: files.length === 1 ? "File uploaded." : "Files uploaded." });
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-44 flex-col gap-1.5">
          <label htmlFor="file-folder" className="text-sm">
            {t("Folder")}
          </label>
          <select
            id="file-folder"
            className={selectClass}
            value={folder}
            onChange={(e) => setFolder(e.target.value as R2Folder)}
          >
            {R2.map((f) => (
              <option key={f} value={f}>
                {t(FOLDER_LABELS[f])}
              </option>
            ))}
          </select>
        </div>
        <Button type="button" variant="outline" size="sm" className="relative" disabled={pending}>
          <Upload />
          {pending ? t("Uploading…") : t("Upload files")}
          <input
            type="file"
            multiple
            disabled={pending}
            className="absolute inset-0 cursor-pointer opacity-0"
            onChange={(e) => {
              onFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </Button>
      </div>
      {progress && <p className="text-sm text-muted-foreground">{progress}</p>}
      <FormMessage state={state} />
    </div>
  );
}

export function FileRowActions({ fileId }: { fileId: string }) {
  const { t } = useI18n();
  const [state, setState] = useState<FormState>(undefined);
  const [copied, setCopied] = useState(false);
  const [ask, setAsk] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1">
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await fileShareUrl(fileId);
              if (res.error || !res.url) return setState({ error: res.error });
              await navigator.clipboard.writeText(res.url);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            })
          }
        >
          {copied ? <Check /> : <Copy />}
          {copied ? t("Copied") : t("Copy link")}
        </Button>
        {ask ? (
          <>
            <Button
              type="button"
              size="xs"
              variant="destructive"
              disabled={pending}
              onClick={() => start(async () => setState(await deleteProjectFile(fileId)))}
            >
              {t("Confirm")}
            </Button>
            <Button type="button" size="xs" variant="ghost" onClick={() => setAsk(false)}>
              {t("Cancel")}
            </Button>
          </>
        ) : (
          <Button type="button" size="xs" variant="destructive" disabled={pending} onClick={() => setAsk(true)}>
            <Trash2 />
            {t("Delete")}
          </Button>
        )}
      </div>
      <FormMessage state={state} />
    </div>
  );
}
