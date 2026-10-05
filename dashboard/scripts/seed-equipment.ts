import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });

const ITEMS = [
  { code: "PRN-01", name: "Printer", category: "Printing", quantity: 1 },
  { code: "MQ3-01", name: "Meta Quest 3", category: "VR", quantity: 1 },
  { code: "NFC-01", name: "NFC reader", category: "Sensors", quantity: 3 },
];

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  for (const item of ITEMS) {
    const rows = await sql`
      insert into equipment (code, name, category, quantity)
      values (${item.code}, ${item.name}, ${item.category}, ${item.quantity})
      on conflict (code) do nothing
      returning code`;
    console.log(rows.length ? `Added ${item.name} x ${item.quantity}` : `${item.code} already exists`);
  }
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
