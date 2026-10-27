import "server-only";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { equipment, equipmentRequests } from "@/db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Units currently out on approved requests, per equipment item. Use in queries selecting from `equipment`. */
export const inUseQuantity = sql<number>`coalesce((
  select sum(er.quantity) from equipment_requests er
  where er.equipment_id = "equipment"."id" and er.status = 'approved'
), 0)::int`;

/** Active catalogue rows for the request form (retired items are hidden). */
export function listCatalogForRequest() {
  return db
    .select({
      id: equipment.id,
      name: equipment.name,
      code: equipment.code,
      status: equipment.status,
      quantity: equipment.quantity,
      inUse: inUseQuantity,
    })
    .from(equipment)
    .where(ne(equipment.status, "retired"))
    .orderBy(asc(equipment.name));
}

async function lockAndCountFree(tx: Tx, equipmentId: string) {
  // Row lock serializes concurrent requests for the same item so stock can't be double-booked.
  const [item] = await tx.select().from(equipment).where(eq(equipment.id, equipmentId)).for("update");
  if (!item) return null;
  const [{ used }] = await tx
    .select({ used: sql<number>`coalesce(sum(${equipmentRequests.quantity}), 0)::int` })
    .from(equipmentRequests)
    .where(and(eq(equipmentRequests.equipmentId, equipmentId), eq(equipmentRequests.status, "approved")));
  const free = item.status === "active" ? item.quantity - used : 0;
  return { item, free };
}

/** Approves when enough units are free, otherwise waitlists. */
export async function createEquipmentRequest(input: {
  projectId: string;
  equipmentId: string;
  requestedBy: string;
  quantity: number;
  neededFrom: string | null;
  neededUntil: string | null;
  notes: string | null;
}) {
  return db.transaction(async (tx) => {
    const stock = await lockAndCountFree(tx, input.equipmentId);
    if (!stock) return null;
    const status = stock.free >= input.quantity ? ("approved" as const) : ("waitlisted" as const);
    const [created] = await tx
      .insert(equipmentRequests)
      .values({ ...input, status })
      .returning({ id: equipmentRequests.id, status: equipmentRequests.status });
    return { ...created, itemName: stock.item.name, free: stock.free };
  });
}

/** Ends a request and approves waitlisted requests, oldest first, that now fit. */
export async function closeEquipmentRequest(requestId: string, outcome: "returned" | "cancelled") {
  return db.transaction(async (tx) => {
    const [request] = await tx.select().from(equipmentRequests).where(eq(equipmentRequests.id, requestId));
    if (!request || (request.status !== "approved" && request.status !== "waitlisted")) return null;

    await lockAndCountFree(tx, request.equipmentId);
    await tx
      .update(equipmentRequests)
      .set({ status: outcome, returnedAt: outcome === "returned" ? new Date() : null })
      .where(eq(equipmentRequests.id, requestId));

    const promoted = await promoteWaitlist(tx, request.equipmentId);
    return { request, promoted };
  });
}

/** Re-checks the waitlist, e.g. after stock was increased or an item came back from maintenance. */
export async function refreshWaitlist(equipmentId: string) {
  return db.transaction(async (tx) => {
    await lockAndCountFree(tx, equipmentId);
    return promoteWaitlist(tx, equipmentId);
  });
}

async function promoteWaitlist(tx: Tx, equipmentId: string) {
  const stock = await lockAndCountFree(tx, equipmentId);
  if (!stock) return [];
  let free = stock.free;
  const waiting = await tx
    .select()
    .from(equipmentRequests)
    .where(and(eq(equipmentRequests.equipmentId, equipmentId), eq(equipmentRequests.status, "waitlisted")))
    .orderBy(asc(equipmentRequests.createdAt));

  const promoted: string[] = [];
  for (const w of waiting) {
    if (w.quantity > free) continue;
    await tx.update(equipmentRequests).set({ status: "approved" }).where(eq(equipmentRequests.id, w.id));
    free -= w.quantity;
    promoted.push(w.id);
  }
  return promoted;
}
