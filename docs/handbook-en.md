# ARTECH Studio OS — Staff handbook (English)

This is a **user guide** for anyone who works in Studio OS. It explains what the system does, who can do what, and how a project moves from brief to completed job.

It is not a technical setup or software-install guide.

Switch the app language with **العربية / English** in the header. Dates and money follow Cairo time.

---

## 1. What Studio OS is

Studio OS is ARTECH’s system for running interactive and experiential projects in one place:

- Client briefs
- Developer assignment and deadlines
- Client feedback
- Internal requests (blocked / needs data / needs assets)
- Equipment
- Site installation
- Budget, collections, expenses, and profit
- Files shared with the team
- Email reminders

Postgres is the source of truth. What you see depends on your **department** and whether you are a **head**.

---

## 2. Sign in and your account

1. Open the Studio OS address your company uses.
2. Sign in with the email and temporary password your department head (or Super Admin) gave you.
3. On first login you **must set a new password** on **Account** before you can use the rest of the app.
4. Later, change your password any time from **Account**.

If an account is disabled, sign-in is blocked. Ask your department head.

The microphone on some fields is dictation (speech to text). Arabic is the default so names and notes are captured correctly.

---

## 3. Roles

| Role | Department | Typical job in the system |
|---|---|---|
| Super Admin | — | Sees everything. Appoints heads. Users, activity log, automations. |
| Business Head | Business | Briefs, budget, installation date, client feedback decisions, mark completed. Manages Business users. |
| Business | Business | Same project work as Business Head, without managing users or exporting Excel. |
| Accountant Manager | Accounting | Budget, payments, expenses. Manages Accounting users. |
| Accountant | Accounting | Same finance work, without managing users. |
| Tech Head | Development | Assigns developers, deadlines, milestones, reviews work. Sees all projects and budget (view). Manages developers. |
| Developer | Development | Only **projects they are assigned to**. Work, milestones, installation guide, equipment requests. |
| Operations Manager | Operations | Installation calendar, start/finish install, equipment, suppliers. Manages Operations users. |
| Operations | Operations | Same site work, without managing users. |

Heads can add, edit, reset password, and disable **regular members of their own department**. They cannot change other heads or the Super Admin. Only Super Admin appoints heads.

---

## 4. Who sees which menu

| Menu | Who sees it |
|---|---|
| Home, Projects, Requests, Account | Everyone |
| Assignments | Super Admin, Tech Head |
| Installations | Everyone except Developers |
| Equipment | Super Admin, Development, Operations |
| Suppliers | Super Admin, Business, Operations |
| Finance | Super Admin, Business, Accounting, Tech Head |
| Users | Super Admin and department heads |
| Activity, Automations | Super Admin only |

Developers never see the real installation date or any money.

---

## 5. The life of a project

This is the normal path. Buttons only appear when *your* role can take that step.

```
Brief submitted
    → Tech Head assigns team + deadline
Assigned
    → Developer starts work
In development
    → Developer sends for internal review
Internal review
    → Tech Head approves (guide + demo video must exist)
Ready for installation
    → Operations starts the install
Installing
    → Operations marks installed
Installed
    → Business marks completed
Completed
```

**Tech Head** can send a project **back to development** from internal review or from ready for installation.

**Operations** can pause an install (back to ready for installation).

A project can also be **On hold** or **Cancelled** in the data model; day-to-day work uses the path above.

### Who does what on that path

1. **Business** creates the brief (name, client, description, references, design, content, other notes). Sets budget and the **real installation date** when known. Can add progress-showing dates (when WIP is shown to the client).
2. **Tech Head** opens **Assignments**, picks developers, sets the development deadline and milestones.
3. **Developers** start development, tick milestones, write the **installation guide** (English and/or Arabic) and add a **demo video** link recorded on the same setup that will go on site.
4. Tech Head cannot approve “ready for installation” until steps and demo video are there.
5. **Operations** uses **Installations**, assigns a lead technician, starts the job, writes the report, marks installed.
6. **Business** marks the job **completed** after install (this date is used in the monthly report).
7. **Accounting** records collections and expenses at any time after the budget exists.

