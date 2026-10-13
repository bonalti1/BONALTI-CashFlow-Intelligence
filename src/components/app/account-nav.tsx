"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AccountNav({ links }: { links: Array<{ href: string; label: string }> }) {
  const pathname = usePathname();

  return (
    <nav className="-mx-1 flex min-w-0 items-center gap-1 overflow-x-auto text-sm">
      {links.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);

        return (
          <Link
            className={`shrink-0 rounded-[8px] px-2.5 py-1.5 font-bold transition ${
              active ? "bg-[#16294d] text-white" : "text-[#5f6b7d] hover:bg-[#f2f1ea] hover:text-[#16294d]"
            }`}
            href={link.href}
            key={link.href}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
