import postgres, { type Sql } from "postgres";

const globalForSql = globalThis as typeof globalThis & {
  __cashflowSql?: Sql;
};

export function hasDatabaseUrl() {
  return Boolean(process.env.DATABASE_URL);
}

// One pool for the whole Node process, including copies of this module that
// Next bundles separately. Do not call postgres() anywhere else.
export function sql() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
  }

  globalForSql.__cashflowSql ??= postgres(process.env.DATABASE_URL, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 8,
    ssl: "require",
  });

  return globalForSql.__cashflowSql;
}

function databaseErrorCode(error: unknown) {
  if (!error || typeof error !== "object") {
    return null;
  }

  const code = "code" in error ? error.code : null;

  return typeof code === "string" ? code : null;
}

export async function getDatabaseConnectionStatus() {
  if (!hasDatabaseUrl()) {
    return {
      configured: false,
      connected: false,
      code: null,
      message: "DATABASE_URL is not configured.",
    };
  }

  try {
    await sql()`select 1`;

    return {
      configured: true,
      connected: true,
      code: null,
      message: "Database connection is healthy.",
    };
  } catch (error) {
    return {
      configured: true,
      connected: false,
      code: databaseErrorCode(error),
      message: "DATABASE_URL is configured, but the app cannot reach the database.",
    };
  }
}
