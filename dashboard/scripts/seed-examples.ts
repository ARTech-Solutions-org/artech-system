import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });

// Example projects at every installation stage, dated around today. Remove them with `--remove`.
const SUFFIX = " (example)";

type Example = {
  name: string;
  client: string;
  description: string;
  status: string;
  devDeadlineInDays: number;
  installInDays: number | null;
  location?: string;
  steps?: string;
  demo?: string;
  withLeadTech?: boolean;
  installStatus?: "scheduled" | "in_progress" | "done";
  report?: string;
  budget?: number;
  equipment?: { code: string; quantity: number }[];
};

const STEPS =
  "1. Unload and check every box against the equipment list\n2. Mount the screens and run the cables\n3. Connect the PC and NFC readers\n4. Start the app from the desktop shortcut and run the demo once\n5. Show the client how to restart it";

const STEPS_AR: Record<string, string> = {
  [STEPS]:
    "1. فك الصناديق ومطابقة كل صندوق مع قائمة المعدات\n2. تركيب الشاشات وتمديد الكابلات\n3. توصيل الكمبيوتر وقارئات NFC\n4. تشغيل التطبيق من اختصار سطح المكتب وتجربة العرض مرة واحدة\n5. شرح طريقة إعادة التشغيل للعميل",
  "1. Place the table\n2. Connect power and network": "1. وضع الطاولة في مكانها\n2. توصيل الكهرباء والشبكة",
};

const EXAMPLES: Example[] = [
  {
    name: "Museum VR Experience",
    client: "Grand Museum",
    description: "VR tour of the old city for the museum's new wing.",
    status: "installing",
    devDeadlineInDays: -5,
    installInDays: 0,
    location: "https://maps.google.com/?q=Grand+Egyptian+Museum",
    steps: STEPS,
    demo: "https://drive.google.com/file/d/example-museum",
    withLeadTech: true,
    installStatus: "in_progress",
    budget: 180000,
    equipment: [{ code: "PRN-01", quantity: 1 }],
  },
  {
    name: "Mall NFC Treasure Hunt",
    client: "City Stars Mall",
    description: "Kids scan NFC stations around the mall to collect stamps.",
    status: "ready_for_installation",
    devDeadlineInDays: -2,
    installInDays: 3,
    location: "https://maps.google.com/?q=City+Stars+Mall",
    steps: STEPS,
    demo: "https://drive.google.com/file/d/example-mall",
    withLeadTech: true,
    budget: 95000,
    equipment: [{ code: "NFC-01", quantity: 1 }],
  },
  {
    name: "Hotel Welcome Screen",
    client: "Nile View Hotel",
    description: "Interactive welcome screen in the hotel lobby.",
    status: "ready_for_installation",
    devDeadlineInDays: -6,
    installInDays: -2,
    location: "https://maps.google.com/?q=Nile+View+Hotel",
    steps: STEPS,
    demo: "https://drive.google.com/file/d/example-hotel",
    budget: 60000,
  },
  {
    name: "Bank Lobby Touch Table",
    client: "National Bank",
    description: "Touch table showing the bank's services and history.",
    status: "internal_review",
    devDeadlineInDays: 4,
    installInDays: 12,
    location: "https://maps.google.com/?q=National+Bank+HQ",
    steps: "1. Place the table\n2. Connect power and network",
    budget: 220000,
  },
  {
    name: "School Science Wall",
    client: "Future School",
    description: "Projection wall with science experiments that react to touch.",
    status: "installed",
    devDeadlineInDays: -12,
    installInDays: -4,
    location: "https://maps.google.com/?q=Future+School",
    steps: STEPS,
    demo: "https://drive.google.com/file/d/example-school",
    withLeadTech: true,
    installStatus: "done",
    report: "Installed and tested with the client. Signed off by the school principal. Spare cable left on site.",
    budget: 75000,
  },
  {
    name: "Expo Booth Hologram",
    client: "Tech Expo",
    description: "Hologram fan display for the client's expo booth.",
    status: "in_development",
    devDeadlineInDays: 20,
    installInDays: 32,
    location: "https://maps.google.com/?q=Egypt+International+Exhibition+Center",
    budget: 130000,
  },
  {
    name: "Launch Event AR Photo",
    client: "Brand Co.",
    description: "AR photo booth for a product launch. Date not confirmed yet.",
    status: "assigned",
    devDeadlineInDays: 15,
    installInDays: null,
    budget: 40000,
  },
];

const dayOffset = (days: number) => {
  const d = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" }) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

  if (process.argv.includes("--remove")) {
    const removed = await sql`delete from projects where name like ${"%" + SUFFIX} returning name`;
    console.log(`Removed ${removed.length} example project(s).`);
    await sql.end();
    return;
  }

  const [admin] = await sql`select id from users where is_super_admin limit 1`;
  const [dev] =
    await sql`select id from users where department = 'development' and not is_head and status = 'active' limit 1`;
  const [tech] = await sql`select id from users where department = 'operations' and status = 'active' limit 1`;

  for (const ex of EXAMPLES) {
    const name = ex.name + SUFFIX;
    const [exists] = await sql`select id from projects where lower(name) = lower(${name})`;
    if (exists) {
      console.log(`${name} already exists`);
      continue;
    }

    await sql.begin(async (tx) => {
      const [project] = await tx`
        insert into projects (name, client_name, description, status, dev_deadline, created_by, assigned_by, assigned_at)
        values (${name}, ${ex.client}, ${ex.description}, ${ex.status}, ${dayOffset(ex.devDeadlineInDays)},
                ${admin?.id ?? null}, ${admin?.id ?? null}, now())
        returning id`;
      if (dev) {
        await tx`insert into project_members (project_id, user_id, role, added_by) values (${project.id}, ${dev.id}, 'lead', ${admin?.id ?? null})`;
      }
      if (ex.budget) {
        await tx`insert into project_finance (project_id, budget, currency) values (${project.id}, ${ex.budget}, 'EGP')`;
      }
      await tx`
        insert into project_schedule (project_id, installation_date, location_link)
        values (${project.id}, ${ex.installInDays === null ? null : dayOffset(ex.installInDays)}, ${ex.location ?? null})`;
      if (ex.steps || ex.withLeadTech || ex.installStatus) {
        const started = ex.installStatus === "in_progress" || ex.installStatus === "done";
        await tx`
          insert into installations (project_id, steps, steps_ar, demo_video_url, lead_technician_id, status, started_at, completed_at, notes)
          values (${project.id}, ${ex.steps ?? null}, ${(ex.steps && STEPS_AR[ex.steps]) ?? null}, ${ex.demo ?? null}, ${ex.withLeadTech ? (tech?.id ?? null) : null},
                  ${ex.installStatus ?? "scheduled"}, ${started ? new Date(Date.now() - 3 * 3600_000) : null},
                  ${ex.installStatus === "done" ? new Date(Date.now() - 3600_000) : null}, ${ex.report ?? null})`;
      }
      for (const item of ex.equipment ?? []) {
        const [eq] = await tx`
          select e.id, e.quantity - coalesce((select sum(quantity) from equipment_requests
            where equipment_id = e.id and status = 'approved'), 0) as free
          from equipment e where code = ${item.code} for update`;
        if (!eq || !dev) continue;
        await tx`
          insert into equipment_requests (project_id, equipment_id, requested_by, quantity, status)
          values (${project.id}, ${eq.id}, ${dev.id}, ${item.quantity}, ${eq.free >= item.quantity ? "approved" : "waitlisted"})`;
      }
    });
    console.log(`Added ${name}`);
  }
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
