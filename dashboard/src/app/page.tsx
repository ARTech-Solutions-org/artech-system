import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/db";

type Check = { name: string; ok: boolean; detail: string };

async function checkPostgres(): Promise<Check> {
  try {
    const rows = await db.execute<{ version: string }>(sql`select version()`);
    return { name: "Postgres", ok: true, detail: rows[0].version.split(" on ")[0] };
  } catch (e) {
    return { name: "Postgres", ok: false, detail: (e as Error).message };
  }
}

async function checkN8n(): Promise<Check> {
  try {
    const res = await fetch(`${process.env.N8N_URL}/healthz`, { signal: AbortSignal.timeout(3000) });
    return { name: "n8n", ok: res.ok, detail: res.ok ? "Reachable" : `HTTP ${res.status}` };
  } catch (e) {
    return { name: "n8n", ok: false, detail: (e as Error).message };
  }
}

export default async function Home() {
  await connection();
  const checks = await Promise.all([checkPostgres(), checkN8n()]);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 p-10">
      <div>
        <h1 className="text-2xl font-semibold">Studio OS</h1>
        <p className="text-muted-foreground">System status</p>
      </div>
      <ul className="divide-y rounded-lg border">
        {checks.map((c) => (
          <li key={c.name} className="flex items-center justify-between gap-4 p-4">
            <span className="font-medium">{c.name}</span>
            <span className={c.ok ? "text-green-600" : "text-red-600"}>
              {c.ok ? "● " : "○ "}
              {c.detail}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
