import "server-only";

import { and, eq, gt, isNull, sql } from "drizzle-orm";

import {
  events,
  players,
  playerSessions,
} from "../../../db/schema";
import { getDb } from "@/lib/db/client";
import {
  RegistrationConflictError,
  type PersistRegistrationInput,
  type PersistRegistrationResult,
  type PlayerRepository,
} from "@/server/services/player-registration";

type RegistrationQueryRow = {
  outcome: "CREATED" | "EVENT_NOT_FOUND" | "REGISTRATION_UNAVAILABLE";
  publicCode: string | null;
  nickname: string | null;
  currentStreak: number | null;
  eventSlug: string | null;
  eventName: string | null;
  eventTimezone: string | null;
  eventStatus: "READY" | "LIVE" | null;
};

function getConstraintName(error: unknown): string | undefined {
  let candidate: unknown = error;

  for (let depth = 0; depth < 5; depth += 1) {
    if (!candidate || typeof candidate !== "object") {
      return undefined;
    }

    const record = candidate as Record<string, unknown>;

    if (record.code === "23505") {
      if (typeof record.constraint === "string") {
        return record.constraint;
      }

      if (typeof record.message === "string") {
        if (record.message.includes("players_event_nickname_unique")) {
          return "players_event_nickname_unique";
        }

        if (record.message.includes("players_public_code_unique")) {
          return "players_public_code_unique";
        }
      }
    }

    candidate = record.cause;
  }

  return undefined;
}

async function createRegistration(
  input: PersistRegistrationInput,
): Promise<PersistRegistrationResult> {
  const db = getDb();

  try {
    const result = await db.execute<RegistrationQueryRow>(sql`
      WITH target_event AS (
        SELECT id, slug, name, timezone, status
        FROM ${events}
        WHERE ${events.slug} = ${input.eventSlug}
        LIMIT 1
      ), eligible_event AS (
        SELECT id, slug, name, timezone, status
        FROM target_event
        WHERE status IN ('READY', 'LIVE')
      ), new_player AS (
        INSERT INTO ${players} (id, event_id, public_code, nickname)
        SELECT ${input.playerId}, id, ${input.publicCode}, ${input.nickname}
        FROM eligible_event
        RETURNING id, event_id, public_code, nickname, current_streak
      ), new_session AS (
        INSERT INTO ${playerSessions} (id, player_id, token_hash, expires_at)
        SELECT ${input.sessionId}, id, ${input.tokenHash}, ${input.expiresAt}
        FROM new_player
        RETURNING player_id
      )
      SELECT
        'CREATED'::text AS outcome,
        new_player.public_code AS "publicCode",
        new_player.nickname,
        new_player.current_streak AS "currentStreak",
        eligible_event.slug AS "eventSlug",
        eligible_event.name AS "eventName",
        eligible_event.timezone AS "eventTimezone",
        eligible_event.status::text AS "eventStatus"
      FROM new_player
      INNER JOIN new_session ON new_session.player_id = new_player.id
      INNER JOIN eligible_event ON eligible_event.id = new_player.event_id

      UNION ALL

      SELECT
        CASE
          WHEN NOT EXISTS (SELECT 1 FROM target_event) THEN 'EVENT_NOT_FOUND'
          ELSE 'REGISTRATION_UNAVAILABLE'
        END AS outcome,
        NULL::text AS "publicCode",
        NULL::text AS nickname,
        NULL::integer AS "currentStreak",
        NULL::text AS "eventSlug",
        NULL::text AS "eventName",
        NULL::text AS "eventTimezone",
        NULL::text AS "eventStatus"
      WHERE NOT EXISTS (SELECT 1 FROM new_player)
    `);

    const row = result.rows[0];

    if (!row || row.outcome === "EVENT_NOT_FOUND") {
      return { outcome: "event_not_found" };
    }

    if (row.outcome === "REGISTRATION_UNAVAILABLE") {
      return { outcome: "registration_unavailable" };
    }

    if (
      !row.publicCode ||
      !row.nickname ||
      row.currentStreak === null ||
      !row.eventSlug ||
      !row.eventName ||
      !row.eventTimezone ||
      !row.eventStatus
    ) {
      throw new Error("Invalid registration result");
    }

    return {
      outcome: "created",
      player: {
        publicCode: row.publicCode,
        nickname: row.nickname,
        currentStreak: row.currentStreak,
      },
      event: {
        slug: row.eventSlug,
        name: row.eventName,
        timezone: row.eventTimezone,
        status: row.eventStatus,
      },
    };
  } catch (error) {
    const constraint = getConstraintName(error);

    if (constraint === "players_event_nickname_unique") {
      throw new RegistrationConflictError("nickname");
    }

    if (constraint === "players_public_code_unique") {
      throw new RegistrationConflictError("publicCode");
    }

    throw error;
  }
}

async function findCurrentPlayer(tokenHash: string, now: Date) {
  const db = getDb();
  const [session] = await db
    .select({
      sessionId: playerSessions.id,
      playerId: players.id,
      publicCode: players.publicCode,
      nickname: players.nickname,
      currentStreak: players.currentStreak,
      eventSlug: events.slug,
      eventName: events.name,
      eventTimezone: events.timezone,
      eventStatus: events.status,
    })
    .from(playerSessions)
    .innerJoin(players, eq(players.id, playerSessions.playerId))
    .innerJoin(events, eq(events.id, players.eventId))
    .where(
      and(
        eq(playerSessions.tokenHash, tokenHash),
        isNull(playerSessions.revokedAt),
        gt(playerSessions.expiresAt, now),
        eq(players.status, "ACTIVE"),
      ),
    )
    .limit(1);

  if (!session) {
    return null;
  }

  await db.batch([
    db
      .update(playerSessions)
      .set({ lastSeenAt: now })
      .where(eq(playerSessions.id, session.sessionId)),
    db
      .update(players)
      .set({ lastSeenAt: now })
      .where(eq(players.id, session.playerId)),
  ]);

  return {
    player: {
      publicCode: session.publicCode,
      nickname: session.nickname,
      currentStreak: session.currentStreak,
    },
    event: {
      slug: session.eventSlug,
      name: session.eventName,
      timezone: session.eventTimezone,
      status: session.eventStatus,
    },
  };
}

export const postgresPlayerRepository: PlayerRepository = {
  createRegistration,
  findCurrentPlayer,
};
