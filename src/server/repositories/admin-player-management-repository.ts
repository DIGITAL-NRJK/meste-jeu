import "server-only";

import { sql } from "drizzle-orm";

import {
  adminUsers,
  answers,
  auditLogs,
  consents,
  events,
  players,
  playerSessions,
  questionOptions,
  questions,
  quizSessions,
  rewardAwards,
  scoreEvents,
  sessionQuestions,
} from "../../../db/schema";
import { getDb } from "@/lib/db/client";
import type {
  AdminPlayerAnswer,
  AdminPlayerDetail,
  AdminPlayerEvent,
  AdminPlayerFilters,
  AdminPlayerManagementRepository,
  AdminPlayerScoreAdjustment,
  AdminPlayerScoreSession,
  AdminPlayerSummary,
  AppendScoreAdjustmentOutcome,
  DeletePlayerOutcome,
  DisablePlayerOutcome,
  PersistScoreAdjustment,
} from "@/server/services/admin-player-management";

async function listEvents(): Promise<AdminPlayerEvent[]> {
  const result = await getDb().execute<AdminPlayerEvent>(sql`
    SELECT
      event.id,
      event.slug,
      event.name,
      event.environment::text AS environment,
      event.status::text AS status
    FROM ${events} AS event
    ORDER BY
      CASE event.status::text
        WHEN 'LIVE' THEN 0
        WHEN 'READY' THEN 1
        WHEN 'DRAFT' THEN 2
        WHEN 'FINISHED' THEN 3
        ELSE 4
      END,
      event.starts_at DESC
  `);

  return [...result.rows];
}

async function listPlayers(
  filters: AdminPlayerFilters,
): Promise<AdminPlayerSummary[]> {
  const search = filters.search ?? null;
  const status = filters.status ?? null;
  const result = await getDb().execute<AdminPlayerSummary>(sql`
    SELECT
      player.id,
      player.public_code AS "publicCode",
      player.nickname,
      player.status::text AS status,
      player.current_streak AS "currentStreak",
      COALESCE((
        SELECT sum(score.points)::integer
        FROM ${scoreEvents} AS score
        INNER JOIN ${quizSessions} AS scored_session
          ON scored_session.id = score.quiz_session_id
        WHERE score.player_id = player.id
          AND scored_session.event_id = player.event_id
          AND score.voided_at IS NULL
      ), 0)::integer AS "totalPoints",
      (
        SELECT count(*)::integer
        FROM ${answers} AS answer
        WHERE answer.player_id = player.id
      ) AS "answerCount",
      player.created_at AS "createdAt",
      player.last_seen_at AS "lastSeenAt"
    FROM ${players} AS player
    WHERE player.event_id = ${filters.eventId}::uuid
      AND (${status}::text IS NULL OR player.status::text = ${status}::text)
      AND (
        ${search}::text IS NULL
        OR position(lower(${search}::text) in lower(player.nickname)) > 0
        OR position(upper(${search}::text) in upper(player.public_code)) > 0
      )
    ORDER BY lower(player.nickname), player.public_code
    LIMIT ${filters.limit}::integer
  `);

  return [...result.rows];
}

type PlayerDetailRow = Omit<
  AdminPlayerDetail,
  "event" | "answers" | "scoreSessions" | "scoreAdjustments"
> & {
  eventId: string;
  eventSlug: string;
  eventName: string;
  eventEnvironment: AdminPlayerEvent["environment"];
  eventStatus: AdminPlayerEvent["status"];
};

