import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  events,
  players,
  playerSessions,
} from "../../db/schema";
import { hashPlayerSessionToken } from "../../src/lib/auth/player-session";
import { getDb } from "../../src/lib/db/client";
import { postgresPlayerRepository } from "../../src/server/repositories/player-repository";
import {
  getCurrentPlayer,
  NicknameAlreadyUsedError,
  registerPlayer,
} from "../../src/server/services/player-registration";

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
const eventSlug = `integration-registration-${randomUUID()}`;
const sessionSecret = process.env.SESSION_SECRET ?? "";

describe("player registration with PostgreSQL", () => {
  beforeAll(async () => {
    await db.insert(events).values({
      id: eventId,
      slug: eventSlug,
      name: "Événement test d’intégration",
      startsAt: new Date("2026-08-12T00:00:00.000Z"),
      endsAt: new Date("2026-08-16T00:00:00.000Z"),
      timezone: "Africa/Accra",
      status: "READY",
    });
  });

  afterAll(async () => {
    const testPlayers = await db
      .select({ id: players.id })
      .from(players)
      .where(eq(players.eventId, eventId));

    for (const player of testPlayers) {
      await db
        .delete(playerSessions)
        .where(eq(playerSessions.playerId, player.id));
    }

    await db.delete(players).where(eq(players.eventId, eventId));
    await db.delete(events).where(eq(events.id, eventId));
  });

  it("persiste atomiquement le joueur et l’empreinte de sa session", async () => {
    const registration = await registerPlayer(
      { eventSlug, nickname: "Makaya Integration" },
      {
        repository: postgresPlayerRepository,
        sessionSecret,
      },
    );

    const [storedSession] = await db
      .select({
        tokenHash: playerSessions.tokenHash,
        nickname: players.nickname,
      })
      .from(playerSessions)
      .innerJoin(players, eq(players.id, playerSessions.playerId))
      .where(
        and(
          eq(players.eventId, eventId),
          eq(players.publicCode, registration.player.publicCode),
        ),
      )
      .limit(1);

    expect(storedSession).toEqual({
      tokenHash: hashPlayerSessionToken(
        registration.session.token,
        sessionSecret,
      ),
      nickname: "Makaya Integration",
    });
    expect(storedSession?.tokenHash).not.toBe(registration.session.token);

    await expect(
      registerPlayer(
        { eventSlug, nickname: "makaya integration" },
        { repository: postgresPlayerRepository, sessionSecret },
      ),
    ).rejects.toBeInstanceOf(NicknameAlreadyUsedError);

    const currentPlayer = await getCurrentPlayer(registration.session.token, {
      repository: postgresPlayerRepository,
      sessionSecret,
    });

    expect(currentPlayer).toMatchObject({
      player: {
        publicCode: registration.player.publicCode,
        nickname: "Makaya Integration",
      },
      event: { slug: eventSlug, status: "READY" },
    });
  });
});
