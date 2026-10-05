"use client";

import { useActionState, useId, useRef } from "react";
import type { FormState } from "@/app/actions/auth";
import { DictateButton } from "@/components/dictate-button";
import { selectClass } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type Values = Record<string, string | null | undefined>;

export function Field({
  label,
  name,
  values,
  hint,
  multiline,
  rows = 3,
  className,
  voice = multiline,
  ...props
}: {
  label: string;
  name: string;
  values: Values;
  hint?: string;
  multiline?: boolean;
  rows?: number;
  className?: string;
  /** Show a microphone button that types what you say. On by default for multi-line fields. */
  voice?: boolean;
} & Omit<React.ComponentProps<"input">, "name" | "defaultValue">) {
  const id = useId();
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <div className="flex min-h-6 items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {voice && <DictateButton target={ref} />}
      </div>
      {multiline ? (
        <Textarea
          ref={ref}
          id={id}
          name={name}
          defaultValue={values[name] ?? ""}
          rows={rows}
          placeholder={props.placeholder}
          required={props.required}
        />
      ) : (
        <Input ref={ref} id={id} name={name} defaultValue={values[name] ?? ""} {...props} />
      )}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function SelectField({
  label,
  name,
  values,
  options,
  defaultValue,
  className,
}: {
  label: string;
  name: string;
  values: Values;
  options: { value: string; label: string; disabled?: boolean }[];
  defaultValue?: string;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <Label htmlFor={id}>{label}</Label>
      <select id={id} name={name} defaultValue={values[name] ?? defaultValue} className={selectClass}>
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Submit({
  pending,
  label,
  pendingLabel,
  variant,
}: {
  pending: boolean;
  label: string;
  pendingLabel: string;
  variant?: "default" | "outline" | "destructive" | "secondary";
}) {
  return (
    <Button type="submit" disabled={pending} variant={variant} className="self-start">
      {pending ? pendingLabel : label}
    </Button>
  );
}

/** Keeps typed values after a failed submit; React resets forms once an action finishes. */
export function useForm(action: (s: FormState, f: FormData) => Promise<FormState>, initial: Values = {}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const values: Values = state?.values ?? initial;
  return { state, formAction, pending, values, key: JSON.stringify(values) };
}
