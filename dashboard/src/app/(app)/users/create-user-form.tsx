"use client";

import { useActionState } from "react";
import { createUser } from "@/app/actions/users";
import { FormMessage, selectClass } from "@/components/form-message";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEPARTMENT_LABELS, type Department } from "@/lib/permissions";

export function CreateUserForm({ departments, canSetHead }: { departments: Department[]; canSetHead: boolean }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(createUser, undefined);
  const v = state?.values ?? {};

  return (
    <form key={JSON.stringify(v)} action={action} className="grid gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">{t("Full name")}</Label>
        <Input id="name" name="name" defaultValue={v.name} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">{t("Email")}</Label>
        <Input id="email" name="email" type="email" dir="ltr" defaultValue={v.email} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="phone">{t("Phone (optional)")}</Label>
        <Input id="phone" name="phone" dir="ltr" defaultValue={v.phone} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="department">{t("Department")}</Label>
        <select id="department" name="department" defaultValue={v.department} className={selectClass} required>
          {departments.map((d) => (
            <option key={d} value={d}>
              {t(DEPARTMENT_LABELS[d])}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">{t("Temporary password")}</Label>
        <Input id="password" name="password" dir="ltr" minLength={8} required />
      </div>
      {canSetHead && (
        <label className="flex items-center gap-2 self-end pb-1.5 text-sm">
          <input type="checkbox" name="isHead" defaultChecked={v.isHead === "on"} /> {t("Department head")}
        </label>
      )}
      <div className="flex flex-col gap-2 sm:col-span-2">
        <FormMessage state={state} />
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? t("Adding…") : t("Add member")}
        </Button>
      </div>
    </form>
  );
}
