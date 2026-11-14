import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { getIdentityProvider } from "./identity";
import { mapIdentityToUser } from "./users";

export const SESSION_COOKIE = "setda_session";

/**
 * The access token is kept in an HttpOnly cookie, so the browser's JavaScript
 * can never read it. It is verified (signature, expiry, audience, issuer) on
 * every request that needs it; there is no long-lived server-side session.
 * Token lifetime follows the provider (Supabase default: 1 hour) — after that
 * the user signs in again (refresh-token flow is deliberately out of scope).
 */
export function setSession(token: string, maxAgeSeconds: number): void {
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // Only disabled for the local HTTP E2E environment.
    secure: process.env.SESSION_COOKIE_SECURE !== "false",
    path: "/",
    maxAge: maxAgeSeconds,
  });
}

export function clearSession(): void {
  cookies().delete(SESSION_COOKIE);
}

export interface CurrentUser {
  externalId: string;
  email: string | null;
  /** our users.id; null = authenticated but not provisioned (no access yet) */
  userId: string | null;
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  let identity;
  try {
    identity = await getIdentityProvider().verify(token);
  } catch {
    return null;
  }
  if (!identity) return null;
  const userId = await mapIdentityToUser(identity.externalId);
  return { externalId: identity.externalId, email: identity.email, userId };
});
