import { createHmac, randomBytes, randomInt } from "node:crypto";

export const PLAYER_SESSION_COOKIE_NAME = "meste_player_session";
export const PLAYER_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export function createPlayerSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashPlayerSessionToken(
  token: string,
  sessionSecret: string,
): string {
  return createHmac("sha256", sessionSecret).update(token).digest("hex");
}

export function createPlayerPublicCode(): string {
  return `HC-${randomInt(0, 1_000_000).toString().padStart(6, "0")}`;
}

export function getPlayerSessionCookieOptions(
  expires: Date,
  secure: boolean,
) {
  return {
    expires,
    httpOnly: true,
    path: "/",
    priority: "high" as const,
    sameSite: "lax" as const,
    secure,
  };
}

export function getExpiredPlayerSessionCookieOptions(secure: boolean) {
  return {
    ...getPlayerSessionCookieOptions(new Date(0), secure),
    maxAge: 0,
  };
}
