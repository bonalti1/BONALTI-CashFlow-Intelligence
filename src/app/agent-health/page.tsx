import Link from "next/link";
import Image from "next/image";
import {
  Bot,
  Brain,
  ClipboardList,
  LayoutDashboard,
  NotebookText,
  ShieldCheck,
} from "lucide-react";

import { getAccountsSnapshot, type QboAccount } from "@/lib/qbo/accounts-store";
import { getConfirmedHouseName, isInternalBankAccount } from "@/lib/qbo/bank-account-map";
import { getQboConnectionStatus } from "@/lib/qbo/token-store";
import { getTransactionsSnapshotStatus } from "@/lib/qbo/transactions-store";

export const dynamic = "force-dynamic";

const PHASE_COUNT = 6;
const AVERAGE_PROFIT_TARGET = 60_000;
const MARKETING_PER_PHASE = (AVERAGE_PROFIT_TARGET * 0.15) / PHASE_COUNT;
const MANAGEMENT_PER_PHASE = (AVERAGE_PROFIT_TARGET * 0.2) / PHASE_COUNT;
const OPERATIONS_AFTER_CLOSE = AVERAGE_PROFIT_TARGET * 0.05;

function currency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function accountName(account: QboAccount) {
  return account.FullyQualifiedName ?? account.Name;
}

function bankBalance(account: QboAccount) {
  return account.CurrentBalance ?? 0;
}

function accountNameIncludes(account: QboAccount, matcher: string) {
  return accountName(account).toLowerCase().includes(matcher);
}

function sumAccountBalances(accounts: QboAccount[]) {
  return accounts.reduce((total, account) => total + bankBalance(account), 0);
}

