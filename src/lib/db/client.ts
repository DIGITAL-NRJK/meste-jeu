import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "../../../db/schema";
import { getServerEnv } from "@/lib/env/server";

function createDatabase() {
  const sql = neon(getServerEnv().DATABASE_URL);

  return drizzle({ client: sql, schema });
}

export type Database = ReturnType<typeof createDatabase>;

let database: Database | undefined;

export function getDb(): Database {
  database ??= createDatabase();

  return database;
}
