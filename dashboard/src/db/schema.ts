import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const department = pgEnum("department", ["business", "accounting", "development", "operations"]);

export const userStatus = pgEnum("user_status", ["pending", "active", "disabled"]);

export const projectStatus = pgEnum("project_status", [
  "brief_submitted",
  "assigned",
  "in_development",
  "internal_review",
  "ready_for_installation",
  "installing",
  "installed",
  "completed",
  "on_hold",
  "cancelled",
]);

export const memberRole = pgEnum("member_role", ["lead", "member"]);

export const milestoneStatus = pgEnum("milestone_status", ["pending", "done"]);

export const flagType = pgEnum("flag_type", ["blocked", "needs_data", "needs_assets", "other"]);

export const flagStatus = pgEnum("flag_status", ["open", "resolved", "cancelled"]);

export const equipmentStatus = pgEnum("equipment_status", ["active", "maintenance", "broken", "retired"]);

export const equipmentRequestStatus = pgEnum("equipment_request_status", [
  "approved",
  "waitlisted",
  "returned",
  "cancelled",
]);

export const financeEntryKind = pgEnum("finance_entry_kind", ["payment", "expense"]);

export const installationStatus = pgEnum("installation_status", ["scheduled", "in_progress", "done"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash"),
    department: department("department"),
    isHead: boolean("is_head").notNull().default(false),
    isSuperAdmin: boolean("is_super_admin").notNull().default(false),
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    status: userStatus("status").notNull().default("pending"),
    phone: text("phone"),
    // Language for emails; follows the language picked in the dashboard.
    locale: text("locale").notNull().default("en"),
    approvedBy: uuid("approved_by").references((): AnyPgColumn => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("users_email_unique").on(sql`lower(${t.email})`),
    check("users_department_required", sql`${t.isSuperAdmin} or ${t.department} is not null`),
  ],
);

// id is the SHA-256 of the cookie token, so a leaked database row cannot be used as a cookie.
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    clientName: text("client_name"),
    description: text("description"),
    // Free text, one link or note per line.
    refs: text("refs"),
    design: text("design"),
    content: text("content"),
    otherData: text("other_data"),
    status: projectStatus("status").notNull().default("brief_submitted"),
    devDeadline: date("dev_deadline"),
    createdBy: uuid("created_by").references(() => users.id),
    assignedBy: uuid("assigned_by").references(() => users.id),
    assignedAt: timestamp("assigned_at", { withTimezone: true }),
    // Secret part of the client's feedback link; null means the link is off.
    clientToken: text("client_token").unique(),
    ...timestamps,
  },
  (t) => [uniqueIndex("projects_name_unique").on(sql`lower(${t.name})`), index("projects_status_idx").on(t.status)],
);

// Restricted: Business, Accounting, Tech Head only.
export const projectFinance = pgTable("project_finance", {
  projectId: uuid("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  budget: numeric("budget", { precision: 14, scale: 2 }),
  currency: text("currency").notNull().default("EGP"),
  notes: text("notes"),
  updatedBy: uuid("updated_by").references(() => users.id),
  ...timestamps,
});

// Restricted like project_finance.
export const financeEntries = pgTable(
  "finance_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    kind: financeEntryKind("kind").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    entryDate: date("entry_date").notNull(),
    description: text("description").notNull(),
    reference: text("reference"),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    check("finance_entries_amount_positive", sql`${t.amount} > 0`),
    index("finance_entries_project_idx").on(t.projectId),
  ],
);

// Restricted: hidden from Developers.
export const projectSchedule = pgTable("project_schedule", {
  projectId: uuid("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  installationDate: date("installation_date"),
  locationLink: text("location_link"),
  notes: text("notes"),
  updatedBy: uuid("updated_by").references(() => users.id),
  ...timestamps,
});

export const progressReviews = pgTable(
  "progress_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    reviewDate: date("review_date").notNull(),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("progress_reviews_project_idx").on(t.projectId)],
);

export const projectMembers = pgTable(
  "project_members",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: memberRole("role").notNull().default("member"),
    addedBy: uuid("added_by").references(() => users.id),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.userId] }), index("project_members_user_idx").on(t.userId)],
);

export const milestones = pgTable(
  "milestones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    dueDate: date("due_date"),
    status: milestoneStatus("status").notNull().default("pending"),
    sortOrder: integer("sort_order").notNull().default(0),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("milestones_project_idx").on(t.projectId)],
);

