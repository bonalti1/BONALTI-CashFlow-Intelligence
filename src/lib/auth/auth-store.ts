import { hasDatabaseUrl, sql } from "@/lib/db/raw";
import { createSecretToken, hashToken } from "@/lib/auth/crypto";
import { appRoles, type ApiKeyRecord, type AppRole, type AppUser } from "@/lib/auth/roles";

export { appRoles, roleDescriptions, roleLabels } from "@/lib/auth/roles";
export type { ApiKeyRecord, AppRole, AppUser } from "@/lib/auth/roles";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
  password_hash: string | null;
  created_at: Date;
  last_login_at: Date | null;
};

const sessionLifetimeMs = 30 * 24 * 60 * 60 * 1000;
const inviteLifetimeMs = 7 * 24 * 60 * 60 * 1000;
const loginWindowMinutes = 15;
const maxFailedLoginsPerWindow = 8;

let authTablesReady: Promise<void> | null = null;

async function initializeAuthTables() {
  await sql()`
    create table if not exists app_users (
      id uuid primary key default gen_random_uuid(),
      email text not null unique,
      name text not null,
      role text not null,
      password_hash text,
      active boolean not null default true,
      created_by uuid,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      last_login_at timestamptz
    )
  `;
  await sql()`
    create table if not exists app_sessions (
      token_hash text primary key,
      user_id uuid not null references app_users(id) on delete cascade,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null,
      last_seen_at timestamptz not null default now(),
      user_agent text
    )
  `;
  await sql()`
    create index if not exists app_sessions_user_idx on app_sessions (user_id)
  `;
  await sql()`
    create table if not exists app_invites (
      token_hash text primary key,
      user_id uuid not null references app_users(id) on delete cascade,
      purpose text not null default 'invite',
      created_by uuid,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null,
      used_at timestamptz
    )
  `;
  await sql()`
    create table if not exists app_login_attempts (
      id bigserial primary key,
      email text not null,
      ip_address text,
      success boolean not null,
      attempted_at timestamptz not null default now()
    )
  `;
  await sql()`
    create index if not exists app_login_attempts_email_idx
    on app_login_attempts (email, attempted_at desc)
  `;
  await sql()`
    create table if not exists app_api_keys (
      id uuid primary key default gen_random_uuid(),
      name text not null,
      key_prefix text not null,
      key_hash text not null unique,
      scope text not null default 'read',
      created_by uuid,
      created_at timestamptz not null default now(),
      last_used_at timestamptz,
      revoked_at timestamptz
    )
  `;
}

export function ensureAuthTables() {
  authTablesReady ??= initializeAuthTables().catch((error) => {
    authTablesReady = null;
    throw error;
  });

  return authTablesReady;
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function toRole(value: string): AppRole {
  return appRoles.includes(value as AppRole) ? (value as AppRole) : "viewer";
}

function toUser(row: UserRow): AppUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: toRole(row.role),
    active: row.active,
    hasPassword: Boolean(row.password_hash),
    createdAt: row.created_at.toISOString(),
    lastLoginAt: row.last_login_at?.toISOString() ?? null,
  };
}

export async function countUsers() {
  if (!hasDatabaseUrl()) {
    return 0;
  }

  await ensureAuthTables();
  const [row] = await sql()<Array<{ count: number }>>`
    select count(*)::int as count from app_users
  `;

  return row?.count ?? 0;
}

export async function listUsers() {
  await ensureAuthTables();
  const rows = await sql()<UserRow[]>`
    select id, email, name, role, active, password_hash, created_at, last_login_at
    from app_users
    order by active desc, name asc
  `;

  return rows.map(toUser);
}

export async function getUserById(id: string) {
  await ensureAuthTables();
  const [row] = await sql()<UserRow[]>`
    select id, email, name, role, active, password_hash, created_at, last_login_at
    from app_users
    where id = ${id}
  `;

  return row ? toUser(row) : null;
}

export async function getUserForLogin(email: string) {
  await ensureAuthTables();
  const [row] = await sql()<UserRow[]>`
    select id, email, name, role, active, password_hash, created_at, last_login_at
    from app_users
    where email = ${normalizeEmail(email)}
  `;

  return row ? { user: toUser(row), passwordHash: row.password_hash } : null;
}

export async function createUser({
  email,
  name,
  role,
  passwordHash = null,
  createdBy = null,
}: {
  email: string;
  name: string;
  role: AppRole;
  passwordHash?: string | null;
  createdBy?: string | null;
}) {
  await ensureAuthTables();
  const rows = await sql()<UserRow[]>`
    insert into app_users (email, name, role, password_hash, created_by)
    values (${normalizeEmail(email)}, ${name.trim()}, ${role}, ${passwordHash}, ${createdBy})
    on conflict (email) do nothing
    returning id, email, name, role, active, password_hash, created_at, last_login_at
  `;

  if (!rows[0]) {
    throw new Error("Someone with that email already has an account.");
  }

  return toUser(rows[0]);
}

