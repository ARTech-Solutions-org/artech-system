import { config } from "dotenv";
import postgres from "postgres";
import { hashPassword } from "../src/lib/auth/password";

config({ path: ".env.local" });

const PASSWORD = "Demo1234";

/** Real team, placeholder mailboxes on the company domain so Hostinger can match them later. */
const TEST_USERS = [
  { name: "Ahmed Haddad", email: "ahmed.haddad@artechsolutions.io", department: "business", isHead: true },
  { name: "Ahmed Raafat", email: "ahmed.raafat@artechsolutions.io", department: "business", isHead: false },
  { name: "Madeeh Haddad", email: "madeeh.haddad@artechsolutions.io", department: "accounting", isHead: true },
  // Same person as accounting head; one login can only have one department.
  { name: "Madeeh Haddad", email: "madeeh.haddad.ops@artechsolutions.io", department: "operations", isHead: true },
  { name: "Ahmed Aglan", email: "ahmed.aglan@artechsolutions.io", department: "development", isHead: true },
  { name: "Mahmoud Essa", email: "mahmoud.essa@artechsolutions.io", department: "development", isHead: false },
  { name: "Mohannad Mahmoud", email: "mohannad.mahmoud@artechsolutions.io", department: "development", isHead: false },
  { name: "Mostafa Saied", email: "mostafa.saied@artechsolutions.io", department: "operations", isHead: false },
] as const;

async function main() {
  const url = process.env.DATABASE_URL!;
  const sql = postgres(url, /\.neon\.tech\b/.test(url) ? { max: 1, ssl: "require" } : { max: 1 });
  const passwordHash = await hashPassword(PASSWORD);

  const old = await sql<{ id: string }[]>`
    select id from users
    where not is_super_admin and lower(email) like '%@example.com'`;
  if (old.length) {
    const ids = old.map((u) => u.id);
    await sql`delete from flag_recipients where user_id in ${sql(ids)}`;
    await sql`delete from flags where raised_by in ${sql(ids)}`;
    await sql`delete from project_members where user_id in ${sql(ids)}`;
    await sql`update installations set lead_technician_id = null where lead_technician_id in ${sql(ids)}`;
    await sql`delete from equipment_requests where requested_by in ${sql(ids)}`;
    await sql`delete from notifications where user_id in ${sql(ids)}`;
    await sql`update audit_log set user_id = null where user_id in ${sql(ids)}`;
    await sql`delete from users where id in ${sql(ids)}`;
    console.log(`Removed ${old.length} old @example.com demo user(s).`);
  }

  for (const u of TEST_USERS) {
    const updated = await sql`
      update users set
        name = ${u.name},
        department = ${u.department},
        is_head = ${u.isHead},
        password_hash = ${passwordHash},
        status = 'active',
        must_change_password = false
      where lower(email) = ${u.email}
      returning id`;
    if (!updated.length) {
      await sql`
        insert into users (name, email, department, is_head, password_hash, status, must_change_password)
        values (${u.name}, ${u.email}, ${u.department}, ${u.isHead}, ${passwordHash}, 'active', false)`;
    }
    const role = `${u.department}${u.isHead ? " head" : ""}`;
    console.log(`${u.email} / ${PASSWORD}  (${u.name}, ${role})`);
  }
  await sql`update users set password_hash = ${passwordHash}, must_change_password = false`;
  console.log(`All users (including admin) use password: ${PASSWORD}`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
