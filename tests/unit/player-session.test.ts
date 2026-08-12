import { describe, expect, it } from "vitest";

import {
  createPlayerPublicCode,
  createPlayerSessionToken,
  getExpiredPlayerSessionCookieOptions,
  getPlayerSessionCookieOptions,
  hashPlayerSessionToken,
} from "../../src/lib/auth/player-session";

const sessionSecret = "session-secret-with-at-least-32-characters";

describe("player session security", () => {
  it("génère un token opaque avec suffisamment d’entropie", () => {
    const firstToken = createPlayerSessionToken();
    const secondToken = createPlayerSessionToken();

    expect(firstToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(secondToken).not.toBe(firstToken);
  });

  it("stocke une empreinte HMAC et jamais le token brut", () => {
    const token = "opaque-player-session-token";
    const hash = hashPlayerSessionToken(token, sessionSecret);

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain(token);
    expect(hashPlayerSessionToken(token, sessionSecret)).toBe(hash);
    expect(
      hashPlayerSessionToken(
        token,
        "another-session-secret-with-at-least-32-characters",
      ),
    ).not.toBe(hash);
  });

  it("génère un code public qui ne révèle pas l’identifiant interne", () => {
    expect(createPlayerPublicCode()).toMatch(/^HC-\d{6}$/);
  });

  it("configure un cookie HttpOnly protégé", () => {
    const expiresAt = new Date("2026-09-11T12:00:00.000Z");

    expect(getPlayerSessionCookieOptions(expiresAt, true)).toEqual({
      expires: expiresAt,
      httpOnly: true,
      path: "/",
      priority: "high",
      sameSite: "lax",
      secure: true,
    });

    expect(getExpiredPlayerSessionCookieOptions(true)).toMatchObject({
      expires: new Date(0),
      httpOnly: true,
      maxAge: 0,
      secure: true,
    });
  });
});
