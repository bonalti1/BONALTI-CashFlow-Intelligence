import postgres, { type Sql } from "postgres";

let sqlClient: Sql | null = null;

export function hasDatabaseUrl() {
  return Boolean(process.env.DATABASE_URL);
}

export function sql() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
  }

  sqlClient ??= postgres(process.env.DATABASE_URL, {
    max: 1,
    ssl: "require",
  });

  return sqlClient;
}

