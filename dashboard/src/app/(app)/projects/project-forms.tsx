"use client";

import { useActionState, useEffect, useId, useState, type ChangeEvent } from "react";
import {
  addFinanceEntries,
  addMembers,
  addMilestone,
  addProgressReview,
  createProject,
  saveFinance,
  saveSchedule,
  setDevDeadline,
  updateBrief,
} from "@/app/actions/projects";
import { Field, Submit, useForm, type Values } from "@/components/form-fields";
import { FormMessage, selectClass } from "@/components/form-message";
import { useI18n } from "@/components/i18n-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { financeEntryRowSchema, type FinanceEntryRow } from "@/lib/finance";
import { CURRENCIES } from "@/lib/format";
import { firstIssue, type Msg } from "@/lib/i18n";

function CurrencySelect({ values, name = "currency" }: { values: Values; name?: string }) {
  const { t } = useI18n();
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{t("Currency")}</Label>
      <select id={id} name={name} defaultValue={values[name] ?? "EGP"} className={selectClass}>
        {CURRENCIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </div>
  );
}

function BriefFields({ values }: { values: Values }) {
  const { t } = useI18n();
  const lines = t("One link or note per line.");
  return (
    <>
      <Field label={t("Project name")} name="name" values={values} required voice />
      <Field label={t("Client")} name="clientName" values={values} voice />
      <Field label={t("Description")} name="description" values={values} multiline className="sm:col-span-2" />
      <Field label={t("References")} name="refs" values={values} multiline hint={lines} className="sm:col-span-2" />
      <Field label={t("Design")} name="design" values={values} multiline hint={lines} />
      <Field label={t("Content")} name="content" values={values} multiline hint={lines} />
      <Field
        label={t("Other data")}
        name="otherData"
        values={values}
        multiline
        hint={t("Voice notes, assets, logins, anything else the team needs.")}
        className="sm:col-span-2"
      />
    </>
  );
}

function ScheduleFields({ values }: { values: Values }) {
  const { t } = useI18n();
  return (
    <>
      <Field label={t("Real installation date")} name="installationDate" values={values} type="date" />
      <Field label={t("Location link")} name="locationLink" values={values} placeholder="https://maps.google.com/…" />
      <Field label={t("Installation notes")} name="scheduleNotes" values={values} multiline className="sm:col-span-2" />
    </>
  );
}

function BudgetFields({ values }: { values: Values }) {
  const { t } = useI18n();
  return (
    <>
      <Field label={t("Budget")} name="budget" values={values} inputMode="decimal" placeholder="150000" />
      <CurrencySelect values={values} />
      <Field label={t("Budget notes")} name="financeNotes" values={values} multiline className="sm:col-span-2" />
    </>
  );
}

export function CreateProjectForm({ withBudget, withSchedule }: { withBudget: boolean; withSchedule: boolean }) {
  const { t } = useI18n();
  const f = useForm(createProject);
  return (
    <form key={f.key} action={f.formAction} className="flex flex-col gap-8">
      <section className="grid gap-4 sm:grid-cols-2">
        <h2 className="font-medium sm:col-span-2">{t("Brief")}</h2>
        <BriefFields values={f.values} />
      </section>
      {withBudget && (
        <section className="grid gap-4 sm:grid-cols-2">
          <h2 className="font-medium sm:col-span-2">{t("Budget")}</h2>
          <BudgetFields values={f.values} />
        </section>
      )}
      {withSchedule && (
        <section className="grid gap-4 sm:grid-cols-2">
          <h2 className="font-medium sm:col-span-2">{t("Installation")}</h2>
          <ScheduleFields values={f.values} />
        </section>
      )}
      <div className="flex flex-col gap-2">
        <FormMessage state={f.state} />
        <Submit pending={f.pending} label={t("Create brief")} pendingLabel={t("Creating…")} />
      </div>
    </form>
  );
}

export function EditBriefForm({ projectId, initial }: { projectId: string; initial: Values }) {
  const { t } = useI18n();
  const f = useForm(updateBrief, initial);
  return (
    <form key={f.key} action={f.formAction} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="projectId" value={projectId} />
      <BriefFields values={f.values} />
      <div className="flex flex-col gap-2 sm:col-span-2">
        <FormMessage state={f.state} />
        <Submit pending={f.pending} label={t("Save brief")} pendingLabel={t("Saving…")} />
      </div>
    </form>
  );
}