async function getPlayer(playerId: string): Promise<AdminPlayerDetail | null> {
  const db = getDb();
  const [playerResult, answerResult, scoreSessionResult, adjustmentResult] =
    await db.batch([
      db.execute<PlayerDetailRow>(sql`
        SELECT
          player.id,
          player.public_code AS "publicCode",
          player.nickname,
          player.status::text AS status,
          player.current_streak AS "currentStreak",
          COALESCE((
            SELECT sum(score.points)::integer
            FROM ${scoreEvents} AS score
            INNER JOIN ${quizSessions} AS scored_session
              ON scored_session.id = score.quiz_session_id
            WHERE score.player_id = player.id
              AND scored_session.event_id = player.event_id
              AND score.voided_at IS NULL
          ), 0)::integer AS "totalPoints",
          (
            SELECT count(*)::integer
            FROM ${answers} AS answer
            WHERE answer.player_id = player.id
          ) AS "answerCount",
          player.created_at AS "createdAt",
          player.last_seen_at AS "lastSeenAt",
          event.id AS "eventId",
          event.slug AS "eventSlug",
          event.name AS "eventName",
          event.environment::text AS "eventEnvironment",
          event.status::text AS "eventStatus"
        FROM ${players} AS player
        INNER JOIN ${events} AS event ON event.id = player.event_id
        WHERE player.id = ${playerId}::uuid
        LIMIT 1
      `),
      db.execute<AdminPlayerAnswer>(sql`
        SELECT
          answer.id,
          session.name AS "sessionName",
          occurrence.position AS "questionPosition",
          question.question_text AS "questionText",
          selected_option.label AS "selectedOptionLabel",
          selected_option.text AS "selectedOptionText",
          CASE
            WHEN occurrence.status = 'REVEALED' THEN answer.is_correct
            ELSE NULL
          END AS "isCorrect",
          answer.response_time_ms AS "responseTimeMs",
          answer.received_at AS "receivedAt",
          occurrence.status::text AS "questionStatus"
        FROM ${answers} AS answer
        INNER JOIN ${sessionQuestions} AS occurrence
          ON occurrence.id = answer.session_question_id
        INNER JOIN ${quizSessions} AS session
          ON session.id = occurrence.quiz_session_id
        INNER JOIN ${questions} AS question ON question.id = occurrence.question_id
        INNER JOIN ${questionOptions} AS selected_option
          ON selected_option.id = answer.question_option_id
        WHERE answer.player_id = ${playerId}::uuid
        ORDER BY answer.received_at DESC, answer.id DESC
      `),
      db.execute<AdminPlayerScoreSession>(sql`
        SELECT
          session.id,
          session.name,
          session.mode::text AS mode,
          session.status::text AS status,
          session.reset_score AS "resetScore",
          COALESCE((
            SELECT sum(score.points)::integer
            FROM ${scoreEvents} AS score
            WHERE score.player_id = ${playerId}::uuid
              AND score.quiz_session_id = session.id
              AND score.voided_at IS NULL
          ), 0)::integer AS points
        FROM ${quizSessions} AS session
        INNER JOIN ${players} AS player ON player.event_id = session.event_id
        WHERE player.id = ${playerId}::uuid
        ORDER BY
          CASE session.status::text
            WHEN 'LIVE' THEN 0
            WHEN 'READY' THEN 1
            WHEN 'FINISHED' THEN 2
            WHEN 'DRAFT' THEN 3
            ELSE 4
          END,
          session.starts_at DESC NULLS LAST,
          session.created_at DESC
      `),
      db.execute<AdminPlayerScoreAdjustment>(sql`
        SELECT
          adjustment.id,
          adjustment.quiz_session_id AS "quizSessionId",
          session.name AS "sessionName",
          adjustment.points,
          COALESCE(adjustment.metadata->>'reason', 'Motif non renseigné') AS reason,
          admin.display_name AS "adminDisplayName",
          adjustment.created_at AS "createdAt"
        FROM ${scoreEvents} AS adjustment
        INNER JOIN ${quizSessions} AS session
          ON session.id = adjustment.quiz_session_id
        INNER JOIN ${adminUsers} AS admin
          ON admin.id = adjustment.created_by_admin_id
        WHERE adjustment.player_id = ${playerId}::uuid
          AND adjustment.type = 'ADMIN_ADJUSTMENT'
        ORDER BY adjustment.created_at DESC, adjustment.id DESC
      `),
    ]);

  const player = playerResult.rows[0];
  if (!player) return null;

  return {
    id: player.id,
    publicCode: player.publicCode,
    nickname: player.nickname,
    status: player.status,
    currentStreak: player.currentStreak,
    totalPoints: player.totalPoints,
    answerCount: player.answerCount,
    createdAt: player.createdAt,
    lastSeenAt: player.lastSeenAt,
    event: {
      id: player.eventId,
      slug: player.eventSlug,
      name: player.eventName,
      environment: player.eventEnvironment,
      status: player.eventStatus,
    },
    answers: [...answerResult.rows],
    scoreSessions: [...scoreSessionResult.rows],
    scoreAdjustments: [...adjustmentResult.rows],
  };
}

