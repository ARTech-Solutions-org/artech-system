import { alias } from "drizzle-orm/pg-core";
import { asc, desc, eq } from "drizzle-orm";
import { closeRequest } from "@/app/actions/work";
import { db } from "@/db";
import { equipment, equipmentRequests, flags, installations, projects, users } from "@/db/schema";
import { LinkedText } from "@/components/linked-text";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { inUseQuantity } from "@/lib/equipment";
import { FLAG_TYPE_LABELS as FLAG_LABELS, formatDate, formatDateTime } from "@/lib/format";
import {
  canAssign,
  canManageEquipment,
  canManageInstallation,
  canRaiseFlag,
  canRequestEquipment,
  canResolveFlag,
  canWorkOnProject,
  DEPARTMENT_LABELS,
  type Viewer,
} from "@/lib/permissions";
import { GuideForm, RaiseFlagForm, RequestEquipmentForm, ResolveFlagForm, StatusButtons } from "../work-forms";
import { Detail, EditSection, SmallAction } from "./project-ui";

type Project = typeof projects.$inferSelect;
type Props = { me: Viewer; project: Project; isMember: boolean };
export function StatusActions({ me, project, isMember }: Props) {
  if (!canWorkOnProject(me, isMember)) return null;
  const head = canAssign(me);
  const moves: { to: string; label: string; variant?: "default" | "outline" }[] = [];

  switch (project.status) {
    case "assigned":
      moves.push({ to: "in_development", label: "Start development" });
      break;
    case "in_development":
      moves.push({ to: "internal_review", label: "Send for internal review" });
      break;
    case "internal_review":
      if (head) {
        moves.push({ to: "ready_for_installation", label: "Approve: ready for installation" });
        moves.push({ to: "in_development", label: "Send back to development", variant: "outline" });
      }
      break;
    case "ready_for_installation":
      if (head) moves.push({ to: "in_development", label: "Send back to development", variant: "outline" });
      break;
  }

  if (!moves.length) {
    return project.status === "internal_review" ? (
      <p className="text-sm text-muted-foreground">Waiting for the Tech Head to review.</p>
    ) : null;
  }
  return (
    <Detail label="Next step">
      <StatusButtons projectId={project.id} moves={moves} />
    </Detail>
  );
}

export async function WorkSections({ me, project, isMember }: Props) {
  const raiser = alias(users, "raiser");
  const resolver = alias(users, "resolver");

  const [flagRows, requests, items, [guide]] = await Promise.all([
    db
      .select({
        id: flags.id,
        type: flags.type,
        details: flags.details,
        ownerDepartment: flags.ownerDepartment,
        status: flags.status,
        raisedBy: flags.raisedBy,
        raisedByName: raiser.name,
        createdAt: flags.createdAt,
        resolution: flags.resolution,
        resolvedByName: resolver.name,
        resolvedAt: flags.resolvedAt,
      })
      .from(flags)
      .innerJoin(raiser, eq(raiser.id, flags.raisedBy))
      .leftJoin(resolver, eq(resolver.id, flags.resolvedBy))
      .where(eq(flags.projectId, project.id))
      .orderBy(desc(flags.status), desc(flags.createdAt)),
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
  const closedFlags = flagRows.filter((f) => f.status === "resolved");
  const canClose = (requestedBy: string) =>
    requestedBy === me.id || canAssign(me) || canManageInstallation(me) || canManageEquipment(me);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Flags
            {openFlags.length > 0 && <Badge variant="destructive">{openFlags.length} open</Badge>}
          </CardTitle>
          <CardDescription>Blockers and missing data. The department that needs to act sees them on its Flags page.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {flagRows.length === 0 && <p className="text-sm text-muted-foreground">No flags.</p>}
          {openFlags.map((f) => (
            <div key={f.id} className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="destructive">{FLAG_LABELS[f.type]}</Badge>
                <span>
                  For <span className="font-medium">{DEPARTMENT_LABELS[f.ownerDepartment]}</span> · raised by{" "}
                  {f.raisedByName} on {formatDateTime(f.createdAt)}
                </span>
              </div>
              <LinkedText text={f.details} />
              {canResolveFlag(me, f) && <ResolveFlagForm flagId={f.id} />}
            </div>
          ))}
          {closedFlags.length > 0 && (
            <EditSection label={`Resolved (${closedFlags.length})`}>
              <ul className="flex flex-col gap-3">
                {closedFlags.map((f) => (
                  <li key={f.id} className="text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{FLAG_LABELS[f.type]}</Badge>
                      <span className="text-muted-foreground">
                        {f.raisedByName}, {formatDateTime(f.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1">{f.details}</p>
                    <p className="text-muted-foreground">
                      Resolved by {f.resolvedByName} on {formatDateTime(f.resolvedAt)}: {f.resolution}
                    </p>
                  </li>
                ))}
              </ul>
            </EditSection>
          )}
          {canRaiseFlag(me) && (
            <EditSection label="Raise a flag">
              <RaiseFlagForm projectId={project.id} />
            </EditSection>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Equipment</CardTitle>
          <CardDescription>Requests are approved automatically when enough units are free; otherwise they wait in line.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No equipment requested.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Needed</TableHead>
                  <TableHead>Requested by</TableHead>
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
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.neededFrom || r.neededUntil ? `${formatDate(r.neededFrom)} → ${formatDate(r.neededUntil)}` : "—"}
                    </TableCell>
                    <TableCell>{r.requesterName}</TableCell>
                    <TableCell className="text-right">
                      {canClose(r.requestedBy) && r.status === "approved" && (
                        <SmallAction action={closeRequest} fields={{ id: r.id, outcome: "returned" }} label="Returned" variant="outline" />
                      )}
                      {canClose(r.requestedBy) && (r.status === "approved" || r.status === "waitlisted") && (
                        <SmallAction action={closeRequest} fields={{ id: r.id, outcome: "cancelled" }} label="Cancel" />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {canRequestEquipment(me) && (
            <EditSection label="Request equipment">
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
          <CardTitle>Installation guide</CardTitle>
          <CardDescription>Written by the developers for Operations. Needed before the project can be approved for installation.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Detail label="Steps">
            <LinkedText text={guide?.steps} empty="Not written yet." />
          </Detail>
          <Detail label="Demo video">
            <LinkedText text={guide?.demoVideoUrl} empty="No demo video yet." />
          </Detail>
          {canWorkOnProject(me, isMember) && (
            <EditSection label={guide ? "Edit guide" : "Write guide"} open={!guide && project.status === "in_development"}>
              <GuideForm projectId={project.id} initial={{ steps: guide?.steps, demoVideoUrl: guide?.demoVideoUrl }} />
            </EditSection>
          )}
        </CardContent>
      </Card>
    </>
  );
}
