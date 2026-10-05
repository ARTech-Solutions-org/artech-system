export type FinanceEntryLike = { kind: "payment" | "expense"; amount: string; currency: string };

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

/** Budget minus payments received in the budget's currency; payments in other currencies are not converted. */
export function outstanding(budget: string | null, currency: string, totals: CurrencyTotals): number | null {
  if (budget === null) return null;
  return Number(budget) - (totals[currency]?.received ?? 0);
}
