"use client";

import { Printer } from "lucide-react";

export function PrintReportButton() {
  return (
    <button
      className="inline-flex h-11 items-center gap-2 rounded-[9px] bg-[#16294d] px-4 text-sm font-extrabold uppercase tracking-[0.08em] text-white shadow-sm"
      onClick={() => window.print()}
      type="button"
    >
      <Printer size={16} />
      Print / Save PDF
    </button>
  );
}
