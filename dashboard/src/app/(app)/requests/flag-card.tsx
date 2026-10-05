import Link from "next/link";
import { LinkedText } from "@/components/linked-text";
import type { Person } from "@/components/people-picker";
import { Badge } from "@/components/ui/badge";
import type { LoadedFlag, flagPeople } from "@/lib/flags";
import { FLAG_TYPE_LABELS } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { canCancelFlag, canResolveFlagPart, roleTitle, type Viewer } from "@/lib/permissions";
import { CancelFlagForm, RemindFlagForm, ResolveFlagForm } from "../projects/work-forms";

export const toPeople = (rows: Awaited<ReturnType<typeof flagPeople>>): Person[] =>
  rows.map((u) => ({ id: u.id, name: u.name, email: u.email, team: roleTitle(u) }));

/** Open parts `me` can resolve, so pages can sort flags that need action first. */
export const myOpenParts = (me: Viewer, f: LoadedFlag) =>
  f.status === "open"
    ? f.parts.filter((p) => p.status === "open" && canResolveFlagPart(me, { id: p.userId, department: p.department }))
    : [];

export async function FlagCard({
  me,
  flag: f,
  showProject = true,
}: {
  me: Viewer;
  flag: LoadedFlag;
  showProject?: boolean;
}) {
  const { t, fmt } = await getI18n();
  const open = f.status === "open";
  const mine = myOpenParts(me, f);
  const done = f.parts.filter((p) => p.status === "resolved").length;

  return (
    <div
      id={`flag-${f.id}`}
      className={`flex flex-col gap-3 rounded-lg border p-3 ${open ? "border-destructive/30 bg-destructive/5" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant={open ? "destructive" : "outline"}>{t(FLAG_TYPE_LABELS[f.type])}</Badge>
        {f.status === "cancelled" && <Badge variant="secondary">{t("Cancelled")}</Badge>}
        {f.status === "resolved" && <Badge variant="secondary">{t("Resolved")}</Badge>}
        {showProject &&
          (f.projectId ? (
            <Link href={`/projects/${f.projectId}`} className="font-medium underline-offset-4 hover:underline">
              {f.projectName}
            </Link>
          ) : (
            <span className="font-medium">{t("General request")}</span>
          ))}
        <span className="text-muted-foreground">
          {t("From {name} on {date}", { name: f.raisedByName, date: fmt.dateTime(f.createdAt) })}
        </span>
      </div>

      <LinkedText text={f.details} />

      <div className="flex flex-col gap-1.5 text-sm">
        <div className="text-muted-foreground">
          {t("Sent to ({done} of {total} done):", { done, total: f.parts.length })}
        </div>
        <ul className="flex flex-col gap-1">
          {f.parts.map((p) => (
            <li key={p.userId}>
              <span className={p.status === "resolved" ? "text-green-700 dark:text-green-500" : ""}>
                {p.status === "resolved" ? "✓" : "○"} {p.name}
              </span>
              {p.status === "resolved" ? (
                <span className="text-muted-foreground">
                  {" — "}
                  {p.resolvedByName && p.resolvedByName !== p.name
                    ? t("resolved by {name} on {date}: {resolution}", {
                        name: p.resolvedByName,
                        date: fmt.dateTime(p.resolvedAt),
                        resolution: p.resolution ?? "",
                      })
                    : t("resolved on {date}: {resolution}", {
                        date: fmt.dateTime(p.resolvedAt),
                        resolution: p.resolution ?? "",
                      })}
                </span>
              ) : (
                <span className="text-muted-foreground"> — {t(open ? "waiting" : "not needed")}</span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {f.status === "cancelled" && (
        <p className="text-sm text-muted-foreground">
          {t("Cancelled by {name} on {date}.", { name: f.closedByName ?? "—", date: fmt.dateTime(f.closedAt) })}
          {f.cancelReason && ` ${t("Reason: {reason}", { reason: f.cancelReason })}`}
        </p>
      )}

      {mine.map((p) => (
        <ResolveFlagForm
          key={p.userId}
          flagId={f.id}
          userId={p.userId}
          label={p.userId === me.id ? t("How did you resolve it?") : t("Resolve for {name}", { name: p.name })}
        />
      ))}

      {open && canCancelFlag(me, f) && (
        <div className="flex flex-col gap-2 border-t pt-3">
          <div className="flex flex-wrap items-center gap-3">
            <RemindFlagForm flagId={f.id} />
            {f.lastRemindedAt && (
              <span className="text-xs text-muted-foreground">
                {t("Last reminder: {date}", { date: fmt.dateTime(f.lastRemindedAt) })}
              </span>
            )}
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">{t("Cancel this request")}</summary>
            <div className="mt-2">
              <CancelFlagForm flagId={f.id} />
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
