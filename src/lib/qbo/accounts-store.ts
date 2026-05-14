import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type QboAccount = {
  Id: string;
  Name: string;
  FullyQualifiedName?: string;
  AccountType?: string;
  AccountSubType?: string;
  Classification?: string;
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

export async function saveAccountsSnapshot(snapshot: AccountsSnapshot) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(accountsPath, JSON.stringify(snapshot, null, 2), "utf8");

  return snapshot;
}

export async function getAccountsSnapshotStatus() {
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

export async function getAccountsSnapshot() {
  return JSON.parse(await readFile(accountsPath, "utf8")) as AccountsSnapshot;
}

export type { QboAccount };
