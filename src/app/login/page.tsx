import { redirect } from "next/navigation";

import { countUsers } from "@/lib/auth/auth-store";
import { getCurrentUser, safeNextPath } from "@/lib/auth/session";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  if (await getCurrentUser()) {
    redirect("/");
  }

  if ((await countUsers().catch(() => 1)) === 0) {
    redirect("/setup-owner");
  }

  const { next } = await searchParams;

  return (
    <AuthShell
      description="Use the email and password you set from your invite link. Forgot it? Ask an admin for a new link."
      eyebrow="Welcome back"
      title="Sign in"
    >
      <LoginForm nextPath={safeNextPath(typeof next === "string" ? next : null)} />
    </AuthShell>
  );
}
