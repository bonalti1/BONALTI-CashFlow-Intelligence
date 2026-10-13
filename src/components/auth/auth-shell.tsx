import Image from "next/image";
import type { InputHTMLAttributes, ReactNode } from "react";

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f2f1ea] px-4 py-10 text-[#1b2233] [background-image:linear-gradient(rgba(22,41,77,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(22,41,77,0.055)_1px,transparent_1px)] [background-size:34px_34px] [font-family:Barlow,system-ui,sans-serif]">
      <div className="w-full max-w-[420px]">
        <div className="mb-5 flex items-center gap-3">
          <div className="grid h-14 w-16 place-items-center rounded-[10px] bg-white shadow-sm ring-1 ring-[#e3e1d7]">
            <Image
              alt="South Texas Builders"
              className="h-auto w-[46px]"
              height={1080}
              priority
              src="/south-texas-builders-logo.png"
              width={1080}
            />
          </div>
          <div>
            <div className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-[#e23b2a]">
              South Texas Builders
            </div>
            <div className="font-['Barlow_Condensed',Barlow,sans-serif] text-xl font-bold uppercase tracking-[0.04em] text-[#16294d]">
              Project Source of Truth
            </div>
          </div>
        </div>

        <section className="rounded-[14px] border border-[#e3e1d7] bg-white p-6 shadow-[0_18px_50px_-28px_rgba(14,27,54,0.45)]">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#e23b2a]">
            {eyebrow}
          </p>
          <h1 className="mt-1 font-['Barlow_Condensed',Barlow,sans-serif] text-[30px] font-bold leading-tight text-[#16294d]">
            {title}
          </h1>
          {description ? (
            <div className="mt-2 text-sm leading-6 text-[#5f6b7d]">{description}</div>
          ) : null}
          <div className="mt-5">{children}</div>
        </section>
      </div>
    </main>
  );
}

export function AuthField({
  label,
  hint,
  ...inputProps
}: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="text-[12px] font-extrabold uppercase tracking-[0.1em] text-[#16294d]">
        {label}
      </span>
      <input
        className="mt-1.5 h-12 w-full rounded-[10px] border border-[#d8d5ca] bg-white px-3.5 text-base text-[#16294d] outline-none transition placeholder:text-[#a3a8b5] focus:border-[#16294d] focus:ring-2 focus:ring-[#16294d]/15"
        {...inputProps}
      />
      {hint ? <span className="mt-1 block text-xs text-[#7b8298]">{hint}</span> : null}
    </label>
  );
}

export function AuthError({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }

  return (
    <p
      className="rounded-[10px] border border-[#f1c4bf] bg-[#fdf0ee] px-3.5 py-2.5 text-sm font-semibold text-[#b32f24]"
      role="alert"
    >
      {message}
    </p>
  );
}

export function AuthSubmit({ pending, label, pendingLabel }: { pending: boolean; label: string; pendingLabel: string }) {
  return (
    <button
      className="h-12 w-full rounded-[10px] bg-[#16294d] text-sm font-extrabold uppercase tracking-[0.1em] text-white transition hover:bg-[#1f3766] disabled:cursor-wait disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
