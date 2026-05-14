import Link from "next/link";
import {
  CheckCircle2,
  CircleAlert,
  Database,
  KeyRound,
  ListTree,
  PlugZap,
} from "lucide-react";

import { getEnvStatus, type ServerEnvKey } from "@/lib/env";
import { getAccountsSnapshotStatus } from "@/lib/qbo/accounts-store";
import { getQboConnectionStatus } from "@/lib/qbo/token-store";

export const dynamic = "force-dynamic";

type SetupStep = {
  title: string;
  body: string;
  complete?: boolean;
  envKey?: ServerEnvKey;
};

const setupSteps: SetupStep[] = [
  {
    title: "App scaffold",
    body: "The app frame is built and running locally.",
    complete: true,
  },
  {
    title: "Database connection",
    body: "Needed so the app can store houses, QuickBooks accounts, checks, budgets, and agent notes.",
    envKey: "DATABASE_URL",
  },
  {
    title: "QuickBooks app keys",
    body: "Needed so QuickBooks knows this app is allowed to ask you for read-only access.",
    envKey: "QBO_CLIENT_ID",
  },
  {
    title: "QuickBooks secret",
    body: "Needed on the server only. This is never shown in the browser.",
    envKey: "QBO_CLIENT_SECRET",
  },
  {
    title: "OpenAI key",
    body: "Needed later so the agent can write plain-English health notes.",
    envKey: "OPENAI_API_KEY",
  },
  {
    title: "QuickBooks OAuth connection",
    body: "After keys are present, we can click Connect and QuickBooks will send us back with a company ID.",
    complete: false,
  },
];

export default async function SetupPage() {
  const envStatus = getEnvStatus();
  const qboConnection = await getQboConnectionStatus();
  const accountsSnapshot = await getAccountsSnapshotStatus();
  const configured = new Map(envStatus.map((item) => [item.key, item.configured]));
  const qboReady =
    configured.get("QBO_CLIENT_ID") &&
    configured.get("QBO_CLIENT_SECRET") &&
    configured.get("QBO_REDIRECT_URI") &&
    configured.get("QBO_ENVIRONMENT");

  return (
    <main className="min-h-screen bg-[#f7f8f5] px-6 py-6 text-[#18211f]">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase text-[#69746f]">Setup</p>
            <h1 className="mt-1 text-2xl font-semibold">Connection Checklist</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5f6b66]">
              This page tells us what the app can see right now. It only shows
              yes or no. It does not show secret values.
            </p>
          </div>
          <Link
            className="rounded-md border border-[#ccd6cf] bg-white px-3 py-2 text-sm font-medium"
            href="/"
          >
            Back to dashboard
          </Link>
        </div>

        <section className="mb-5 grid grid-cols-4 gap-3">
          <StatusCard
            icon={Database}
            label="Database"
            ready={Boolean(configured.get("DATABASE_URL"))}
          />
          <StatusCard icon={PlugZap} label="QuickBooks keys" ready={Boolean(qboReady)} />
          <StatusCard
            icon={PlugZap}
            label="QuickBooks connection"
            ready={qboConnection.connected}
          />
          <StatusCard
            icon={ListTree}
            label="Chart of Accounts"
            ready={accountsSnapshot.synced}
          />
          <StatusCard
            icon={KeyRound}
            label="Agent key"
            ready={Boolean(configured.get("OPENAI_API_KEY"))}
          />
        </section>

        <section className="rounded-lg border border-[#dfe5dc] bg-white">
          {setupSteps.map((step, index) => {
            const complete =
              step.complete ?? Boolean(step.envKey && configured.get(step.envKey));
            const Icon = complete ? CheckCircle2 : CircleAlert;

            return (
              <div
                className="grid grid-cols-[42px_1fr_120px] gap-3 border-b border-[#edf0eb] px-4 py-4 last:border-b-0"
                key={step.title}
              >
                <div
                  className={`flex size-9 items-center justify-center rounded-md ${
                    complete ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                  }`}
                >
                  <Icon size={18} />
                </div>
                <div>
                  <div className="text-sm font-semibold">
                    {index + 1}. {step.title}
                  </div>
                  <div className="mt-1 text-sm text-[#5f6b66]">{step.body}</div>
                  {step.envKey ? (
                    <div className="mt-2 font-mono text-xs text-[#69746f]">{step.envKey}</div>
                  ) : null}
                </div>
                <div className="flex items-start justify-end">
                  <span
                    className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                      complete
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-amber-200 bg-amber-50 text-amber-700"
                    }`}
                  >
                    {complete ? "Ready" : "Missing"}
                  </span>
                </div>
              </div>
            );
          })}
        </section>

        <section className="mt-5 rounded-lg border border-[#dfe5dc] bg-white p-4">
          <h2 className="text-sm font-semibold">Plain-English Status</h2>
          <p className="mt-2 text-sm leading-6 text-[#5f6b66]">
            The visual dashboard works, QuickBooks is connected, and the latest
            Chart of Accounts snapshot has {accountsSnapshot.synced ? accountsSnapshot.total : 0}{" "}
            accounts. The live QuickBooks chart still needs cleanup before it matches
            the locked 8-section construction structure.
          </p>
        </section>
      </div>
    </main>
  );
}

function StatusCard({
  icon: Icon,
  label,
  ready,
}: {
  icon: typeof Database;
  label: string;
  ready: boolean;
}) {
  return (
    <div className="rounded-lg border border-[#dfe5dc] bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <Icon className={ready ? "text-emerald-700" : "text-amber-700"} size={20} />
        <span
          className={`rounded-md border px-2 py-1 text-xs font-medium ${
            ready
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-amber-200 bg-amber-50 text-amber-700"
          }`}
        >
          {ready ? "Ready" : "Missing"}
        </span>
      </div>
      <div className="text-sm font-semibold">{label}</div>
    </div>
  );
}