---

## 6. Opening a project — tabs

A project is split into tabs. You can always open any tab you are allowed to see.

**If you open a project from Home or Projects**, the first tab depends on your role:

| You are | Lands on |
|---|---|
| Accountant | Finance |
| Operations | Installation |
| Developer / Tech Head | Development |
| Business / Super Admin | Brief |

**If you click a project from another page**, that page wins:

| You clicked from | Opens |
|---|---|
| Finance | Finance |
| Installations | Installation |
| Assignments | Development |
| Requests | Requests |
| Equipment | Equipment |

---

## 7. Home

Greeting, your role, and (if you can see all projects) pipeline counts and upcoming development deadlines.

Widgets appear only when they have something for you:

- **My projects** — jobs you are assigned to
- **Upcoming installations** — if you handle operations
- **Client feedback** assigned to you, or waiting for Business
- **System status** — Super Admin only

---

## 8. Projects

- **Developers** see only assigned projects.
- Everyone else sees all projects (except cancelled ones in some lists).

**New brief** is for Business (and Super Admin).

**Download Excel** is for Super Admin and heads of Business or Accounting. You can group quarters by brief date or by installation date.

Each card shows status, client, team, development deadline, and (if you are allowed) installation date and budget.

---

## 9. Project tabs in detail

### Brief

What the client asked for. Business can edit. Progress dates (when work in progress is shown) live here too.

### Feedback

Log what the client said (WhatsApp, call, email, meeting, site visit, or the client link). Split into items: design, content, technical, new request, general.

Typical path:

1. Business or Operations **logs** feedback (optionally with AI split into items).
2. If it is a **new request not in the brief**, it waits for Business to decide: included / extra cost / rejected.
3. Tech Head or Business **assigns** an item.
4. The assignee (or developers on the project) mark **in progress**, then **done**.
5. The developer can ask for **extra days** on the development deadline; Tech Head accepts or declines.
6. Business confirms the **client approved**, or the client does that on their own link.

**Client link:** Business can turn on a private link. The client sees a simple status (not internal steps), can add comments, and can say an item is not right yet. Team discussion stays internal.

Urgent items are marked clearly.

### Files

Shared uploads (cloud): Brief, Client assets, Brand, Design, Content, Preview, Delivery. Max **100 MB** per file.

Heavy working files (Unreal, C4D, Premiere) stay on the **office disk** folders shown on the page — they are not uploaded.

Developers can manage files only on projects they are on. Business, Operations, Tech Head, and Super Admin can manage files more broadly.

### Development

Team, development deadline, milestones, status buttons, and the **installation guide**.

- Tech Head: assign / remove developers, deadline, add milestones, approve or send back.
- Developers on the project: start work, send for review, tick milestones, write the guide (either language; the other can be translated on save if empty).

### Requests (inside a project and the Requests page)

Ask a person for what this job needs: blocked, needs data, needs assets, or other. Only people involved see each request.

- Recipients (or their department head) resolve **their part**.
- When every part is resolved, the request is closed.
- The person who raised it (or Super Admin) can **cancel**.
- A badge on **Requests** in the menu is the count waiting on you.

### Equipment (on the project)

Request units for a date range. If enough units are **free**, the request is **approved** immediately. If not, it is **waitlisted** until stock is free.

When the job is done with the kit, mark **Returned** (or Cancel). Super Admin and heads of Development or Operations maintain the catalogue (quantity, status: active / maintenance / broken / retired).

### Installation

Hidden from developers.

- **Business** sets the real date, location link, and notes.
- **Operations** sets lead technician, starts install, pauses, marks installed, writes the report.
- **Business** marks **completed** after installed.

### Finance

Hidden from developers and Operations.

