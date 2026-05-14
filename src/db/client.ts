import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { requireEnv } from "@/lib/env";

const client = postgres(requireEnv("DATABASE_URL"), {
  max: 1,
});

export const db = drizzle(client);
