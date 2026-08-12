import { createHmac, randomBytes } from "node:crypto";

export const ADMIN_SESSION_COOKIE_NAME = "meste_admin_session";
export const ADMIN_SESSION_DURATION_MS = 12 * 60 * 60 * 1_000;

export function createAdminSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashAdminSessionToken(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token).digest("hex");
}

export function adminSessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  };
}
