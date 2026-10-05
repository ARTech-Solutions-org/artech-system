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

export const FEEDBACK_STATUS_LABELS = {
  awaiting_scope: "Waiting for scope decision",
  new: "New",
  in_progress: "In progress",
  done: "Done, waiting for client",
  client_approved: "Client approved",
  rejected: "Not doing",
} as const satisfies Record<string, Msg>;

export type FeedbackStatus = keyof typeof FEEDBACK_STATUS_LABELS;
export const OPEN_FEEDBACK: FeedbackStatus[] = ["awaiting_scope", "new", "in_progress", "done"];

/** What the client sees on their feedback link: no internal steps. */
export const CLIENT_FEEDBACK_STATUS_LABELS = {
  awaiting_scope: "Under review",
  new: "Received by our team",
  in_progress: "In progress",
  done: "Ready for your review",
  client_approved: "Approved",
  rejected: "Not included",
} as const satisfies Record<FeedbackStatus, Msg>;

export const FEEDBACK_TYPE_LABELS = {
  design: "Design",
  content: "Content",
  technical: "Technical",
  new_request: "New request (not in the brief)",
  general: "General",
} as const satisfies Record<string, Msg>;

export const FEEDBACK_SOURCE_LABELS = {
  whatsapp: "WhatsApp",
  call: "Phone call",
  email: "Email",
  meeting: "Meeting",
  site_visit: "Site visit",
  client_link: "Client link",
} as const satisfies Record<string, Msg>;

export const SCOPE_DECISION_LABELS = {
  included: "Included in the project",
  extra_cost: "Extra cost",
  rejected: "Rejected",
} as const satisfies Record<string, Msg>;

/** Statuses that still count toward a developer's workload. */
export const ACTIVE_STATUSES: ProjectStatus[] = [
  "assigned",
  "in_development",
  "internal_review",
  "ready_for_installation",
  "installing",
];
