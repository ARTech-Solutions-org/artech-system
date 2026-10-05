import { asc, ilike, or, sql } from "drizzle-orm";
import { Phone, Search } from "lucide-react";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { suppliers } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireUser } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { canManageSuppliers } from "@/lib/permissions";
import { EditSection } from "../projects/[id]/project-ui";
import { AddSupplierButton, DeleteSupplierButton, SupplierForm } from "./supplier-forms";

export default async function SuppliersPage(props: PageProps<"/suppliers">) {
  const me = await requireUser();
  if (!canManageSuppliers(me)) redirect("/");
  const { t } = await getI18n();
  const raw = (await props.searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";

  const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const rows = await db
    .select()
    .from(suppliers)
    .where(
      q
        ? or(
            ilike(suppliers.name, pattern),
            ilike(suppliers.mobile, pattern),
            sql`exists (select 1 from unnest(${suppliers.equipment}) as item where item ilike ${pattern})`,
          )
        : undefined,
    )
    .orderBy(asc(suppliers.name));

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("Suppliers")}</h1>
          <p className="text-muted-foreground">{t("Companies we rent equipment from, and how to reach them.")}</p>
        </div>
        <AddSupplierButton />
      </div>

      <form className="relative max-w-sm">
        <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          name="q"
          defaultValue={q}
          placeholder={t("Search by name, mobile or equipment")}
          className="ps-8"
          aria-label={t("Search by name, mobile or equipment")}
        />
      </form>

      {rows.length === 0 && (
        <p className="text-muted-foreground">
          {q ? t("No suppliers match your search.") : t("No suppliers yet. Add the first one.")}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {rows.map((s) => (
          <Card key={s.id}>
            <CardHeader>
              <CardTitle className="text-base font-semibold">{s.name}</CardTitle>
              <a
                href={`tel:${s.mobile.replace(/[\s-]/g, "")}`}
                dir="ltr"
                className="flex items-center gap-1.5 self-start text-sm text-muted-foreground hover:text-foreground"
              >
                <Phone className="size-3.5" />
                {s.mobile}
              </a>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <div>
                <div className="mb-1.5 text-xs font-medium text-muted-foreground">
                  {t("Equipment we rent ({count})", { count: s.equipment.length })}
                </div>
                {s.equipment.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {s.equipment.map((item) => (
                      <span key={item} className="rounded-md border bg-muted px-2 py-0.5 text-xs">
                        {item}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>
              {s.notes && <p className="text-muted-foreground">{s.notes}</p>}
              <EditSection label={t("Edit")}>
                <div className="flex flex-col gap-4">
                  <SupplierForm
                    initial={{
                      id: s.id,
                      name: s.name,
                      mobile: s.mobile,
                      equipment: s.equipment.join("\n"),
                      notes: s.notes,
                    }}
                  />
                  <DeleteSupplierButton id={s.id} name={s.name} />
                </div>
              </EditSection>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
