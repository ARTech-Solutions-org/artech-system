import type { Msg } from "@/lib/i18n";

export const CURRENCIES = ["EGP", "USD", "EUR", "GBP", "SAR", "AED", "KWD", "QAR"] as const;
export type Currency = (typeof CURRENCIES)[number];

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
} as const satisfies Record<string, Msg>;

export type ProjectStatus = keyof typeof PROJECT_STATUS_LABELS;

export const FLAG_TYPE_LABELS = {
  blocked: "Blocked",
  needs_data: "Needs data",
  needs_assets: "Needs assets",
  other: "Other",
} as const satisfies Record<string, Msg>;

export const EQUIPMENT_STATUS_LABELS = {
  active: "Active",
  maintenance: "Maintenance",
  broken: "Broken",
  retired: "Retired",
} as const satisfies Record<string, Msg>;

export const REQUEST_STATUS_LABELS = {
  approved: "Approved",
  waitlisted: "Waitlisted",
  returned: "Returned",
  cancelled: "Cancelled",
} as const satisfies Record<string, Msg>;

export const USER_STATUS_LABELS = {
  pending: "Pending",
  active: "Active",
  disabled: "Disabled",
} as const satisfies Record<string, Msg>;

/** Statuses that still count toward a developer's workload. */
export const ACTIVE_STATUSES: ProjectStatus[] = [
  "assigned",
  "in_development",
  "internal_review",
  "ready_for_installation",
  "installing",
];
