"use client";

import { Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import type { FormState } from "@/app/actions/auth";
import { deleteSupplier, saveSupplier } from "@/app/actions/suppliers";
import { Field, Submit, useForm, type Values } from "@/components/form-fields";
import { FormMessage } from "@/components/form-message";
import { useI18n } from "@/components/i18n-provider";
import { Modal } from "@/components/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
        label={t("Company name")}
        name="companyName"
        values={f.values}
        required
        placeholder={t("e.g. Cairo AV Rentals")}
      />
      <Field label={t("Contact name")} name="name" values={f.values} required placeholder={t("e.g. Ahmed Hassan")} />
      <Field
        label={t("Phone number")}
        name="mobile"
        values={f.values}
        required
        type="tel"
        dir="ltr"
        placeholder="01012345678"
      />
      <Field
        label={t("Address (optional)")}
        name="address"
        values={f.values}
        placeholder={t("e.g. 12 Abbas El Akkad St, Nasr City, Cairo")}
      />
      <EquipmentInput initial={f.values.equipment} />
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

/** One "Add equipment" box with a plus button; each added item becomes a removable row. */
function EquipmentInput({ initial }: { initial?: string | null }) {
  const { t } = useI18n();
  const [items, setItems] = useState(() => (initial ?? "").split("\n").filter(Boolean));
  const [draft, setDraft] = useState("");
  const add = () => {
    const item = draft.trim();
    if (item && !items.includes(item)) setItems([...items, item]);
    setDraft("");
  };
  return (
    <div className="flex flex-col gap-2 sm:col-span-2">
      <Label>{t("Equipment we rent from them")}</Label>
      {items.length > 0 && (
        <ul className="flex flex-col divide-y rounded-md border">
          {items.map((item) => (
            <li key={item} className="flex items-center justify-between gap-2 py-1 ps-3 pe-1 text-sm">
              <input type="hidden" name="equipment" value={item} />
              {item}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t("Remove {name}", { name: item })}
                onClick={() => setItems(items.filter((i) => i !== item))}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            add();
          }}
          placeholder={t("Add equipment")}
          aria-label={t("Add equipment")}
        />
        {/* Text typed but not added with the plus button is still saved. */}
        <input type="hidden" name="equipment" value={draft} />
        <Button type="button" variant="outline" size="icon" onClick={add} aria-label={t("Add equipment")}>
          <Plus />
        </Button>
      </div>
    </div>
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
