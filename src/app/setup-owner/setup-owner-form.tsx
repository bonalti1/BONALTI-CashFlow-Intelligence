"use client";

import { useActionState } from "react";

import { setupOwnerAction, type AuthFormState } from "@/app/actions/auth";
import { AuthError, AuthField, AuthSubmit } from "@/components/auth/auth-shell";

const initialState: AuthFormState = { error: null };

export function SetupOwnerForm() {
  const [state, formAction, pending] = useActionState(setupOwnerAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <AuthField
        autoComplete="off"
        hint="The OWNER_SETUP_CODE value from your hosting settings."
        label="Setup code"
        name="setupCode"
        required
        type="password"
      />
      <AuthField autoComplete="name" defaultValue={state.fields?.name} label="Your name" name="name" required />
      <AuthField
        autoComplete="email"
        defaultValue={state.fields?.email}
        label="Work email"
        name="email"
        required
        type="email"
      />
      <AuthField
        autoComplete="new-password"
        hint="At least 10 characters."
        label="Password"
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
      <AuthSubmit label="Create owner account" pending={pending} pendingLabel="Creating…" />
    </form>
  );
}
