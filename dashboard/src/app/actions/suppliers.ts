"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { suppliers } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth/session";
import { firstIssue } from "@/lib/i18n";
import { canManageSuppliers } from "@/lib/permissions";
import type { FormState } from "./auth";

const SupplierSchema = z.object({
  companyName: z.string().trim().min(2, "Enter the company name."),
  name: z.string().trim().min(2, "Enter the contact name."),
  mobile: z
    .string()
    .trim()
    .regex(/^\+?[\d\s-]{7,20}$/, "Enter a valid phone number, e.g. 01012345678."),
  address: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || null),
  equipment: z.array(z.string()).transform((list) => [...new Set(list.map((s) => s.trim()).filter(Boolean))]),
});

const NOT_ALLOWED = "Only Business, Operations or the super admin can manage suppliers.";

export async function saveSupplier(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireUser();
  const equipment = formData.getAll("equipment").map(String);
  const values: Record<string, string> = { ...Object.fromEntries(formData), equipment: equipment.join("\n") } as Record<
    string,
    string
  >;
  if (!canManageSuppliers(me)) return { error: NOT_ALLOWED, values };

  const id = z
    .union([z.literal(""), z.uuid()])
    .optional()
    .safeParse(values.id ?? "");
  const parsed = SupplierSchema.safeParse({ ...values, equipment });
  if (!id.success) return { error: "Supplier not found.", values };
  if (!parsed.success) return { error: firstIssue(parsed.error), values };

  let supplierId: string;
  if (id.data) {
    const updated = await db
      .update(suppliers)
      .set(parsed.data)
      .where(eq(suppliers.id, id.data))
      .returning({ id: suppliers.id });
    if (!updated.length) return { error: "Supplier not found.", values };
    supplierId = id.data;
  } else {
    const [created] = await db
      .insert(suppliers)
      .values({ ...parsed.data, createdBy: me.id })
      .returning({ id: suppliers.id });
    supplierId = created.id;
  }

  await audit({
    userId: me.id,
    action: id.data ? "update" : "create",
    entity: "supplier",
    entityId: supplierId,
    changes: parsed.data,
  });
  revalidatePath("/suppliers");
  if (!id.data) return { success: "{name} added.", vars: { name: parsed.data.companyName } };
  return { success: "Saved.", values };
}

export async function deleteSupplier(id: string): Promise<FormState> {
  const me = await requireUser();
  if (!canManageSuppliers(me)) return { error: NOT_ALLOWED };
  if (!z.uuid().safeParse(id).success) return { error: "Supplier not found." };

  const [removed] = await db.delete(suppliers).where(eq(suppliers.id, id)).returning({ name: suppliers.companyName });
  if (!removed) return { error: "Supplier not found." };

  await audit({ userId: me.id, action: "delete", entity: "supplier", entityId: id, changes: removed });
  revalidatePath("/suppliers");
  return { success: "Supplier removed." };
}
