"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { recordAudit } from "@/lib/audit/audit-log";
import {
  acceptInvite,
  countUsers,
  createFirstOwner,
  getUserForLogin,
  isLoginLocked,
  recordLoginAttempt,
} from "@/lib/auth/auth-store";
import { burnPasswordCheck, hashPassword, safeEqualText, verifyPassword } from "@/lib/auth/crypto";
import { endUserSession, safeNextPath, startUserSession } from "@/lib/auth/session";
import { hasDatabaseUrl } from "@/lib/db/raw";

// Non-secret fields are echoed back because React resets the form after each submit.
export type AuthFormState = { error: string | null; fields?: Record<string, string> };

const minimumPasswordLength = 10;

function text(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function looksLikeEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 200;
}

function passwordProblem(password: string, confirmation: string) {
  if (password.length < minimumPasswordLength) {
    return `Use at least ${minimumPasswordLength} characters for the password.`;
  }

  if (password.length > 200) {
    return "That password is too long.";
  }

  if (password !== confirmation) {
    return "The two passwords do not match.";
  }

  return null;
}

async function clientIp() {
  const forwardedFor = (await headers()).get("x-forwarded-for");

  return forwardedFor?.split(",")[0]?.trim() || null;
}

export async function loginAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (!hasDatabaseUrl()) {
    return { error: "The database is not connected yet, so sign-in is unavailable." };
  }

  const email = text(formData.get("email")).toLowerCase();
  const password = String(formData.get("password") ?? "");
  const nextPath = safeNextPath(formData.get("next"));
  const fields = { email };

  if (!email || !password) {
    return { error: "Enter your email and password.", fields };
  }

  if (await isLoginLocked(email)) {
    return { error: "Too many wrong passwords. Wait 15 minutes and try again.", fields };
  }

  const account = await getUserForLogin(email);
  let passwordMatches = false;

  if (account) {
    passwordMatches = await verifyPassword(password, account.passwordHash);
  } else {
    await burnPasswordCheck(password);
  }

  const ip = await clientIp();

  if (!account || !passwordMatches || !account.user.active) {
    await recordLoginAttempt(email, ip, false);

    return { error: "That email and password do not match an active account.", fields };
  }

  await recordLoginAttempt(email, ip, true);
  await startUserSession(account.user.id);
  redirect(nextPath);
}

export async function logoutAction() {
  await endUserSession();
  redirect("/login");
}

export async function setupOwnerAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const setupCode = process.env.OWNER_SETUP_CODE;

  if (!hasDatabaseUrl()) {
    return { error: "The database is not connected yet." };
  }

  if (!setupCode) {
    return { error: "OWNER_SETUP_CODE is not set on the server yet." };
  }

  if ((await countUsers()) > 0) {
    return { error: "The owner account already exists. Sign in instead." };
  }

  const name = text(formData.get("name"));
  const email = text(formData.get("email")).toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmPassword") ?? "");
  const fields = { name, email };

  if (!safeEqualText(text(formData.get("setupCode")), setupCode)) {
    return { error: "That setup code is not correct.", fields };
  }

  if (!name || name.length > 80) {
    return { error: "Enter your name.", fields };
  }

  if (!looksLikeEmail(email)) {
    return { error: "Enter a valid email address.", fields };
  }

  const problem = passwordProblem(password, confirmation);

  if (problem) {
    return { error: problem, fields };
  }

  let owner;

  try {
    owner = await createFirstOwner({ email, name, passwordHash: await hashPassword(password) });
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not create the owner account.",
      fields,
    };
  }

  await recordAudit({
    actor: { type: "user", id: owner.id, name: owner.name },
    action: "team.owner_created",
    entityType: "user",
    entityId: owner.id,
    summary: `${owner.name} created the owner account (${owner.email}).`,
  });
  await startUserSession(owner.id);
  redirect("/team");
}

export async function acceptInviteAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const token = text(formData.get("token"));
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmPassword") ?? "");
  const problem = passwordProblem(password, confirmation);

  if (!token) {
    return { error: "This link is missing its code. Ask an admin for a new one." };
  }

  if (problem) {
    return { error: problem };
  }

  let user;

  try {
    user = await acceptInvite(token, await hashPassword(password));
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save your password." };
  }

  await recordAudit({
    actor: { type: "user", id: user.id, name: user.name },
    action: "team.password_set",
    entityType: "user",
    entityId: user.id,
    summary: `${user.name} set their password.`,
  });
  await startUserSession(user.id);
  redirect("/");
}
