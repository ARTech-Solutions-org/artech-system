"use client";

import {
  cancelFlag,
  moveStatus,
  raiseFlag,
  remindFlag,
  requestEquipment,
  resolveFlag,
  saveEquipment,
  saveGuide,
  saveInstallation,
  translateText,
} from "@/app/actions/work";
import { BellRing, Languages, Plus, X } from "lucide-react";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Field, SelectField, Submit, useForm, type Values } from "@/components/form-fields";
import { FormMessage } from "@/components/form-message";
import { useI18n } from "@/components/i18n-provider";
import { type Person, PeoplePicker } from "@/components/people-picker";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EQUIPMENT_STATUS_LABELS, FLAG_TYPE_LABELS } from "@/lib/format";
import type { Locale, Msg } from "@/lib/i18n";

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

/** `projectId` fixes the project (project page); otherwise `projects` offers an optional project to attach. */
export function RaiseFlagForm({
  projectId,
  projects,
  people,
  onSent,
}: {
  projectId?: string;
  projects?: { id: string; name: string }[];
  people: Person[];
  onSent?: () => void;
}) {
  const { t } = useI18n();
  const f = useForm(raiseFlag, { type: "needs_data" });
  useEffect(() => {
    if (f.state?.success) onSent?.();
  }, [f.state, onSent]);
  return (
    <form key={f.key} action={f.formAction} className="grid gap-4 sm:grid-cols-2">
      {projectId ? (
        <input type="hidden" name="projectId" value={projectId} />
      ) : (
        <SelectField
          label={t("Project (optional)")}
          name="projectId"
          values={f.values}
          defaultValue=""
          options={[
            { value: "", label: t("No project: general request") },
            ...(projects ?? []).map((p) => ({ value: p.id, label: p.name })),
          ]}
        />
      )}
      <SelectField
        label={t("Type")}
        name="type"
        values={f.values}
        options={Object.entries(FLAG_TYPE_LABELS).map(([value, label]) => ({ value, label: t(label) }))}
      />
      <div className="sm:col-span-2">
        <PeoplePicker
          label={t("Send to")}
          name="recipients"
          people={people}
          initial={f.values.recipients?.split(",").filter(Boolean)}
        />
      </div>
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
        <Submit pending={f.pending} label={t("Send request")} pendingLabel={t("Sending…")} variant="destructive" />
      </div>
    </form>
  );
}

/** Resolves one recipient's part. `label` names whose part when a head resolves it for someone else. */
export function ResolveFlagForm({ flagId, userId, label }: { flagId: string; userId: string; label: string }) {
  const { t } = useI18n();
  const f = useForm(resolveFlag);
  return (
    <form key={f.key} action={f.formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={flagId} />
      <input type="hidden" name="userId" value={userId} />
      <Field
        label={label}
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

export function RemindFlagForm({ flagId }: { flagId: string }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(remindFlag, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={flagId} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        <BellRing />
        {pending ? t("Sending…") : t("Send reminder")}
      </Button>
      <FormMessage state={state} />
    </form>
  );
}

/** "New request" button that opens the request form in a dialog. */
export function NewRequestButton(props: Omit<Parameters<typeof RaiseFlagForm>[0], "onSent">) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        {t("New request")}
      </Button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:pt-16"
          onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("New request")}
            className="w-full max-w-2xl rounded-xl border bg-background p-5 shadow-lg"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{t("New request")}</h2>
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label={t("Close")}>
                <X />
              </Button>
            </div>
            <RaiseFlagForm {...props} onSent={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}

export function CancelFlagForm({ flagId }: { flagId: string }) {
  const { t } = useI18n();
  const f = useForm(cancelFlag);
  return (
    <form key={f.key} action={f.formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={flagId} />
      <Field
        label={t("Reason (optional)")}
        name="reason"
        values={f.values}
        placeholder={t("e.g. Not needed anymore")}
        className="min-w-56 flex-1"
      />
      <Submit pending={f.pending} label={t("Cancel request")} pendingLabel={t("Saving…")} variant="outline" />
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
      <BilingualSteps values={f.values} />
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

const STEPS_PLACEHOLDER = {
  en: "1. Mount the screens\n2. Connect the NFC readers to the PC\n3. Start the app from the desktop shortcut",
  ar: "1. تركيب الشاشات\n2. توصيل قارئات NFC بالكمبيوتر\n3. تشغيل التطبيق من اختصار سطح المكتب",
};

function BilingualSteps({ values }: { values: Values }) {
  const { t } = useI18n();
  const refs = { en: useRef<HTMLTextAreaElement>(null), ar: useRef<HTMLTextAreaElement>(null) };
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<Msg>();

  const translateInto = (to: Locale) => {
    const from = to === "ar" ? "en" : "ar";
    const text = refs[from].current?.value.trim() ?? "";
    setError(undefined);
    if (!text) return setError("Write something to translate first.");
    startTransition(async () => {
      const result = await translateText(text, to);
      if (result.error) setError(result.error);
      else if (refs[to].current) refs[to].current.value = result.text;
    });
  };

  const box = (lang: Locale, name: string, label: Msg, button: Msg) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`steps-${lang}`}>{t(label)}</Label>
      <Textarea
        id={`steps-${lang}`}
        ref={refs[lang]}
        name={name}
        dir={lang === "ar" ? "rtl" : "ltr"}
        lang={lang}
        rows={8}
        defaultValue={values[name] ?? ""}
        placeholder={STEPS_PLACEHOLDER[lang]}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        disabled={pending}
        onClick={() => translateInto(lang === "en" ? "ar" : "en")}
      >
        <Languages />
        {pending ? t("Translating…") : t(button)}
      </Button>
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-4 sm:grid-cols-2">
        {box("en", "steps", "Installation steps (English)", "Translate to Arabic")}
        {box("ar", "stepsAr", "Installation steps (Arabic)", "Translate to English")}
      </div>
      <p className="text-xs text-muted-foreground">
        {t("Write in either language. The other one is translated automatically when you save if it's empty.")}
      </p>
      {error && <p className="text-sm text-destructive">{t(error)}</p>}
    </div>
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
        <Submit
          pending={f.pending}
          label={editing ? t("Save changes") : t("Add equipment")}
          pendingLabel={t("Saving…")}
        />
      </div>
    </form>
  );
}
