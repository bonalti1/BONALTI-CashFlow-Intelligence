"use client";

import { Printer } from "lucide-react";
import { useState } from "react";

async function loadReportImages() {
  const images = Array.from(
    document.querySelectorAll<HTMLImageElement>("img[data-report-render='true']"),
  );

  await Promise.all(
    images.map(
      (image) =>
        new Promise<void>((resolve) => {
          image.loading = "eager";
          image.fetchPriority = "high";

          if (image.complete && image.naturalWidth > 0) {
            resolve();
            return;
          }

          const finish = () => resolve();

          image.addEventListener("load", finish, { once: true });
          image.addEventListener("error", finish, { once: true });

          if (image.src) {
            image.src = image.src;
          }
        }),
    ),
  );
}

export function PrintReportButton() {
  const [isPreparing, setIsPreparing] = useState(false);

  async function handlePrint() {
    setIsPreparing(true);
    await loadReportImages();
    setIsPreparing(false);
    window.print();
  }

  return (
    <button
      className="inline-flex h-11 items-center gap-2 rounded-[9px] bg-[#16294d] px-4 text-sm font-extrabold uppercase tracking-[0.08em] text-white shadow-sm disabled:cursor-wait disabled:opacity-75"
      disabled={isPreparing}
      onClick={handlePrint}
      type="button"
    >
      <Printer size={16} />
      {isPreparing ? "Preparing Renders" : "Print / Save PDF"}
    </button>
  );
}
