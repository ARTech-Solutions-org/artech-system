import { and, asc, desc, eq } from "drizzle-orm";
import { closeRequest } from "@/app/actions/work";
import { db } from "@/db";
import { equipment, equipmentRequests, flags, installations, projects, users } from "@/db/schema";
import { BilingualText, LinkedText } from "@/components/linked-text";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { inUseQuantity } from "@/lib/equipment";
import { REQUEST_STATUS_LABELS } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import {
  canAssign,
  canManageEquipment,
  canManageInstallation,
  canRequestEquipment,
  canWorkOnProject,
  type Viewer,
} from "@/lib/permissions";
import { flagPeople, loadFlags, visibleFlagsWhere } from "@/lib/flags";
import { FlagCard, toPeople } from "../../requests/flag-card";
import { GuideForm, NewRequestButton, RequestEquipmentForm, StatusButtons } from "../work-forms";
import { Detail, EditSection, SmallAction } from "./project-ui";

type Project = typeof projects.$inferSelect;
type Props = { me: Viewer; project: Project; isMember: boolean };
type Move = { to: string; label: string; variant?: "default" | "outline" };

/** Development status moves: developers start and submit, the Tech Head approves or sends back. */
export async function StatusActions({ me, project, isMember }: Props) {
  if (!canWorkOnProject(me, isMember)) return null;
  const { t } = await getI18n();
  const head = canAssign(me);
  const moves: Move[] = [];

  switch (project.status) {
    case "assigned":
      moves.push({ to: "in_development", label: t("Start development") });
      break;
    case "in_development":
      moves.push({ to: "internal_review", label: t("Send for internal review") });
      break;
    case "internal_review":
      if (head) {
        moves.push({ to: "ready_for_installation", label: t("Approve: ready for installation") });
        moves.push({ to: "in_development", label: t("Send back to development"), variant: "outline" });
      }
      break;
    case "ready_for_installation":
      if (head) moves.push({ to: "in_development", label: t("Send back to development"), variant: "outline" });
      break;
  }

  if (!moves.length) {
    return project.status === "internal_review" ? (
      <p className="text-sm text-muted-foreground">{t("Waiting for the Tech Head to review.")}</p>
    ) : null;
  }
  return (
    <Detail label={t("Next step")}>
      <StatusButtons projectId={project.id} moves={moves} />
    </Detail>
  );
}

/** Operations status moves: start the installation, then mark it installed. */
export async function InstallationActions({ me, project }: Omit<Props, "isMember">) {
  if (!canManageInstallation(me)) return null;
  const { t } = await getI18n();
  const moves: Move[] = [];
  if (project.status === "ready_for_installation") {
    moves.push({ to: "installing", label: t("Start installation") });
  } else if (project.status === "installing") {
    moves.push({ to: "installed", label: t("Mark installed") });
    moves.push({ to: "ready_for_installation", label: t("Pause: back to ready"), variant: "outline" });
  }
  if (!moves.length) {
    const before = ["brief_submitted", "assigned", "in_development", "internal_review"].includes(project.status);
    return before ? (
      <p className="text-sm text-muted-foreground">
        {t("You can start once the Tech Head approves the project for installation.")}
      </p>
    ) : null;
  }
  return (
    <Detail label={t("Next step")}>
      <StatusButtons projectId={project.id} moves={moves} />
    </Detail>
  );
}

