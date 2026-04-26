import { Pool } from "pg";
import { logger } from "../utils/logger";

export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: false,
});

db.on("error", (err) => logger.error("PostgreSQL pool error", { error: err.message }));

export async function dbConnect(): Promise<void> {
  const client = await db.connect();
  client.release();
  logger.info("PostgreSQL conectado");
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await db.query(sql, params);
  return result.rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}
