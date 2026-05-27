import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { seal, unseal } from "@/lib/crypto/seal";
import { hasDatabaseUrl, sql } from "@/lib/db/raw";
import { createQboOAuthClient } from "@/lib/qbo/oauth";

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

async function ensureQboConnectionTable() {
  await sql()`
    create table if not exists qbo_connections (
      realm_id text primary key,
      environment text not null,
      access_token_encrypted text not null,
      refresh_token_encrypted text not null,
      access_token_expires_at timestamptz not null,
      refresh_token_expires_at timestamptz not null,
      connected_at timestamptz not null,
      updated_at timestamptz not null default now()
    )
  `;
}

async function persistQboConnection(stored: StoredQboConnection) {
  if (hasDatabaseUrl()) {
    await ensureQboConnectionTable();
    await sql()`
      insert into qbo_connections (
        realm_id,
        environment,
        access_token_encrypted,
        refresh_token_encrypted,
        access_token_expires_at,
        refresh_token_expires_at,
        connected_at,
        updated_at
      )
      values (
        ${stored.realmId},
        ${stored.environment},
        ${stored.accessTokenEncrypted},
        ${stored.refreshTokenEncrypted},
        ${stored.accessTokenExpiresAt},
        ${stored.refreshTokenExpiresAt},
        ${stored.connectedAt},
        now()
      )
      on conflict (realm_id) do update set
        environment = excluded.environment,
        access_token_encrypted = excluded.access_token_encrypted,
        refresh_token_encrypted = excluded.refresh_token_encrypted,
        access_token_expires_at = excluded.access_token_expires_at,
        refresh_token_expires_at = excluded.refresh_token_expires_at,
        connected_at = excluded.connected_at,
        updated_at = now()
    `;

    return stored;
  }

  await mkdir(dataDir, { recursive: true });
  await writeFile(connectionPath, JSON.stringify(stored, null, 2), "utf8");

  return stored;
}

function buildStoredQboConnection({
  realmId,
  environment,
  token,
  connectedAt = new Date().toISOString(),
}: {
  realmId: string;
  environment: string;
  token: TokenPayload;
  connectedAt?: string;
}) {
  if (!token.access_token || !token.refresh_token) {
    throw new Error("QuickBooks did not return the expected tokens.");
  }

  return {
    realmId,
    environment,
    accessTokenEncrypted: seal(token.access_token),
    refreshTokenEncrypted: seal(token.refresh_token),
    accessTokenExpiresAt: expiresAt(token.createdAt, token.expires_in),
    refreshTokenExpiresAt: expiresAt(token.createdAt, token.x_refresh_token_expires_in),
    connectedAt,
  };
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
  return persistQboConnection(buildStoredQboConnection({ realmId, environment, token }));
}

export async function getQboConnectionStatus() {
  if (hasDatabaseUrl()) {
    try {
      await ensureQboConnectionTable();
      const rows = await sql()<
        Array<{
          realm_id: string;
          environment: string;
          connected_at: Date;
          access_token_expires_at: Date;
          refresh_token_expires_at: Date;
        }>
      >`
        select
          realm_id,
          environment,
          connected_at,
          access_token_expires_at,
          refresh_token_expires_at
        from qbo_connections
        order by updated_at desc
        limit 1
      `;
      const stored = rows[0];

      if (!stored) {
        return {
          connected: false,
        };
      }

      return {
        connected: true,
        realmId: stored.realm_id,
        environment: stored.environment,
        connectedAt: stored.connected_at.toISOString(),
        accessTokenExpiresAt: stored.access_token_expires_at.toISOString(),
        refreshTokenExpiresAt: stored.refresh_token_expires_at.toISOString(),
      };
    } catch {
      return {
        connected: false,
      };
    }
  }

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
  if (hasDatabaseUrl()) {
    await ensureQboConnectionTable();
    const rows = await sql()<
      Array<{
        realm_id: string;
        environment: string;
        access_token_encrypted: string;
        refresh_token_encrypted: string;
        access_token_expires_at: Date;
        refresh_token_expires_at: Date;
        connected_at: Date;
      }>
    >`
      select
        realm_id,
        environment,
        access_token_encrypted,
        refresh_token_encrypted,
        access_token_expires_at,
        refresh_token_expires_at,
        connected_at
      from qbo_connections
      order by updated_at desc
      limit 1
    `;
    const stored = rows[0];

    if (!stored) {
      throw new Error("QuickBooks connection is not saved yet.");
    }

    return unsealStoredQboConnection({
      realmId: stored.realm_id,
      environment: stored.environment,
      accessTokenEncrypted: stored.access_token_encrypted,
      refreshTokenEncrypted: stored.refresh_token_encrypted,
      accessTokenExpiresAt: stored.access_token_expires_at.toISOString(),
      refreshTokenExpiresAt: stored.refresh_token_expires_at.toISOString(),
      connectedAt: stored.connected_at.toISOString(),
    });
  }

  const stored = JSON.parse(
    await readFile(connectionPath, "utf8"),
  ) as StoredQboConnection;

  return unsealStoredQboConnection(stored);
}

function shouldRefreshAccessToken(connection: StoredQboConnectionWithTokens) {
  const refreshBufferMs = 2 * 60 * 1000;

  return new Date(connection.accessTokenExpiresAt).getTime() <= Date.now() + refreshBufferMs;
}

export async function refreshQboConnection(
  connection: StoredQboConnectionWithTokens,
) {
  if (new Date(connection.refreshTokenExpiresAt).getTime() <= Date.now()) {
    throw new Error("QuickBooks refresh token expired. Connect QuickBooks again.");
  }

  const oauthClient = createQboOAuthClient();
  const authResponse = await oauthClient.refreshUsingToken(connection.refreshToken);
  const token = authResponse.getToken();
  const stored = buildStoredQboConnection({
    realmId: connection.realmId,
    environment: connection.environment,
    token,
    connectedAt: connection.connectedAt,
  });

  await persistQboConnection(stored);

  return unsealStoredQboConnection(stored);
}

export async function getFreshQboConnection(
  connectionOverride?: StoredQboConnectionWithTokens,
) {
  const connection = connectionOverride ?? await getStoredQboConnection();

  if (!shouldRefreshAccessToken(connection)) {
    return connection;
  }

  return refreshQboConnection(connection);
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
