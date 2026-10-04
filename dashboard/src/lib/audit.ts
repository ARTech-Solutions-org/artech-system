import "server-only";
import { db } from "@/db";
import { auditLog } from "@/db/schema";

export async function audit(entry: {
  userId: string | null;
  action: string;
  entity: string;
  entityId?: string;
  changes?: Record<string, unknown>;
}) {
  await db.insert(auditLog).values(entry);
}
