import { LinkedText } from "@/components/linked-text";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { projects } from "@/db/schema";
import { aiEnabled, feedbackAssignees, isOpenFeedback, type LoadedFeedback, loadProjectFeedback } from "@/lib/feedback";
import {
  FEEDBACK_SOURCE_LABELS,
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_TYPE_LABELS,
  type FeedbackStatus,
  SCOPE_DECISION_LABELS,
} from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { todayInCairo } from "@/lib/installations";
import {
  canAssign,
  canAssignFeedback,
  canDecideFeedback,
  canLogFeedback,
  canRequestDeadlineChange,
  canWorkOnFeedback,
  canWorkOnProject,
  type Viewer,
} from "@/lib/permissions";
import {
  ClientLinkControls,
  FeedbackCommentForm,
  FeedbackItemActions,
  type ItemPermissions,
  LogFeedbackForm,
} from "./feedback-forms";
import { EditSection } from "./project-ui";

const STATUS_STYLE: Record<FeedbackStatus, string> = {
  awaiting_scope: "border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  new: "border-foreground/20",
  in_progress: "border-blue-500/40 bg-blue-500/10 text-blue-800 dark:text-blue-300",
  done: "border-violet-500/40 bg-violet-500/10 text-violet-800 dark:text-violet-300",
  client_approved: "border-green-600/40 bg-green-600/10 text-green-800 dark:text-green-300",
  rejected: "border-foreground/10 text-muted-foreground",
};

const ORDER: Record<FeedbackStatus, number> = {
  awaiting_scope: 0,
  new: 1,
  in_progress: 2,
  done: 3,
  client_approved: 4,
  rejected: 5,
};

