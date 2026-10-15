import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { hasDatabaseUrl, sql } from "@/lib/db/raw";
import { runOnce } from "@/lib/db/run-once";
import { clearTtlCache, readTtlCache } from "@/lib/performance/ttl-cache";

type QboAccount = {
  Id: string;
  Name: string;
  FullyQualifiedName?: string;
  AccountType?: string;
  AccountSubType?: string;
  Classification?: string;
  CurrentBalance?: number;
  Active?: boolean;
  ParentRef?: {
    value?: string;
    name?: string;
  };
  SubAccount?: boolean;
};

type AccountsSnapshot = {
  realmId: string;
  syncedAt: string;
  total: number;
  accounts: QboAccount[];
};

const dataDir = path.join(process.cwd(), ".data");
const accountsPath = path.join(dataDir, "qbo-accounts.json");
const accountsSnapshotCacheKey = "qbo:accounts-snapshot";
const accountsSnapshotTtlMs = 60_000;

const ensureAccountsTables = runOnce(initializeAccountsTables);

export function ensureQboAccountTables() {
  return ensureAccountsTables();
}

async function initializeAccountsTables() {
  await sql()`
    create table if not exists qbo_account_snapshots (
      realm_id text primary key,
      synced_at timestamptz not null,
      total integer not null,
      updated_at timestamptz not null default now()
    )
  `;
  await sql()`
    create table if not exists qb_accounts (
      qbo_id text primary key,
      realm_id text not null,
      name text not null,
      fully_qualified_name text,
      account_type text,
      account_sub_type text,
      classification text,
      current_balance numeric,
      active boolean,
      parent_qbo_id text,
      parent_name text,
      sub_account boolean,
      raw jsonb not null,
      updated_at timestamptz not null default now()
    )
  `;
}

export async function saveAccountsSnapshot(snapshot: AccountsSnapshot) {
  clearTtlCache(accountsSnapshotCacheKey);

  if (hasDatabaseUrl()) {
    await ensureAccountsTables();
    await sql().begin(async (transaction) => {
      await transaction`
        insert into qbo_account_snapshots (realm_id, synced_at, total, updated_at)
        values (${snapshot.realmId}, ${snapshot.syncedAt}, ${snapshot.total}, now())
        on conflict (realm_id) do update set
          synced_at = excluded.synced_at,
          total = excluded.total,
          updated_at = now()
      `;

      for (const account of snapshot.accounts) {
        await transaction`
          insert into qb_accounts (
            qbo_id,
            realm_id,
            name,
            fully_qualified_name,
            account_type,
            account_sub_type,
            classification,
            current_balance,
            active,
            parent_qbo_id,
            parent_name,
            sub_account,
            raw,
            updated_at
          )
          values (
            ${account.Id},
            ${snapshot.realmId},
            ${account.Name},
            ${account.FullyQualifiedName ?? null},
            ${account.AccountType ?? null},
            ${account.AccountSubType ?? null},
            ${account.Classification ?? null},
            ${account.CurrentBalance ?? null},
            ${account.Active ?? null},
            ${account.ParentRef?.value ?? null},
            ${account.ParentRef?.name ?? null},
            ${account.SubAccount ?? null},
            ${transaction.json(account)},
            now()
          )
          on conflict (qbo_id) do update set
            realm_id = excluded.realm_id,
            name = excluded.name,
            fully_qualified_name = excluded.fully_qualified_name,
            account_type = excluded.account_type,
            account_sub_type = excluded.account_sub_type,
            classification = excluded.classification,
            current_balance = excluded.current_balance,
            active = excluded.active,
            parent_qbo_id = excluded.parent_qbo_id,
            parent_name = excluded.parent_name,
            sub_account = excluded.sub_account,
            raw = excluded.raw,
            updated_at = now()
        `;
      }
    });

    return snapshot;
  }

  await mkdir(dataDir, { recursive: true });
  await writeFile(accountsPath, JSON.stringify(snapshot, null, 2), "utf8");

  return snapshot;
}

