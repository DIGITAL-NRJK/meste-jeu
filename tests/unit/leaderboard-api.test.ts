import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { PLAYER_SESSION_COOKIE_NAME } from "../../src/lib/auth/player-session";

const repository = vi.hoisted(() => ({ findLeaderboard: vi.fn() }));

vi.mock("@/lib/env/server", () => ({
  getServerEnv: () => ({
    DATABASE_URL: "postgresql://user:password@example.neon.tech/database",
    APP_URL: "http://localhost:3000",
    SESSION_SECRET: "session-secret-with-at-least-32-characters",
    ADMIN_AUTH_SECRET: "admin-secret-with-at-least-32-characters",
  }),
}));

vi.mock("@/server/repositories/leaderboard-repository", () => ({
  postgresLeaderboardRepository: repository,
}));

import { GET } from "../../src/app/api/leaderboard/route";

describe("leaderboard API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.findLeaderboard.mockResolvedValue({
      event: {
        slug: "heritage-congo-2026",
        name: "Héritage Congo 2026",
        status: "LIVE",
      },
      scope: { type: "EVENT" },
      entries: [
        {
          position: 1,
          publicCode: "HC-000001",
          nickname: "Makaya",
          points: 175,
        },
      ],
      currentPlayer: null,
      participantCount: 1,
    });
  });

  it("retourne le Top 10 public sans mise en cache", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/leaderboard?eventSlug=heritage-congo-2026",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      entries: [{ position: 1, nickname: "Makaya", points: 175 }],
      participantCount: 1,
    });
  });

  it("transmet le cookie au service sans l’exposer au payload", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/leaderboard?eventSlug=heritage-congo-2026",
        {
          headers: {
            cookie: `${PLAYER_SESSION_COOKIE_NAME}=raw-session-token`,
          },
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(repository.findLeaderboard).toHaveBeenCalledWith(
      expect.objectContaining({
        playerTokenHash: expect.any(String),
        limit: 10,
      }),
    );
    expect(JSON.stringify(await response.json())).not.toContain(
      "raw-session-token",
    );
  });

  it("refuse une requête sans événement", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/leaderboard"),
    );

    expect(response.status).toBe(400);
    expect(repository.findLeaderboard).not.toHaveBeenCalled();
  });

  it("retourne 404 pour une session hors événement", async () => {
    repository.findLeaderboard.mockResolvedValueOnce(null);
    const response = await GET(
      new NextRequest(
        "http://localhost/api/leaderboard?eventSlug=heritage-congo-2026&sessionId=00000000-0000-4000-8000-000000000001",
      ),
    );

    expect(response.status).toBe(404);
  });
});
