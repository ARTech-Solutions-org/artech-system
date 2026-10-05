"use client";

import { useActionState, useId } from "react";
import {
  addFinanceEntry,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CURRENCIES } from "@/lib/format";

function CurrencySelect({ values, name = "currency" }: { values: Values; name?: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Currency</Label>
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

const LINES_HINT = "One link or note per line.";

function BriefFields({ values }: { values: Values }) {
  return (
    <>
      <Field label="Project name" name="name" values={values} required />
      <Field label="Client" name="clientName" values={values} />
      <Field label="Description" name="description" values={values} multiline className="sm:col-span-2" />
      <Field label="References" name="refs" values={values} multiline hint={LINES_HINT} className="sm:col-span-2" />
      <Field label="Design" name="design" values={values} multiline hint={LINES_HINT} />
      <Field label="Content" name="content" values={values} multiline hint={LINES_HINT} />
      <Field
        label="Other data"
        name="otherData"
        values={values}
        multiline
        hint="Voice notes, assets, logins, anything else the team needs."
        className="sm:col-span-2"
      />
    </>
  );
}

export function CreateProjectForm({ withBudget, withSchedule }: { withBudget: boolean; withSchedule: boolean }) {
  const f = useForm(createProject);
  return (
    <form key={f.key} action={f.formAction} className="flex flex-col gap-8">
      <section className="grid gap-4 sm:grid-cols-2">
        <h2 className="font-medium sm:col-span-2">Brief</h2>
        <BriefFields values={f.values} />
      </section>
      {withBudget && (
        <section className="grid gap-4 sm:grid-cols-2">
          <h2 className="font-medium sm:col-span-2">Budget</h2>
          <Field label="Budget" name="budget" values={f.values} inputMode="decimal" placeholder="150000" />
          <CurrencySelect values={f.values} />
          <Field label="Budget notes" name="financeNotes" values={f.values} multiline className="sm:col-span-2" />
        </section>
      )}
      {withSchedule && (
        <section className="grid gap-4 sm:grid-cols-2">
          <h2 className="font-medium sm:col-span-2">Installation</h2>
          <Field label="Real installation date" name="installationDate" values={f.values} type="date" />
          <Field label="Location link" name="locationLink" values={f.values} placeholder="https://maps.google.com/…" />
          <Field label="Installation notes" name="scheduleNotes" values={f.values} multiline className="sm:col-span-2" />
        </section>
      )}
      <div className="flex flex-col gap-2">
        <FormMessage state={f.state} />
        <Submit pending={f.pending} label="Create brief" pendingLabel="Creating…" />
      </div>
    </form>
  );
}

export function EditBriefForm({ projectId, initial }: { projectId: string; initial: Values }) {
  const f = useForm(updateBrief, initial);
  return (
    <form key={f.key} action={f.formAction} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="projectId" value={projectId} />
      <BriefFields values={f.values} />
      <div className="flex flex-col gap-2 sm:col-span-2">
        <FormMessage state={f.state} />
        <Submit pending={f.pending} label="Save brief" pendingLabel="Saving…" />
      </div>
    </form>
  );
}

export function FinanceForm({ projectId, initial }: { projectId: string; initial: Values }) {
  const f = useForm(saveFinance, initial);
  return (
    <form key={f.key} action={f.formAction} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="projectId" value={projectId} />
      <Field label="Budget" name="budget" values={f.values} inputMode="decimal" placeholder="150000" />
      <CurrencySelect values={f.values} />
      <Field label="Budget notes" name="financeNotes" values={f.values} multiline className="sm:col-span-2" />
      <div className="flex flex-col gap-2 sm:col-span-2">
        <FormMessage state={f.state} />
        <Submit pending={f.pending} label="Save budget" pendingLabel="Saving…" />
      </div>
    </form>
  );
}

export function FinanceEntryForm({ projectId, defaultCurrency }: { projectId: string; defaultCurrency: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const f = useForm(addFinanceEntry, { kind: "payment", currency: defaultCurrency, entryDate: today });
  return (
    <form key={f.key} action={f.formAction} className="grid gap-4 sm:grid-cols-3">
      <input type="hidden" name="projectId" value={projectId} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${projectId}-kind`}>Type</Label>
        <select id={`${projectId}-kind`} name="kind" defaultValue={f.values.kind ?? "payment"} className={selectClass}>
          <option value="payment">Payment received</option>
          <option value="expense">Expense</option>
        </select>
      </div>
      <Field label="Amount" name="amount" values={f.values} inputMode="decimal" required />
      <CurrencySelect values={f.values} />
      <Field label="Date" name="entryDate" values={f.values} type="date" required />
      <Field label="Description" name="description" values={f.values} required placeholder="First installment" />
      <Field label="Reference (optional)" name="reference" values={f.values} placeholder="Invoice / receipt no." />
      <div className="flex flex-col gap-2 sm:col-span-3">
        <FormMessage state={f.state} />
        <Submit pending={f.pending} label="Add entry" pendingLabel="Adding…" />
      </div>
    </form>
  );
}

export function ScheduleForm({ projectId, initial }: { projectId: string; initial: Values }) {
  const f = useForm(saveSchedule, initial);
  return (
    <form key={f.key} action={f.formAction} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="projectId" value={projectId} />
      <Field label="Real installation date" name="installationDate" values={f.values} type="date" />
      <Field label="Location link" name="locationLink" values={f.values} placeholder="https://maps.google.com/…" />
      <Field label="Installation notes" name="scheduleNotes" values={f.values} multiline className="sm:col-span-2" />
      <div className="flex flex-col gap-2 sm:col-span-2">
        <FormMessage state={f.state} />
        <Submit pending={f.pending} label="Save installation details" pendingLabel="Saving…" />
      </div>
    </form>
  );
}

export function ProgressReviewForm({ projectId }: { projectId: string }) {
  const f = useForm(addProgressReview);
  return (
    <form key={f.key} action={f.formAction} className="grid gap-4 sm:grid-cols-3">
      <input type="hidden" name="projectId" value={projectId} />
      <Field label="What will be shown" name="title" values={f.values} required placeholder="First demo to client" />
      <Field label="Date" name="reviewDate" values={f.values} type="date" required />
      <Field label="Notes (optional)" name="notes" values={f.values} />
      <div className="flex flex-col gap-2 sm:col-span-3">
        <FormMessage state={f.state} />
        <Submit pending={f.pending} label="Add progress date" pendingLabel="Adding…" />
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
  const [state, action, pending] = useActionState(addMembers, undefined);
  if (!developers.length) {
    return <p className="text-sm text-muted-foreground">Every active developer is already on this project.</p>;
  }
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="projectId" value={projectId} />
      <table className="text-sm">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="w-10 pb-1 font-normal">Add</th>
            <th className="w-12 pb-1 font-normal">Lead</th>
            <th className="pb-1 font-normal">Developer</th>
          </tr>
        </thead>
        <tbody>
          {developers.map((d) => (
            <tr key={d.id}>
              <td className="py-1">
                <input type="checkbox" name="developers" value={d.id} aria-label={`Add ${d.name}`} />
              </td>
              <td className="py-1">
                <input type="radio" name="lead" value={d.id} aria-label={`Make ${d.name} lead`} />
              </td>
              <td className="py-1">
                {d.name}
                {d.isHead && <span className="text-muted-foreground"> (Tech Head)</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground">
        {firstAssignment
          ? "If you don't pick a lead, the first selected developer becomes lead."
          : "Picking a lead here replaces the current lead."}
      </p>
      <FormMessage state={state} />
      <Submit
        pending={pending}
        label={firstAssignment ? "Assign project" : "Add to project"}
        pendingLabel="Saving…"
      />
    </form>
  );
}

export function DeadlineForm({ projectId, devDeadline }: { projectId: string; devDeadline: string | null }) {
  const [state, action, pending] = useActionState(setDevDeadline, undefined);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="projectId" value={projectId} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${projectId}-devDeadline`}>Development deadline</Label>
        <Input id={`${projectId}-devDeadline`} name="devDeadline" type="date" defaultValue={devDeadline ?? ""} className="w-44" />
      </div>
      <Submit pending={pending} label="Save deadline" pendingLabel="Saving…" />
      <div className="basis-full">
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function MilestoneForm({ projectId }: { projectId: string }) {
  const f = useForm(addMilestone);
  return (
    <form key={f.key} action={f.formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="projectId" value={projectId} />
      <Field label="Milestone" name="title" values={f.values} required className="min-w-56 flex-1" />
      <Field label="Due date (optional)" name="dueDate" values={f.values} type="date" />
      <Submit pending={f.pending} label="Add milestone" pendingLabel="Adding…" />
      <div className="basis-full">
        <FormMessage state={f.state} />
      </div>
    </form>
  );
}
