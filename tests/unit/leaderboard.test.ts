import { describe, expect, it, vi } from "vitest";

import { hashPlayerSessionToken } from "../../src/lib/auth/player-session";
import {
  getLeaderboard,
  LeaderboardInputError,
  LeaderboardNotFoundError,
  type Leaderboard,
  type LeaderboardRepository,
} from "../../src/server/services/leaderboard";

const sessionSecret = "session-secret-with-at-least-32-characters";
const playerToken = "raw-player-session-token";
const now = new Date("2026-08-15T18:30:00.000Z");
const sessionId = "00000000-0000-4000-8000-000000000001";
const leaderboard: Leaderboard = {
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
};

describe("leaderboard service", () => {
  it("valide la portée, hache le cookie et fixe le Top 10 côté serveur", async () => {
    const repository: LeaderboardRepository = {
      findLeaderboard: vi.fn(async () => leaderboard),
    };

    await expect(
      getLeaderboard(
        { eventSlug: "heritage-congo-2026", sessionId },
        playerToken,
        { repository, sessionSecret, now: () => now },
      ),
    ).resolves.toBe(leaderboard);
    expect(repository.findLeaderboard).toHaveBeenCalledWith({
      eventSlug: "heritage-congo-2026",
      sessionId,
      playerTokenHash: hashPlayerSessionToken(playerToken, sessionSecret),
      now,
      limit: 10,
    });
  });

  it("autorise un classement public sans cookie", async () => {
    const repository: LeaderboardRepository = {
      findLeaderboard: vi.fn(async () => leaderboard),
    };

    await getLeaderboard(
      { eventSlug: "heritage-congo-2026" },
      undefined,
      { repository, sessionSecret, now: () => now },
    );

    expect(repository.findLeaderboard).toHaveBeenCalledWith(
      expect.objectContaining({ playerTokenHash: null }),
    );
  });

  it("refuse les paramètres invalides avant PostgreSQL", async () => {
    const repository: LeaderboardRepository = {
      findLeaderboard: vi.fn(async () => leaderboard),
    };

    await expect(
      getLeaderboard(
        { eventSlug: "Héritage Congo", sessionId: "invalid" },
        undefined,
        { repository, sessionSecret },
      ),
    ).rejects.toBeInstanceOf(LeaderboardInputError);
    expect(repository.findLeaderboard).not.toHaveBeenCalled();
  });

  it("signale une portée absente", async () => {
    const repository: LeaderboardRepository = {
      findLeaderboard: vi.fn(async () => null),
    };

    await expect(
      getLeaderboard(
        { eventSlug: "heritage-congo-2026" },
        undefined,
        { repository, sessionSecret },
      ),
    ).rejects.toBeInstanceOf(LeaderboardNotFoundError);
  });
});
