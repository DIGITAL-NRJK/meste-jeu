import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { PLAYER_SESSION_COOKIE_NAME } from "../../src/lib/auth/player-session";
import { RegistrationConflictError } from "../../src/server/services/player-registration";

const repository = vi.hoisted(() => ({
  createRegistration: vi.fn(),
  findCurrentPlayer: vi.fn(),
}));

vi.mock("@/lib/env/server", () => ({
  getServerEnv: () => ({
    DATABASE_URL: "postgresql://user:password@example.neon.tech/database",
    APP_URL: "http://localhost:3000",
    SESSION_SECRET: "session-secret-with-at-least-32-characters",
    ADMIN_AUTH_SECRET: "admin-secret-with-at-least-32-characters",
  }),
}));

vi.mock("@/server/repositories/player-repository", () => ({
  postgresPlayerRepository: repository,
}));

import { GET } from "../../src/app/api/me/route";
import { POST } from "../../src/app/api/register/route";

function registrationRequest(body: unknown) {
  return new Request("http://localhost:3000/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("player API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.createRegistration.mockImplementation(async (input) => ({
      outcome: "created",
      player: {
        publicCode: input.publicCode,
        nickname: input.nickname,
        currentStreak: 0,
        totalPoints: 0,
      },
      event: {
        slug: input.eventSlug,
        name: "Héritage Congo 2026",
        timezone: "Africa/Accra",
        status: "READY",
      },
    }));
    repository.findCurrentPlayer.mockResolvedValue(null);
  });

  it("inscrit le visiteur et pose le cookie sécurisé côté serveur", async () => {
    const response = await POST(
      registrationRequest({
        eventSlug: "heritage-congo-2026",
        nickname: "  Makaya  ",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toContain(
      `${PLAYER_SESSION_COOKIE_NAME}=`,
    );
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
    expect(body).toMatchObject({
      player: { nickname: "Makaya", currentStreak: 0, totalPoints: 0 },
      event: { slug: "heritage-congo-2026", status: "READY" },
    });
    expect(body).not.toHaveProperty("session");
  });

  it("refuse une inscription invalide avant tout accès PostgreSQL", async () => {
    const response = await POST(
      registrationRequest({
        eventSlug: "heritage-congo-2026",
        nickname: "AB",
      }),
    );

    expect(response.status).toBe(400);
    expect(repository.createRegistration).not.toHaveBeenCalled();
  });

  it("retourne un conflit public pour un pseudo déjà réservé", async () => {
    repository.createRegistration.mockRejectedValueOnce(
      new RegistrationConflictError("nickname"),
    );

    const response = await POST(
      registrationRequest({
        eventSlug: "heritage-congo-2026",
        nickname: "Makaya",
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "NICKNAME_ALREADY_USED" },
    });
  });

  it("restaure le joueur depuis son cookie sans exposer la session", async () => {
    repository.findCurrentPlayer.mockResolvedValueOnce({
      player: {
        publicCode: "HC-084200",
        nickname: "Makaya",
        currentStreak: 0,
        totalPoints: 175,
      },
      event: {
        slug: "heritage-congo-2026",
        name: "Héritage Congo 2026",
        timezone: "Africa/Accra",
        status: "READY",
      },
    });
    const request = new NextRequest("http://localhost:3000/api/me", {
      headers: {
        cookie: `${PLAYER_SESSION_COOKIE_NAME}=raw-session-token`,
      },
    });

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      player: {
        publicCode: "HC-084200",
        nickname: "Makaya",
        currentStreak: 0,
        totalPoints: 175,
      },
      event: {
        slug: "heritage-congo-2026",
        name: "Héritage Congo 2026",
        timezone: "Africa/Accra",
        status: "READY",
      },
    });
  });

  it("efface un cookie dont la session n’est plus valide", async () => {
    const request = new NextRequest("http://localhost:3000/api/me", {
      headers: {
        cookie: `${PLAYER_SESSION_COOKIE_NAME}=expired-session-token`,
      },
    });

    const response = await GET(request);

    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