export async function getAccountsSnapshotStatus() {
  if (hasDatabaseUrl()) {
    try {
      await ensureAccountsTables();
      const rows = await sql()<
        Array<{
          realm_id: string;
          synced_at: Date;
          total: number;
        }>
      >`
        select realm_id, synced_at, total
        from qbo_account_snapshots
        order by updated_at desc
        limit 1
      `;
      const snapshot = rows[0];

      if (!snapshot) {
        return {
          synced: false,
        };
      }

      return {
        synced: true,
        realmId: snapshot.realm_id,
        syncedAt: snapshot.synced_at.toISOString(),
        total: snapshot.total,
      };
    } catch {
      return {
        synced: false,
      };
    }
  }

  try {
    const snapshot = JSON.parse(
      await readFile(accountsPath, "utf8"),
    ) as AccountsSnapshot;

    return {
      synced: true,
      realmId: snapshot.realmId,
      syncedAt: snapshot.syncedAt,
      total: snapshot.total,
    };
  } catch {
    return {
      synced: false,
    };
  }
}

type AccountRow = {
  qbo_id: string;
  name: string;
  fully_qualified_name: string | null;
  account_type: string | null;
  account_sub_type: string | null;
  classification: string | null;
  current_balance: string | null;
  active: boolean | null;
  parent_qbo_id: string | null;
  parent_name: string | null;
  sub_account: boolean | null;
};

function accountFromRow(row: AccountRow): QboAccount {
  const parent =
    row.parent_qbo_id || row.parent_name
      ? {
          value: row.parent_qbo_id ?? undefined,
          name: row.parent_name ?? undefined,
        }
      : undefined;

  return {
    Id: row.qbo_id,
    Name: row.name,
    FullyQualifiedName: row.fully_qualified_name ?? undefined,
    AccountType: row.account_type ?? undefined,
    AccountSubType: row.account_sub_type ?? undefined,
    Classification: row.classification ?? undefined,
    CurrentBalance:
      row.current_balance === null ? undefined : Number(row.current_balance),
    Active: row.active ?? undefined,
    ParentRef: parent,
    SubAccount: row.sub_account ?? undefined,
  };
}

export async function getBankAccounts() {
  if (!hasDatabaseUrl()) {
    return [] as QboAccount[];
  }

  await ensureAccountsTables();
  const rows = await sql()<Array<AccountRow>>`
    select
      qbo_id,
      name,
      fully_qualified_name,
      account_type,
      account_sub_type,
      classification,
      current_balance,
      active,
      parent_qbo_id,
      parent_name,
      sub_account
    from qb_accounts
    where account_type = 'Bank'
    order by coalesce(fully_qualified_name, name)
  `;

  return rows.map(accountFromRow);
}

async function loadAccountsSnapshot() {
  if (hasDatabaseUrl()) {
    await ensureAccountsTables();
    const snapshots = await sql()<
      Array<{
        realm_id: string;
        synced_at: Date;
        total: number;
      }>
    >`
      select realm_id, synced_at, total
      from qbo_account_snapshots
      order by updated_at desc
      limit 1
    `;
    const snapshot = snapshots[0];

    if (!snapshot) {
      throw new Error("No Chart of Accounts snapshot exists yet.");
    }

    const accounts = await sql()<Array<AccountRow>>`
      select
        qbo_id,
        name,
        fully_qualified_name,
        account_type,
        account_sub_type,
        classification,
        current_balance,
        active,
        parent_qbo_id,
        parent_name,
        sub_account
      from qb_accounts
      where realm_id = ${snapshot.realm_id}
      order by coalesce(fully_qualified_name, name)
    `;

    return {
      realmId: snapshot.realm_id,
      syncedAt: snapshot.synced_at.toISOString(),
      total: snapshot.total,
      accounts: accounts.map(accountFromRow),
    };
  }

  return JSON.parse(await readFile(accountsPath, "utf8")) as AccountsSnapshot;
}

export async function getAccountsSnapshot() {
  return readTtlCache(
    accountsSnapshotCacheKey,
    accountsSnapshotTtlMs,
    loadAccountsSnapshot,
  );
}

export type { QboAccount };
