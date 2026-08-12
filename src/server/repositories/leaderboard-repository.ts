import "server-only";

import { sql } from "drizzle-orm";

import {
  answers,
  events,
  players,
  playerSessions,
  quizSessions,
  scoreEvents,
  sessionQuestions,
} from "../../../db/schema";
import { getDb } from "@/lib/db/client";
import type {
  FindLeaderboardInput,
  Leaderboard,
  LeaderboardEntry,
  LeaderboardRepository,
} from "@/server/services/leaderboard";

type LeaderboardRow = {
  eventSlug: string;
  eventName: string;
  eventStatus: Leaderboard["event"]["status"];
  sessionId: string | null;
  sessionName: string | null;
  sessionStatus: "DRAFT" | "READY" | "LIVE" | "FINISHED" | "CANCELED" | null;
  participantCount: number;
  playerId: string | null;
  publicCode: string | null;
  nickname: string | null;
  points: number | null;
  position: number | null;
  listingOrder: number | null;
  isCurrentPlayer: boolean;
};

function toEntry(row: LeaderboardRow): LeaderboardEntry | null {
  if (
    !row.playerId ||
    !row.publicCode ||
    !row.nickname ||
    row.points === null ||
    row.position === null
  ) {
    return null;
  }

  return {
    position: row.position,
    publicCode: row.publicCode,
    nickname: row.nickname,
    points: row.points,
  };
}

async function findLeaderboard(
  input: FindLeaderboardInput,
): Promise<Leaderboard | null> {
  const sessionId = input.sessionId ?? null;
  const result = await getDb().execute<LeaderboardRow>(sql`
    WITH context AS (
      SELECT
        event.id AS event_id,
        event.slug AS event_slug,
        event.name AS event_name,
        event.status::text AS event_status,
        session.id AS session_id,
        session.name AS session_name,
        session.status::text AS session_status
      FROM ${events} AS event
      LEFT JOIN ${quizSessions} AS session
        ON session.id = ${sessionId}::uuid
        AND session.event_id = event.id
      WHERE event.slug = ${input.eventSlug}
        AND (${sessionId}::uuid IS NULL OR session.id IS NOT NULL)
      LIMIT 1
    ), authenticated_player AS (
      SELECT player.id
      FROM ${playerSessions} AS player_session
      INNER JOIN ${players} AS player ON player.id = player_session.player_id
      INNER JOIN context ON context.event_id = player.event_id
      WHERE ${input.playerTokenHash}::text IS NOT NULL
        AND player_session.token_hash = ${input.playerTokenHash}
        AND player_session.revoked_at IS NULL
        AND player_session.expires_at > ${input.now}
        AND player.status = 'ACTIVE'
      LIMIT 1
    ), eligible_players AS (
      SELECT player.id, player.public_code, player.nickname
      FROM ${players} AS player
      INNER JOIN context ON context.event_id = player.event_id
      WHERE player.status = 'ACTIVE'
        AND (
          context.session_id IS NULL
          OR EXISTS (
            SELECT 1
            FROM ${answers} AS answer
            INNER JOIN ${sessionQuestions} AS occurrence
              ON occurrence.id = answer.session_question_id
            WHERE answer.player_id = player.id
              AND occurrence.quiz_session_id = context.session_id
          )
          OR EXISTS (
            SELECT 1
            FROM ${scoreEvents} AS participation_score
            WHERE participation_score.player_id = player.id
              AND participation_score.quiz_session_id = context.session_id
          )
        )
    ), totals AS (
      SELECT
        player.id AS player_id,
        player.public_code,
        player.nickname,
        COALESCE((
          SELECT sum(score.points)::integer
          FROM ${scoreEvents} AS score
          INNER JOIN ${quizSessions} AS scored_session
            ON scored_session.id = score.quiz_session_id
          INNER JOIN context ON context.event_id = scored_session.event_id
          WHERE score.player_id = player.id
            AND score.voided_at IS NULL
            AND (
              context.session_id IS NULL
              OR score.quiz_session_id = context.session_id
            )
        ), 0)::integer AS points
      FROM eligible_players AS player
    ), ranked AS (
      SELECT
        totals.*,
        rank() OVER (ORDER BY totals.points DESC)::integer AS position,
        row_number() OVER (
          ORDER BY totals.points DESC, lower(totals.nickname), totals.public_code
        )::integer AS listing_order
      FROM totals
    ), selected_rows AS (
      SELECT
        ranked.*,
        authenticated_player.id IS NOT NULL
          AND ranked.player_id = authenticated_player.id AS is_current_player
      FROM ranked
      LEFT JOIN authenticated_player ON true
      WHERE ranked.listing_order <= ${input.limit}
        OR ranked.player_id = authenticated_player.id
    )
    SELECT
      context.event_slug AS "eventSlug",
      context.event_name AS "eventName",
      context.event_status AS "eventStatus",
      context.session_id AS "sessionId",
      context.session_name AS "sessionName",
      context.session_status AS "sessionStatus",
      (SELECT count(*)::integer FROM ranked) AS "participantCount",
      selected_rows.player_id AS "playerId",
      selected_rows.public_code AS "publicCode",
      selected_rows.nickname,
      selected_rows.points,
      selected_rows.position,
      selected_rows.listing_order AS "listingOrder",
      COALESCE(selected_rows.is_current_player, false) AS "isCurrentPlayer"
    FROM context
    LEFT JOIN selected_rows ON true
    ORDER BY selected_rows.listing_order NULLS LAST
  `);
  const first = result.rows[0];

  if (!first) {
    return null;
  }

  const entries: LeaderboardEntry[] = [];
  let currentPlayer: LeaderboardEntry | null = null;

  for (const row of result.rows) {
    const entry = toEntry(row);

    if (!entry) continue;
    if (row.listingOrder !== null && row.listingOrder <= input.limit) {
      entries.push(entry);
    }
    if (row.isCurrentPlayer) {
      currentPlayer = entry;
    }
  }

  const scope: Leaderboard["scope"] = first.sessionId
    ? {
        type: "SESSION",
        id: first.sessionId,
        name: first.sessionName ?? "Session",
        status: first.sessionStatus ?? "DRAFT",
      }
    : { type: "EVENT" };

  return {
    event: {
      slug: first.eventSlug,
      name: first.eventName,
      status: first.eventStatus,
    },
    scope,
    entries,
    currentPlayer,
    participantCount: first.participantCount,
  };
}

export const postgresLeaderboardRepository: LeaderboardRepository = {
  findLeaderboard,
};
