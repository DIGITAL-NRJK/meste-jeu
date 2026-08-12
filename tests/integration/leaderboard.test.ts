import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  events,
  players,
  playerSessions,
  quizSessions,
  scoreEvents,
} from "../../db/schema";
import { hashPlayerSessionToken } from "../../src/lib/auth/player-session";
import { getDb } from "../../src/lib/db/client";
import { postgresLeaderboardRepository } from "../../src/server/repositories/leaderboard-repository";
import { getLeaderboard } from "../../src/server/services/leaderboard";

if (
  process.env.DATABASE_INTEGRATION_TARGET !== "neon-preview" ||
  process.env.GITHUB_EVENT_NAME !== "pull_request"
) {
  throw new Error(
    "Database integration tests are restricted to Neon pull request branches.",
  );
}

const db = getDb();
const eventId = randomUUID();
const eventSlug = `integration-leaderboard-${randomUUID()}`;
const firstSessionId = randomUUID();
const secondSessionId = randomUUID();
const playerIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
const playerSessionId = randomUUID();
const playerToken = `integration-leaderboard-token-${randomUUID()}`;
const sessionSecret = process.env.SESSION_SECRET ?? "";
const now = new Date("2026-08-15T20:00:00.000Z");
const scoreIds: string[] = [];

function score(
  playerId: string,
  quizSessionId: string,
  points: number,
  voidedAt: Date | null = null,
) {
  const id = randomUUID();
  scoreIds.push(id);
  return {
    id,
    playerId,
    quizSessionId,
    type: "ANSWER_CORRECT" as const,
    points,
    voidedAt,
  };
}

describe("leaderboard with PostgreSQL", () => {
  beforeAll(async () => {
    await db.insert(events).values({
      id: eventId,
      slug: eventSlug,
      name: "Événement d’intégration du classement",
      startsAt: new Date("2026-08-15T16:00:00.000Z"),
      endsAt: new Date("2026-08-15T23:00:00.000Z"),
      timezone: "Africa/Brazzaville",
      status: "LIVE",
    });
    await db.insert(quizSessions).values([
      {
        id: firstSessionId,
        eventId,
        name: "Qualification",
        slug: `qualification-${randomUUID()}`,
        mode: "LIVE",
        status: "FINISHED",
        startsAt: new Date("2026-08-15T18:00:00.000Z"),
        endsAt: new Date("2026-08-15T19:00:00.000Z"),
      },
      {
        id: secondSessionId,
        eventId,
        name: "Finale",
        slug: `finale-${randomUUID()}`,
        mode: "LIVE",
        status: "LIVE",
        startsAt: new Date("2026-08-15T19:30:00.000Z"),
      },
    ]);
    await db.insert(players).values([
      {
        id: playerIds[0]!,
        eventId,
        publicCode: `HC-${randomUUID()}`,
        nickname: "Aline",
      },
      {
        id: playerIds[1]!,
        eventId,
        publicCode: `HC-${randomUUID()}`,
        nickname: "Basile",
      },
      {
        id: playerIds[2]!,
        eventId,
        publicCode: `HC-${randomUUID()}`,
        nickname: "Céleste",
      },
      {
        id: playerIds[3]!,
        eventId,
        publicCode: `HC-${randomUUID()}`,
        nickname: "Désactivé",
        status: "DISABLED",
      },
    ]);
    await db.insert(playerSessions).values({
      id: playerSessionId,
      playerId: playerIds[2]!,
      tokenHash: hashPlayerSessionToken(playerToken, sessionSecret),
      createdAt: new Date("2026-08-15T17:00:00.000Z"),
      expiresAt: new Date("2026-08-16T17:00:00.000Z"),
    });
    await db.insert(scoreEvents).values([
      score(playerIds[0]!, firstSessionId, 100),
      score(playerIds[0]!, firstSessionId, 50),
      score(playerIds[0]!, secondSessionId, 20),
      score(playerIds[1]!, firstSessionId, 100),
      score(playerIds[1]!, firstSessionId, 50),
      score(playerIds[2]!, firstSessionId, 100),
      score(
        playerIds[2]!,
        firstSessionId,
        500,
        new Date("2026-08-15T19:01:00.000Z"),
      ),
      score(playerIds[3]!, firstSessionId, 1_000),
    ]);
  });

  afterAll(async () => {
    await db.delete(scoreEvents).where(inArray(scoreEvents.id, scoreIds));
    await db
      .delete(playerSessions)
      .where(eq(playerSessions.id, playerSessionId));
    await db.delete(players).where(inArray(players.id, playerIds));
    await db
      .delete(quizSessions)
      .where(inArray(quizSessions.id, [firstSessionId, secondSessionId]));
    await db.delete(events).where(eq(events.id, eventId));
  });

  it("calcule les portées, les égalités et la position personnelle depuis le ledger actif", async () => {
    const general = await getLeaderboard(
      { eventSlug },
      playerToken,
      {
        repository: postgresLeaderboardRepository,
        sessionSecret,
        now: () => now,
      },
    );

    expect(general.scope).toEqual({ type: "EVENT" });
    expect(general.participantCount).toBe(3);
    expect(general.entries.map(({ nickname, position, points }) => ({ nickname, position, points }))).toEqual([
      { nickname: "Aline", position: 1, points: 170 },
      { nickname: "Basile", position: 2, points: 150 },
      { nickname: "Céleste", position: 3, points: 100 },
    ]);
    expect(general.currentPlayer).toMatchObject({
      nickname: "Céleste",
      position: 3,
      points: 100,
    });

    const session = await getLeaderboard(
      { eventSlug, sessionId: firstSessionId },
      playerToken,
      {
        repository: postgresLeaderboardRepository,
        sessionSecret,
        now: () => now,
      },
    );

    expect(session.scope).toMatchObject({
      type: "SESSION",
      id: firstSessionId,
      name: "Qualification",
    });
    expect(session.entries.map(({ nickname, position, points }) => ({ nickname, position, points }))).toEqual([
      { nickname: "Aline", position: 1, points: 150 },
      { nickname: "Basile", position: 1, points: 150 },
      { nickname: "Céleste", position: 3, points: 100 },
    ]);

    await db
      .update(scoreEvents)
      .set({ voidedAt: now })
      .where(
        and(
          eq(scoreEvents.playerId, playerIds[1]!),
          eq(scoreEvents.quizSessionId, firstSessionId),
        ),
      );

    const recalculated = await getLeaderboard(
      { eventSlug, sessionId: firstSessionId },
      undefined,
      {
        repository: postgresLeaderboardRepository,
        sessionSecret,
        now: () => now,
      },
    );
    expect(recalculated.entries.map(({ nickname, position, points }) => ({ nickname, position, points }))).toEqual([
      { nickname: "Aline", position: 1, points: 150 },
      { nickname: "Céleste", position: 2, points: 100 },
      { nickname: "Basile", position: 3, points: 0 },
    ]);
  });
});