// Only creates the owner when the table is still empty, so two racing setup requests cannot both win.
export async function createFirstOwner({
  email,
  name,
  passwordHash,
}: {
  email: string;
  name: string;
  passwordHash: string;
}) {
  await ensureAuthTables();

  return sql().begin(async (transaction) => {
    await transaction`lock table app_users in exclusive mode`;
    const [existing] = await transaction<Array<{ count: number }>>`
      select count(*)::int as count from app_users
    `;

    if ((existing?.count ?? 0) > 0) {
      throw new Error("The owner account has already been created. Sign in instead.");
    }

    const [row] = await transaction<UserRow[]>`
      insert into app_users (email, name, role, password_hash)
      values (${normalizeEmail(email)}, ${name.trim()}, 'admin', ${passwordHash})
      returning id, email, name, role, active, password_hash, created_at, last_login_at
    `;

    return toUser(row);
  });
}

async function countOtherActiveAdmins(userId: string) {
  const [row] = await sql()<Array<{ count: number }>>`
    select count(*)::int as count
    from app_users
    where role = 'admin' and active and id <> ${userId}
  `;

  return row?.count ?? 0;
}

export async function updateUserRole(userId: string, role: AppRole) {
  await ensureAuthTables();
  const before = await getUserById(userId);

  if (!before) {
    throw new Error("That person was not found.");
  }

  if (before.role === "admin" && role !== "admin" && (await countOtherActiveAdmins(userId)) === 0) {
    throw new Error("Keep at least one active admin. Make someone else an admin first.");
  }

  await sql()`
    update app_users set role = ${role}, updated_at = now() where id = ${userId}
  `;

  return { before, after: { ...before, role } };
}

export async function setUserActive(userId: string, active: boolean) {
  await ensureAuthTables();
  const before = await getUserById(userId);

  if (!before) {
    throw new Error("That person was not found.");
  }

  if (!active && before.role === "admin" && (await countOtherActiveAdmins(userId)) === 0) {
    throw new Error("Keep at least one active admin. Make someone else an admin first.");
  }

  await sql().begin(async (transaction) => {
    await transaction`
      update app_users set active = ${active}, updated_at = now() where id = ${userId}
    `;

    if (!active) {
      await transaction`delete from app_sessions where user_id = ${userId}`;
      await transaction`
        update app_invites set used_at = now() where user_id = ${userId} and used_at is null
      `;
    }
  });

  return before;
}

export async function createSession(userId: string, userAgent: string | null) {
  await ensureAuthTables();
  const token = createSecretToken();
  const expiresAt = new Date(Date.now() + sessionLifetimeMs);

  await sql()`
    insert into app_sessions (token_hash, user_id, expires_at, user_agent)
    values (${hashToken(token)}, ${userId}, ${expiresAt}, ${userAgent?.slice(0, 300) ?? null})
  `;
  await sql()`
    update app_users set last_login_at = now() where id = ${userId}
  `;

  return { token, expiresAt };
}

export async function getSessionUser(token: string) {
  await ensureAuthTables();
  const [row] = await sql()<Array<UserRow & { last_seen_at: Date; token_hash: string }>>`
    select
      u.id, u.email, u.name, u.role, u.active, u.password_hash, u.created_at, u.last_login_at,
      s.last_seen_at, s.token_hash
    from app_sessions s
    join app_users u on u.id = s.user_id
    where s.token_hash = ${hashToken(token)}
      and s.expires_at > now()
      and u.active
  `;

  if (!row) {
    return null;
  }

  if (Date.now() - row.last_seen_at.getTime() > 15 * 60 * 1000) {
    void sql()`
      update app_sessions set last_seen_at = now() where token_hash = ${row.token_hash}
    `.catch(() => undefined);
  }

  return toUser(row);
}

export async function deleteSession(token: string) {
  if (!hasDatabaseUrl()) {
    return;
  }

  await ensureAuthTables();
  await sql()`delete from app_sessions where token_hash = ${hashToken(token)}`;
}

export async function recordLoginAttempt(email: string, ipAddress: string | null, success: boolean) {
  await ensureAuthTables();
  await sql()`
    insert into app_login_attempts (email, ip_address, success)
    values (${normalizeEmail(email)}, ${ipAddress}, ${success})
  `;
}

export async function isLoginLocked(email: string) {
  await ensureAuthTables();
  const [row] = await sql()<Array<{ count: number }>>`
    select count(*)::int as count
    from app_login_attempts
    where email = ${normalizeEmail(email)}
      and not success
      and attempted_at > now() - make_interval(mins => ${loginWindowMinutes})
      and attempted_at > coalesce((
        select max(attempted_at) from app_login_attempts
        where email = ${normalizeEmail(email)} and success
      ), 'epoch'::timestamptz)
  `;

  return (row?.count ?? 0) >= maxFailedLoginsPerWindow;
}

