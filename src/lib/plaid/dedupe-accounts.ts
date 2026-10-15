// Pure helpers for Plaid account identity. No database and no access tokens.

export const balanceRefreshWindowMs = 5 * 60 * 1000;

export const publicBalanceFields = [
  "name",
  "mask",
  "type",
  "current",
  "available",
  "iso_currency",
] as const;

export type PublicBalance = {
  name: string;
  mask: string | null;
  type: string | null;
  current: number | null;
  available: number | null;
  iso_currency: string | null;
};

export type DedupeFields = {
  id: string;
  mask: string | null;
  institutionKey: string | null;
  type: string | null;
  balanceAsOf: string | null;
  updatedAt: string;
  linked: boolean;
  itemConnectedAt: string | null;
};

export type CanonicalItem = {
  itemId: string;
  institutionKey: string | null;
  connectedAt: string;
  needsSignIn: boolean;
};

// Skip a new Plaid call when the last successful refresh is under 5 minutes old.
export function withinRefreshWindow(
  lastAt: Date | string | null,
  now: number,
  windowMs = balanceRefreshWindowMs,
) {
  if (!lastAt) {
    return false;
  }

  const time = lastAt instanceof Date ? lastAt.getTime() : new Date(lastAt).getTime();

  return Number.isFinite(time) && now - time < windowMs;
}

export function toPublicBalance(account: {
  name: string;
  mask: string | null;
  type: string | null;
  current: number | null;
  available: number | null;
  currency: string | null;
}): PublicBalance {
  return {
    name: account.name,
    mask: account.mask,
    type: account.type,
    current: account.current,
    available: account.available,
    iso_currency: account.currency,
  };
}

function rank(row: DedupeFields) {
  return [
    row.linked ? "1" : "0",
    row.balanceAsOf ?? "",
    row.itemConnectedAt ?? "",
    row.updatedAt,
    row.id,
  ];
}

function prefer<T extends DedupeFields>(current: T, candidate: T) {
  const left = rank(current);
  const right = rank(candidate);

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] === right[index]) {
      continue;
    }

    return left[index] > right[index] ? current : candidate;
  }

  return current;
}

// Collapse rows that are the same Plaid account_id, then rows that are the same
// physical account: mask + institution + type. A missing mask stays on its own,
// because the last four digits are what tells two logins apart.
export function dedupePlaidAccounts<T extends DedupeFields>(accounts: T[]) {
  const byId = new Map<string, T>();

  for (const account of accounts) {
    const current = byId.get(account.id);

    byId.set(account.id, current ? prefer(current, account) : account);
  }

  const byPhysical = new Map<string, T>();
  const unmatched: T[] = [];

  for (const account of byId.values()) {
    if (!account.mask || !account.institutionKey) {
      unmatched.push(account);
      continue;
    }

    const key = [account.institutionKey, account.mask, account.type ?? ""].join("|");
    const current = byPhysical.get(key);

    byPhysical.set(key, current ? prefer(current, account) : account);
  }

  return [...byPhysical.values(), ...unmatched].sort(
    (left, right) => (left.mask ?? "").localeCompare(right.mask ?? "") || left.id.localeCompare(right.id),
  );
}

// One login per institution. The newest login that does not need a fresh sign-in
// is the one we ask Plaid about. Older logins of the same bank stay in the database.
export function pickCanonicalItems<T extends CanonicalItem>(items: T[]) {
  const groups = new Map<string, T[]>();

  for (const item of items) {
    const key = item.institutionKey ?? `item:${item.itemId}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  const keep: T[] = [];
  const skipped: T[] = [];

  for (const group of groups.values()) {
    const newestFirst = [...group].sort((left, right) => right.connectedAt.localeCompare(left.connectedAt));
    const chosen = newestFirst.find((item) => !item.needsSignIn) ?? newestFirst[0];

    keep.push(chosen);

    for (const item of newestFirst) {
      if (item.itemId !== chosen.itemId) {
        skipped.push(item);
      }
    }
  }

  return { keep, skipped };
}
