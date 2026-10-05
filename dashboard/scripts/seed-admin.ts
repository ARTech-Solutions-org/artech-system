import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { users } from "../src/db/schema";
import { hashPassword } from "../src/lib/auth/password";

config({ path: ".env.local" });

const EMAIL = process.env.ADMIN_EMAIL ?? "admin";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "admin123";

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  const db = drizzle(client);

  // Any super admin counts, so renaming the admin login later never brings back the default account.
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`${users.isSuperAdmin} or lower(${users.email}) = ${EMAIL.toLowerCase()}`);
  if (existing.length) {
    console.log("A super admin already exists. Nothing to do.");
  } else {
    await db.insert(users).values({
      name: "Super Admin",
      email: EMAIL,
      isSuperAdmin: true,
      status: "active",
      passwordHash: await hashPassword(PASSWORD),
    });
    console.log(`Created super admin "${EMAIL}".`);
  }
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
