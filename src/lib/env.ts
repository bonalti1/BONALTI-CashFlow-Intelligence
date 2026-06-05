const serverEnvKeys = [
  "DATABASE_URL",
  "QBO_CLIENT_ID",
  "QBO_CLIENT_SECRET",
  "QBO_REDIRECT_URI",
  "QBO_ENVIRONMENT",
  "OPENAI_API_KEY",
  "TOKEN_ENCRYPTION_KEY",
  "AI_CSUITE_EXPORT_TOKEN",
] as const;

export type ServerEnvKey = (typeof serverEnvKeys)[number];

export function getEnvStatus() {
  return serverEnvKeys.map((key) => ({
    key,
    configured: Boolean(process.env[key]),
  }));
}

export function requireEnv(key: ServerEnvKey) {
  const value = process.env[key];

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}
