import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  clampTransactionLimit,
  clampTransactionOffset,
  datesWithinTransferWindow,
  decodeTransactionCursor,
  encodeTransactionCursor,
  isOppositeAmount,
  maxTransactionLimit,
  parseIsoDate,
} from "./transaction-page.ts";

describe("transaction page limits", () => {
  it("defaults to 500 and rejects anything above 2000", () => {
    assert.equal(clampTransactionLimit(null).ok && clampTransactionLimit(null).limit, 500);
    assert.equal(clampTransactionLimit("2000").ok && clampTransactionLimit("2000").limit, maxTransactionLimit);
    assert.equal(clampTransactionLimit("2001").ok, false);
    assert.equal(clampTransactionLimit("0").ok, false);
    assert.equal(clampTransactionLimit("nope").ok, false);
  });

  it("accepts an offset and rejects a negative one", () => {
    assert.equal(clampTransactionOffset(null).ok && clampTransactionOffset(null).offset, 0);
    assert.equal(clampTransactionOffset("25").ok && clampTransactionOffset("25").offset, 25);
    assert.equal(clampTransactionOffset("-1").ok, false);
  });
});

describe("transaction cursor", () => {
  it("round-trips a date and transaction id", () => {
    const cursor = encodeTransactionCursor("2026-10-01", "txn-7523");

    assert.deepEqual(decodeTransactionCursor(cursor), { date: "2026-10-01", id: "txn-7523" });
    assert.equal(decodeTransactionCursor("not-a-cursor"), null);
    assert.equal(cursor.includes("access_token"), false);
  });
});

describe("internal transfer hint", () => {
  it("matches an opposite amount within 3 days and not beyond that", () => {
    assert.equal(isOppositeAmount(250, -250), true);
    assert.equal(isOppositeAmount(250, 250), false);
    assert.equal(isOppositeAmount(0, 0), false);
    assert.equal(datesWithinTransferWindow("2026-10-01", "2026-10-04"), true);
    assert.equal(datesWithinTransferWindow("2026-10-04", "2026-10-01"), true);
    assert.equal(datesWithinTransferWindow("2026-10-01", "2026-10-05"), false);
  });
});

describe("parseIsoDate", () => {
  it("accepts a real calendar date", () => {
    assert.deepEqual(parseIsoDate("2026-02-31"), { ok: false });
    assert.deepEqual(parseIsoDate("2026-10-15"), { ok: true, date: "2026-10-15" });
    assert.deepEqual(parseIsoDate(null), { ok: true, date: null });
  });
});
