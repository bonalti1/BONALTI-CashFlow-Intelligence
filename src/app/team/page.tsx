import { headers } from "next/headers";

import { NoAccess, PageShell } from "@/components/app/page-shell";
import { listApiKeys, listUsers } from "@/lib/auth/auth-store";
import { requireUser } from "@/lib/auth/session";
import { getPublicAppUrl } from "@/lib/app-url";
import { ApiKeysPanel, InvitePersonPanel, PeoplePanel } from "./team-manager";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const user = await requireUser();

  if (user.role !== "admin") {
    return <NoAccess message="Only admins can invite people or manage read-only keys." />;
  }

  const [users, apiKeys] = await Promise.all([listUsers(), listApiKeys()]);
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const origin = host
    ? `${requestHeaders.get("x-forwarded-proto") ?? "https"}://${host}`
    : getPublicAppUrl();

  return (
    <PageShell
      description="Everyone signs in with their own account, so every change shows who made it. Editors add and change project and draw information. Viewers can only look. Read-only keys let Grokbot check the work without being able to change anything."
      eyebrow="Admin"
      title="Team & Access"
    >
      <InvitePersonPanel />
      <PeoplePanel currentUserId={user.id} users={users} />
      <ApiKeysPanel apiKeys={apiKeys} origin={origin} />
    </PageShell>
  );
}
