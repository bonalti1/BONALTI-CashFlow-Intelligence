import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { seal, unseal } from "@/lib/crypto/seal";

type StoredQboConnection = {
  realmId: string;
  environment: string;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
  connectedAt: string;
};

export type StoredQboConnectionWithTokens = StoredQboConnection & {
  accessToken: string;
  refreshToken: string;
};

type TokenPayload = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  x_refresh_token_expires_in?: number;
  createdAt?: number;
};

const dataDir = path.join(process.cwd(), ".data");
const connectionPath = path.join(dataDir, "qbo-connection.json");
export const qboConnectionCookieName = "stb_qbo_connection";

function expiresAt(createdAt: number | undefined, seconds: number | undefined) {
  return new Date((createdAt ?? Date.now()) + (seconds ?? 0) * 1000).toISOString();
}

export async function saveQboConnection({
  realmId,
  environment,
  token,
}: {
  realmId: string;
  environment: string;
  token: TokenPayload;
}) {
  if (!token.access_token || !token.refresh_token) {
    throw new Error("QuickBooks did not return the expected tokens.");
  }

  const stored: StoredQboConnection = {
    realmId,
    environment,
    accessTokenEncrypted: seal(token.access_token),
    refreshTokenEncrypted: seal(token.refresh_token),
    accessTokenExpiresAt: expiresAt(token.createdAt, token.expires_in),
    refreshTokenExpiresAt: expiresAt(token.createdAt, token.x_refresh_token_expires_in),
    connectedAt: new Date().toISOString(),
  };

  await mkdir(dataDir, { recursive: true });
  await writeFile(connectionPath, JSON.stringify(stored, null, 2), "utf8");

  return stored;
}

export async function getQboConnectionStatus() {
  try {
    const stored = JSON.parse(
      await readFile(connectionPath, "utf8"),
    ) as StoredQboConnection;

    return {
      connected: true,
      realmId: stored.realmId,
      environment: stored.environment,
      connectedAt: stored.connectedAt,
      accessTokenExpiresAt: stored.accessTokenExpiresAt,
      refreshTokenExpiresAt: stored.refreshTokenExpiresAt,
    };
  } catch {
    return {
      connected: false,
    };
  }
}

export async function getStoredQboConnection() {
  const stored = JSON.parse(
    await readFile(connectionPath, "utf8"),
  ) as StoredQboConnection;

  return unsealStoredQboConnection(stored);
}

export function sealStoredQboConnectionForCookie(stored: StoredQboConnection) {
  return seal(JSON.stringify(stored));
}

export function getStoredQboConnectionFromCookie(
  cookieValue: string | undefined,
): StoredQboConnectionWithTokens | null {
  if (!cookieValue) {
    return null;
  }

  const stored = JSON.parse(unseal(cookieValue)) as StoredQboConnection;

  return unsealStoredQboConnection(stored);
}

function unsealStoredQboConnection(
  stored: StoredQboConnection,
): StoredQboConnectionWithTokens {
  return {
    ...stored,
    accessToken: unseal(stored.accessTokenEncrypted),
    refreshToken: unseal(stored.refreshTokenEncrypted),
  };
}
