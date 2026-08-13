import "server-only";

import { sql } from "drizzle-orm";

import {
  answers,
  events,
  players,
  questions,
  quizSessions,
  scoreEvents,
  sessionQuestions,
} from "../../../db/schema";
import { getDb } from "@/lib/db/client";
import type {
  AdminDashboard,
  AdminDashboardRepository,
  AdminEventOption,
} from "@/server/services/admin-dashboard";

type DashboardPayload = Omit<AdminDashboard, "events">;
type DashboardRow = { payload: DashboardPayload };

async function listEvents(): Promise<AdminEventOption[]> {
  const rows = await getDb().execute<AdminEventOption>(sql`
    SELECT
      ${events.id} AS id,
      ${events.slug} AS slug,
      ${events.name} AS name,
      ${events.environment}::text AS environment,
      ${events.status}::text AS status
    FROM ${events}
    ORDER BY
      CASE ${events.status}::text
        WHEN 'LIVE' THEN 0
        WHEN 'READY' THEN 1
        WHEN 'DRAFT' THEN 2
        WHEN 'FINISHED' THEN 3
        ELSE 4
      END,
      ${events.startsAt} DESC
  `);

  return [...rows.rows];
}

async function getDashboard(event: AdminEventOption, now: Date) {
  const activeSince = new Date(now.getTime() - 15 * 60 * 1_000);
  const rows = await getDb().execute<DashboardRow>(sql`
    WITH current_session AS (
      SELECT
        session.id,
        session.name,
        session.mode::text AS mode,
        session.status::text AS status,
        (
          SELECT count(*)::integer
          FROM ${sessionQuestions} AS occurrence
          WHERE occurrence.quiz_session_id = session.id
        ) AS question_count
      FROM ${quizSessions} AS session
      WHERE session.event_id = ${event.id}::uuid
        AND session.status <> 'CANCELED'
      ORDER BY
        CASE session.status::text
          WHEN 'LIVE' THEN 0
          WHEN 'READY' THEN 1
          WHEN 'DRAFT' THEN 2
          WHEN 'FINISHED' THEN 3
          ELSE 4
        END,
        session.updated_at DESC
      LIMIT 1
    ), current_question AS (
      SELECT
        occurrence.id,
        question.question_text,
        occurrence.position,
        occurrence.duration_seconds,
        occurrence.status::text AS status,
        occurrence.opens_at,
        occurrence.closes_at
      FROM ${sessionQuestions} AS occurrence
      INNER JOIN current_session ON current_session.id = occurrence.quiz_session_id
      INNER JOIN ${questions} AS question ON question.id = occurrence.question_id
      WHERE occurrence.status <> 'CANCELED'
      ORDER BY
        CASE occurrence.status::text
          WHEN 'OPEN' THEN 0
          WHEN 'CLOSED' THEN 1
          WHEN 'REVEALED' THEN 2
          WHEN 'PENDING' THEN 3
          ELSE 4
        END,
        CASE
          WHEN occurrence.status = 'PENDING' THEN occurrence.position
          ELSE -occurrence.position
        END
      LIMIT 1
    ), participant_stats AS (
      SELECT
        count(*)::integer AS registered,
        count(*) FILTER (
          WHERE player.status = 'ACTIVE'
            AND player.last_seen_at >= ${activeSince}
        )::integer AS active_recently
      FROM ${players} AS player
      WHERE player.event_id = ${event.id}::uuid
    ), answer_stats AS (
      SELECT
        count(answer.id)::integer AS answers_received,
        count(answer.id) FILTER (WHERE answer.is_correct = true)::integer AS correct_answers,
        coalesce(
          round(
            100.0 * count(answer.id) FILTER (WHERE answer.is_correct = true)
            / nullif(count(answer.id), 0)
          ),
          0
        )::integer AS success_rate,
        round(avg(answer.response_time_ms))::integer AS average_response_time_ms
      FROM current_question
      LEFT JOIN ${answers} AS answer
        ON answer.session_question_id = current_question.id
    ), player_scores AS (
      SELECT
        player.id,
        player.public_code,
        player.nickname,
        coalesce((
          SELECT sum(score_event.points)
          FROM ${scoreEvents} AS score_event
          INNER JOIN ${quizSessions} AS score_session
            ON score_session.id = score_event.quiz_session_id
          WHERE score_event.player_id = player.id
            AND score_session.event_id = player.event_id
            AND score_event.voided_at IS NULL
        ), 0)::integer AS points
      FROM ${players} AS player
      WHERE player.event_id = ${event.id}::uuid
        AND player.status = 'ACTIVE'
    ), ranked_scores AS (
      SELECT
        rank() OVER (ORDER BY points DESC)::integer AS position,
        row_number() OVER (
          ORDER BY points DESC, lower(nickname), public_code
        )::integer AS display_order,
        public_code,
        nickname,
        points
      FROM player_scores
    ), library_stats AS (
      SELECT
        count(*)::integer AS total,
        count(*) FILTER (WHERE status = 'DRAFT')::integer AS drafts,
        count(*) FILTER (WHERE status = 'REVIEW')::integer AS in_review,
        count(*) FILTER (WHERE status = 'VALIDATED')::integer AS validated
      FROM ${questions}
    )
    SELECT jsonb_build_object(
      'serverNow', ${now}::timestamptz,
      'event', jsonb_build_object(
        'id', ${event.id}::uuid,
        'slug', ${event.slug}::text,
        'name', ${event.name}::text,
        'environment', ${event.environment}::text,
        'status', ${event.status}::text
      ),
      'participants', jsonb_build_object(
        'registered', participant_stats.registered,
        'activeRecently', participant_stats.active_recently
      ),
      'session', CASE WHEN current_session.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', current_session.id,
        'name', current_session.name,
        'mode', current_session.mode,
        'status', current_session.status,
        'questionCount', current_session.question_count
      ) END,
      'currentQuestion', CASE WHEN current_question.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', current_question.id,
        'questionText', current_question.question_text,
        'position', current_question.position,
        'durationSeconds', current_question.duration_seconds,
        'status', current_question.status,
        'opensAt', current_question.opens_at,
        'closesAt', current_question.closes_at,
        'answersReceived', answer_stats.answers_received,
        'correctAnswers', answer_stats.correct_answers,
        'successRate', answer_stats.success_rate,
        'averageResponseTimeMs', answer_stats.average_response_time_ms
      ) END,
      'leaderboard', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'position', ranked.position,
          'publicCode', ranked.public_code,
          'nickname', ranked.nickname,
          'points', ranked.points
        ) ORDER BY ranked.display_order)
        FROM ranked_scores AS ranked
        WHERE ranked.display_order <= 10
      ), '[]'::jsonb),
      'questionLibrary', jsonb_build_object(
        'total', library_stats.total,
        'drafts', library_stats.drafts,
        'inReview', library_stats.in_review,
        'validated', library_stats.validated
      )
    ) AS payload
    FROM participant_stats
    CROSS JOIN answer_stats
    CROSS JOIN library_stats
    LEFT JOIN current_session ON true
    LEFT JOIN current_question ON true
  `);

  const dashboard = rows.rows[0]?.payload;

  if (!dashboard) {
    throw new Error("Admin dashboard query returned no payload");
  }

  return dashboard;
}

export const postgresAdminDashboardRepository: AdminDashboardRepository = {
  listEvents,
  getDashboard,
};
