"use client";

import type { FormState } from "@/app/actions/auth";
import { useI18n } from "@/components/i18n-provider";

export function FormMessage({ state }: { state: FormState }) {
  const { tLoose } = useI18n();
  if (state?.error) return <p className="text-sm text-destructive">{tLoose(state.error, state.vars)}</p>;
  if (state?.success) return <p className="text-sm text-emerald-400">{tLoose(state.success, state.vars)}</p>;
  return null;
}

export const selectClass =
  "h-9 w-full rounded-[var(--radius)] border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50";