export async function FeedbackSection({
  me,
  project,
  isMember,
}: {
  me: Viewer;
  project: typeof projects.$inferSelect;
  isMember: boolean;
}) {
  const { t, fmt } = await getI18n();
  const log = canLogFeedback(me);
  const decide = canDecideFeedback(me);
  const assignAny = canAssignFeedback(me);
  const [{ rounds, items }, people] = await Promise.all([
    loadProjectFeedback(project.id),
    log || assignAny ? feedbackAssignees() : Promise.resolve([]),
  ]);
  const assignees = people.map((p) => ({ id: p.id, name: p.name }));

  const open = items.filter((i) => isOpenFeedback(i.item.status));
  const waiting = items.filter((i) => i.item.status === "done").length;
  const needsScope = items.filter((i) => i.item.status === "awaiting_scope").length;
  const extraCost = items.filter((i) => i.item.scopeDecision === "extra_cost").length;
  const deadlineAsks = items.filter(
    (i) => i.item.extraDays && !i.item.deadlineDecision && isOpenFeedback(i.item.status),
  );

  const permissions = (i: LoadedFeedback["item"]): ItemPermissions => {
    const work = canWorkOnFeedback(me, isMember, i);
    const isOpen = isOpenFeedback(i.status);
    return {
      start: work && i.status === "new",
      done: work && (i.status === "new" || i.status === "in_progress"),
      reopen: (work || decide) && (i.status === "done" || i.status === "client_approved"),
      approve: decide && i.status === "done",
      reject: decide && isOpen && i.status !== "awaiting_scope",
      scope: decide && i.status === "awaiting_scope",
      requestDeadline: canRequestDeadlineChange(me, isMember) && isOpen && (!i.extraDays || !!i.deadlineDecision),
      decideDeadline: canAssign(me) && !!i.extraDays && !i.deadlineDecision,
      assign: assignAny && isOpen,
      selfAssign: !assignAny && canWorkOnProject(me, isMember) && isOpen && i.status !== "awaiting_scope",
    };
  };

  const chips = [
    { label: t("Open"), value: open.length, alert: false },
    { label: t("Waiting for client"), value: waiting, alert: false },
    { label: t("Scope decision needed"), value: needsScope, alert: needsScope > 0 },
    { label: t("Extra cost items"), value: extraCost, alert: false },
    { label: t("Revision rounds"), value: rounds.length, alert: false },
  ];

  return (
    <Card id="feedback" className="scroll-mt-20">
      <CardHeader>
        <CardTitle>{t("Client feedback")}</CardTitle>
        <CardDescription>
          {t("Every comment and edit the client asks for, round by round, until the client approves it.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {chips.map((c) => (
            <div
              key={c.label}
              className={`rounded-lg border px-3 py-2 ${c.alert ? "border-amber-500/50 bg-amber-500/10" : ""}`}
            >
              <div className="text-xl font-semibold tabular-nums">{c.value}</div>
              <div className="text-xs text-muted-foreground">{c.label}</div>
            </div>
          ))}
        </div>

        {deadlineAsks.length > 0 && canAssign(me) && (
          <p className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm">
            {t("{count} item(s) ask for more time on the dev deadline. Decide below.", { count: deadlineAsks.length })}
          </p>
        )}

        {log && (
          <EditSection label={t("Log client feedback")} open={items.length === 0}>
            <LogFeedbackForm
              projectId={project.id}
              assignees={assignees}
              ai={aiEnabled()}
              today={todayInCairo()}
              hasRounds={rounds.length > 0}
            />
          </EditSection>
        )}

        {decide && (
          <EditSection label={project.clientToken ? t("Client link (on)") : t("Client link")}>
            <ClientLinkControls projectId={project.id} token={project.clientToken} />
          </EditSection>
        )}

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("No client feedback yet.")}</p>
        ) : (
          rounds.map((round) => {
            const inRound = items
              .filter((i) => i.item.roundId === round.id)
              .sort((a, b) => ORDER[a.item.status] - ORDER[b.item.status]);
            const active = inRound.filter((i) => isOpenFeedback(i.item.status));
            const closed = inRound.filter((i) => !isOpenFeedback(i.item.status));
            if (!inRound.length) return null;
            return (
              <section key={round.id} className="flex flex-col gap-3">
                <h3 className="flex flex-wrap items-baseline gap-2 border-b pb-1 text-sm font-semibold">
                  {t("Round {n}", { n: round.number })}
                  <span className="font-normal text-muted-foreground">
                    {t("started {date} · {open} open · {closed} closed", {
                      date: fmt.dateTime(round.createdAt),
                      open: active.length,
                      closed: closed.length,
                    })}
                  </span>
                </h3>
                {active.map((i) => (
                  <ItemCard key={i.item.id} entry={i} can={permissions(i.item)} assignees={assignees} meId={me.id} />
                ))}
                {closed.length > 0 && (
                  <details className="flex flex-col gap-3" open={active.length === 0 && round === rounds[0]}>
                    <summary className="cursor-pointer text-sm text-muted-foreground">
                      {t("{count} closed item(s)", { count: closed.length })}
                    </summary>
                    <div className="mt-3 flex flex-col gap-3">
                      {closed.map((i) => (
                        <ItemCard
                          key={i.item.id}
                          entry={i}
                          can={permissions(i.item)}
                          assignees={assignees}
                          meId={me.id}
                        />
                      ))}
                    </div>
                  </details>
                )}
              </section>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

async function ItemCard({
  entry,
  can,
  assignees,
  meId,
}: {
  entry: LoadedFeedback;
  can: ItemPermissions;
  assignees: { id: string; name: string }[];
  meId: string;
}) {
  const { t, fmt } = await getI18n();
  const { item: i, comments } = entry;
  const urgent = i.priority === "urgent" && isOpenFeedback(i.status);
  const hasActions = Object.values(can).some(Boolean);

  return (
    <div
      id={`feedback-${i.id}`}
      className={`flex flex-col gap-3 rounded-lg border p-3 ${urgent ? "border-destructive/40" : ""} ${
        i.status === "rejected" ? "opacity-70" : ""
      }`}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[i.status]}`}>
          {t(FEEDBACK_STATUS_LABELS[i.status])}
        </span>
        <Badge variant="outline">{t(FEEDBACK_TYPE_LABELS[i.type])}</Badge>
        {urgent && <Badge variant="destructive">{t("Urgent")}</Badge>}
        {i.scopeDecision === "extra_cost" && <Badge variant="secondary">{t("Extra cost")}</Badge>}
        <span className="text-muted-foreground">
          {i.clientName
            ? t("{name} via the client link, {date}", { name: i.clientName, date: fmt.date(i.receivedOn) })
            : t("{source}, {date} · logged by {name}", {
                source: t(FEEDBACK_SOURCE_LABELS[i.source]),
                date: fmt.date(i.receivedOn),
                name: entry.createdByName ?? "—",
              })}
        </span>
      </div>

      <LinkedText text={i.body} />

      <div className="flex flex-col gap-1 text-sm text-muted-foreground">
        {entry.assigneeName && <span>{t("Assigned to {name}", { name: entry.assigneeName })}</span>}
        {i.scopeDecision && (
          <span>
            {t("Scope: {decision} ({name})", {
              decision: t(SCOPE_DECISION_LABELS[i.scopeDecision]),
              name: entry.scopeDecidedByName ?? "—",
            })}
            {i.scopeNote && ` — ${i.scopeNote}`}
          </span>
        )}
        {i.extraDays && (
          <span>
            {i.deadlineDecision === "applied"
              ? t("{days} extra day(s) added to the dev deadline.", { days: i.extraDays })
              : i.deadlineDecision === "declined"
                ? t("Request for {days} extra day(s) was declined.", { days: i.extraDays })
                : t("Asked for {days} extra day(s), waiting for the Tech Head.", { days: i.extraDays })}
            {i.deadlineNote && ` — ${i.deadlineNote}`}
          </span>
        )}
        {i.doneAt && (
          <span>{t("Done by {name} on {date}", { name: entry.doneByName ?? "—", date: fmt.dateTime(i.doneAt) })}</span>
        )}
        {i.approvedAt && (
          <span className="text-green-700 dark:text-green-500">
            {i.approvedBy
              ? t("Client approval confirmed by {name} on {date}", {
                  name: entry.approvedByName ?? "—",
                  date: fmt.dateTime(i.approvedAt),
                })
              : t("Approved by the client on {date}", { date: fmt.dateTime(i.approvedAt) })}
          </span>
        )}
        {i.status === "rejected" && i.rejectReason && <span>{t("Reason: {reason}", { reason: i.rejectReason })}</span>}
      </div>

      {comments.length > 0 && (
        <ul className="flex flex-col gap-2 border-s-2 ps-3">
          {comments.map((c) => (
            <li key={c.id} className="text-sm">
              <span className="font-medium">
                {c.clientName ? t("{name} (client)", { name: c.clientName }) : (c.authorName ?? "—")}
              </span>{" "}
              <span className="text-xs text-muted-foreground">{fmt.dateTime(c.createdAt)}</span>
              <LinkedText text={c.body} />
            </li>
          ))}
        </ul>
      )}

      {hasActions && (
        <FeedbackItemActions
          itemId={i.id}
          can={can}
          assignees={assignees}
          assigneeId={i.assigneeId}
          meId={meId}
          extraDays={i.extraDays}
        />
      )}
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">
          {comments.length ? t("Reply") : t("Comment")}
        </summary>
        <div className="mt-2">
          <FeedbackCommentForm itemId={i.id} />
        </div>
      </details>
    </div>
  );
}
