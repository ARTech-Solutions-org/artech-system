"use client";

import { useActionState } from "react";
import { resetPassword, updateUser } from "@/app/actions/users";
import { FormMessage, selectClass } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEPARTMENT_LABELS, DEPARTMENTS, type Department } from "@/lib/permissions";

type EditableUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  department: Department | null;
  isHead: boolean;
  isSuperAdmin: boolean;
};

export function EditUserForm({ user, canSetHead }: { user: EditableUser; canSetHead: boolean }) {
  const [state, action, pending] = useActionState(updateUser, undefined);
  const showRoleFields = canSetHead && !user.isSuperAdmin;

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="id" value={user.id} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Full name</Label>
        <Input id="name" name="name" defaultValue={user.name} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" defaultValue={user.email} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" name="phone" defaultValue={user.phone ?? ""} />
      </div>
      {showRoleFields && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="department">Department</Label>
            <select id="department" name="department" defaultValue={user.department ?? ""} className={selectClass}>
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {DEPARTMENT_LABELS[d]}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isHead" defaultChecked={user.isHead} /> Department head
          </label>
        </>
      )}
      <div className="flex flex-col gap-2 sm:col-span-2">
        <FormMessage state={state} />
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

export function ResetPasswordForm({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState(resetPassword, undefined);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={userId} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">New temporary password</Label>
        <Input id="password" name="password" minLength={8} required className="max-w-xs" />
      </div>
      <FormMessage state={state} />
      <Button type="submit" variant="outline" disabled={pending} className="self-start">
        {pending ? "Resetting…" : "Reset password"}
      </Button>
    </form>
  );
}
