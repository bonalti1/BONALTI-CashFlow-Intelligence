"use client";

import {
  createContext,
  useActionState,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";
import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";

import { idleFormResult, type FormResult } from "@/lib/forms/form-result";

type FormAction = (previous: FormResult, formData: FormData) => Promise<FormResult>;

const PendingContext = createContext(false);
const defaultMaxFileBytes = 25 * 1024 * 1024;

// Submits through onSubmit instead of the form action prop so React does not reset
// the fields: after an error, the person keeps what they typed and can fix it.
export function ActionForm({
  action,
  children,
  className,
  maxFileBytes = defaultMaxFileBytes,
  resetOnSuccess = false,
}: {
  action: FormAction;
  children: ReactNode;
  className?: string;
  maxFileBytes?: number;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, idleFormResult);
  const [, startTransition] = useTransition();
  const [clientError, setClientError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (state.status === "saved" && resetOnSuccess) {
      formRef.current?.reset();
    } else if (state.status === "saved") {
      formRef.current
        ?.querySelectorAll<HTMLInputElement>('input[type="file"]')
        .forEach((input) => {
          input.value = "";
        });
    }

    messageRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [state, resetOnSuccess]);

  useEffect(() => {
    messageRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [clientError]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const tooLarge = [...formData.values()].find(
      (value) => value instanceof File && value.size > maxFileBytes,
    );

    if (tooLarge instanceof File) {
      setClientError(
        `${tooLarge.name} is ${(tooLarge.size / 1024 / 1024).toFixed(1)} MB. Files must be under ${Math.round(maxFileBytes / 1024 / 1024)} MB.`,
      );
      return;
    }

    setClientError(null);
    startTransition(() => formAction(formData));
  }

  const message = clientError ?? (pending ? null : state.message);
  const isError = Boolean(clientError) || state.status === "error";

  return (
    <div>
      <form aria-busy={pending} className={className} onSubmit={handleSubmit} ref={formRef}>
        <PendingContext.Provider value={pending}>{children}</PendingContext.Provider>
      </form>
      {message ? (
        <p
          ref={messageRef}
          className={`mt-2 flex items-start gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-bold ${
            isError
              ? "border-[#f1c4bf] bg-[#fdf0ee] text-[#b32f24]"
              : "border-[#b9dec9] bg-[#eaf7f0] text-[#1f6f4b]"
          }`}
          role={isError ? "alert" : "status"}
        >
          {isError ? (
            <CircleAlert className="mt-px shrink-0" size={14} />
          ) : (
            <CircleCheck className="mt-px shrink-0" size={14} />
          )}
          {message}
        </p>
      ) : null}
    </div>
  );
}

export function SubmitButton({
  children,
  className,
  pendingLabel = "Saving…",
}: {
  children: ReactNode;
  className?: string;
  pendingLabel?: string;
}) {
  const pending = useContext(PendingContext);

  return (
    <button className={`${className ?? ""} disabled:cursor-wait disabled:opacity-60`} disabled={pending} type="submit">
      {pending ? (
        <span className="inline-flex items-center justify-center gap-1.5">
          <LoaderCircle className="animate-spin" size={14} />
          {pendingLabel}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
