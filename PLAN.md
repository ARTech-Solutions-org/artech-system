# Studio OS — Dashboard + Postgres Plan

## Goal

Replace the Google Sheets + n8n forms system with:

- **Postgres** — single source of truth for all data.
- **Dashboard (Next.js)** — login, role-based views, all actions, permission enforcement.
- **n8n** — automations only: notifications, reminders, schedules, Google Sheets export.
- **Google Sheets** — read-only export of Projects + assigned developers for reporting.

## Real-life workflow

1. **Business** submits the brief: client, description, design/content links, budget, real installation date, progress-showing dates.
2. **Tech Head** assigns developer(s), development deadline, and milestones.
3. **Developer** works on the project, requests equipment (auto-approved when free), raises flags (blocked / needs data / needs assets), writes installation steps, adds a demo video recorded on the same setup.
4. **Operations** sees the real installation date, equipment list, steps, and demo video, then installs.

## Roles

Departments: Business, Accounting, Development, Operations (~3 people each).
Each department has a head who approves members and sets their access level:
Business Head, Accountant Manager, Tech Head, Operations Manager.

| | Business | Accounting | Tech Head | Developer | Operations |
|---|---|---|---|---|---|
| Create / edit brief | edit | view | view | view (assigned only) | view |
| Budget | edit | edit | view | hidden | hidden |
| Real installation date | edit | view | view | hidden | view |
| Assign developers, dev deadline, milestones | view | — | edit (only role) | view | — |
| Add members to a project mid-work | — | — | yes | — | — |
| Request equipment (auto-approve if free) | — | — | yes | yes | yes |
| Raise flags | — | — | yes | yes | yes |
| Installation steps + demo video | view | — | edit | edit | view |
| Manage own department's members | Business Head | Accountant Manager | Tech Head | — | Operations Manager |

Developers only see projects they are a member of.
Equipment hand-off at installation is handled on the ground (out of scope for now).

## Architecture

```
Staff ──> Dashboard (Next.js: UI + API + auth + permissions) ──> Postgres
                 │
                 └── events (project.created, flag.raised, ...) ──> n8n
                                                                    ├── Google Sheets export
                                                                    ├── Notifications
                                                                    └── Schedules / reminders
```

All services run in one `docker-compose.yml`: `postgres`, `n8n`, `dashboard`.

## Phases

Each phase ends with a demo and your sign-off before the next starts.

### Phase 0 — Foundation
- Git repo for the project; archive the old patch scripts into `legacy/`.
- Add Postgres to `docker-compose.yml` with a persistent volume and daily backups.
- Scaffold the Next.js dashboard (TypeScript, Tailwind, shadcn/ui, Drizzle ORM).
- n8n stores its own data in Postgres (database `n8n`), covered by the same backups.
- **Done when:** `docker compose up` starts Postgres and n8n, and the dashboard (run with `npm run dev`; containerized in Phase 8) shows both as healthy.
- **Status:** done.

### Phase 1 — Database + data import
- Tables: `users`, `departments`, `projects`, `project_members`, `project_finance`,
  `project_schedule`, `milestones`, `flags`, `equipment`, `equipment_requests`,
  `installations`, `audit_log`.
- No import: the old system never went live. Tables start empty; data is entered through the dashboard.
- Schema: `dashboard/src/db/schema.ts`, migrations in `dashboard/drizzle/` (`npm run db:generate`, `npm run db:migrate`).
- **Status:** done.

### Phase 2 — Login + user management
- Login, sessions, role and department per user.
- Department heads invite members, approve them, set access level, deactivate them.
- Permission layer on the server: restricted fields are never sent to unauthorized roles.
- **Done when:** each test user logs in and sees only what their role allows.
- Email + password accounts (scrypt), database sessions, forced password change for new/reset accounts.
  Super admin seeded with `npm run db:seed-admin` (login `admin`, change the default password before go-live).
  Super admin manages everyone and sets heads; heads add/edit/reset/disable members of their own department.
- **Status:** done.

### Phase 3 — Business + Accounting + Tech Head
- Business: brief form, project list, installation date and progress dates.
- Accounting: budget / payments view and editing.
- Tech Head: unassigned briefs queue, assign developers, dev deadline, milestones, add members mid-project, team workload.
- **Done when:** a brief can go from created to assigned with correct visibility at each step.
- Brief fields: name, client, description, references, design, content, other data (one link or note per line).
- Budget with currency dropdown; Accounting records payments received and expenses (any currency);
  Finance page shows budget / received / outstanding / expenses per project and totals per currency.
- Tech Head: Assignments page (queue + workload); on the project: assign developers + lead, dev deadline,
  milestones, add/remove members mid-project.
- **Status:** done.

### Phase 4 — Developer workspace
- "My projects" with dev deadline and milestones.
- Equipment requests with automatic approval when stock is free (transaction-safe).
- Flags: raise, assign to owning department, resolve.
- Installation guide: steps + demo video link.
- **Done when:** a developer can take an assigned project to "Ready for Installation".

### Phase 5 — Operations
- Installation calendar with real dates.
- Per-project view: equipment list, steps, demo video, location link.
- Mark installing / installed.
- **Done when:** the full pipeline runs end to end in the dashboard.

### Phase 6 — n8n automations
- Dashboard sends events to n8n webhooks.
- Notifications: assigned, flag raised/resolved, ready for installation, deadlines approaching.
- Scheduled jobs: overdue reminders, equipment auto-release, weekly summary.
- Google Sheets export: Projects + assigned developers.
- Retire the old Projects Hub form workflow.
- **Done when:** notifications arrive and the export sheet stays in sync.

### Phase 7 — Overview + audit
- Overview dashboard per role (status counts, upcoming deadlines/installations, open flags, equipment usage).
- Audit log viewer (who changed what, when).
- Automation health page (n8n workflow status, recent failures).

### Phase 8 — Pilot + go-live
- Deploy where the team can reach it (see "What I need from you").
- One week running with real users, fix feedback.
- Switch off the old system.

## Pipeline statuses

Brief Submitted → Assigned → In Development → (Flagged) → Internal Review →
Ready for Installation → Installing → Installed → Completed
