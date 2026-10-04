import type { FormState } from "@/app/actions/auth";

export function FormMessage({ state }: { state: FormState }) {
  if (state?.error) return <p className="text-sm text-destructive">{state.error}</p>;
  if (state?.success) return <p className="text-sm text-green-600">{state.success}</p>;
  return null;
}

export const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50";
