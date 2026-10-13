"use client";

import { useActionState } from "react";

import { acceptInviteAction, type AuthFormState } from "@/app/actions/auth";
import { AuthError, AuthField, AuthSubmit } from "@/components/auth/auth-shell";

const initialState: AuthFormState = { error: null };

export function InviteForm({ email, token }: { email: string; token: string }) {
  const [state, formAction, pending] = useActionState(acceptInviteAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <input name="token" type="hidden" value={token} />
      <AuthField autoComplete="username" label="Your email" name="email" readOnly type="email" value={email} />
      <AuthField
        autoComplete="new-password"
        autoFocus
        hint="At least 10 characters. A short sentence is easy to remember."
        label="New password"
        minLength={10}
        name="password"
        required
        type="password"
      />
      <AuthField
        autoComplete="new-password"
        label="Type it again"
        minLength={10}
        name="confirmPassword"
        required
        type="password"
      />
      <AuthError message={state.error} />
      <AuthSubmit label="Save password and sign in" pending={pending} pendingLabel="Saving…" />
    </form>
  );
}
