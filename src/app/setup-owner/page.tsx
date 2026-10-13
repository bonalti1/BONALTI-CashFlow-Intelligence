import { redirect } from "next/navigation";

import { countUsers } from "@/lib/auth/auth-store";
import { AuthShell } from "@/components/auth/auth-shell";
import { hasDatabaseUrl } from "@/lib/db/raw";
import { SetupOwnerForm } from "./setup-owner-form";

export const dynamic = "force-dynamic";

export default async function SetupOwnerPage() {
  if (hasDatabaseUrl() && (await countUsers()) > 0) {
    redirect("/login");
  }

  if (!hasDatabaseUrl() || !process.env.OWNER_SETUP_CODE) {
    return (
      <AuthShell
        description={
          <>
            Before anyone can sign in, add these settings on your hosting service, then
            reload this page:
            <ul className="mt-3 list-disc space-y-1 pl-5">
              {!hasDatabaseUrl() ? (
                <li>
                  <code className="font-bold text-[#16294d]">DATABASE_URL</code>: your database
                  connection
                </li>
              ) : null}
              {!process.env.OWNER_SETUP_CODE ? (
                <li>
                  <code className="font-bold text-[#16294d]">OWNER_SETUP_CODE</code>: any long
                  secret phrase only you know. You will type it once below.
                </li>
              ) : null}
            </ul>
          </>
        }
        eyebrow="One-time setup"
        title="Almost ready"
      >
        <p className="text-sm text-[#7b8298]">Nobody can sign in until this is done.</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      description="Create the first admin account. After this, you invite everyone else from the Team page."
      eyebrow="One-time setup"
      title="Create the owner account"
    >
      <SetupOwnerForm />
    </AuthShell>
  );
}
