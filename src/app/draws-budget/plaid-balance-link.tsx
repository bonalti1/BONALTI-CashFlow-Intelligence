"use client";

import { useState } from "react";
import { Check, ChevronDown, LoaderCircle, Landmark } from "lucide-react";

import { linkProjectPlaidAccount, listPlaidAccountsForLink } from "@/app/actions/plaid";

type PlaidAccountOption = {
  id: string;
  name: string;
  officialName: string | null;
  mask: string | null;
  currentBalance: number | null;
  availableBalance: number | null;
  linkedHouseName: string | null;
  linkedQboBankAccountId: string | null;
};

function currency(value: number | null) {
  if (value === null) {
    return "Pending";
  }

  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

export function PlaidBalanceLink({
  balance,
  houseName,
  qboBankAccountId,
}: {
  balance: number | null;
  houseName: string;
  qboBankAccountId: string;
}) {
  const [accounts, setAccounts] = useState<PlaidAccountOption[]>([]);
  const [currentBalance, setCurrentBalance] = useState(balance);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState("");

  async function openPicker() {
    const nextOpen = !open;
    setOpen(nextOpen);
    setError(null);

    if (!nextOpen || accounts.length > 0) {
      return;
    }

    setLoading(true);

    try {
      const payload = await listPlaidAccountsForLink();

      if (!payload.ok) {
        throw new Error(payload.message);
      }

      const nextAccounts = payload.accounts;
      const linked = nextAccounts.find(
        (account) => account.linkedQboBankAccountId === qboBankAccountId,
      );

      setAccounts(nextAccounts);
      setSelectedId(linked?.id ?? "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load accounts.");
    } finally {
      setLoading(false);
    }
  }

  async function linkAccount() {
    if (!selectedId) {
      setError("Choose a bank account first.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = await linkProjectPlaidAccount({
        houseName,
        plaidAccountId: selectedId,
        qboBankAccountId,
      });

      if (!payload.ok) {
        throw new Error(payload.message);
      }

      setCurrentBalance(payload.account.currentBalance);
      setOpen(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to link account.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative w-full">
      <button
        aria-expanded={open}
        className="w-full rounded-[8px] border border-[#b9dec9] bg-[#eaf7f0] px-2 py-1.5 text-center uppercase text-[#1f6f4b] transition hover:border-[#2f9b72] hover:bg-[#e1f3e9]"
        onClick={openPicker}
        title="Link this project to a connected Plaid bank account"
        type="button"
      >
        <span className="flex items-center justify-center gap-1 text-[8px] font-extrabold tracking-[0.1em]">
          Plaid balance
          <ChevronDown className={`h-3 w-3 transition ${open ? "rotate-180" : ""}`} />
        </span>
        <span className="mt-0.5 block text-[10px] font-extrabold tracking-[0.04em]">
          {currentBalance === null ? "Link account" : currency(currentBalance)}
        </span>
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[320px] rounded-[12px] border border-[#d8d5ca] bg-white p-3 text-left shadow-[0_18px_50px_-20px_rgba(14,27,54,0.45)]">
          <div className="flex items-center gap-2 text-[#16294d]">
            <Landmark className="h-4 w-4" />
            <div>
              <div className="text-xs font-extrabold uppercase tracking-[0.08em]">
                Link bank account
              </div>
              <div className="mt-0.5 text-[11px] font-semibold text-[#7b8298]">
                {houseName}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="mt-3 flex items-center gap-2 rounded-[8px] bg-[#f6f5f0] px-3 py-3 text-xs font-bold text-[#7b8298]">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Loading connected accounts
            </div>
          ) : (
            <select
              className="mt-3 w-full rounded-[8px] border border-[#d8d5ca] bg-white px-3 py-2.5 text-xs font-bold text-[#16294d] outline-none focus:border-[#2f9b72]"
              onChange={(event) => setSelectedId(event.target.value)}
              value={selectedId}
            >
              <option value="">Choose a Plaid account</option>
              {accounts.map((account) => {
                const linkedElsewhere =
                  Boolean(account.linkedQboBankAccountId) &&
                  account.linkedQboBankAccountId !== qboBankAccountId;

                return (
                  <option disabled={linkedElsewhere} key={account.id} value={account.id}>
                    {account.name}
                    {account.mask ? ` •••• ${account.mask}` : ""}
                    {` · ${currency(account.currentBalance)}`}
                    {linkedElsewhere
                      ? ` · Linked to ${account.linkedHouseName ?? "another project"}`
                      : ""}
                  </option>
                );
              })}
            </select>
          )}

          {error ? (
            <p className="mt-2 text-[11px] font-bold leading-4 text-[#b32f24]">{error}</p>
          ) : null}

          <button
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-[8px] bg-[#16294d] px-3 py-2.5 text-xs font-extrabold uppercase tracking-[0.08em] text-white disabled:cursor-not-allowed disabled:opacity-45"
            disabled={loading || saving || !selectedId}
            onClick={linkAccount}
            type="button"
          >
            {saving ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {saving ? "Linking" : "Link account"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
