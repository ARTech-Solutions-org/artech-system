"use client";

import { Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import type { FormState } from "@/app/actions/auth";
import { deleteSupplier, saveSupplier } from "@/app/actions/suppliers";
import { Field, Submit, useForm, type Values } from "@/components/form-fields";
import { FormMessage } from "@/components/form-message";
import { useI18n } from "@/components/i18n-provider";
import { Modal } from "@/components/modal";
import { Button } from "@/components/ui/button";

export function SupplierForm({ initial, onSaved }: { initial?: Values; onSaved?: () => void }) {
  const { t } = useI18n();
  const f = useForm(saveSupplier, initial);
  const editing = !!initial?.id;
  useEffect(() => {
    if (f.state?.success) onSaved?.();
  }, [f.state, onSaved]);
  return (
    <form key={f.key} action={f.formAction} className="grid gap-4 sm:grid-cols-2">
      {editing && <input type="hidden" name="id" value={initial!.id!} />}
      <Field
        label={t("Supplier name")}
        name="name"
        values={f.values}
        required
        placeholder={t("e.g. Cairo AV Rentals")}
      />
      <Field
        label={t("Mobile number")}
        name="mobile"
        values={f.values}
        required
        type="tel"
        dir="ltr"
        placeholder="01012345678"
      />
      <Field
        label={t("Equipment we rent from them")}
        name="equipment"
        values={f.values}
        multiline
        rows={4}
        voice={false}
        hint={t("One item per line.")}
        placeholder={t("e.g. LED screen 3x2 m\nProjector 10,000 lumens")}
        className="sm:col-span-2"
      />
      <Field label={t("Notes (optional)")} name="notes" values={f.values} className="sm:col-span-2" />
      <div className="flex flex-col gap-2 sm:col-span-2">
        <FormMessage state={f.state} />
        <Submit
          pending={f.pending}
          label={editing ? t("Save changes") : t("Add supplier")}
          pendingLabel={t("Saving…")}
        />
      </div>
    </form>
  );
}

export function AddSupplierButton() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        {t("Add supplier")}
      </Button>
      <Modal open={open} onClose={close} title={t("Add supplier")}>
        <SupplierForm onSaved={close} />
      </Modal>
    </>
  );
}

export function DeleteSupplierButton({ id, name }: { id: string; name: string }) {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  const [state, setState] = useState<FormState>();
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="destructive"
        size="sm"
        className="self-start"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(t("Remove {name} from the supplier list?", { name }))) return;
          start(async () => setState(await deleteSupplier(id)));
        }}
      >
        <Trash2 />
        {t("Remove supplier")}
      </Button>
      <FormMessage state={state} />
    </div>
  );
}