export const flags = pgTable(
  "flags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Optional: a flag can also be a general request between people.
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    type: flagType("type").notNull(),
    details: text("details").notNull(),
    // Only set on flags raised before flags were sent to people.
    ownerDepartment: department("owner_department"),
    // Resolved once every recipient has resolved their part; cancelled by the sender.
    status: flagStatus("status").notNull().default("open"),
    raisedBy: uuid("raised_by")
      .notNull()
      .references(() => users.id),
    // Set when the flag is cancelled (optional reason).
    resolution: text("resolution"),
    resolvedBy: uuid("resolved_by").references(() => users.id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    lastRemindedAt: timestamp("last_reminded_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("flags_project_idx").on(t.projectId), index("flags_status_idx").on(t.status)],
);

/** One row per person a flag was sent to; each resolves their own part. */
export const flagRecipients = pgTable(
  "flag_recipients",
  {
    flagId: uuid("flag_id")
      .notNull()
      .references(() => flags.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    status: flagStatus("status").notNull().default("open"),
    resolution: text("resolution"),
    resolvedBy: uuid("resolved_by").references(() => users.id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.flagId, t.userId] }), index("flag_recipients_user_idx").on(t.userId, t.status)],
);

// Free units are computed as quantity minus approved requests, not stored.
export const equipment = pgTable(
  "equipment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    category: text("category"),
    quantity: integer("quantity").notNull().default(1),
    location: text("location"),
    status: equipmentStatus("status").notNull().default("active"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [check("equipment_quantity_non_negative", sql`${t.quantity} >= 0`)],
);

export const equipmentRequests = pgTable(
  "equipment_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    equipmentId: uuid("equipment_id")
      .notNull()
      .references(() => equipment.id),
    requestedBy: uuid("requested_by")
      .notNull()
      .references(() => users.id),
    quantity: integer("quantity").notNull().default(1),
    neededFrom: date("needed_from"),
    neededUntil: date("needed_until"),
    status: equipmentRequestStatus("status").notNull(),
    notes: text("notes"),
    returnedAt: timestamp("returned_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    check("equipment_requests_quantity_positive", sql`${t.quantity} > 0`),
    index("equipment_requests_equipment_idx").on(t.equipmentId, t.status),
    index("equipment_requests_project_idx").on(t.projectId),
  ],
);

// Client feedback: every comment or edit the client asks for is one item, grouped into revision rounds.
export const feedbackSource = pgEnum("feedback_source", [
  "whatsapp",
  "call",
  "email",
  "meeting",
  "site_visit",
  "client_link",
]);
export const feedbackType = pgEnum("feedback_type", ["design", "content", "technical", "new_request", "general"]);
export const feedbackPriority = pgEnum("feedback_priority", ["normal", "urgent"]);
// `awaiting_scope`: a new request not in the brief, waiting for Business to decide before anyone works on it.
export const feedbackStatus = pgEnum("feedback_status", [
  "awaiting_scope",
  "new",
  "in_progress",
  "done",
  "client_approved",
  "rejected",
]);
export const scopeDecision = pgEnum("scope_decision", ["included", "extra_cost", "rejected"]);
export const deadlineDecision = pgEnum("deadline_decision", ["applied", "declined"]);

export const feedbackRounds = pgTable(
  "feedback_rounds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("feedback_rounds_project_number_unique").on(t.projectId, t.number)],
);

export const feedbackItems = pgTable(
  "feedback_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    roundId: uuid("round_id")
      .notNull()
      .references(() => feedbackRounds.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    source: feedbackSource("source").notNull(),
    type: feedbackType("type").notNull(),
    priority: feedbackPriority("priority").notNull().default("normal"),
    status: feedbackStatus("status").notNull(),
    receivedOn: date("received_on").notNull(),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    // Set when the client wrote it through their feedback link.
    clientName: text("client_name"),
    scopeDecision: scopeDecision("scope_decision"),
    scopeNote: text("scope_note"),
    scopeDecidedBy: uuid("scope_decided_by").references(() => users.id, { onDelete: "set null" }),
    scopeDecidedAt: timestamp("scope_decided_at", { withTimezone: true }),
    // Extra days a developer says this item adds to the dev deadline; the Tech Head applies or declines it.
    extraDays: integer("extra_days"),
    deadlineNote: text("deadline_note"),
    deadlineDecision: deadlineDecision("deadline_decision"),
    deadlineDecidedBy: uuid("deadline_decided_by").references(() => users.id, { onDelete: "set null" }),
    doneBy: uuid("done_by").references(() => users.id, { onDelete: "set null" }),
    doneAt: timestamp("done_at", { withTimezone: true }),
    // approvedBy is null with approvedAt set when the client approved it through their link.
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectReason: text("reject_reason"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    check("feedback_items_extra_days_positive", sql`${t.extraDays} is null or ${t.extraDays} > 0`),
    index("feedback_items_project_idx").on(t.projectId, t.status),
    index("feedback_items_assignee_idx").on(t.assigneeId, t.status),
  ],
);

export const feedbackComments = pgTable(
  "feedback_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => feedbackItems.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    // Set instead of userId for comments the client wrote through their link.
    clientName: text("client_name"),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("feedback_comments_item_idx").on(t.itemId)],
);

// Outside companies we rent equipment from; `equipment` lists what we rent from each one.
export const suppliers = pgTable(
  "suppliers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyName: text("company_name").notNull().default(""),
    name: text("name").notNull(),
    mobile: text("mobile").notNull(),
    address: text("address"),
    equipment: text("equipment")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("suppliers_name_idx").on(t.name)],
);

export const installations = pgTable(
  "installations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    steps: text("steps"),
    stepsAr: text("steps_ar"),
    demoVideoUrl: text("demo_video_url"),
    leadTechnicianId: uuid("lead_technician_id").references(() => users.id),
    status: installationStatus("status").notNull().default("scheduled"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    notes: text("notes"),
    updatedBy: uuid("updated_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [uniqueIndex("installations_project_unique").on(t.projectId)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: uuid("user_id").references(() => users.id),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    changes: jsonb("changes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_entity_idx").on(t.entity, t.entityId), index("audit_log_created_idx").on(t.createdAt)],
);

export const notificationStatus = pgEnum("notification_status", ["pending", "sent", "failed", "skipped"]);

// One row per email handed to n8n. `dedupeKey` stops scheduled reminders from going out twice for the same day.
export const notifications = pgTable(
  "notifications",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    event: text("event").notNull(),
    dedupeKey: text("dedupe_key"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    email: text("email").notNull(),
    subject: text("subject").notNull(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    status: notificationStatus("status").notNull().default("pending"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("notifications_dedupe_unique").on(t.dedupeKey, t.email),
    index("notifications_created_idx").on(t.createdAt),
  ],
);
