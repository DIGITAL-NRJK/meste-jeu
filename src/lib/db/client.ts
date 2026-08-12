import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import { getServerEnv } from "@/lib/env/server";

function createDatabase() {
  const sql = neon(getServerEnv().DATABASE_URL);

  return drizzle({ client: sql });
}

export type Database = ReturnType<typeof createDatabase>;

let database: Database | undefined;

export function getDb(): Database {
  database ??= createDatabase();

  return database;
}
