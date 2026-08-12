import { Pool } from "pg";

let pool: Pool | undefined;

/** One bounded pool per server process; never create a connection per request. */
export const databasePool = (): Pool => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("database runtime is not configured");
  pool ??= new Pool({
    connectionString,
    max: 4,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 3_000,
    statement_timeout: 8_000,
    ssl: { rejectUnauthorized: false },
  });
  return pool;
};
