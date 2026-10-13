import Link from "next/link";

import { getInvite } from "@/lib/auth/auth-store";
import { AuthShell } from "@/components/auth/auth-shell";
import { InviteForm } from "./invite-form";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await getInvite(token).catch(() => null);

  if (!invite) {
    return (
      <AuthShell
        description="This link has expired or was already used. Ask an admin to send you a new one."
        eyebrow="Link not valid"
        title="This link doesn't work"
      >
        <Link
          className="flex h-12 items-center justify-center rounded-[10px] border border-[#d8d5ca] text-sm font-extrabold uppercase tracking-[0.1em] text-[#16294d]"
          href="/login"
        >
          Go to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      description={
        invite.purpose === "reset"
          ? "Choose a new password. Your old password stops working."
          : "Choose a password to finish setting up your account."
      }
      eyebrow={invite.purpose === "reset" ? "Reset password" : "You're invited"}
      title={`Hi ${invite.name.split(" ")[0]}`}
    >
      <InviteForm email={invite.email} token={token} />
    </AuthShell>
  );
}
