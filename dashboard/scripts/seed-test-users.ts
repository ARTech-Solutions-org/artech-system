import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { users } from "../src/db/schema";
import { hashPassword } from "../src/lib/auth/password";

config({ path: ".env.local" });

// One account per view, all with the same password. Local testing only; never run on the live server.
const PASSWORD = "Test1234";
const TEST_USERS = [
  { name: "Test Business Head", email: "business.head@test.local", department: "business", isHead: true },
  { name: "Test Business", email: "business@test.local", department: "business", isHead: false },
  { name: "Test Accounting Head", email: "accounting.head@test.local", department: "accounting", isHead: true },
  { name: "Test Accounting", email: "accounting@test.local", department: "accounting", isHead: false },
  { name: "Test Tech Head", email: "techhead@test.local", department: "development", isHead: true },
  { name: "Test Developer", email: "dev@test.local", department: "development", isHead: false },
  { name: "Test Ops Head", email: "ops.head@test.local", department: "operations", isHead: true },
  { name: "Test Ops", email: "ops@test.local", department: "operations", isHead: false },
] as const;

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  const db = drizzle(client);
  const passwordHash = await hashPassword(PASSWORD);
  for (const u of TEST_USERS) {
    const values = { ...u, passwordHash, status: "active" as const, mustChangePassword: false };
    const updated = await db
      .update(users)
      .set(values)
      .where(sql`lower(${users.email}) = ${u.email}`)
      .returning({ id: users.id });
    if (!updated.length) await db.insert(users).values(values);
    console.log(`${u.email} / ${PASSWORD}`);
  }
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