export function FinanceForm({ projectId, initial }: { projectId: string; initial: Values }) {
  const { t } = useI18n();
  const f = useForm(saveFinance, initial);
  return (
    <form key={f.key} action={f.formAction} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="projectId" value={projectId} />
      <BudgetFields values={f.values} />
      <div className="flex flex-col gap-2 sm:col-span-2">
        <FormMessage state={f.state} />
        <Submit pending={f.pending} label={t("Save budget")} pendingLabel={t("Saving…")} />
      </div>
    </form>
  );
}

type Draft = {
  kind: "payment" | "expense";
  amount: string;
  currency: string;
  entryDate: string;
  description: string;
  reference: string;
};

export function FinanceEntryForm({ projectId, defaultCurrency }: { projectId: string; defaultCurrency: string }) {
  const { t, fmt } = useI18n();
  const today = new Date().toISOString().slice(0, 10);
  const blank = (): Draft => ({
    kind: "payment",
    amount: "",
    currency: defaultCurrency,
    entryDate: today,
    description: "",
    reference: "",
  });
  const [draft, setDraft] = useState<Draft>(blank);
  const [queue, setQueue] = useState<FinanceEntryRow[]>([]);
  const [localError, setLocalError] = useState<Msg | null>(null);
  const [state, formAction, pending] = useActionState(addFinanceEntries, undefined);

  useEffect(() => {
    if (!state?.success) return;
    setQueue([]);
    setDraft(blank());
    setLocalError(null);
  }, [state]);

  const set =
    (key: keyof Draft) =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setDraft((d) => ({ ...d, [key]: e.target.value }));
      setLocalError(null);
    };

  const queueRow = () => {
    const parsed = financeEntryRowSchema.safeParse(draft);
    if (!parsed.success) {
      setLocalError(firstIssue(parsed.error));
      return;
    }
    setQueue((rows) => [...rows, parsed.data]);
    setDraft((d) => ({ ...blank(), kind: d.kind, currency: d.currency, entryDate: d.entryDate }));
    setLocalError(null);
  };

  return (
    <form
      className="flex flex-col gap-4"
      action={(formData) => {
        const empty = !draft.amount.trim() && !draft.description.trim();
        let rows = queue;
        if (!empty) {
          const parsed = financeEntryRowSchema.safeParse(draft);
          if (!parsed.success) {
            setLocalError(firstIssue(parsed.error));
            return;
          }
          rows = [...queue, parsed.data];
        }
        if (!rows.length) {
          setLocalError("Add at least one entry.");
          return;
        }
        formData.set("projectId", projectId);
        formData.set("entries", JSON.stringify(rows));
        formAction(formData);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${projectId}-kind`}>{t("Type")}</Label>
          <select
            id={`${projectId}-kind`}
            value={draft.kind}
            onChange={set("kind")}
            className={selectClass}
          >
            <option value="payment">{t("Payment received")}</option>
            <option value="expense">{t("Expense")}</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${projectId}-amount`}>{t("Amount")}</Label>
          <Input
            id={`${projectId}-amount`}
            inputMode="decimal"
            value={draft.amount}
            onChange={set("amount")}
            placeholder="15000"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${projectId}-currency`}>{t("Currency")}</Label>
          <select
            id={`${projectId}-currency`}
            value={draft.currency}
            onChange={set("currency")}
            className={selectClass}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${projectId}-entryDate`}>{t("Date")}</Label>
          <Input id={`${projectId}-entryDate`} type="date" value={draft.entryDate} onChange={set("entryDate")} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${projectId}-description`}>{t("Description")}</Label>
          <Input
            id={`${projectId}-description`}
            value={draft.description}
            onChange={set("description")}
            placeholder={t("First installment")}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${projectId}-reference`}>{t("Reference (optional)")}</Label>
          <Input
            id={`${projectId}-reference`}
            value={draft.reference}
            onChange={set("reference")}
            placeholder={t("Invoice / receipt no.")}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={pending} onClick={queueRow}>
          {t("Add")}
        </Button>
      </div>

      {queue.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
            {t("To save ({count})", { count: queue.length })}
          </div>
          <ul className="divide-y border">
            {queue.map((row, i) => (
              <li key={`${row.kind}-${row.amount}-${row.description}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <Badge variant={row.kind === "payment" ? "secondary" : "outline"}>
                    {row.kind === "payment" ? t("Payment") : t("Expense")}
                  </Badge>
                  <span className="tabular-nums">
                    {row.kind === "expense" ? "−" : ""}
                    {fmt.money(row.amount, row.currency)}
                  </span>
                  <span className="truncate">{row.description}</span>
                  <span className="text-muted-foreground">{fmt.date(row.entryDate)}</span>
                </span>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => setQueue((rows) => rows.filter((_, j) => j !== i))}
                >
                  {t("Remove")}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {localError && <p className="text-sm text-destructive">{t(localError)}</p>}
        <FormMessage state={state} />
        <Submit pending={pending} label={t("Save")} pendingLabel={t("Saving…")} />
      </div>
    </form>
  );
}

export function ScheduleForm({ projectId, initial }: { projectId: string; initial: Values }) {
  const { t } = useI18n();
  const f = useForm(saveSchedule, initial);
  return (
    <form key={f.key} action={f.formAction} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="projectId" value={projectId} />
      <ScheduleFields values={f.values} />
      <div className="flex flex-col gap-2 sm:col-span-2">
        <FormMessage state={f.state} />
        <Submit pending={f.pending} label={t("Save installation details")} pendingLabel={t("Saving…")} />
      </div>
    </form>
  );
}

export function ProgressReviewForm({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const f = useForm(addProgressReview);
  return (
    <form key={f.key} action={f.formAction} className="grid gap-4 sm:grid-cols-3">
      <input type="hidden" name="projectId" value={projectId} />
      <Field
        label={t("What will be shown")}
        name="title"
        values={f.values}
        required
        placeholder={t("First demo to client")}
      />
      <Field label={t("Date")} name="reviewDate" values={f.values} type="date" required />
      <Field label={t("Notes (optional)")} name="notes" values={f.values} />
      <div className="flex flex-col gap-2 sm:col-span-3">
        <FormMessage state={f.state} />
        <Submit pending={f.pending} label={t("Add progress date")} pendingLabel={t("Adding…")} />
      </div>
    </form>
  );
}

export function AddMembersForm({
  projectId,
  developers,
  firstAssignment,
}: {
  projectId: string;
  developers: { id: string; name: string; isHead: boolean }[];
  firstAssignment: boolean;
}) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(addMembers, undefined);
  if (!developers.length) {
    return <p className="text-sm text-muted-foreground">{t("Every active developer is already on this project.")}</p>;
  }
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="projectId" value={projectId} />
      <table className="text-sm">
        <thead>
          <tr className="text-start text-muted-foreground">
            <th className="w-10 pb-1 text-start font-normal">{t("Add")}</th>
            <th className="pb-1 text-start font-normal">{t("Developer")}</th>
          </tr>
        </thead>
        <tbody>
          {developers.map((d) => (
            <tr key={d.id}>
              <td className="py-1">
                <input type="checkbox" name="developers" value={d.id} aria-label={t("Add {name}", { name: d.name })} />
              </td>
              <td className="py-1">
                {d.name}
                {d.isHead && <span className="text-muted-foreground"> ({t("Tech Head")})</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <FormMessage state={state} />
      <Submit
        pending={pending}
        label={firstAssignment ? t("Assign project") : t("Add to project")}
        pendingLabel={t("Saving…")}
      />
    </form>
  );
}

export function DeadlineForm({ projectId, devDeadline }: { projectId: string; devDeadline: string | null }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(setDevDeadline, undefined);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="projectId" value={projectId} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${projectId}-devDeadline`}>{t("Development deadline")}</Label>
        <Input
          id={`${projectId}-devDeadline`}
          name="devDeadline"
          type="date"
          defaultValue={devDeadline ?? ""}
          className="w-44"
        />
      </div>
      <Submit pending={pending} label={t("Save deadline")} pendingLabel={t("Saving…")} />
      <div className="basis-full">
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function MilestoneForm({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const f = useForm(addMilestone);
  return (
    <form key={f.key} action={f.formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="projectId" value={projectId} />
      <Field label={t("Milestone")} name="title" values={f.values} required className="min-w-56 flex-1" />
      <Field label={t("Due date (optional)")} name="dueDate" values={f.values} type="date" />
      <Submit pending={f.pending} label={t("Add milestone")} pendingLabel={t("Adding…")} />
      <div className="basis-full">
        <FormMessage state={f.state} />
      </div>
    </form>
  );
}
