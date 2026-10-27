import { asc, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import {
  deleteFinanceEntry,
  deleteMilestone,
  deleteProgressReview,
  removeMember,
  toggleMilestone,
} from "@/app/actions/projects";
import { db } from "@/db";
import {
  financeEntries,
  installations,
  milestones,
  progressReviews,
  projectFinance,
  projectMembers,
  projectSchedule,
  users,
} from "@/db/schema";
import { LinkedText } from "@/components/linked-text";
import { PageHeader } from "@/components/page-header";
import { ProjectTabs } from "@/components/project-tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/lib/auth/session";
import { outstanding, profitOf, revenueOf, totalsByCurrency } from "@/lib/finance";
import { PROJECT_STATUS_LABELS } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { defaultProjectTab, resolveProjectTab, visibleProjectTabs } from "@/lib/project-tabs";
import {
  canAssign,
  canEditBrief,
  canEditBudget,
  canEditInstallationDate,
  canManageFinance,
  canManageInstallation,
  canViewBudget,
  canViewInstallationDate,
  canWorkOnProject,
} from "@/lib/permissions";
import { getProjectAccess, listDevelopers, listTechnicians } from "@/lib/projects";
import { FeedbackSection } from "./feedback-section";
import { FilesSection } from "./files-section";
import { Detail, EditSection, SmallAction } from "./project-ui";
import { CloseProjectActions, InstallationActions, StatusActions, WorkSections } from "./work-sections";
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
import { InstallationForm } from "../work-forms";

export default async function ProjectPage({ params, searchParams }: PageProps<"/projects/[id]">) {
  const me = await requireUser();
  const { t, fmt } = await getI18n();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const access = await getProjectAccess(me, id.data);
  if (!access) notFound();
  const { project, isMember } = access;

  const showFinance = canViewBudget(me);
  const showSchedule = canViewInstallationDate(me);
  const assign = canAssign(me);
  const work = canWorkOnProject(me, isMember);
  const operate = canManageInstallation(me);
  const tabs = visibleProjectTabs({ showFinance, showSchedule });
  const tab = resolveProjectTab((await searchParams).tab, tabs, defaultProjectTab(me));

  const [
    members,
    milestoneRows,
    reviews,
    [createdBy],
    [finance],
    entries,
    [schedule],
    developers,
    [install],
    technicians,
  ] = await Promise.all([
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
    showSchedule
      ? db
          .select({
            leadTechnicianId: installations.leadTechnicianId,
            leadName: users.name,
            startedAt: installations.startedAt,
            completedAt: installations.completedAt,
            notes: installations.notes,
          })
          .from(installations)
          .leftJoin(users, eq(users.id, installations.leadTechnicianId))
          .where(eq(installations.projectId, project.id))
      : Promise.resolve([]),
    operate ? listTechnicians() : Promise.resolve([]),
  ]);

  const currency = finance?.currency ?? "EGP";
  const totals = totalsByCurrency(entries);
  const collected = revenueOf(totals[currency]);
  const profit = profitOf(totals[currency]);
  const due = outstanding(finance?.budget ?? null, currency, totals);
  const otherCurrencies = Object.keys(totals).filter((c) => c !== currency);
  const memberIds = new Set(members.map((m) => m.userId));
  const assignable = developers.filter((d) => !memberIds.has(d.id));

  return (
    <div className="flex max-w-4xl flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link href="/projects" className="text-sm text-muted-foreground hover:underline">
          {t("← Projects")}
        </Link>
        <PageHeader
          title={
            <span className="inline-flex flex-wrap items-center gap-3">
              {project.name}
              <Badge variant={project.status === "brief_submitted" ? "outline" : "secondary"}>
                {t(PROJECT_STATUS_LABELS[project.status])}
              </Badge>
            </span>
          }
          description={
            <>
              {project.clientName ? `${project.clientName} · ` : ""}
              {t("Brief by {name} on {date}", { name: createdBy?.name ?? "—", date: fmt.dateTime(project.createdAt) })}
            </>
          }
        />
      </div>

      <ProjectTabs projectId={project.id} tabs={tabs} active={tab} t={t} />

      {tab === "brief" && (
      <Card>
        <CardHeader>
          <CardTitle>{t("Brief")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Detail label={t("Description")}>
            <LinkedText text={project.description} />
          </Detail>
          <Detail label={t("References")}>
            <LinkedText text={project.refs} />
          </Detail>
          <div className="grid gap-5 sm:grid-cols-2">
            <Detail label={t("Design")}>
              <LinkedText text={project.design} />
            </Detail>
            <Detail label={t("Content")}>
              <LinkedText text={project.content} />
            </Detail>
          </div>
          <Detail label={t("Other data")}>
            <LinkedText text={project.otherData} />
          </Detail>
          {canEditBrief(me) && (
            <EditSection label={t("Edit brief")}>
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
      )}

      {tab === "feedback" && <FeedbackSection me={me} project={project} isMember={isMember} />}

      {tab === "files" && <FilesSection me={me} project={project} isMember={isMember} />}

      {tab === "development" && (
      <Card>
        <CardHeader>
          <CardTitle>{t("Development")}</CardTitle>
          <CardDescription>
            {project.assignedAt
              ? t("Assigned on {date}", { date: fmt.dateTime(project.assignedAt) })
              : t("Waiting for the Tech Head to assign.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {assign ? (
            <DeadlineForm projectId={project.id} devDeadline={project.devDeadline} />
          ) : (
            <Detail label={t("Development deadline")}>
              <p className="text-sm">{fmt.date(project.devDeadline)}</p>
            </Detail>
          )}

          <Detail label={t("Team")}>
            {members.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("Nobody assigned yet.")}</p>
            ) : (
              <ul className="divide-y border">
                {members.map((m) => (
                  <li key={m.userId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span>{m.name}</span>
                    {assign && (
                      <span className="flex gap-1">
                        <SmallAction
                          action={removeMember}
                          fields={{ projectId: project.id, userId: m.userId }}
                          label={t("Remove")}
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
            <EditSection label={members.length ? t("Add developers") : t("Assign developers")} open={!members.length}>
              <AddMembersForm projectId={project.id} developers={assignable} firstAssignment={!members.length} />
            </EditSection>
          )}

          <Detail label={t("Milestones")}>
            {milestoneRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("No milestones.")}</p>
            ) : (
              <ul className="divide-y border">
                {milestoneRows.map((ms) => (
                  <li key={ms.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className={ms.status === "done" ? "text-muted-foreground line-through" : ""}>
                      {ms.title}
                      <span className="ms-2 text-muted-foreground">{ms.dueDate ? fmt.date(ms.dueDate) : ""}</span>
                    </span>
                    {work ? (
                      <span className="flex gap-1">
                        <SmallAction
                          action={toggleMilestone}
                          fields={{ id: ms.id, done: String(ms.status !== "done") }}
                          label={ms.status === "done" ? t("Reopen") : t("Mark done")}
                          variant="outline"
                        />
                        {assign && (
                          <SmallAction
                            action={deleteMilestone}
                            fields={{ id: ms.id }}
                            label={t("Delete")}
                            variant="destructive"
                          />
                        )}
                      </span>
                    ) : (
                      ms.status === "done" && <Badge variant="secondary">{t("Done")}</Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Detail>
          {assign && <MilestoneForm projectId={project.id} />}
          <StatusActions me={me} project={project} isMember={isMember} />
        </CardContent>
      </Card>
      )}

      {tab === "development" && <WorkSections me={me} project={project} isMember={isMember} parts={["guide"]} />}
      {tab === "requests" && <WorkSections me={me} project={project} isMember={isMember} parts={["requests"]} />}
      {tab === "equipment" && <WorkSections me={me} project={project} isMember={isMember} parts={["equipment"]} />}

      {tab === "brief" && (
      <Card>
        <CardHeader>
          <CardTitle>{t("Progress dates")}</CardTitle>
          <CardDescription>{t("When work in progress is shown to the client or management.")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {reviews.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("No progress dates.")}</p>
          ) : (
            <ul className="divide-y border">
              {reviews.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span>
                    <span className="font-medium">{fmt.date(r.reviewDate)}</span> — {r.title}
                    {r.notes && <span className="text-muted-foreground"> · {r.notes}</span>}
                  </span>
                  {canEditInstallationDate(me) && (
                    <SmallAction
                      action={deleteProgressReview}
                      fields={{ id: r.id }}
                      label={t("Delete")}
                      variant="destructive"
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
          {canEditInstallationDate(me) && <ProgressReviewForm projectId={project.id} />}
        </CardContent>
      </Card>
      )}

      {tab === "installation" && showSchedule && (
        <Card>
          <CardHeader>
            <CardTitle>{t("Installation")}</CardTitle>
            <CardDescription>{t("The real installation date. Hidden from developers.")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <Detail label={t("Installation date")}>
                <p className="text-sm">{fmt.date(schedule?.installationDate, { weekday: "long" })}</p>
              </Detail>
              <Detail label={t("Location")}>
                <LinkedText text={schedule?.locationLink} />
              </Detail>
            </div>
            <Detail label={t("Notes")}>
              <LinkedText text={schedule?.notes} />
            </Detail>
            {canEditInstallationDate(me) && (
              <EditSection label={t("Edit installation details")}>
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

            <div className="grid gap-5 border-t pt-5 sm:grid-cols-3">
              <Detail label={t("Lead technician")}>
                <p className="text-sm">{install?.leadName ?? "—"}</p>
              </Detail>
              <Detail label={t("Started")}>
                <p className="text-sm">{fmt.dateTime(install?.startedAt)}</p>
              </Detail>
              <Detail label={t("Installed")}>
                <p className="text-sm">{fmt.dateTime(install?.completedAt)}</p>
              </Detail>
            </div>
            <Detail label={t("Installation report")}>
              <LinkedText text={install?.notes} />
            </Detail>
            <InstallationActions me={me} project={project} />
            <CloseProjectActions me={me} project={project} />
            {operate && (
              <EditSection label={t("Edit lead technician and report")}>
                <InstallationForm
                  projectId={project.id}
                  technicians={technicians}
                  initial={{ leadTechnicianId: install?.leadTechnicianId ?? "", installNotes: install?.notes }}
                />
              </EditSection>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "finance" && showFinance && (
        <Card>
          <CardHeader>
            <CardTitle>{t("Finance")}</CardTitle>
            <CardDescription>
              {t("Revenue is collections only. It stays at zero until a payment is recorded. Profit is revenue minus expenses.")}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
              <Detail label={t("Budget")}>
                <p className="text-lg font-semibold tabular-nums">{fmt.money(finance?.budget, currency)}</p>
              </Detail>
              <Detail label={t("Revenue")}>
                <p className="text-lg font-semibold tabular-nums">{fmt.money(collected, currency)}</p>
              </Detail>
              <Detail label={t("Outstanding")}>
                <p
                  className={`text-lg font-semibold tabular-nums ${due !== null && due < 0 ? "text-destructive" : ""}`}
                >
                  {due === null ? "—" : fmt.money(due, currency)}
                </p>
              </Detail>
              <Detail label={t("Expenses")}>
                <p className="text-lg font-semibold tabular-nums">
                  {fmt.money(totals[currency]?.expenses ?? 0, currency)}
                </p>
              </Detail>
              <Detail label={t("Profit")}>
                <p className={`text-lg font-semibold tabular-nums ${profit < 0 ? "text-destructive" : ""}`}>
                  {fmt.money(profit, currency)}
                </p>
              </Detail>
            </div>
            {otherCurrencies.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {t("Also recorded in other currencies (not included above):")}{" "}
                {otherCurrencies
                  .map((c) =>
                    t("{revenue} revenue, {expenses} expenses, {profit} profit", {
                      revenue: fmt.money(revenueOf(totals[c]), c),
                      expenses: fmt.money(totals[c].expenses, c),
                      profit: fmt.money(profitOf(totals[c]), c),
                    }),
                  )
                  .join("; ")}
              </p>
            )}
            {finance?.notes && (
              <Detail label={t("Budget notes")}>
                <LinkedText text={finance.notes} />
              </Detail>
            )}
            {canEditBudget(me) && (
              <EditSection label={finance ? t("Edit budget") : t("Set budget")} open={!finance}>
                <FinanceForm
                  projectId={project.id}
                  initial={{ budget: finance?.budget, currency, financeNotes: finance?.notes }}
                />
              </EditSection>
            )}

            <Detail label={t("Payments and expenses")}>
              {entries.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("Nothing recorded yet.")}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("Date")}</TableHead>
                      <TableHead>{t("Type")}</TableHead>
                      <TableHead>{t("Description")}</TableHead>
                      <TableHead>{t("Reference")}</TableHead>
                      <TableHead className="text-end">{t("Amount")}</TableHead>
                      {canManageFinance(me) && <TableHead />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell>{fmt.date(e.entryDate)}</TableCell>
                        <TableCell>
                          <Badge variant={e.kind === "payment" ? "secondary" : "outline"}>
                            {e.kind === "payment" ? t("Payment") : t("Expense")}
                          </Badge>
                        </TableCell>
                        <TableCell>{e.description}</TableCell>
                        <TableCell className="text-muted-foreground">{e.reference ?? "—"}</TableCell>
                        <TableCell className="text-end tabular-nums">
                          {e.kind === "expense" ? "−" : ""}
                          {fmt.money(e.amount, e.currency)}
                        </TableCell>
                        {canManageFinance(me) && (
                          <TableCell className="text-end">
                            <SmallAction
                              action={deleteFinanceEntry}
                              fields={{ id: e.id }}
                              label={t("Delete")}
                              variant="destructive"
                            />
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Detail>
            {canManageFinance(me) && (
              <EditSection label={t("Record payment or expense")}>
                <FinanceEntryForm projectId={project.id} defaultCurrency={currency} />
              </EditSection>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