| Figure | Meaning |
|---|---|
| **Budget** | Agreed amount. Does not change when you add expenses. |
| **Revenue** | Money **collected**. Starts at **0** until a payment is recorded. |
| **Outstanding** | Budget minus revenue (still to collect). |
| **Expenses** | Costs. |
| **Profit** | Revenue minus expenses. Red if costs exceed collections. |

Who can do what:

- **View:** Super Admin, Business, Accounting, Tech Head
- **Edit budget:** Super Admin, Business, Accounting
- **Record payments and expenses:** Super Admin and Accounting only

**How Accounting records many lines:** open **Record payment or expense** → fill a line → **Add** (repeat) → **Save** once. You can remove a queued line before save. If the last line is filled and you click Save without Add, that last line is included.

The **Finance** page shows the same figures for every project.

---

## 10. Assignments (Tech Head)

Waiting briefs as cards, then each developer with their active projects underneath (nearest deadline first). Open a card to assign people, deadline, and milestones (Development tab).

---

## 11. Installations calendar

Month view of real site dates, “installing now”, and projects still without a date. Business sets the date on the project. Operations runs the day on site from the Installation tab.

---

## 12. Equipment catalogue

Stock, free vs in use, which project is holding units, waitlist. Request from a project. Heads of Development/Operations (and Super Admin) add and edit items.

---

## 13. Suppliers

Company name, contact, phone, address, and rented equipment. For Business, Operations, and Super Admin.

---

## 14. Users

- Super Admin sees everyone and can appoint heads.
- A head sees only their department and can add members with a **temporary password** (at least 8 characters). The new person must change it on first login.
- Reset password, disable, or re-enable from the person’s page. You cannot disable yourself; use **Account** for your own password.

---

## 15. Emails the system sends

You do not need to trigger these. Typical messages:

- You were assigned to a project
- A request needs your part
- A request was cancelled
- Client feedback assigned to you
- Development deadline in 3 days or tomorrow, or overdue
- Installation in 2 days, or overdue
- Equipment still in use
- **Weekly summary** (heads and Super Admin): pipeline, upcoming installs, overdue deadlines, open requests, equipment in use
- **Monthly report** (Business Head and Super Admin): completed jobs for the previous month, with a spreadsheet

---

## 16. Super Admin only

- **Activity** — who changed what
- **Automations** — email health, run daily / weekly / monthly jobs if needed

---

## 17. Cheat sheets

### I am Business

1. **Projects → New brief**
2. Set **budget** and **installation date** when you have them
3. Log **client feedback**; decide scope on “new request”
4. Turn the **client link** on when the client should reply themselves
5. After Operations marks installed → **Mark completed**

### I am Tech Head

1. **Assignments** — pick up waiting briefs
2. Assign developers, deadline, milestones
3. Developers send for review → check guide + demo → **Approve: ready for installation** (or send back)
4. Decide extra days asked from feedback items

### I am a Developer

1. **Home / Projects** — only your jobs
2. **Start development** → work milestones → write guide + demo video
3. **Send for internal review**
4. Request equipment and raise requests if you are blocked
5. You will not see money or the real install date

### I am Operations

1. **Installations** calendar
2. On the project **Installation** tab: lead technician, **Start installation**, report, **Mark installed**
3. Equipment and suppliers as needed
4. You can log client feedback from the site; Business decides extra scope

### I am Accounting

1. **Finance** or a project **Finance** tab (opens automatically)
2. Confirm **budget**
3. **Add** payments and expenses to a list, then **Save**
4. Watch **revenue** (collections), **outstanding**, **profit**

---

## 18. If something is missing

- You cannot see a menu item → your role is not meant to. That is normal.
- You cannot open a project → you are a developer and not on the team. Ask the Tech Head.
- You cannot change status → the previous step is not done, or the guide/demo is missing.
- Login fails → password, or the account is disabled. Ask your head.

Questions about **how the company wants a job run** (not the buttons) go to your department head.
