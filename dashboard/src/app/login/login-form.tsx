"use client";

import { useActionState } from "react";
import { login } from "@/app/actions/auth";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          key={state?.email}
          id="email"
          name="email"
          autoComplete="username"
          defaultValue={state?.email}
          autoFocus
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <FormMessage state={state} />
      <Button type="submit" disabled={pending} size="lg">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