type DisablePlayerRow = { outcome: "DISABLED" | "NOT_FOUND" | "ALREADY_DISABLED" };

async function disablePlayer(input: {
  playerId: string;
  actorAdminId: string;
  now: Date;
}): Promise<DisablePlayerOutcome> {
  const result = await getDb().execute<DisablePlayerRow>(sql`
    WITH candidate AS (
      SELECT player.id, player.status
      FROM ${players} AS player
      WHERE player.id = ${input.playerId}::uuid
    ), disabled AS (
      UPDATE ${players} AS player
      SET status = 'DISABLED', updated_at = ${input.now}
      WHERE player.id = ${input.playerId}::uuid
        AND player.status = 'ACTIVE'
      RETURNING player.id, player.event_id, player.public_code
    ), revoked AS (
      UPDATE ${playerSessions} AS player_session
      SET revoked_at = ${input.now}
      FROM disabled
      WHERE player_session.player_id = disabled.id
        AND player_session.revoked_at IS NULL
      RETURNING player_session.id
    ), audit AS (
      INSERT INTO ${auditLogs} (
        admin_user_id,
        action,
        entity_type,
        entity_id,
        metadata,
        created_at
      )
      SELECT
        ${input.actorAdminId}::uuid,
        'PLAYER_DISABLED',
        'player',
        disabled.id,
        jsonb_build_object(
          'eventId', disabled.event_id,
          'publicCode', disabled.public_code,
          'revokedSessionCount', (SELECT count(*) FROM revoked)
        ),
        ${input.now}
      FROM disabled
      RETURNING id
    )
    SELECT CASE
      WHEN NOT EXISTS (SELECT 1 FROM candidate) THEN 'NOT_FOUND'
      WHEN NOT EXISTS (SELECT 1 FROM disabled) THEN 'ALREADY_DISABLED'
      ELSE 'DISABLED'
    END::text AS outcome
  `);

  const outcome = result.rows[0]?.outcome;
  if (outcome === "DISABLED") return "disabled";
  if (outcome === "ALREADY_DISABLED") return "already_disabled";
  return "not_found";
}

type DeletePlayerRow = {
  outcome: "DELETED" | "NOT_FOUND" | "PRODUCTION_EVENT" | "FINISHED_EVENT";
};

async function deletePlayer(input: {
  playerId: string;
  actorAdminId: string;
  now: Date;
}): Promise<DeletePlayerOutcome> {
  const result = await getDb().execute<DeletePlayerRow>(sql`
    WITH candidate AS (
      SELECT
        player.id,
        player.event_id,
        player.public_code,
        player.nickname,
        event.environment::text AS environment,
        event.status::text AS event_status
      FROM ${players} AS player
      INNER JOIN ${events} AS event ON event.id = player.event_id
      WHERE player.id = ${input.playerId}::uuid
    ), eligible AS (
      SELECT *
      FROM candidate
      WHERE environment = 'TEST'
        AND event_status <> 'FINISHED'
    ), deleted_awards AS (
      DELETE FROM ${rewardAwards} AS award
      USING eligible
      WHERE award.player_id = eligible.id
      RETURNING award.id
    ), deleted_scores AS (
      DELETE FROM ${scoreEvents} AS score
      USING eligible
      WHERE score.player_id = eligible.id
        AND (SELECT count(*) FROM deleted_awards) >= 0
      RETURNING score.id
    ), deleted_answers AS (
      DELETE FROM ${answers} AS answer
      USING eligible
      WHERE answer.player_id = eligible.id
        AND (SELECT count(*) FROM deleted_scores) >= 0
      RETURNING answer.id
    ), deleted_sessions AS (
      DELETE FROM ${playerSessions} AS player_session
      USING eligible
      WHERE player_session.player_id = eligible.id
        AND (SELECT count(*) FROM deleted_answers) >= 0
      RETURNING player_session.id
    ), deleted_consents AS (
      DELETE FROM ${consents} AS consent
      USING eligible
      WHERE consent.player_id = eligible.id
        AND (SELECT count(*) FROM deleted_sessions) >= 0
      RETURNING consent.id
    ), written_audit AS (
      INSERT INTO ${auditLogs} (
        admin_user_id, action, entity_type, entity_id, metadata, created_at
      )
      SELECT
        ${input.actorAdminId}::uuid,
        'PLAYER_DELETED',
        'player',
        eligible.id,
        jsonb_build_object(
          'eventId', eligible.event_id,
          'publicCode', eligible.public_code,
          'nickname', eligible.nickname,
          'rewardAwards', (SELECT count(*) FROM deleted_awards),
          'scoreEvents', (SELECT count(*) FROM deleted_scores),
          'answers', (SELECT count(*) FROM deleted_answers),
          'playerSessions', (SELECT count(*) FROM deleted_sessions),
          'consents', (SELECT count(*) FROM deleted_consents)
        ),
        ${input.now}
      FROM eligible
      RETURNING entity_id
    ), deleted AS (
      DELETE FROM ${players} AS player
      USING written_audit
      WHERE player.id = written_audit.entity_id
      RETURNING player.id
    )
    SELECT CASE
      WHEN NOT EXISTS (SELECT 1 FROM candidate) THEN 'NOT_FOUND'
      WHEN (SELECT environment FROM candidate) <> 'TEST' THEN 'PRODUCTION_EVENT'
      WHEN (SELECT event_status FROM candidate) = 'FINISHED' THEN 'FINISHED_EVENT'
      WHEN EXISTS (SELECT 1 FROM deleted) THEN 'DELETED'
      ELSE 'NOT_FOUND'
    END::text AS outcome
  `);

  switch (result.rows[0]?.outcome) {
    case "DELETED":
      return "deleted";
    case "PRODUCTION_EVENT":
      return "production_event";
    case "FINISHED_EVENT":
      return "finished_event";
    default:
      return "not_found";
  }
}

