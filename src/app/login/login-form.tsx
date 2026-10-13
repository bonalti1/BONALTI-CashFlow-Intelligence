"use client";

import { useActionState } from "react";

import { loginAction, type AuthFormState } from "@/app/actions/auth";
import { AuthError, AuthField, AuthSubmit } from "@/components/auth/auth-shell";

const initialState: AuthFormState = { error: null };

export function LoginForm({ nextPath }: { nextPath: string }) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <input name="next" type="hidden" value={nextPath} />
      <AuthField
        autoComplete="email"
        autoFocus
        defaultValue={state.fields?.email}
        label="Work email"
        name="email"
        required
        type="email"
      />
      <AuthField autoComplete="current-password" label="Password" name="password" required type="password" />
      <AuthError message={state.error} />
      <AuthSubmit label="Sign in" pending={pending} pendingLabel="Signing in…" />
    </form>
  );
}
