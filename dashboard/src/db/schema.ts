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

export const flagStatus = pgEnum("flag_status", ["open", "resolved"]);

export const equipmentStatus = pgEnum("equipment_status", ["active", "maintenance", "broken", "retired"]);

export const equipmentRequestStatus = pgEnum("equipment_request_status", [
  "approved",
  "waitlisted",
  "returned",
  "cancelled",
]);

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
    department: department("department").notNull(),
    isHead: boolean("is_head").notNull().default(false),
    status: userStatus("status").notNull().default("pending"),
    phone: text("phone"),
    approvedBy: uuid("approved_by").references((): AnyPgColumn => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_email_unique").on(sql`lower(${t.email})`)],
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    clientName: text("client_name"),
    description: text("description"),
    assetsNotes: text("assets_notes"),
    designLink: text("design_link"),
    contentLink: text("content_link"),
    referenceLink: text("reference_link"),
    voiceNoteLink: text("voice_note_link"),
    status: projectStatus("status").notNull().default("brief_submitted"),
    devDeadline: date("dev_deadline"),
    createdBy: uuid("created_by").references(() => users.id),
    assignedBy: uuid("assigned_by").references(() => users.id),
    assignedAt: timestamp("assigned_at", { withTimezone: true }),
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
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    type: flagType("type").notNull(),
    details: text("details").notNull(),
    ownerDepartment: department("owner_department").notNull(),
    status: flagStatus("status").notNull().default("open"),
    raisedBy: uuid("raised_by")
      .notNull()
      .references(() => users.id),
    resolution: text("resolution"),
    resolvedBy: uuid("resolved_by").references(() => users.id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("flags_project_idx").on(t.projectId), index("flags_open_idx").on(t.status, t.ownerDepartment)],
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

export const installations = pgTable(
  "installations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    steps: text("steps"),
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
