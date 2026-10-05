"use client";

import { moveStatus, raiseFlag, requestEquipment, resolveFlag, saveEquipment, saveGuide } from "@/app/actions/work";
import { Field, SelectField, Submit, useForm, type Values } from "@/components/form-fields";
import { FormMessage } from "@/components/form-message";
import { DEPARTMENT_LABELS, DEPARTMENTS } from "@/lib/permissions";

export function RequestEquipmentForm({
  projectId,
  items,
}: {
  projectId: string;
  items: { id: string; name: string; code: string; free: number; status: string }[];
}) {
  const f = useForm(requestEquipment, { quantity: "1" });
  if (!items.length) return <p className="text-sm text-muted-foreground">No equipment in the inventory yet.</p>;
  return (
    <form key={f.key} action={f.formAction} className="grid gap-4 sm:grid-cols-4">
      <input type="hidden" name="projectId" value={projectId} />
      <SelectField
        label="Equipment"
        name="equipmentId"
        values={f.values}
        className="sm:col-span-2"
        options={items.map((i) => ({
          value: i.id,
          label: `${i.name} (${i.code}) — ${i.status === "active" ? `${i.free} free` : i.status}`,
        }))}
      />
      <Field label="Quantity" name="quantity" values={f.values} type="number" min={1} required />
      <div />
      <Field label="Needed from (optional)" name="neededFrom" values={f.values} type="date" />
      <Field label="Needed until (optional)" name="neededUntil" values={f.values} type="date" />
      <Field label="Notes (optional)" name="notes" values={f.values} className="sm:col-span-2" />
      <div className="flex flex-col gap-2 sm:col-span-4">
        <FormMessage state={f.state} />
        <Submit pending={f.pending} label="Request" pendingLabel="Requesting…" />
      </div>
    </form>
  );
}

const FLAG_TYPES = [
  { value: "blocked", label: "Blocked" },
  { value: "needs_data", label: "Needs data" },
  { value: "needs_assets", label: "Needs assets" },
  { value: "other", label: "Other" },
];

export function RaiseFlagForm({ projectId }: { projectId: string }) {
  const f = useForm(raiseFlag, { type: "needs_data", ownerDepartment: "business" });
  return (
    <form key={f.key} action={f.formAction} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="projectId" value={projectId} />
      <SelectField label="Type" name="type" values={f.values} options={FLAG_TYPES} />
      <SelectField
        label="Who needs to act"
        name="ownerDepartment"
        values={f.values}
        options={DEPARTMENTS.map((d) => ({ value: d, label: DEPARTMENT_LABELS[d] }))}
      />
      <Field
        label="What is needed"
        name="details"
        values={f.values}
        multiline
        required
        placeholder="e.g. Final logo files in SVG"
        className="sm:col-span-2"
      />
      <div className="flex flex-col gap-2 sm:col-span-2">
        <FormMessage state={f.state} />
        <Submit pending={f.pending} label="Raise flag" pendingLabel="Raising…" variant="destructive" />
      </div>
    </form>
  );
}

export function ResolveFlagForm({ flagId }: { flagId: string }) {
  const f = useForm(resolveFlag);
  return (
    <form key={f.key} action={f.formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={flagId} />
      <Field
        label="Resolution"
        name="resolution"
        values={f.values}
        required
        placeholder="e.g. Files uploaded to Drive"
        className="min-w-56 flex-1"
      />
      <Submit pending={f.pending} label="Resolve" pendingLabel="Saving…" variant="outline" />
      <div className="basis-full">
        <FormMessage state={f.state} />
      </div>
    </form>
  );
}

export function GuideForm({ projectId, initial }: { projectId: string; initial: Values }) {
  const f = useForm(saveGuide, initial);
  return (
    <form key={f.key} action={f.formAction} className="flex flex-col gap-4">
      <input type="hidden" name="projectId" value={projectId} />
      <Field
        label="Installation steps"
        name="steps"
        values={f.values}
        multiline
        rows={8}
        placeholder={"1. Mount the screens\n2. Connect the NFC readers to the PC\n3. Start the app from the desktop shortcut"}
      />
      <Field
        label="Demo video link"
        name="demoVideoUrl"
        values={f.values}
        type="url"
        placeholder="https://drive.google.com/…"
        hint="Record the demo on the same setup that will be installed."
      />
      <FormMessage state={f.state} />
      <Submit pending={f.pending} label="Save guide" pendingLabel="Saving…" />
    </form>
  );
}

export function StatusButtons({
  projectId,
  moves,
}: {
  projectId: string;
  moves: { to: string; label: string; variant?: "default" | "outline" }[];
}) {
  const f = useForm(moveStatus);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {moves.map((m) => (
          <form key={m.to} action={f.formAction}>
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="to" value={m.to} />
            <Submit pending={f.pending} label={m.label} pendingLabel="Saving…" variant={m.variant} />
          </form>
        ))}
      </div>
      <FormMessage state={f.state} />
    </div>
  );
}

const EQUIPMENT_STATUSES = [
  { value: "active", label: "Active" },
  { value: "maintenance", label: "Maintenance" },
  { value: "broken", label: "Broken" },
  { value: "retired", label: "Retired" },
];

export function EquipmentForm({ initial }: { initial?: Values }) {
  const f = useForm(saveEquipment, initial ?? { quantity: "1", status: "active" });
  const editing = !!initial?.id;
  return (
    <form key={f.key} action={f.formAction} className="grid gap-4 sm:grid-cols-3">
      {editing && <input type="hidden" name="id" value={initial!.id!} />}
      <Field label="Code" name="code" values={f.values} required placeholder="MQ3-01" />
      <Field label="Name" name="name" values={f.values} required placeholder="Meta Quest 3" />
      <Field label="Category (optional)" name="category" values={f.values} placeholder="VR" />
      <Field label="Quantity" name="quantity" values={f.values} type="number" min={0} required />
      <Field label="Location (optional)" name="location" values={f.values} placeholder="Office storage" />
      <SelectField label="Status" name="status" values={f.values} options={EQUIPMENT_STATUSES} />
      <Field label="Notes (optional)" name="notes" values={f.values} className="sm:col-span-3" />
      <div className="flex flex-col gap-2 sm:col-span-3">
        <FormMessage state={f.state} />
        <Submit
          pending={f.pending}
          label={editing ? "Save changes" : "Add equipment"}
          pendingLabel="Saving…"
        />
      </div>
    </form>
  );
}
