import { z } from "zod";
import { CURRENCIES } from "@/lib/format";

export type FinanceEntryLike = { kind: "payment" | "expense"; amount: string; currency: string };

export const financeEntryRowSchema = z.object({
  kind: z.enum(["payment", "expense"], "Pick payment or expense."),
  amount: z.preprocess(
    (v) => (typeof v === "string" ? v.replace(/,/g, "").trim() : v),
    z.string().regex(/^\d+(\.\d{1,2})?$/, "Enter an amount like 15000 or 15000.50."),
  ),
  currency: z.enum(CURRENCIES, "Pick a currency."),
  entryDate: z.iso.date("Enter the date."),
  description: z.string().trim().min(2, "Describe the entry."),
  reference: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (typeof v === "string" ? v.trim() : "") || null),
});

export type FinanceEntryRow = z.output<typeof financeEntryRowSchema>;

export type CurrencyTotals = Record<string, { received: number; expenses: number }>;

export function totalsByCurrency(entries: FinanceEntryLike[]): CurrencyTotals {
  const totals: CurrencyTotals = {};
  for (const e of entries) {
    const t = (totals[e.currency] ??= { received: 0, expenses: 0 });
    if (e.kind === "payment") t.received += Number(e.amount);
    else t.expenses += Number(e.amount);
  }
  return totals;
}

/** Collections only. Stays 0 until a payment is recorded. */
export function revenueOf(totals?: { received: number }): number {
  return totals?.received ?? 0;
}

/** Revenue minus expenses. Negative if costs exceed collections. */
export function profitOf(totals?: { received: number; expenses: number }): number {
  return revenueOf(totals) - (totals?.expenses ?? 0);
}

/** Budget minus payments received in the budget's currency; payments in other currencies are not converted. */
export function outstanding(budget: string | null, currency: string, totals: CurrencyTotals): number | null {
  if (budget === null) return null;
  return Number(budget) - revenueOf(totals[currency]);
}
