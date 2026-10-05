import { asc, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import {
  deleteFinanceEntry,
  deleteMilestone,
  deleteProgressReview,
  removeMember,
  setLead,
  toggleMilestone,
} from "@/app/actions/projects";
import { db } from "@/db";
import {
  financeEntries,
  milestones,
  progressReviews,
  projectFinance,
  projectMembers,
  projectSchedule,
  users,
} from "@/db/schema";
import { LinkedText } from "@/components/linked-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/lib/auth/session";
import { outstanding, totalsByCurrency } from "@/lib/finance";
import { formatDate, formatDateTime, formatMoney, PROJECT_STATUS_LABELS } from "@/lib/format";
import {
  canAssign,
  canEditBrief,
  canEditBudget,
  canEditInstallationDate,
  canManageFinance,
  canViewBudget,
  canViewInstallationDate,
} from "@/lib/permissions";
import { getVisibleProject, listDevelopers } from "@/lib/projects";
import {
  AddMembersForm,
  DeadlineForm,
  EditBriefForm,
  FinanceEntryForm,
  FinanceForm,
  MilestoneForm,
  ProgressReviewForm,
  ScheduleForm,
} from "../project-forms";

function EditSection({ label, open, children }: { label: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details open={open} className="group rounded-lg border p-4">
      <summary className="cursor-pointer text-sm font-medium select-none">{label}</summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</div>
      {children}
    </div>
  );
}

function SmallAction({
  action,
  fields,
  label,
  variant = "ghost",
}: {
  action: (formData: FormData) => Promise<void>;
  fields: Record<string, string>;
  label: string;
  variant?: "ghost" | "destructive" | "outline";
}) {
  return (
    <form action={action}>
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Button type="submit" size="xs" variant={variant}>
        {label}
      </Button>
    </form>
  );
}

export default async function ProjectPage({ params }: PageProps<"/projects/[id]">) {
  const me = await requireUser();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const project = await getVisibleProject(me, id.data);
  if (!project) notFound();

  const showFinance = canViewBudget(me);
  const showSchedule = canViewInstallationDate(me);
  const assign = canAssign(me);

  const [members, milestoneRows, reviews, [createdBy], [finance], entries, [schedule], developers] =
    await Promise.all([
      db
        .select({ userId: projectMembers.userId, name: users.name, role: projectMembers.role })
        .from(projectMembers)
        .innerJoin(users, eq(users.id, projectMembers.userId))
        .where(eq(projectMembers.projectId, project.id))
        .orderBy(asc(projectMembers.role), asc(users.name)),
      db
        .select()
        .from(milestones)
        .where(eq(milestones.projectId, project.id))
        .orderBy(asc(milestones.dueDate), asc(milestones.createdAt)),
      db
        .select()
        .from(progressReviews)
        .where(eq(progressReviews.projectId, project.id))
        .orderBy(asc(progressReviews.reviewDate)),
      project.createdBy
        ? db.select({ name: users.name }).from(users).where(eq(users.id, project.createdBy))
        : Promise.resolve([]),
      // Restricted data is only queried for roles allowed to see it.
      showFinance
        ? db.select().from(projectFinance).where(eq(projectFinance.projectId, project.id))
        : Promise.resolve([]),
      showFinance
        ? db
            .select()
            .from(financeEntries)
            .where(eq(financeEntries.projectId, project.id))
            .orderBy(desc(financeEntries.entryDate), desc(financeEntries.createdAt))
        : Promise.resolve([]),
      showSchedule
        ? db.select().from(projectSchedule).where(eq(projectSchedule.projectId, project.id))
        : Promise.resolve([]),
      assign ? listDevelopers() : Promise.resolve([]),
    ]);

  const currency = finance?.currency ?? "EGP";
  const totals = totalsByCurrency(entries);
  const due = outstanding(finance?.budget ?? null, currency, totals);
  const otherCurrencies = Object.keys(totals).filter((c) => c !== currency);
  const memberIds = new Set(members.map((m) => m.userId));
  const assignable = developers.filter((d) => !memberIds.has(d.id));

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div>
        <Link href="/projects" className="text-sm text-muted-foreground hover:underline">
          ← Projects
        </Link>
        <h1 className="mt-1 flex flex-wrap items-center gap-3 text-2xl font-semibold">
          {project.name}
          <Badge variant={project.status === "brief_submitted" ? "outline" : "secondary"}>
            {PROJECT_STATUS_LABELS[project.status]}
          </Badge>
        </h1>
        <p className="text-muted-foreground">
          {project.clientName ? `${project.clientName} · ` : ""}
          Brief by {createdBy?.name ?? "—"} on {formatDateTime(project.createdAt)}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Brief</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Detail label="Description">
            <LinkedText text={project.description} />
          </Detail>
          <Detail label="References">
            <LinkedText text={project.refs} />
          </Detail>
          <div className="grid gap-5 sm:grid-cols-2">
            <Detail label="Design">
              <LinkedText text={project.design} />
            </Detail>
            <Detail label="Content">
              <LinkedText text={project.content} />
            </Detail>
          </div>
          <Detail label="Other data">
            <LinkedText text={project.otherData} />
          </Detail>
          {canEditBrief(me) && (
            <EditSection label="Edit brief">
              <EditBriefForm
                projectId={project.id}
                initial={{
                  name: project.name,
                  clientName: project.clientName,
                  description: project.description,
                  refs: project.refs,
                  design: project.design,
                  content: project.content,
                  otherData: project.otherData,
                }}
              />
            </EditSection>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Development</CardTitle>
          <CardDescription>
            {project.assignedAt ? `Assigned on ${formatDateTime(project.assignedAt)}` : "Waiting for the Tech Head to assign."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {assign ? (
            <DeadlineForm projectId={project.id} devDeadline={project.devDeadline} />
          ) : (
            <Detail label="Development deadline">
              <p className="text-sm">{formatDate(project.devDeadline)}</p>
            </Detail>
          )}

          <Detail label="Team">
            {members.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nobody assigned yet.</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {members.map((m) => (
                  <li key={m.userId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="flex items-center gap-2">
                      {m.name}
                      {m.role === "lead" && <Badge variant="secondary">Lead</Badge>}
                    </span>
                    {assign && (
                      <span className="flex gap-1">
                        {m.role !== "lead" && (
                          <SmallAction
                            action={setLead}
                            fields={{ projectId: project.id, userId: m.userId }}
                            label="Make lead"
                          />
                        )}
                        <SmallAction
                          action={removeMember}
                          fields={{ projectId: project.id, userId: m.userId }}
                          label="Remove"
                          variant="destructive"
                        />
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Detail>

          {assign && (
            <EditSection label={members.length ? "Add developers" : "Assign developers"} open={!members.length}>
              <AddMembersForm projectId={project.id} developers={assignable} firstAssignment={!members.length} />
            </EditSection>
          )}

          <Detail label="Milestones">
            {milestoneRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No milestones.</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {milestoneRows.map((ms) => (
                  <li key={ms.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className={ms.status === "done" ? "text-muted-foreground line-through" : ""}>
                      {ms.title}
                      <span className="ml-2 text-muted-foreground">{ms.dueDate ? formatDate(ms.dueDate) : ""}</span>
                    </span>
                    {assign ? (
                      <span className="flex gap-1">
                        <SmallAction
                          action={toggleMilestone}
                          fields={{ id: ms.id, done: String(ms.status !== "done") }}
                          label={ms.status === "done" ? "Reopen" : "Mark done"}
                          variant="outline"
                        />
                        <SmallAction action={deleteMilestone} fields={{ id: ms.id }} label="Delete" variant="destructive" />
                      </span>
                    ) : (
                      ms.status === "done" && <Badge variant="secondary">Done</Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Detail>
          {assign && <MilestoneForm projectId={project.id} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Progress dates</CardTitle>
          <CardDescription>When work in progress is shown to the client or management.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {reviews.length === 0 ? (
            <p className="text-sm text-muted-foreground">No progress dates.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {reviews.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span>
                    <span className="font-medium">{formatDate(r.reviewDate)}</span> — {r.title}
                    {r.notes && <span className="text-muted-foreground"> · {r.notes}</span>}
                  </span>
                  {canEditInstallationDate(me) && (
                    <SmallAction action={deleteProgressReview} fields={{ id: r.id }} label="Delete" variant="destructive" />
                  )}
                </li>
              ))}
            </ul>
          )}
          {canEditInstallationDate(me) && <ProgressReviewForm projectId={project.id} />}
        </CardContent>
      </Card>

      {showSchedule && (
        <Card>
          <CardHeader>
            <CardTitle>Installation</CardTitle>
            <CardDescription>The real installation date. Hidden from developers.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <Detail label="Installation date">
                <p className="text-sm">{formatDate(schedule?.installationDate)}</p>
              </Detail>
              <Detail label="Location">
                <LinkedText text={schedule?.locationLink} />
              </Detail>
            </div>
            <Detail label="Notes">
              <LinkedText text={schedule?.notes} />
            </Detail>
            {canEditInstallationDate(me) && (
              <EditSection label="Edit installation details">
                <ScheduleForm
                  projectId={project.id}
                  initial={{
                    installationDate: schedule?.installationDate,
                    locationLink: schedule?.locationLink,
                    scheduleNotes: schedule?.notes,
                  }}
                />
              </EditSection>
            )}
          </CardContent>
        </Card>
      )}

      {showFinance && (
        <Card>
          <CardHeader>
            <CardTitle>Finance</CardTitle>
            <CardDescription>Hidden from developers and Operations.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="grid gap-5 sm:grid-cols-4">
              <Detail label="Budget">
                <p className="text-lg font-semibold tabular-nums">{formatMoney(finance?.budget, currency)}</p>
              </Detail>
              <Detail label="Received">
                <p className="text-lg font-semibold tabular-nums">
                  {formatMoney(totals[currency]?.received ?? 0, currency)}
                </p>
              </Detail>
              <Detail label="Outstanding">
                <p className={`text-lg font-semibold tabular-nums ${due !== null && due < 0 ? "text-destructive" : ""}`}>
                  {due === null ? "—" : formatMoney(due, currency)}
                </p>
              </Detail>
              <Detail label="Expenses">
                <p className="text-lg font-semibold tabular-nums">
                  {formatMoney(totals[currency]?.expenses ?? 0, currency)}
                </p>
              </Detail>
            </div>
            {otherCurrencies.length > 0 && (
              <p className="text-sm text-muted-foreground">
                Also recorded in other currencies (not included above):{" "}
                {otherCurrencies
                  .map(
                    (c) =>
                      `${formatMoney(totals[c].received, c)} received, ${formatMoney(totals[c].expenses, c)} expenses`,
                  )
                  .join("; ")}
              </p>
            )}
            {finance?.notes && (
              <Detail label="Budget notes">
                <LinkedText text={finance.notes} />
              </Detail>
            )}
            {canEditBudget(me) && (
              <EditSection label={finance ? "Edit budget" : "Set budget"} open={!finance}>
                <FinanceForm
                  projectId={project.id}
                  initial={{ budget: finance?.budget, currency, financeNotes: finance?.notes }}
                />
              </EditSection>
            )}

            <Detail label="Payments and expenses">
              {entries.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      {canManageFinance(me) && <TableHead />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell>{formatDate(e.entryDate)}</TableCell>
                        <TableCell>
                          <Badge variant={e.kind === "payment" ? "secondary" : "outline"}>
                            {e.kind === "payment" ? "Payment" : "Expense"}
                          </Badge>
                        </TableCell>
                        <TableCell>{e.description}</TableCell>
                        <TableCell className="text-muted-foreground">{e.reference ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {e.kind === "expense" ? "−" : ""}
                          {formatMoney(e.amount, e.currency)}
                        </TableCell>
                        {canManageFinance(me) && (
                          <TableCell className="text-right">
                            <SmallAction action={deleteFinanceEntry} fields={{ id: e.id }} label="Delete" variant="destructive" />
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Detail>
            {canManageFinance(me) && (
              <EditSection label="Record payment or expense">
                <FinanceEntryForm projectId={project.id} defaultCurrency={currency} />
              </EditSection>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
