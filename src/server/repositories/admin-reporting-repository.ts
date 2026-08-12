import "server-only";

import { sql } from "drizzle-orm";

import {
  adminUsers,
  answers,
  auditLogs,
  events,
  players,
  questionOptions,
  questions,
  quizSessions,
  scoreEvents,
  sessionQuestions,
} from "../../../db/schema";
import { getDb } from "@/lib/db/client";
import type {
  AdminAuditLogEntry,
  AdminReportingRepository,
  AnswerExportRow,
  LeaderboardExportRow,
  PlayerExportRow,
  ReportingEvent,
} from "@/server/services/admin-reporting";

async function findEventBySlug(eventSlug: string): Promise<ReportingEvent | null> {
  const result = await getDb().execute<ReportingEvent>(sql`
    SELECT event.id, event.slug, event.name
    FROM ${events} AS event
    WHERE event.slug = ${eventSlug}
    LIMIT 1
  `);

  return result.rows[0] ?? null;
}

async function listPlayers(eventId: string): Promise<PlayerExportRow[]> {
  const result = await getDb().execute<PlayerExportRow>(sql`
    SELECT
      player.public_code AS "publicCode",
      player.nickname,
      player.status::text AS status,
      player.current_streak AS "currentStreak",
      to_char(player.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
      to_char(player.last_seen_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "lastSeenAt"
    FROM ${players} AS player
    WHERE player.event_id = ${eventId}::uuid
    ORDER BY lower(player.nickname), player.public_code
  `);

  return [...result.rows];
}

async function listLeaderboard(eventId: string): Promise<LeaderboardExportRow[]> {
  const result = await getDb().execute<LeaderboardExportRow>(sql`
    WITH totals AS (
      SELECT
        player.public_code,
        player.nickname,
        COALESCE((
          SELECT sum(score.points)::integer
          FROM ${scoreEvents} AS score
          INNER JOIN ${quizSessions} AS scored_session
            ON scored_session.id = score.quiz_session_id
          WHERE score.player_id = player.id
            AND scored_session.event_id = ${eventId}::uuid
            AND score.voided_at IS NULL
        ), 0)::integer AS points
      FROM ${players} AS player
      WHERE player.event_id = ${eventId}::uuid
        AND player.status = 'ACTIVE'
    ), ranked AS (
      SELECT
        rank() OVER (ORDER BY totals.points DESC)::integer AS position,
        row_number() OVER (
          ORDER BY totals.points DESC, lower(totals.nickname), totals.public_code
        )::integer AS listing_order,
        totals.public_code,
        totals.nickname,
        totals.points
      FROM totals
    )
    SELECT
      ranked.position,
      ranked.public_code AS "publicCode",
      ranked.nickname,
      ranked.points
    FROM ranked
    ORDER BY ranked.listing_order
  `);

  return [...result.rows];
}

async function listAnswers(eventId: string): Promise<AnswerExportRow[]> {
  const result = await getDb().execute<AnswerExportRow>(sql`
    SELECT
      session.name AS "sessionName",
      occurrence.position AS "questionPosition",
      question.question_text AS "questionText",
      player.public_code AS "publicCode",
      player.nickname,
      selected_option.label AS "selectedOptionLabel",
      selected_option.text AS "selectedOptionText",
      CASE
        WHEN occurrence.status = 'REVEALED' THEN correct_option.label
        ELSE NULL
      END AS "correctOptionLabel",
      CASE
        WHEN occurrence.status = 'REVEALED' THEN correct_option.text
        ELSE NULL
      END AS "correctOptionText",
      CASE
        WHEN occurrence.status = 'REVEALED' THEN answer.is_correct
        ELSE NULL
      END AS "isCorrect",
      answer.response_time_ms AS "responseTimeMs",
      to_char(answer.received_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "receivedAt",
      occurrence.status::text AS "questionStatus"
    FROM ${answers} AS answer
    INNER JOIN ${players} AS player ON player.id = answer.player_id
    INNER JOIN ${sessionQuestions} AS occurrence
      ON occurrence.id = answer.session_question_id
    INNER JOIN ${quizSessions} AS session
      ON session.id = occurrence.quiz_session_id
    INNER JOIN ${questions} AS question ON question.id = occurrence.question_id
    INNER JOIN ${questionOptions} AS selected_option
      ON selected_option.id = answer.question_option_id
    INNER JOIN ${questionOptions} AS correct_option
      ON correct_option.question_id = question.id
      AND correct_option.is_correct = true
    WHERE session.event_id = ${eventId}::uuid
    ORDER BY
      session.starts_at NULLS LAST,
      session.created_at,
      occurrence.position,
      answer.received_at,
      player.public_code
  `);

  return [...result.rows];
}

async function listAuditLogs(limit: number): Promise<AdminAuditLogEntry[]> {
  const result = await getDb().execute<AdminAuditLogEntry>(sql`
    SELECT
      audit.id,
      audit.action::text AS action,
      audit.entity_type AS "entityType",
      audit.entity_id AS "entityId",
      COALESCE(admin.display_name, 'Système') AS "adminDisplayName",
      to_char(audit.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
    FROM ${auditLogs} AS audit
    LEFT JOIN ${adminUsers} AS admin ON admin.id = audit.admin_user_id
    ORDER BY audit.created_at DESC, audit.id DESC
    LIMIT ${limit}::integer
  `);

  return [...result.rows];
}

export const postgresAdminReportingRepository: AdminReportingRepository = {
  findEventBySlug,
  listPlayers,
  listLeaderboard,
  listAnswers,
  listAuditLogs,
};
