"use client";

import { useActionState, useState } from "react";
import { Check, Copy, KeyRound, Link2, UserPlus } from "lucide-react";

import {
  changeRoleAction,
  createApiKeyAction,
  inviteUserAction,
  newSignInLinkAction,
  revokeApiKeyAction,
  setActiveAction,
  type TeamFormState,
} from "@/app/actions/team";
import { Panel } from "@/components/app/page-shell";
import {
  appRoles,
  roleDescriptions,
  roleLabels,
  type ApiKeyRecord,
  type AppUser,
} from "@/lib/auth/roles";

const initialState: TeamFormState = { error: null, notice: null };

function formatDate(value: string | null) {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Chicago",
  }).format(new Date(value));
}

function FormMessage({ state }: { state: TeamFormState }) {
  const [copied, setCopied] = useState(false);

  if (state.error) {
    return (
      <p className="mt-3 rounded-[10px] border border-[#f1c4bf] bg-[#fdf0ee] px-3 py-2 text-sm font-semibold text-[#b32f24]" role="alert">
        {state.error}
      </p>
    );
  }

  if (!state.notice) {
    return null;
  }

  return (
    <div className="mt-3 rounded-[10px] border border-[#b9dec9] bg-[#eaf7f0] px-3 py-2.5 text-sm text-[#1f6f4b]" role="status">
      <p className="font-semibold">{state.notice}</p>
      {state.secret ? (
        <div className="mt-2 flex items-stretch gap-2">
          <code className="min-w-0 flex-1 break-all rounded-[8px] border border-[#b9dec9] bg-white px-2.5 py-2 font-mono text-xs text-[#16294d]">
            {state.secret}
          </code>
          <button
            className="flex shrink-0 items-center gap-1.5 rounded-[8px] bg-[#1f6f4b] px-3 text-xs font-extrabold uppercase tracking-[0.08em] text-white"
            onClick={async () => {
              await navigator.clipboard.writeText(state.secret ?? "");
              setCopied(true);
            }}
            type="button"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

const inputClass =
  "h-11 w-full rounded-[10px] border border-[#d8d5ca] bg-white px-3 text-sm text-[#16294d] outline-none focus:border-[#16294d] focus:ring-2 focus:ring-[#16294d]/15";
const primaryButton =
  "inline-flex h-11 items-center justify-center gap-2 rounded-[10px] bg-[#16294d] px-4 text-xs font-extrabold uppercase tracking-[0.1em] text-white transition hover:bg-[#1f3766] disabled:opacity-60";
const quietButton =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-[8px] border border-[#d8d5ca] bg-white px-3 text-xs font-bold text-[#16294d] transition hover:border-[#16294d] disabled:opacity-60";

export function InvitePersonPanel() {
  const [state, formAction, pending] = useActionState(inviteUserAction, initialState);

  return (
    <Panel
      description="They get a one-time link to choose their own password. No email setup needed: send the link by text or email yourself."
      title="Add a person"
    >
      <form action={formAction} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-[12px] font-extrabold uppercase tracking-[0.1em] text-[#16294d]">Name</span>
            <input
              className={`${inputClass} mt-1.5`}
              defaultValue={state.fields?.name}
              name="name"
              placeholder="Maria Lopez"
              required
            />
          </label>
          <label className="block">
            <span className="text-[12px] font-extrabold uppercase tracking-[0.1em] text-[#16294d]">Work email</span>
            <input
              className={`${inputClass} mt-1.5`}
              defaultValue={state.fields?.email}
              name="email"
              placeholder="maria@company.com"
              required
              type="email"
            />
          </label>
        </div>
        <fieldset>
          <legend className="text-[12px] font-extrabold uppercase tracking-[0.1em] text-[#16294d]">What can they do?</legend>
          <div className="mt-1.5 grid gap-2 sm:grid-cols-3">
            {appRoles.map((role) => (
              <label
                className="flex cursor-pointer gap-2.5 rounded-[10px] border border-[#d8d5ca] p-3 transition has-[:checked]:border-[#16294d] has-[:checked]:bg-[#f4f6fb]"
                key={role}
              >
                <input className="mt-1 accent-[#16294d]" defaultChecked={role === (state.fields?.role ?? "editor")} name="role" type="radio" value={role} />
                <span>
                  <span className="block text-sm font-extrabold text-[#16294d]">{roleLabels[role]}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-[#7b8298]">{roleDescriptions[role]}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <button className={primaryButton} disabled={pending} type="submit">
          <UserPlus size={15} />
          {pending ? "Creating link…" : "Create invite link"}
        </button>
      </form>
      <FormMessage state={state} />
    </Panel>
  );
}

function PersonRow({ user, isSelf }: { user: AppUser; isSelf: boolean }) {
  const [roleState, roleAction, rolePending] = useActionState(changeRoleAction, initialState);
  const [linkState, linkAction, linkPending] = useActionState(newSignInLinkAction, initialState);
  const [activeState, activeAction, activePending] = useActionState(setActiveAction, initialState);

  return (
    <li className={`py-4 ${user.active ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-extrabold text-[#16294d]">{user.name}</span>
            {isSelf ? (
              <span className="rounded-full bg-[#eef1f7] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#16294d]">You</span>
            ) : null}
            {!user.active ? (
              <span className="rounded-full bg-[#f6f5f0] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#7b8298]">Deactivated</span>
            ) : !user.hasPassword ? (
              <span className="rounded-full bg-[#fff6e5] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#9a6200]">Invite not used yet</span>
            ) : null}
          </div>
          <div className="mt-0.5 break-all text-sm text-[#5f6b7d]">{user.email}</div>
          <div className="mt-0.5 text-xs text-[#7b8298]">Last sign-in: {formatDate(user.lastLoginAt)}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form action={roleAction} className="flex items-center gap-2">
            <input name="userId" type="hidden" value={user.id} />
            <select
              aria-label={`Role for ${user.name}`}
              className="h-9 rounded-[8px] border border-[#d8d5ca] bg-white px-2 text-sm font-bold text-[#16294d]"
              defaultValue={user.role}
              disabled={!user.active || rolePending}
              name="role"
              onChange={(event) => event.currentTarget.form?.requestSubmit()}
            >
              {appRoles.map((role) => (
                <option key={role} value={role}>
                  {roleLabels[role]}
                </option>
              ))}
            </select>
          </form>
          {user.active ? (
            <form action={linkAction}>
              <input name="userId" type="hidden" value={user.id} />
              <button className={quietButton} disabled={linkPending} type="submit">
                <Link2 size={13} />
                {user.hasPassword ? "Reset link" : "New invite link"}
              </button>
            </form>
          ) : null}
          {!isSelf ? (
            <form action={activeAction}>
              <input name="userId" type="hidden" value={user.id} />
              <input name="active" type="hidden" value={user.active ? "false" : "true"} />
              <button
                className={`${quietButton} ${user.active ? "hover:border-[#b32f24] hover:text-[#b32f24]" : ""}`}
                disabled={activePending}
                onClick={(event) => {
                  if (user.active && !window.confirm(`Deactivate ${user.name}? They will be signed out right away.`)) {
                    event.preventDefault();
                  }
                }}
                type="submit"
              >
                {user.active ? "Deactivate" : "Reactivate"}
              </button>
            </form>
          ) : null}
        </div>
      </div>
      <FormMessage state={roleState} />
      <FormMessage state={linkState} />
      <FormMessage state={activeState} />
    </li>
  );
}

export function PeoplePanel({ users, currentUserId }: { users: AppUser[]; currentUserId: string }) {
  return (
    <Panel
      description="Changing a role takes effect on their next click. Deactivating signs them out immediately."
      title={`People (${users.filter((user) => user.active).length} active)`}
    >
      <ul className="-my-4 divide-y divide-[#eeece4]">
        {users.map((user) => (
          <PersonRow isSelf={user.id === currentUserId} key={user.id} user={user} />
        ))}
      </ul>
    </Panel>
  );
}

function ApiKeyRow({ apiKey }: { apiKey: ApiKeyRecord }) {
  const [state, formAction, pending] = useActionState(revokeApiKeyAction, initialState);

  return (
    <li className={`py-3 ${apiKey.revokedAt ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <KeyRound className="text-[#16294d]" size={15} />
            <span className="font-extrabold text-[#16294d]">{apiKey.name}</span>
            <code className="rounded bg-[#f6f5f0] px-1.5 py-0.5 font-mono text-[11px] text-[#5f6b7d]">{apiKey.keyPrefix}…</code>
            {apiKey.revokedAt ? (
              <span className="rounded-full bg-[#f6f5f0] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#7b8298]">Turned off</span>
            ) : null}
          </div>
          <div className="mt-0.5 text-xs text-[#7b8298]">
            Created {formatDate(apiKey.createdAt)}
            {apiKey.createdByName ? ` by ${apiKey.createdByName}` : ""} · Last used {formatDate(apiKey.lastUsedAt)}
          </div>
        </div>
        {!apiKey.revokedAt ? (
          <form action={formAction}>
            <input name="keyId" type="hidden" value={apiKey.id} />
            <button
              className={`${quietButton} hover:border-[#b32f24] hover:text-[#b32f24]`}
              disabled={pending}
              onClick={(event) => {
                if (!window.confirm(`Turn off "${apiKey.name}"? Anything using it will stop working.`)) {
                  event.preventDefault();
                }
              }}
              type="submit"
            >
              Turn off
            </button>
          </form>
        ) : null}
      </div>
      <FormMessage state={state} />
    </li>
  );
}

export function ApiKeysPanel({ apiKeys, origin }: { apiKeys: ApiKeyRecord[]; origin: string }) {
  const [state, formAction, pending] = useActionState(createApiKeyAction, initialState);

  return (
    <Panel
      description="For Grokbot and other assistants. A key can read projects, Plaid balances, draws and the change history. It can never add, change or delete anything."
      title="Read-only keys"
    >
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <label className="block min-w-[220px] flex-1">
          <span className="text-[12px] font-extrabold uppercase tracking-[0.1em] text-[#16294d]">Key name</span>
          <input className={`${inputClass} mt-1.5`} defaultValue="Grokbot" maxLength={60} name="name" />
        </label>
        <button className={primaryButton} disabled={pending} type="submit">
          <KeyRound size={15} />
          {pending ? "Creating…" : "Create read-only key"}
        </button>
      </form>
      <FormMessage state={state} />

      {apiKeys.length > 0 ? (
        <ul className="mt-4 divide-y divide-[#eeece4] border-t border-[#eeece4]">
          {apiKeys.map((apiKey) => (
            <ApiKeyRow apiKey={apiKey} key={apiKey.id} />
          ))}
        </ul>
      ) : null}

      <details className="mt-4 rounded-[10px] border border-[#eeece4] bg-[#fbfaf7] p-3 text-sm text-[#5f6b7d]">
        <summary className="cursor-pointer font-extrabold text-[#16294d]">How Grokbot reads the data</summary>
        <p className="mt-2">
          Send the key as <code className="font-mono text-xs">Authorization: Bearer &lt;key&gt;</code> to:
        </p>
        <ul className="mt-2 space-y-1 font-mono text-xs text-[#16294d]">
          <li>{origin}/api/readonly/v1/projects</li>
          <li>{origin}/api/readonly/v1/activity?since=2026-01-01</li>
          <li>{origin}/api/plaid/accounts</li>
          <li>{origin}/api/ai-csuite/finance-export</li>
        </ul>
      </details>
    </Panel>
  );
}