export async function WorkSections({ me, project, isMember }: Props) {
  const { t, fmt, locale } = await getI18n();

  const [flagRows, people, requests, items, [guide]] = await Promise.all([
    loadFlags(and(eq(flags.projectId, project.id), visibleFlagsWhere(me))),
    flagPeople(me),
    db
      .select({
        id: equipmentRequests.id,
        quantity: equipmentRequests.quantity,
        status: equipmentRequests.status,
        neededFrom: equipmentRequests.neededFrom,
        neededUntil: equipmentRequests.neededUntil,
        notes: equipmentRequests.notes,
        requestedBy: equipmentRequests.requestedBy,
        requesterName: users.name,
        itemName: equipment.name,
        itemCode: equipment.code,
        createdAt: equipmentRequests.createdAt,
      })
      .from(equipmentRequests)
      .innerJoin(equipment, eq(equipment.id, equipmentRequests.equipmentId))
      .innerJoin(users, eq(users.id, equipmentRequests.requestedBy))
      .where(eq(equipmentRequests.projectId, project.id))
      .orderBy(desc(equipmentRequests.createdAt)),
    canRequestEquipment(me)
      ? db
          .select({
            id: equipment.id,
            name: equipment.name,
            code: equipment.code,
            status: equipment.status,
            quantity: equipment.quantity,
            inUse: inUseQuantity,
          })
          .from(equipment)
          .orderBy(asc(equipment.name))
      : Promise.resolve([]),
    db.select().from(installations).where(eq(installations.projectId, project.id)),
  ]);

  const openFlags = flagRows.filter((f) => f.status === "open");
  const closedFlags = flagRows.filter((f) => f.status !== "open");
  const canClose = (requestedBy: string) =>
    requestedBy === me.id || canAssign(me) || canManageInstallation(me) || canManageEquipment(me);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {t("Requests")}
            {openFlags.length > 0 && (
              <Badge variant="destructive">{t("{count} open", { count: openFlags.length })}</Badge>
            )}
          </CardTitle>
          <CardDescription>
            {t("Ask someone for what this project needs. Only the people involved see each request.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {flagRows.length === 0 && <p className="text-sm text-muted-foreground">{t("No requests.")}</p>}
          {openFlags.map((f) => (
            <FlagCard key={f.id} me={me} flag={f} showProject={false} />
          ))}
          {closedFlags.length > 0 && (
            <EditSection label={t("Closed ({count})", { count: closedFlags.length })}>
              <div className="flex flex-col gap-3">
                {closedFlags.map((f) => (
                  <FlagCard key={f.id} me={me} flag={f} showProject={false} />
                ))}
              </div>
            </EditSection>
          )}
          <div>
            <NewRequestButton projectId={project.id} people={toPeople(people)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("Equipment")}</CardTitle>
          <CardDescription>
            {t("Requests are approved automatically when enough units are free; otherwise they wait in line.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("No equipment requested.")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Item")}</TableHead>
                  <TableHead>{t("Qty")}</TableHead>
                  <TableHead>{t("Status")}</TableHead>
                  <TableHead>{t("Needed")}</TableHead>
                  <TableHead>{t("Requested by")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium">{r.itemName}</div>
                      <div className="text-xs text-muted-foreground">{r.itemCode}</div>
                    </TableCell>
                    <TableCell>{r.quantity}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          r.status === "approved" ? "secondary" : r.status === "waitlisted" ? "destructive" : "outline"
                        }
                      >
                        {t(REQUEST_STATUS_LABELS[r.status])}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.neededFrom || r.neededUntil ? `${fmt.date(r.neededFrom)} – ${fmt.date(r.neededUntil)}` : "—"}
                    </TableCell>
                    <TableCell>{r.requesterName}</TableCell>
                    <TableCell className="text-end">
                      <span className="inline-flex gap-1">
                        {canClose(r.requestedBy) && r.status === "approved" && (
                          <SmallAction
                            action={closeRequest}
                            fields={{ id: r.id, outcome: "returned" }}
                            label={t("Returned")}
                            variant="outline"
                          />
                        )}
                        {canClose(r.requestedBy) && (r.status === "approved" || r.status === "waitlisted") && (
                          <SmallAction
                            action={closeRequest}
                            fields={{ id: r.id, outcome: "cancelled" }}
                            label={t("Cancel")}
                          />
                        )}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {canRequestEquipment(me) && (
            <EditSection label={t("Request equipment")}>
              <RequestEquipmentForm
                projectId={project.id}
                items={items
                  .filter((i) => i.status !== "retired")
                  .map((i) => ({ id: i.id, name: i.name, code: i.code, status: i.status, free: i.quantity - i.inUse }))}
              />
            </EditSection>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("Installation guide")}</CardTitle>
          <CardDescription>
            {t("Written by the developers for Operations. Needed before the project can be approved for installation.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Detail label={t("Steps")}>
            <BilingualText
              en={guide?.steps}
              ar={guide?.stepsAr}
              locale={locale}
              empty={t("Not written yet.")}
              showOther={locale === "ar" ? t("Show in English") : t("Show in Arabic")}
            />
          </Detail>
          <Detail label={t("Demo video")}>
            <LinkedText text={guide?.demoVideoUrl} empty={t("No demo video yet.")} />
          </Detail>
          {canWorkOnProject(me, isMember) && (
            <EditSection
              label={guide?.steps || guide?.stepsAr || guide?.demoVideoUrl ? t("Edit guide") : t("Write guide")}
              open={!guide?.steps && !guide?.stepsAr && project.status === "in_development"}
            >
              <GuideForm
                projectId={project.id}
                initial={{ steps: guide?.steps, stepsAr: guide?.stepsAr, demoVideoUrl: guide?.demoVideoUrl }}
              />
            </EditSection>
          )}
        </CardContent>
      </Card>
    </>
  );
}
