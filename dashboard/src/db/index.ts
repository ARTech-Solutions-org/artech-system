import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { sql?: postgres.Sql };

function databaseUrl() {
  const raw = process.env.DATABASE_URL!;
  try {
    const u = new URL(raw);
    // Neon copies `channel_binding=require`; postgres.js does not implement it and login 500s.
    u.searchParams.delete("channel_binding");
    return u.toString();
  } catch {
    return raw;
  }
}

const url = databaseUrl();
const serverless = Boolean(process.env.VERCEL) || /\.neon\.tech\b/.test(url);
const sql =
  globalForDb.sql ??
  postgres(url, serverless ? { max: 1, ssl: "require", prepare: false } : undefined);
if (process.env.NODE_ENV !== "production") globalForDb.sql = sql;

export const db = drizzle(sql, { schema });