type AppendScoreAdjustmentRow = {
  outcome: "CREATED" | "PLAYER_NOT_FOUND" | "SESSION_NOT_FOUND";
};

async function appendScoreAdjustment(
  input: PersistScoreAdjustment,
): Promise<AppendScoreAdjustmentOutcome> {
  const result = await getDb().execute<AppendScoreAdjustmentRow>(sql`
    WITH candidate_player AS (
      SELECT player.id, player.event_id
      FROM ${players} AS player
      WHERE player.id = ${input.playerId}::uuid
    ), eligible AS (
      SELECT
        candidate_player.id AS player_id,
        candidate_player.event_id,
        session.id AS quiz_session_id
      FROM candidate_player
      INNER JOIN ${quizSessions} AS session
        ON session.id = ${input.quizSessionId}::uuid
        AND session.event_id = candidate_player.event_id
        AND session.status <> 'CANCELED'
    ), inserted AS (
      INSERT INTO ${scoreEvents} (
        id,
        player_id,
        quiz_session_id,
        type,
        points,
        metadata,
        created_at,
        created_by_admin_id
      )
      SELECT
        ${input.scoreEventId}::uuid,
        eligible.player_id,
        eligible.quiz_session_id,
        'ADMIN_ADJUSTMENT',
        ${input.points}::integer,
        jsonb_build_object('reason', ${input.reason}::text),
        ${input.now},
        ${input.actorAdminId}::uuid
      FROM eligible
      RETURNING id, player_id, quiz_session_id
    ), audit AS (
      INSERT INTO ${auditLogs} (
        admin_user_id,
        action,
        entity_type,
        entity_id,
        metadata,
        created_at
      )
      SELECT
        ${input.actorAdminId}::uuid,
        'SCORE_ADJUSTED',
        'score_event',
        inserted.id,
        jsonb_build_object(
          'playerId', inserted.player_id,
          'quizSessionId', inserted.quiz_session_id,
          'points', ${input.points}::integer,
          'reason', ${input.reason}::text
        ),
        ${input.now}
      FROM inserted
      RETURNING id
    )
    SELECT CASE
      WHEN NOT EXISTS (SELECT 1 FROM candidate_player) THEN 'PLAYER_NOT_FOUND'
      WHEN NOT EXISTS (SELECT 1 FROM eligible) THEN 'SESSION_NOT_FOUND'
      ELSE 'CREATED'
    END::text AS outcome
  `);

  const outcome = result.rows[0]?.outcome;
  if (outcome === "CREATED") return "created";
  if (outcome === "SESSION_NOT_FOUND") return "session_not_found";
  return "player_not_found";
}

export const postgresAdminPlayerManagementRepository: AdminPlayerManagementRepository = {
  listEvents,
  listPlayers,
  getPlayer,
  disablePlayer,
  deletePlayer,
  appendScoreAdjustment,
};
