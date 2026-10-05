"use client";

import {
  moveStatus,
  raiseFlag,
  requestEquipment,
  resolveFlag,
  saveEquipment,
  saveGuide,
  saveInstallation,
} from "@/app/actions/work";
import { Field, SelectField, Submit, useForm, type Values } from "@/components/form-fields";
import { FormMessage } from "@/components/form-message";
import { useI18n } from "@/components/i18n-provider";
import { EQUIPMENT_STATUS_LABELS, FLAG_TYPE_LABELS } from "@/lib/format";
import { DEPARTMENT_LABELS, DEPARTMENTS } from "@/lib/permissions";

export function RequestEquipmentForm({
  projectId,
  items,
}: {
  projectId: string;
  items: { id: string; name: string; code: string; free: number; status: keyof typeof EQUIPMENT_STATUS_LABELS }[];
}) {
  const { t } = useI18n();
  const f = useForm(requestEquipment, { quantity: "1" });
  if (!items.length) return <p className="text-sm text-muted-foreground">{t("No equipment in the inventory yet.")}</p>;
  return (
    <form key={f.key} action={f.formAction} className="grid gap-4 sm:grid-cols-4">
      <input type="hidden" name="projectId" value={projectId} />
      <SelectField
        label={t("Equipment")}
        name="equipmentId"
        values={f.values}
        className="sm:col-span-2"
        options={items.map((i) => ({
          value: i.id,
          label: `${i.name} (${i.code}) — ${
            i.status === "active" ? t("{count} free", { count: i.free }) : t(EQUIPMENT_STATUS_LABELS[i.status])
          }`,
        }))}
      />
      <Field label={t("Quantity")} name="quantity" values={f.values} type="number" min={1} required />
      <div />
      <Field label={t("Needed from (optional)")} name="neededFrom" values={f.values} type="date" />
      <Field label={t("Needed until (optional)")} name="neededUntil" values={f.values} type="date" />
      <Field label={t("Notes (optional)")} name="notes" values={f.values} className="sm:col-span-2" />
      <div className="flex flex-col gap-2 sm:col-span-4">
        <FormMessage state={f.state} />
        <Submit pending={f.pending} label={t("Request")} pendingLabel={t("Requesting…")} />
      </div>
    </form>
  );
}

