export const CURRENCIES = ["EGP", "USD", "EUR", "GBP", "SAR", "AED", "KWD", "QAR"] as const;
export type Currency = (typeof CURRENCIES)[number];

export function formatMoney(amount: string | number | null | undefined, currency: string): string {
  if (amount === null || amount === undefined || amount === "") return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(
    Number(amount),
  );
}

/** Formats a `YYYY-MM-DD` date column without shifting it by timezone. */
export function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleString("en-GB", { timeZone: "Africa/Cairo", dateStyle: "medium", timeStyle: "short" });
}

export const PROJECT_STATUS_LABELS = {
  brief_submitted: "Brief submitted",
  assigned: "Assigned",
  in_development: "In development",
  internal_review: "Internal review",
  ready_for_installation: "Ready for installation",
  installing: "Installing",
  installed: "Installed",
  completed: "Completed",
  on_hold: "On hold",
  cancelled: "Cancelled",
} as const;

export type ProjectStatus = keyof typeof PROJECT_STATUS_LABELS;

/** Statuses that still count toward a developer's workload. */
export const ACTIVE_STATUSES: ProjectStatus[] = [
  "assigned",
  "in_development",
  "internal_review",
  "ready_for_installation",
  "installing",
];
