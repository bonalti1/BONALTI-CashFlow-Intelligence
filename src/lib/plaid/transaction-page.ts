// Paging helpers for the read-only transaction feed. No database and no access tokens.

export const defaultTransactionLimit = 500;
export const maxTransactionLimit = 2000;
export const internalTransferWindowDays = 3;

export function clampTransactionLimit(value: string | null) {
  if (value === null || value.trim() === "") {
    return { ok: true as const, limit: defaultTransactionLimit };
  }

  if (!/^\d+$/.test(value)) {
    return { ok: false as const };
  }

  const limit = Number(value);

  if (limit < 1 || limit > maxTransactionLimit) {
    return { ok: false as const };
  }

  return { ok: true as const, limit };
}

export function clampTransactionOffset(value: string | null) {
  if (value === null || value.trim() === "") {
    return { ok: true as const, offset: 0 };
  }

  if (!/^\d+$/.test(value)) {
    return { ok: false as const };
  }

  const offset = Number(value);

  if (!Number.isSafeInteger(offset)) {
    return { ok: false as const };
  }

  return { ok: true as const, offset };
}

export function parseIsoDate(value: string | null) {
  if (value === null || value.trim() === "") {
    return { ok: true as const, date: null };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { ok: false as const };
  }

  const parsed = new Date(`${value}T00:00:00Z`);

  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return { ok: false as const };
  }

  return { ok: true as const, date: value };
}

export function encodeTransactionCursor(date: string, id: string) {
  return Buffer.from(`${date}\n${id}`, "utf8").toString("base64url");
}

export function decodeTransactionCursor(cursor: string) {
  if (!cursor || cursor.length > 400) {
    return null;
  }

  const text = Buffer.from(cursor, "base64url").toString("utf8");
  const splitAt = text.indexOf("\n");

  if (splitAt <= 0) {
    return null;
  }

  const date = text.slice(0, splitAt);
  const id = text.slice(splitAt + 1);
  const parsed = parseIsoDate(date);

  if (!parsed.ok || !parsed.date || !id || id.length > 200 || id.includes("\n")) {
    return null;
  }

  return { date: parsed.date, id };
}

export function isOppositeAmount(left: number, right: number) {
  return left !== 0 && Object.is(left, -right);
}

export function datesWithinTransferWindow(left: string, right: string) {
  const start = Date.parse(`${left}T00:00:00Z`);
  const end = Date.parse(`${right}T00:00:00Z`);

  if (Number.isNaN(start) || Number.isNaN(end)) {
    return false;
  }

  return Math.abs(start - end) <= internalTransferWindowDays * 24 * 60 * 60 * 1000;
}