export function RaiseFlagForm({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const f = useForm(raiseFlag, { type: "needs_data", ownerDepartment: "business" });
  return (
    <form key={f.key} action={f.formAction} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="projectId" value={projectId} />
      <SelectField
        label={t("Type")}
        name="type"
        values={f.values}
        options={Object.entries(FLAG_TYPE_LABELS).map(([value, label]) => ({ value, label: t(label) }))}
      />
      <SelectField
        label={t("Who needs to act")}
        name="ownerDepartment"
        values={f.values}
        options={DEPARTMENTS.map((d) => ({ value: d, label: t(DEPARTMENT_LABELS[d]) }))}
      />
      <Field
        label={t("What is needed")}
        name="details"
        values={f.values}
        multiline
        required
        placeholder={t("e.g. Final logo files in SVG")}
        className="sm:col-span-2"
      />
      <div className="flex flex-col gap-2 sm:col-span-2">
        <FormMessage state={f.state} />
        <Submit pending={f.pending} label={t("Raise flag")} pendingLabel={t("Raising…")} variant="destructive" />
      </div>
    </form>
  );
}

export function ResolveFlagForm({ flagId }: { flagId: string }) {
  const { t } = useI18n();
  const f = useForm(resolveFlag);
  return (
    <form key={f.key} action={f.formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={flagId} />
      <Field
        label={t("Resolution")}
        name="resolution"
        values={f.values}
        required
        placeholder={t("e.g. Files uploaded to Drive")}
        className="min-w-56 flex-1"
      />
      <Submit pending={f.pending} label={t("Resolve")} pendingLabel={t("Saving…")} variant="outline" />
      <div className="basis-full">
        <FormMessage state={f.state} />
      </div>
    </form>
  );
}

export function GuideForm({ projectId, initial }: { projectId: string; initial: Values }) {
  const { t } = useI18n();
  const f = useForm(saveGuide, initial);
  return (
    <form key={f.key} action={f.formAction} className="flex flex-col gap-4">
      <input type="hidden" name="projectId" value={projectId} />
      <Field
        label={t("Installation steps")}
        name="steps"
        values={f.values}
        multiline
        rows={8}
        placeholder={t("1. Mount the screens\n2. Connect the NFC readers to the PC\n3. Start the app from the desktop shortcut")}
      />
      <Field
        label={t("Demo video link")}
        name="demoVideoUrl"
        values={f.values}
        type="url"
        dir="ltr"
        placeholder="https://drive.google.com/…"
        hint={t("Record the demo on the same setup that will be installed.")}
      />
      <FormMessage state={f.state} />
      <Submit pending={f.pending} label={t("Save guide")} pendingLabel={t("Saving…")} />
    </form>
  );
}

export function InstallationForm({
  projectId,
  initial,
  technicians,
}: {
  projectId: string;
  initial: Values;
  technicians: { id: string; name: string }[];
}) {
  const { t } = useI18n();
  const f = useForm(saveInstallation, initial);
  return (
    <form key={f.key} action={f.formAction} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="projectId" value={projectId} />
      <SelectField
        label={t("Lead technician")}
        name="leadTechnicianId"
        values={f.values}
        defaultValue=""
        options={[{ value: "", label: t("Not assigned") }, ...technicians.map((u) => ({ value: u.id, label: u.name }))]}
      />
      <Field
        label={t("Installation report")}
        name="installNotes"
        values={f.values}
        multiline
        rows={4}
        hint={t("What was done on site, issues, what the client signed off.")}
        className="sm:col-span-2"
      />
      <div className="flex flex-col gap-2 sm:col-span-2">
        <FormMessage state={f.state} />
        <Submit pending={f.pending} label={t("Save")} pendingLabel={t("Saving…")} />
      </div>
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
  const { t } = useI18n();
  const f = useForm(moveStatus);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {moves.map((m) => (
          <form key={m.to} action={f.formAction}>
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="to" value={m.to} />
            <Submit pending={f.pending} label={m.label} pendingLabel={t("Saving…")} variant={m.variant} />
          </form>
        ))}
      </div>
      <FormMessage state={f.state} />
    </div>
  );
}

export function EquipmentForm({ initial }: { initial?: Values }) {
  const { t } = useI18n();
  const f = useForm(saveEquipment, initial ?? { quantity: "1", status: "active" });
  const editing = !!initial?.id;
  return (
    <form key={f.key} action={f.formAction} className="grid gap-4 sm:grid-cols-3">
      {editing && <input type="hidden" name="id" value={initial!.id!} />}
      <Field label={t("Code")} name="code" values={f.values} required placeholder="MQ3-01" />
      <Field label={t("Name")} name="name" values={f.values} required placeholder="Meta Quest 3" />
      <Field label={t("Category (optional)")} name="category" values={f.values} placeholder="VR" />
      <Field label={t("Quantity")} name="quantity" values={f.values} type="number" min={0} required />
      <Field label={t("Location (optional)")} name="location" values={f.values} placeholder={t("Office storage")} />
      <SelectField
        label={t("Status")}
        name="status"
        values={f.values}
        options={Object.entries(EQUIPMENT_STATUS_LABELS).map(([value, label]) => ({ value, label: t(label) }))}
      />
      <Field label={t("Notes (optional)")} name="notes" values={f.values} className="sm:col-span-3" />
      <div className="flex flex-col gap-2 sm:col-span-3">
        <FormMessage state={f.state} />
        <Submit pending={f.pending} label={editing ? t("Save changes") : t("Add equipment")} pendingLabel={t("Saving…")} />
      </div>
    </form>
  );
}
