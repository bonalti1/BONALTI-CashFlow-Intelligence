import { LogOut } from "lucide-react";

import { logoutAction } from "@/app/actions/auth";
import { roleLabels } from "@/lib/auth/auth-store";
import { getCurrentUser } from "@/lib/auth/session";
import { AccountNav } from "./account-nav";
import { PlaidBalanceRefresh } from "./plaid-balance-refresh";

export async function AccountBar() {
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  const links = [
    { href: "/draws-budget", label: "Projects" },
    { href: "/setup-inputs", label: "House Setup" },
    { href: "/activity", label: "Change History" },
    ...(user.role === "admin" ? [{ href: "/team", label: "Team & Access" }] : []),
  ];

  return (
    <div className="no-print border-b border-[#e3e1d7] bg-white text-[#16294d] [font-family:Barlow,system-ui,sans-serif]">
      <PlaidBalanceRefresh />
      <div className="mx-auto flex h-11 max-w-[1440px] items-center gap-3 px-4">
        <AccountNav links={links} />
        <div className="ml-auto flex shrink-0 items-center gap-2 text-sm">
          <span className="hidden font-bold sm:inline">{user.name}</span>
          <span className="rounded-full bg-[#eef1f7] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#16294d]">
            {roleLabels[user.role]}
          </span>
          <form action={logoutAction}>
            <button
              className="flex h-8 items-center gap-1.5 rounded-[8px] px-2 text-xs font-bold text-[#5f6b7d] hover:bg-[#f2f1ea] hover:text-[#16294d]"
              title="Sign out"
              type="submit"
            >
              <LogOut size={14} />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
