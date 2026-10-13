// Shared with client components, so this file must not import anything server-only.
export type FormResult = {
  status: "idle" | "saved" | "error";
  message: string | null;
  submittedAt: number;
};

export const idleFormResult: FormResult = { status: "idle", message: null, submittedAt: 0 };
