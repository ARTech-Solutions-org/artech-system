import type { Msg } from "@/lib/i18n";

/** Folders the dashboard can upload to (R2). */
export const R2_FOLDERS = [
  "00-brief",
  "01-client-assets",
  "02-brand",
  "03-design",
  "04-content",
  "05-preview",
  "06-delivery",
] as const;

/** Extra folders n8n creates on the office disk only. */
export const DISK_ONLY_FOLDERS = ["09-working", "10-3d", "11-edit"] as const;

export const ALL_DISK_FOLDERS = [...R2_FOLDERS, ...DISK_ONLY_FOLDERS];

export type R2Folder = (typeof R2_FOLDERS)[number];

export const FOLDER_LABELS = {
  "00-brief": "Brief",
  "01-client-assets": "Client assets",
  "02-brand": "Brand",
  "03-design": "Design",
  "04-content": "Content",
  "05-preview": "Preview",
  "06-delivery": "Delivery",
  "09-working": "Working files (office disk)",
  "10-3d": "3D (office disk)",
  "11-edit": "Edit (office disk)",
} as const satisfies Record<(typeof ALL_DISK_FOLDERS)[number], Msg>;

export const isR2Folder = (v: string): v is R2Folder => (R2_FOLDERS as readonly string[]).includes(v);

export const FILE_LIMITS = {
  maxFileBytes: 100 * 1024 * 1024,
  maxBucketBytes: 10 * 1024 * 1024 * 1024,
  maxFileLabel: "100 MB",
};

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/** Windows-safe folder name. Arabic letters are kept. */
export function folderSlug(name: string) {
  const cleaned = name
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return cleaned || "project";
}

export function makeFolderKey(name: string, createdAt: Date, id: string) {
  const year = createdAt.toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" }).slice(0, 4);
  return `${year}/${folderSlug(name)}-${id.slice(0, 8)}`;
}