export async function createInviteLink(
  userId: string,
  createdBy: string | null,
  purpose: "invite" | "reset",
) {
  await ensureAuthTables();
  const token = createSecretToken();
  const expiresAt = new Date(Date.now() + inviteLifetimeMs);

  await sql().begin(async (transaction) => {
    await transaction`
      update app_invites set used_at = now() where user_id = ${userId} and used_at is null
    `;
    await transaction`
      insert into app_invites (token_hash, user_id, purpose, created_by, expires_at)
      values (${hashToken(token)}, ${userId}, ${purpose}, ${createdBy}, ${expiresAt})
    `;
  });

  return { token, expiresAt };
}

export async function getInvite(token: string) {
  if (!hasDatabaseUrl()) {
    return null;
  }

  await ensureAuthTables();
  const [row] = await sql()<
    Array<{ user_id: string; name: string; email: string; purpose: string; expires_at: Date }>
  >`
    select i.user_id, u.name, u.email, i.purpose, i.expires_at
    from app_invites i
    join app_users u on u.id = i.user_id
    where i.token_hash = ${hashToken(token)}
      and i.used_at is null
      and i.expires_at > now()
      and u.active
  `;

  return row
    ? {
        userId: row.user_id,
        name: row.name,
        email: row.email,
        purpose: row.purpose === "reset" ? ("reset" as const) : ("invite" as const),
      }
    : null;
}

export async function acceptInvite(token: string, passwordHash: string) {
  await ensureAuthTables();

  return sql().begin(async (transaction) => {
    const [invite] = await transaction<Array<{ user_id: string }>>`
      update app_invites
      set used_at = now()
      where token_hash = ${hashToken(token)}
        and used_at is null
        and expires_at > now()
      returning user_id
    `;

    if (!invite) {
      throw new Error("This link has expired or was already used. Ask an admin for a new one.");
    }

    const [row] = await transaction<UserRow[]>`
      update app_users
      set password_hash = ${passwordHash}, updated_at = now()
      where id = ${invite.user_id} and active
      returning id, email, name, role, active, password_hash, created_at, last_login_at
    `;

    if (!row) {
      throw new Error("This account is not active. Ask an admin for help.");
    }

    await transaction`delete from app_sessions where user_id = ${invite.user_id}`;

    return toUser(row);
  });
}

export async function createApiKey(name: string, createdBy: string) {
  await ensureAuthTables();
  const key = createSecretToken("stb_ro_");
  const [row] = await sql()<Array<{ id: string }>>`
    insert into app_api_keys (name, key_prefix, key_hash, created_by)
    values (${name.trim()}, ${key.slice(0, 12)}, ${hashToken(key)}, ${createdBy})
    returning id
  `;

  return { id: row.id, key };
}

export async function listApiKeys(): Promise<ApiKeyRecord[]> {
  await ensureAuthTables();
  const rows = await sql()<
    Array<{
      id: string;
      name: string;
      key_prefix: string;
      created_at: Date;
      created_by_name: string | null;
      last_used_at: Date | null;
      revoked_at: Date | null;
    }>
  >`
    select k.id, k.name, k.key_prefix, k.created_at, u.name as created_by_name,
      k.last_used_at, k.revoked_at
    from app_api_keys k
    left join app_users u on u.id = k.created_by
    order by k.revoked_at nulls first, k.created_at desc
  `;

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    keyPrefix: row.key_prefix,
    createdAt: row.created_at.toISOString(),
    createdByName: row.created_by_name,
    lastUsedAt: row.last_used_at?.toISOString() ?? null,
    revokedAt: row.revoked_at?.toISOString() ?? null,
  }));
}

export async function revokeApiKey(id: string) {
  await ensureAuthTables();
  const [row] = await sql()<Array<{ name: string }>>`
    update app_api_keys set revoked_at = now()
    where id = ${id} and revoked_at is null
    returning name
  `;

  return row?.name ?? null;
}

export async function verifyApiKey(key: string) {
  if (!hasDatabaseUrl() || !key.startsWith("stb_ro_")) {
    return null;
  }

  await ensureAuthTables();
  const [row] = await sql()<Array<{ id: string; name: string; last_used_at: Date | null }>>`
    select id, name, last_used_at
    from app_api_keys
    where key_hash = ${hashToken(key)} and revoked_at is null
  `;

  if (!row) {
    return null;
  }

  if (!row.last_used_at || Date.now() - row.last_used_at.getTime() > 60 * 1000) {
    void sql()`
      update app_api_keys set last_used_at = now() where id = ${row.id}
    `.catch(() => undefined);
  }

  return { id: row.id, name: row.name };
}
