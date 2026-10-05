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
- **Status: done.** Home shows "My projects" (next milestone, open flags, deadline). Equipment page lists stock, who is using it and the waitlist; heads of Development/Operations add and edit items (seeded: printer, Meta Quest 3, 3 NFC readers via `npm run db:seed-equipment`). Requests are approved when units are free, otherwise waitlisted and approved automatically, oldest first, when units come back. Flags page shows open flags for your department or that you raised. Status flow: developer moves Assigned → In development → Internal review; Tech Head approves to Ready for installation (requires steps and demo video link) or sends back.

### Phase 5 — Operations
- Installation calendar with real dates.
- Per-project view: equipment list, steps, demo video, location link.
- Mark installing / installed.
- **Done when:** the full pipeline runs end to end in the dashboard.
- **Status: done.** Installations page: month calendar (weeks start Saturday), installing now, the month's list with lead technician, guide/demo readiness, equipment and location, and projects with no date yet. Operations starts the installation, marks it installed (or pauses back to ready), and records the lead technician and an installation report on the project page. Operations' Home shows upcoming installations.
- **Arabic:** every page has an English/Arabic switch (sidebar and login page; saved in a cookie). Arabic pages are right-to-left with IBM Plex Sans Arabic. Translations live in `dashboard/src/lib/i18n/ar.ts`, keyed by the English text; the type checker fails if any UI text has no Arabic entry.

### Phase 6 — n8n automations
- Dashboard sends events to n8n webhooks.
- Notifications: assigned, flag raised/resolved, ready for installation, deadlines approaching.
- Scheduled jobs: overdue reminders, equipment auto-release, weekly summary.
- Google Sheets export: Projects + assigned developers.
- Retire the old Projects Hub form workflow.
- **Done when:** notifications arrive and the export sheet stays in sync.
- **Status: done (Sheets export deferred).** Emails go out in each person's dashboard language. The dashboard writes each email, logs it in `notifications` and hands the batch to the n8n workflow "[Studio OS] Send email", which sends it over SMTP. n8n runs "Daily reminders" (8:00 Cairo: dev deadlines in 3 days/1 day/overdue, installations in 2 days, past installation dates, equipment not returned) and "Weekly summary" (Sunday 9:00, to heads and admins) by calling `/api/automations/daily|weekly` with a shared secret. `npm run n8n:setup` creates the credentials and workflows. Locally emails land in Mailpit (http://localhost:8025) until the real sender is configured.

### Phase 7 — Overview + audit
- Overview dashboard per role (status counts, upcoming deadlines/installations, open flags, equipment usage).
- Audit log viewer (who changed what, when).
- Automation health page (n8n workflow status, recent failures).
- **Status: done.** Home shows an overview for everyone who sees all projects. Super admins get Activity (audit log with filters) and Automations (email counts, test/daily/weekly run buttons, n8n workflows and runs, email log).

### Phase 8 — Pilot + go-live
- Deploy where the team can reach it (see "What I need from you").
- One week running with real users, fix feedback.
- Switch off the old system.
- **Deployment prep: done.** `dashboard/Dockerfile` builds the app; on start it applies migrations and creates the `admin` account only if no super admin exists. `docker compose --profile app` adds the dashboard and Caddy (automatic HTTPS for `DOMAIN`).

#### Deploying to the server
1. Point a DNS A record (e.g. `studio.artechsolutions.io`) at the server. Install Docker. Open ports 80 and 443.
2. Copy the repo to the server, then `cp .env.example .env` and fill it in (strong passwords, `DOMAIN`, `APP_URL`, `AUTOMATION_SECRET`, SMTP password). Keep `DASHBOARD_URL=http://dashboard:3000`.
3. `docker compose --profile app up -d --build`
4. Open the n8n editor through a tunnel (`ssh -L 5678:127.0.0.1:5678 user@server`, then http://localhost:5678), create the owner account and an API key (Settings > n8n API). Put the key in `.env` as `N8N_API_KEY`, then `docker compose --profile app up -d`.
5. `docker compose exec dashboard npm run n8n:setup` (creates the SMTP credential from `SMTP_*`, the secret and the three workflows).
6. Log in at `https://DOMAIN` as `admin` / `admin123`, change the password, set a real email on your user, then use Automations > "Send test email".

To bring the data from this machine, do this between steps 2 and 3: run `docker exec studio-os-postgres pg_dump -U studio studio_os > studio_os.sql` here, copy the file over, then on the server `docker compose up -d postgres` and `docker compose exec -T postgres psql -U studio studio_os < studio_os.sql`. Remove example projects first with `npm run db:seed-examples -- --remove`.

## Pipeline statuses

Brief Submitted → Assigned → In Development → (Flagged) → Internal Review →
Ready for Installation → Installing → Installed → Completed
