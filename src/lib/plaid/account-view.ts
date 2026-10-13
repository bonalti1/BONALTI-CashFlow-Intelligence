// Shared by the Bank Feed server page and its client component, so it must stay free of
// server-only imports.

export type AccountRow = {
  id: string;
  itemId: string;
  institutionKey: string;
  institutionName: string;
  name: string;
  officialName: string | null;
  mask: string | null;
  type: string | null;
  subtype: string | null;
  available: number | null;
  current: number | null;
  balanceAsOf: string | null;
  balanceSource: "live" | "bank_update" | "unknown";
  reportedByBank: boolean;
  connectionStatus: "live" | "last_known" | "needs_sign_in" | "error" | "unchecked";
  connectionMessage: string | null;
  projectLabel: string | null;
  projectNumber: number | null;
};

export type AccountState =
  | "live"
  | "last_known"
  | "needs_sign_in"
  | "not_reported"
  | "duplicate";

export const liveWindowMs = 15 * 60 * 1000;

export function accountKind(row: AccountRow) {
  if (row.type === "credit" || row.type === "loan") {
    return "debt" as const;
  }

  if (row.type === null || row.type === "depository") {
    return "cash" as const;
  }

  return "other" as const;
}

// The same bank connected twice shows every account twice. Keep the copy linked to a
// project (then the one with the newest balance) and count the rest once.
export function findDuplicateAccounts(rows: AccountRow[]) {
  const groups = new Map<string, AccountRow[]>();

  for (const row of rows) {
    if (!row.mask) {
      continue;
    }

    const key = [row.institutionKey, row.name.trim().toLowerCase(), row.mask, row.subtype ?? ""].join("|");
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const duplicates = new Map<string, AccountRow>();

  for (const group of groups.values()) {
    if (group.length < 2 || new Set(group.map((row) => row.itemId)).size < 2) {
      continue;
    }

    const [keep, ...rest] = [...group].sort(
      (a, b) =>
        Number(Boolean(b.projectLabel)) - Number(Boolean(a.projectLabel)) ||
        (b.balanceAsOf ?? "").localeCompare(a.balanceAsOf ?? ""),
    );

    for (const row of rest) {
      duplicates.set(row.id, keep);
    }
  }

  return duplicates;
}

export function accountState(
  row: AccountRow,
  duplicates: Map<string, AccountRow>,
  now: number,
): AccountState {
  if (duplicates.has(row.id)) {
    return "duplicate";
  }

  if (!row.reportedByBank) {
    return "not_reported";
  }

  if (
    row.balanceSource === "live" &&
    row.balanceAsOf &&
    now - new Date(row.balanceAsOf).getTime() < liveWindowMs
  ) {
    return "live";
  }

  if (row.connectionStatus === "needs_sign_in") {
    return "needs_sign_in";
  }

  return "last_known";
}

export function spendable(row: AccountRow) {
  return row.available ?? row.current ?? 0;
}

export function summarizeAccounts(rows: AccountRow[], now: number) {
  const duplicates = findDuplicateAccounts(rows);
  let cashAvailable = 0;
  let cashCurrent = 0;
  let liveAvailable = 0;
  let notLiveAvailable = 0;
  let owed = 0;
  let counted = 0;
  const states: Record<AccountState, number> = {
    live: 0,
    last_known: 0,
    needs_sign_in: 0,
    not_reported: 0,
    duplicate: 0,
  };

  for (const row of rows) {
    const state = accountState(row, duplicates, now);

    states[state] += 1;

    if (state === "duplicate" || state === "not_reported") {
      continue;
    }

    const kind = accountKind(row);

    if (kind === "debt") {
      owed += Math.abs(row.current ?? 0);
      continue;
    }

    if (kind !== "cash") {
      continue;
    }

    counted += 1;
    cashAvailable += spendable(row);
    cashCurrent += row.current ?? 0;

    if (state === "live") {
      liveAvailable += spendable(row);
    } else {
      notLiveAvailable += spendable(row);
    }
  }

  return {
    cashAvailable,
    cashCurrent,
    counted,
    duplicates,
    liveAvailable,
    notLiveAvailable,
    owed,
    states,
  };
}
