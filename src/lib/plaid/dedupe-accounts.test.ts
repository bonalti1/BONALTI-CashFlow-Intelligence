import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  dedupePlaidAccounts,
  pickCanonicalItems,
  publicBalanceFields,
  toPublicBalance,
  withinRefreshWindow,
  type DedupeFields,
} from "./dedupe-accounts.ts";

function row(overrides: Partial<DedupeFields> & Pick<DedupeFields, "id">): DedupeFields {
  return {
    mask: "7523",
    institutionKey: "ins_111355",
    type: "depository",
    balanceAsOf: "2026-10-14T11:49:24.000Z",
    updatedAt: "2026-10-14T11:49:24.000Z",
    linked: false,
    itemConnectedAt: "2026-10-13T04:11:30.000Z",
    ...overrides,
  };
}

describe("dedupePlaidAccounts", () => {
  it("collapses the same Plaid account_id before it looks at the mask", () => {
    const older = row({
      id: "acct-same",
      mask: "1111",
      balanceAsOf: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    });
    const newer = row({
      id: "acct-same",
      mask: "7523",
      balanceAsOf: "2026-10-14T00:00:00.000Z",
      updatedAt: "2026-10-14T00:00:00.000Z",
    });

    const [kept] = dedupePlaidAccounts([older, newer]);

    assert.equal(kept.mask, "7523");
    assert.equal(dedupePlaidAccounts([older, newer]).length, 1);
  });

  it("collapses the same mask at the same institution and type, and keeps a different type", () => {
    const copies = [1, 2, 3, 4, 5].map((copy) =>
      row({
        id: `acct-${copy}`,
        itemConnectedAt: `2026-10-13T04:0${copy}:00.000Z`,
        balanceAsOf: `2026-10-14T11:49:2${copy}.000Z`,
      }),
    );
    const savings = row({ id: "savings", mask: "7523", type: "credit" });
    const otherBank = row({ id: "other-bank", institutionKey: "ins_other" });
    const noMask = row({ id: "no-mask", mask: null });

    const kept = dedupePlaidAccounts([...copies, savings, otherBank, noMask]);
    const ids = kept.map((account) => account.id).sort();

    assert.deepEqual(ids, ["acct-5", "no-mask", "other-bank", "savings"]);
  });

  it("keeps a linked copy ahead of a newer unlinked copy", () => {
    const linked = row({
      id: "linked",
      linked: true,
      itemConnectedAt: "2026-06-19T05:38:51.000Z",
      balanceAsOf: "2026-06-19T05:38:51.000Z",
    });
    const newer = row({
      id: "newer",
      itemConnectedAt: "2026-10-13T04:11:30.000Z",
      balanceAsOf: "2026-10-14T11:49:24.000Z",
    });

    assert.equal(dedupePlaidAccounts([newer, linked])[0].id, "linked");
  });
});

describe("pickCanonicalItems", () => {
  it("asks Plaid once per institution and keeps the newest login that still works", () => {
    const items = [1, 2, 3, 4, 5, 6].map((copy) => ({
      itemId: `item-${copy}`,
      institutionKey: "ins_111355",
      connectedAt: `2026-10-13T04:0${copy}:00.000Z`,
      needsSignIn: copy === 6,
    }));

    const picked = pickCanonicalItems(items);

    assert.deepEqual(
      picked.keep.map((item) => item.itemId),
      ["item-5"],
    );
    assert.equal(picked.skipped.length, 5);
  });

  it("does not merge logins that have no institution id", () => {
    const picked = pickCanonicalItems([
      { itemId: "a", institutionKey: null, connectedAt: "2026-10-01T00:00:00.000Z", needsSignIn: false },
      { itemId: "b", institutionKey: null, connectedAt: "2026-10-02T00:00:00.000Z", needsSignIn: false },
    ]);

    assert.equal(picked.keep.length, 2);
    assert.equal(picked.skipped.length, 0);
  });
});

describe("withinRefreshWindow", () => {
  const now = Date.parse("2026-10-15T18:00:00.000Z");

  it("skips a refresh that succeeded under 5 minutes ago", () => {
    assert.equal(withinRefreshWindow("2026-10-15T17:55:01.000Z", now), true);
    assert.equal(withinRefreshWindow("2026-10-15T17:55:00.000Z", now), false);
    assert.equal(withinRefreshWindow(null, now), false);
  });
});

describe("toPublicBalance", () => {
  it("returns only the public balance fields", () => {
    const balance = toPublicBalance({
      name: "LSNB Business Checking",
      mask: "7523",
      type: "depository",
      current: 10,
      available: 8,
      currency: "USD",
    });

    assert.deepEqual(Object.keys(balance), [...publicBalanceFields]);
    assert.equal("access_token" in balance, false);
    assert.equal(balance.iso_currency, "USD");
  });
});
