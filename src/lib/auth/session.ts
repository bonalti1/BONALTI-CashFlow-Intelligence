import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

import {
  createSession,
  deleteSession,
  getSessionUser,
  verifyApiKey,
  type AppRole,
  type AppUser,
} from "@/lib/auth/auth-store";
import { safeEqualText } from "@/lib/auth/crypto";
import type { AuditActor } from "@/lib/audit/audit-log";
import { hasDatabaseUrl } from "@/lib/db/raw";
import { UserFacingError } from "@/lib/forms/user-facing-error";

export const sessionCookieName = "stb_session";

export const editorRoles: AppRole[] = ["admin", "editor"];
export const adminRoles: AppRole[] = ["admin"];

export const getCurrentUser = cache(async (): Promise<AppUser | null> => {
  if (!hasDatabaseUrl()) {
    return null;
  }

  const token = (await cookies()).get(sessionCookieName)?.value;

  if (!token) {
    return null;
  }

  return getSessionUser(token).catch((error) => {
    console.error("Session lookup failed", error);
    return null;
  });
});

export function canEdit(user: AppUser | null) {
  return Boolean(user && editorRoles.includes(user.role));
}

export function actorForUser(user: AppUser): AuditActor {
  return { type: "user", id: user.id, name: user.name };
}

export async function requireUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

// Server Actions are public endpoints, so every one of them checks the role itself.
export async function requireRole(roles: AppRole[]) {
  const user = await requireUser();

  if (!roles.includes(user.role)) {
    throw new UserFacingError(
      roles.includes("editor")
        ? "Your account is view-only. Ask an admin for editor access to make changes."
        : "Only admins can do this.",
    );
  }

  return user;
}

export function requireEditor() {
  return requireRole(editorRoles);
}

export function requireAdmin() {
  return requireRole(adminRoles);
}

type ApiAuthorization =
  | { ok: true; user: AppUser | null; actor: AuditActor }
  | { ok: false; response: NextResponse };

function bearerToken(request: Request) {
  const [scheme, token] = (request.headers.get("authorization") ?? "").split(" ");

  return scheme === "Bearer" && token ? token : null;
}

export async function authorizeApiRequest(
  request: Request,
  { roles, allowCronSecret = false }: { roles?: AppRole[]; allowCronSecret?: boolean } = {},
): Promise<ApiAuthorization> {
  const cronSecret = process.env.CRON_SECRET;
  const token = bearerToken(request);

  if (allowCronSecret && cronSecret && token && safeEqualText(token, cronSecret)) {
    return { ok: true, user: null, actor: { type: "system", id: null, name: "Scheduled sync" } };
  }

  const user = await getCurrentUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ message: "Sign in to continue." }, { status: 401 }),
    };
  }

  if (roles && !roles.includes(user.role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { message: "Your account does not have permission to do this." },
        { status: 403 },
      ),
    };
  }

  return { ok: true, user, actor: actorForUser(user) };
}

export async function startUserSession(userId: string) {
  const userAgent = (await headers()).get("user-agent");
  const { token, expiresAt } = await createSession(userId, userAgent);

  (await cookies()).set(sessionCookieName, token, {
    expires: expiresAt,
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function endUserSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;

  if (token) {
    await deleteSession(token).catch(() => undefined);
  }

  cookieStore.delete(sessionCookieName);
}

export function safeNextPath(value: FormDataEntryValue | string | null | undefined) {
  const text = typeof value === "string" ? value.trim() : "";

  if (!text.startsWith("/") || text.startsWith("//") || text.startsWith("/\\")) {
    return "/";
  }

  return text;
}

export async function authorizeReadOnlyKey(request: Request) {
  const token = bearerToken(request);
  const apiKey = token ? await verifyApiKey(token).catch(() => null) : null;

  if (!apiKey) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { message: "Send a valid read-only key as: Authorization: Bearer <key>" },
        { status: 401 },
      ),
    };
  }

  return { ok: true as const, apiKey };
}
