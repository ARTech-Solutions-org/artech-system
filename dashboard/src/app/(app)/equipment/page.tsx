import { asc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { equipment, equipmentRequests, projects } from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { inUseQuantity } from "@/lib/equipment";
import { EQUIPMENT_STATUS_LABELS } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { canManageEquipment, canRequestEquipment } from "@/lib/permissions";
import { projectHref } from "@/lib/project-tabs";
import { EquipmentForm } from "../projects/work-forms";
import { EditSection } from "../projects/[id]/project-ui";

export default async function EquipmentPage() {
  const me = await requireUser();
  const manage = canManageEquipment(me);
  if (!manage && !canRequestEquipment(me)) redirect("/");
  const { t } = await getI18n();

  const [items, holders] = await Promise.all([
    db
      .select({
        id: equipment.id,
        code: equipment.code,
        name: equipment.name,
        category: equipment.category,
        quantity: equipment.quantity,
        location: equipment.location,
        status: equipment.status,
        notes: equipment.notes,
        inUse: inUseQuantity,
      })
      .from(equipment)
      .orderBy(asc(equipment.name)),
    db
      .select({
        equipmentId: equipmentRequests.equipmentId,
        status: equipmentRequests.status,
        quantity: equipmentRequests.quantity,
        projectId: projects.id,
        projectName: projects.name,
      })
      .from(equipmentRequests)
      .innerJoin(projects, eq(projects.id, equipmentRequests.projectId))
      .where(inArray(equipmentRequests.status, ["approved", "waitlisted"]))
      .orderBy(asc(equipmentRequests.createdAt)),
  ]);

  return (
    <div className="flex max-w-5xl flex-col gap-8">
      <PageHeader
        title={t("Equipment")}
        description={t("Stock and who is using it. Request equipment from a project page.")}
      />

      {manage && (
        <Card>
          <CardHeader>
            <CardTitle>{t("Add equipment")}</CardTitle>
            <CardDescription>
              {t("Use one entry per kind of item and set the quantity, e.g. 3 NFC readers.")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EquipmentForm />
          </CardContent>
        </Card>
      )}

      {items.length === 0 && <p className="text-muted-foreground">{t("No equipment yet.")}</p>}

      <div className="grid gap-4 md:grid-cols-2">
        {items.map((item) => {
          const free = item.status === "active" ? item.quantity - item.inUse : 0;
          const using = holders.filter((h) => h.equipmentId === item.id && h.status === "approved");
          const waiting = holders.filter((h) => h.equipmentId === item.id && h.status === "waitlisted");
          return (
            <Card key={item.id}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {item.name}
                  <span className="text-sm font-normal text-muted-foreground">{item.code}</span>
                  {item.status !== "active" && (
                    <Badge variant="destructive">{t(EQUIPMENT_STATUS_LABELS[item.status])}</Badge>
                  )}
                </CardTitle>
                <CardDescription>{[item.category, item.location].filter(Boolean).join(" · ") || "—"}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="border p-2">
                    <div className="text-lg font-semibold">{item.quantity}</div>
                    <div className="text-xs text-muted-foreground">{t("Total")}</div>
                  </div>
                  <div className="border p-2">
                    <div className="text-lg font-semibold">{item.inUse}</div>
                    <div className="text-xs text-muted-foreground">{t("In use")}</div>
                  </div>
                  <div className="border p-2">
                    <div className={`text-lg font-semibold ${free <= 0 ? "text-destructive" : "text-emerald-400"}`}>
                      {Math.max(free, 0)}
                    </div>
                    <div className="text-xs text-muted-foreground">{t("Free")}</div>
                  </div>
                </div>
                {using.length > 0 && (
                  <div>
                    <span className="text-muted-foreground">{t("In use by:")} </span>
                    {using.map((h, i) => (
                      <span key={`${h.projectId}-${i}`}>
                        {i > 0 && " · "}
                        <Link href={projectHref(h.projectId, "equipment")} className="underline-offset-4 hover:underline">
                          {h.projectName}
                        </Link>{" "}
                        ({h.quantity})
                      </span>
                    ))}
                  </div>
                )}
                {waiting.length > 0 && (
                  <div className="text-destructive">
                    {t("Waiting:")} {waiting.map((h) => `${h.projectName} (${h.quantity})`).join(" · ")}
                  </div>
                )}
                {item.notes && <p className="text-muted-foreground">{item.notes}</p>}
                {manage && (
                  <EditSection label={t("Edit")}>
                    <EquipmentForm
                      initial={{
                        id: item.id,
                        code: item.code,
                        name: item.name,
                        category: item.category,
                        quantity: String(item.quantity),
                        location: item.location,
                        status: item.status,
                        notes: item.notes,
                      }}
                    />
                  </EditSection>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