export default async function AgentHealthPage() {
  const [snapshot, qboConnection, transactionStatus] = await Promise.all([
    getAccountsSnapshot().catch(() => null),
    getQboConnectionStatus(),
    getTransactionsSnapshotStatus(),
  ]);
  const bankAccounts = snapshot?.accounts.filter((account) => account.AccountType === "Bank") ?? [];
  const houses = bankAccounts.filter((account) => getConfirmedHouseName(account));
  const internalAccounts = bankAccounts.filter((account) => isInternalBankAccount(account));
  const incomeClearingAccounts = internalAccounts.filter((account) =>
    accountNameIncludes(account, "income clearing"),
  );
  const lastAccountSync = snapshot ? new Date(snapshot.syncedAt).toLocaleString() : "Not synced";
  const lastTransactionSync =
    transactionStatus.synced && transactionStatus.syncedAt
      ? new Date(transactionStatus.syncedAt).toLocaleString()
      : "Not synced yet";

  return (
    <main className="min-h-screen bg-[#f7f8f5] text-[#121a36]">
      <div className="grid min-h-screen grid-cols-[248px_1fr]">
        <aside className="border-r border-[#d9dee9] bg-white px-5 py-5">
          <div className="mb-8">
            <div className="mb-4 rounded-lg border border-[#d9dee9] bg-white p-3">
              <Image
                alt="South Texas Builders"
                className="h-auto w-full"
                height={1080}
                src="/south-texas-builders-logo.png"
                width={1080}
              />
            </div>
            <div>
              <div className="brand-heading text-base font-semibold text-[#121d49]">
                South Texas Builders
              </div>
              <div className="brand-kicker mt-1 text-[10px] font-medium uppercase text-[#ff332b]">
                Project Health Agent
              </div>
            </div>
          </div>

          <nav className="space-y-1">
            <NavItem href="/" icon={LayoutDashboard} label="Portfolio" />
            <NavItem href="/setup-inputs" icon={ClipboardList} label="Edit Price & Square Foot" />
            <NavItem href="/ai-health" icon={Brain} label="AI Health Center" />
            <NavItem active icon={NotebookText} label="Agent Health Notes" />
            <NavItem href="/setup" icon={ShieldCheck} label="Setup" />
          </nav>
        </aside>

        <section className="min-w-0 px-6 py-5">
          <header className="mb-5">
            <p className="brand-kicker text-xs font-bold uppercase text-[#ff332b]">
              Agent health notes
            </p>
            <h1 className="mt-1 text-3xl font-semibold text-[#121d49]">
              What The Agent Can Trust Today
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5f6b66]">
              This page keeps the agent explanation out of the way of the main dashboard. It shows
              what is real data today and what still needs the next data layer.
            </p>
          </header>

          <section className="mb-5 grid grid-cols-4 gap-3">
            <StatusCard label="QuickBooks" value={qboConnection.connected ? "Connected" : "Needs reconnect"} />
            <StatusCard label="House banks" value={String(houses.length)} />
            <StatusCard label="Internal banks" value={String(internalAccounts.length)} />
            <StatusCard
              label="Checks/payments"
              value={transactionStatus.synced ? String(transactionStatus.total) : "Not synced"}
            />
          </section>

          <section className="grid grid-cols-[1fr_420px] gap-4">
            <div className="space-y-4">
              <section className="rounded-lg border border-[#dfe5dc] bg-white p-4">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-[#fff0ef] text-[#ff332b]">
                    <Bot size={20} />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold">Plain-English Agent Note</h2>
                    <p className="text-xs text-[#69746f]">Read-only and no guessing</p>
                  </div>
                </div>
                <p className="text-sm leading-6 text-[#384641]">
                  The app can see {houses.length} confirmed house bank accounts and{" "}
                  {internalAccounts.length} internal bank accounts from QuickBooks. Today it can
                  trust QuickBooks bank balances, account mapping, and any synced checks/payments.
                  It should not make final budget or margin calls until house sale price, square
                  footage, city, and the phase budget rules are entered.
                </p>
              </section>

              <section className="rounded-lg border border-[#dfe5dc] bg-white p-4">
                <h2 className="text-sm font-semibold">Sync Status</h2>
                <div className="mt-3 space-y-3 text-sm text-[#4f5b56]">
                  <RuleRow label="Bank balances" value={lastAccountSync} />
                  <RuleRow label="Checks/payments" value={lastTransactionSync} />
                  <RuleRow label="QB connection" value={qboConnection.connected ? "Connected" : "Needs reconnect"} />
                </div>
              </section>

              <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <h2 className="text-sm font-semibold text-amber-900">Next Build Layer</h2>
                <p className="mt-2 text-sm leading-6 text-amber-800">
                  Next we turn the budget template into real saved phase rules. Then the dashboard
                  can say if Phase 1, Phase 2, and the full house are under or over budget.
                </p>
              </section>
            </div>

            <aside className="space-y-4">
              <section className="rounded-lg border border-[#dfe5dc] bg-white p-4">
                <h2 className="text-sm font-semibold">Internal Draw Rules</h2>
                <div className="mt-3 space-y-3 text-sm text-[#4f5b56]">
                  <RuleRow label="Average profit target" value={currency(AVERAGE_PROFIT_TARGET)} />
                  <RuleRow label="Marketing per phase" value={`${currency(MARKETING_PER_PHASE)} x ${PHASE_COUNT}`} />
                  <RuleRow label="Management per phase" value={`${currency(MANAGEMENT_PER_PHASE)} x ${PHASE_COUNT}`} />
                  <RuleRow label="Operations later" value={`${currency(OPERATIONS_AFTER_CLOSE)} after close`} />
                </div>
              </section>

              <section className="rounded-lg border border-[#dfe5dc] bg-white p-4">
                <h2 className="text-sm font-semibold">Internal Accounts Seen</h2>
                <div className="mt-3 space-y-3 text-sm text-[#4f5b56]">
                  {internalAccounts.map((account) => (
                    <RuleRow
                      key={account.Id}
                      label={accountName(account)}
                      value={currency(bankBalance(account))}
                    />
                  ))}
                </div>
              </section>

              {incomeClearingAccounts.length > 0 ? (
                <section className="rounded-lg border border-[#dfe5dc] bg-white p-4">
                  <h2 className="text-sm font-semibold">Income Clearing</h2>
                  <p className="mt-2 text-sm leading-6 text-[#4f5b56]">
                    Balance: {currency(sumAccountBalances(incomeClearingAccounts))}. This is
                    separate so it does not get mixed into house health.
                  </p>
                </section>
              ) : null}
            </aside>
          </section>
        </section>
      </div>
    </main>
  );
}

function StatusCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#dfe5dc] bg-white p-4">
      <div className="text-xs font-medium uppercase text-[#69746f]">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function RuleRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-[#edf0eb] pb-2 last:border-b-0 last:pb-0">
      <span>{label}</span>
      <span className="text-right font-medium text-[#18211f]">{value}</span>
    </div>
  );
}

function NavItem({
  icon: Icon,
  label,
  active = false,
  href,
}: {
  icon: typeof LayoutDashboard;
  label: string;
  active?: boolean;
  href?: string;
}) {
  const className = `flex h-10 w-full items-center gap-3 rounded-md px-3 text-left text-sm ${
    active
      ? "bg-[#fff0ef] font-bold text-[#ff332b]"
      : "text-[#5f6b66] hover:bg-[#fff0ef] hover:text-[#ff332b]"
  }`;

  if (href) {
    return (
      <Link className={className} href={href}>
        <Icon size={17} />
        {label}
      </Link>
    );
  }

  return (
    <div className={className}>
      <Icon size={17} />
      {label}
    </div>
  );
}
