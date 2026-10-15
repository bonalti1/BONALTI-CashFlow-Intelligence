export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { warmupSchema } = await import("@/lib/db/warmup-schema");

  await warmupSchema().catch((error) => {
    console.error("Schema warmup failed. The next database call will retry it.", error);
  });
}
