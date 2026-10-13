import type { ReactNode } from "react";

export function PageShell({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[#f2f1ea] text-[#1b2233] [background-image:linear-gradient(rgba(22,41,77,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(22,41,77,0.055)_1px,transparent_1px)] [background-size:34px_34px] [font-family:Barlow,system-ui,sans-serif]">
      <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6 sm:py-8">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-[#e23b2a]">
              {eyebrow}
            </p>
            <h1 className="mt-1 font-['Barlow_Condensed',Barlow,sans-serif] text-[34px] font-bold leading-none tracking-[0.01em] text-[#16294d]">
              {title}
            </h1>
            {description ? (
              <div className="mt-2 max-w-2xl text-sm leading-6 text-[#5f6b7d]">{description}</div>
            ) : null}
          </div>
          {actions}
        </header>
        <div className="space-y-5">{children}</div>
      </div>
    </main>
  );
}

export function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[14px] border border-[#e3e1d7] bg-white shadow-[0_12px_40px_-30px_rgba(14,27,54,0.5)]">
      <div className="border-b border-[#eeece4] px-5 py-4">
        <h2 className="font-['Barlow_Condensed',Barlow,sans-serif] text-xl font-bold uppercase tracking-[0.04em] text-[#16294d]">
          {title}
        </h2>
        {description ? <div className="mt-1 text-sm text-[#7b8298]">{description}</div> : null}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function NoAccess({ message }: { message: string }) {
  return (
    <PageShell eyebrow="No access" title="You can't open this page">
      <Panel title="Ask an admin">
        <p className="text-sm text-[#5f6b7d]">{message}</p>
      </Panel>
    </PageShell>
  );
}
