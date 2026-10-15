import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { sql } from "@/lib/db/raw";

let database: PostgresJsDatabase | null = null;

// Drizzle rides the shared postgres.js pool. Importing this module does not
// open a second connection.
export function getDb() {
  database ??= drizzle(sql());

  return database;
}
