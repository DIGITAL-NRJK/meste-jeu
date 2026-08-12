import "server-only";

import { sql } from "drizzle-orm";

import {
  answers,
  players,
  playerSessions,
  questionOptions,
  questions,
  quizSessions,
  scoreEvents,
  sessionQuestions,
} from "../../../db/schema";
import { getDb } from "@/lib/db/client";
import {
  CORRECT_ANSWER_POINTS,
  DIFFICULTY_BONUS,
  MAX_SPEED_BONUS,
  STREAK_BONUS,
} from "@/lib/game/scoring";
import type {
  AnswerScoringRepository,
  GetAnswerResultOutcome,
  PersistAnswerInput,
  PlayerAnswerResult,
  SubmitAnswerOutcome,
} from "@/server/services/answer-scoring";

type SubmitAnswerRow = {
  outcome:
    | "ACCEPTED"
    | "UNAUTHENTICATED"
    | "NOT_FOUND"
    | "NOT_OPEN"
    | "EXPIRED"
    | "CANCELED"
    | "INVALID_OPTION"
    | "ALREADY_ANSWERED";
  answerId: string | null;
  receivedAt: Date | null;
  responseTimeMs: number | null;
};

type AnswerResultRow = {
  outcome: "FOUND" | "UNAUTHENTICATED" | "NOT_FOUND";
  questionStatus:
    | "PENDING"
    | "OPEN"
    | "CLOSED"
    | "REVEALED"
    | "CANCELED"
    | null;
  answerSubmitted: boolean;
  selectedOptionId: string | null;
  correctOptionId: string | null;
  isCorrect: boolean | null;
  explanation: string | null;
  answerPoints: number;
  difficultyBonus: number;
  speedBonus: number;
  streakBonus: number;
  totalPoints: number;
};

function mapSubmitAnswerOutcome(row: SubmitAnswerRow): SubmitAnswerOutcome {
  switch (row.outcome) {
    case "ACCEPTED":
      if (!row.answerId || !row.receivedAt || row.responseTimeMs === null) {
        throw new Error("Accepted answer is missing persistence data");
      }

      return {
        outcome: "accepted",
        answer: {
          id: row.answerId,
          receivedAt: row.receivedAt,
          responseTimeMs: row.responseTimeMs,
        },
      };
    case "UNAUTHENTICATED":
      return { outcome: "unauthenticated" };
    case "NOT_FOUND":
      return { outcome: "not_found" };
    case "NOT_OPEN":
      return { outcome: "not_open" };
    case "EXPIRED":
      return { outcome: "expired" };
    case "CANCELED":
      return { outcome: "canceled" };
    case "INVALID_OPTION":
      return { outcome: "invalid_option" };
    case "ALREADY_ANSWERED":
      return { outcome: "already_answered" };
  }
}

async function submitAnswer(
  input: PersistAnswerInput,
): Promise<SubmitAnswerOutcome> {
  const result = await getDb().execute<SubmitAnswerRow>(sql`
    WITH authenticated_player AS (
      SELECT player.id, player.event_id
      FROM ${playerSessions} AS player_session
      INNER JOIN ${players} AS player ON player.id = player_session.player_id
      WHERE player_session.token_hash = ${input.playerTokenHash}
        AND player_session.revoked_at IS NULL
        AND player_session.expires_at > ${input.now}
        AND player.status = 'ACTIVE'
      LIMIT 1
    ), state AS (
      SELECT
        player.id AS player_id,
        player.event_id AS player_event_id,
        occurrence.id AS occurrence_id,
        occurrence.quiz_session_id,
        occurrence.question_id,
        occurrence.status::text AS occurrence_status,
        occurrence.opens_at,
        occurrence.closes_at,
        session.event_id AS session_event_id,
        question.difficulty,
        selected_option.id AS option_id,
        selected_option.is_correct,
        existing_answer.id AS existing_answer_id
      FROM authenticated_player AS player
      LEFT JOIN ${sessionQuestions} AS occurrence
        ON occurrence.id = ${input.sessionQuestionId}::uuid
      LEFT JOIN ${quizSessions} AS session
        ON session.id = occurrence.quiz_session_id
      LEFT JOIN ${questions} AS question ON question.id = occurrence.question_id
      LEFT JOIN ${questionOptions} AS selected_option
        ON selected_option.id = ${input.optionId}::uuid
        AND selected_option.question_id = occurrence.question_id
      LEFT JOIN ${answers} AS existing_answer
        ON existing_answer.player_id = player.id
        AND existing_answer.session_question_id = occurrence.id
    ), eligible AS (
      SELECT
        state.*,
        GREATEST(
          0,
          floor(extract(epoch FROM (${input.now}::timestamptz - state.opens_at)) * 1000)
        )::integer AS response_time_ms,
        floor(
          ${MAX_SPEED_BONUS} * GREATEST(
            0,
            extract(epoch FROM (state.closes_at - ${input.now}::timestamptz))
          ) / GREATEST(
            0.001,
            extract(epoch FROM (state.closes_at - state.opens_at))
          )
        )::integer AS speed_bonus
      FROM state
      WHERE state.occurrence_id IS NOT NULL
        AND state.player_event_id = state.session_event_id
        AND state.existing_answer_id IS NULL
        AND state.occurrence_status = 'OPEN'
        AND state.opens_at IS NOT NULL
        AND state.closes_at IS NOT NULL
        AND ${input.now}::timestamptz >= state.opens_at
        AND ${input.now}::timestamptz < state.closes_at
        AND state.option_id IS NOT NULL
    ), inserted_answer AS (
      INSERT INTO ${answers} (
        id,
        player_id,
        session_question_id,
        question_option_id,
        received_at,
        response_time_ms,
        is_correct,
        created_at
      )
      SELECT
        ${input.answerId}::uuid,
        eligible.player_id,
        eligible.occurrence_id,
        eligible.option_id,
        ${input.now},
        eligible.response_time_ms,
        eligible.is_correct,
        ${input.now}
      FROM eligible
      ON CONFLICT (player_id, session_question_id) DO NOTHING
      RETURNING id, player_id, session_question_id, is_correct, received_at, response_time_ms
    ), updated_streak AS (
      UPDATE ${players} AS player
      SET
        current_streak = CASE
          WHEN inserted_answer.is_correct THEN player.current_streak + 1
          ELSE 0
        END,
        updated_at = ${input.now},
        last_seen_at = ${input.now}
      FROM inserted_answer
      WHERE player.id = inserted_answer.player_id
      RETURNING player.id, player.current_streak
    ), score_facts AS (
      SELECT
        eligible.player_id,
        eligible.quiz_session_id,
        eligible.occurrence_id,
        eligible.difficulty,
        eligible.is_correct,
        eligible.response_time_ms,
        eligible.speed_bonus,
        updated_streak.current_streak AS new_streak
      FROM eligible
      INNER JOIN inserted_answer
        ON inserted_answer.player_id = eligible.player_id
        AND inserted_answer.session_question_id = eligible.occurrence_id
      INNER JOIN updated_streak ON updated_streak.id = eligible.player_id
    ), score_candidates AS (
      SELECT
        score_facts.*,
        'ANSWER_CORRECT'::text AS score_type,
        ${CORRECT_ANSWER_POINTS}::integer AS points,
        jsonb_build_object(
          'responseTimeMs', score_facts.response_time_ms,
          'newStreak', score_facts.new_streak
        ) AS metadata
      FROM score_facts
      WHERE score_facts.is_correct

      UNION ALL

      SELECT
        score_facts.*,
        'DIFFICULTY_BONUS'::text,
        CASE score_facts.difficulty
          WHEN 1 THEN ${DIFFICULTY_BONUS[1]}
          WHEN 2 THEN ${DIFFICULTY_BONUS[2]}
          WHEN 3 THEN ${DIFFICULTY_BONUS[3]}
          WHEN 4 THEN ${DIFFICULTY_BONUS[4]}
          ELSE 0
        END,
        jsonb_build_object(
          'difficulty', score_facts.difficulty,
          'newStreak', score_facts.new_streak
        )
      FROM score_facts
      WHERE score_facts.is_correct

      UNION ALL

      SELECT
        score_facts.*,
        'SPEED_BONUS'::text,
        score_facts.speed_bonus,
        jsonb_build_object(
          'responseTimeMs', score_facts.response_time_ms,
          'newStreak', score_facts.new_streak
        )
      FROM score_facts
      WHERE score_facts.is_correct

      UNION ALL

      SELECT
        score_facts.*,
        'STREAK_BONUS'::text,
        CASE score_facts.new_streak
          WHEN 3 THEN ${STREAK_BONUS[3]}
          WHEN 5 THEN ${STREAK_BONUS[5]}
          WHEN 8 THEN ${STREAK_BONUS[8]}
          ELSE 0
        END,
        jsonb_build_object('newStreak', score_facts.new_streak)
      FROM score_facts
      WHERE score_facts.is_correct
    ), written_scores AS (
      INSERT INTO ${scoreEvents} (
        player_id,
        quiz_session_id,
        session_question_id,
        type,
        points,
        metadata,
        created_at
      )
      SELECT
        score_candidates.player_id,
        score_candidates.quiz_session_id,
        score_candidates.occurrence_id,
        score_candidates.score_type::score_event_type,
        score_candidates.points,
        score_candidates.metadata,
        ${input.now}
      FROM score_candidates
      WHERE score_candidates.points > 0
      RETURNING id
    )
    SELECT
      CASE
        WHEN NOT EXISTS (SELECT 1 FROM authenticated_player) THEN 'UNAUTHENTICATED'
        WHEN (SELECT occurrence_id FROM state) IS NULL
          OR (SELECT player_event_id FROM state) <> (SELECT session_event_id FROM state)
          THEN 'NOT_FOUND'
        WHEN (SELECT existing_answer_id FROM state) IS NOT NULL
          THEN 'ALREADY_ANSWERED'
        WHEN (SELECT occurrence_status FROM state) = 'CANCELED' THEN 'CANCELED'
        WHEN (SELECT occurrence_status FROM state) <> 'OPEN'
          OR (SELECT opens_at FROM state) IS NULL
          OR ${input.now}::timestamptz < (SELECT opens_at FROM state)
          THEN 'NOT_OPEN'
        WHEN (SELECT closes_at FROM state) IS NULL
          OR ${input.now}::timestamptz >= (SELECT closes_at FROM state)
          THEN 'EXPIRED'
        WHEN (SELECT option_id FROM state) IS NULL THEN 'INVALID_OPTION'
        WHEN EXISTS (SELECT 1 FROM inserted_answer) THEN 'ACCEPTED'
        ELSE 'ALREADY_ANSWERED'
      END AS outcome,
      (SELECT id FROM inserted_answer) AS "answerId",
      (SELECT received_at FROM inserted_answer) AS "receivedAt",
      (SELECT response_time_ms FROM inserted_answer) AS "responseTimeMs",
      (SELECT count(*) FROM written_scores) AS "writtenScoreCount"
  `);
  const row = result.rows[0];

  if (!row) {
    throw new Error("Answer submission returned no outcome");
  }

  return mapSubmitAnswerOutcome(row);
}

function buildFoundResult(row: AnswerResultRow): PlayerAnswerResult {
  const status = row.questionStatus;

  if (!status) {
    throw new Error("Answer result is missing its occurrence status");
  }

  if (status === "REVEALED") {
    if (!row.correctOptionId || !row.explanation) {
      throw new Error("Revealed answer result is incomplete");
    }

    return {
      status,
      answerSubmitted: row.answerSubmitted,
      selectedOptionId: row.selectedOptionId,
      correctOptionId: row.correctOptionId,
      isCorrect: row.isCorrect,
      explanation: row.explanation,
      score: {
        answerPoints: row.answerPoints,
        difficultyBonus: row.difficultyBonus,
        speedBonus: row.speedBonus,
        streakBonus: row.streakBonus,
      },
      totalPoints: row.totalPoints,
    };
  }

  if (status === "CANCELED") {
    return {
      status,
      answerSubmitted: row.answerSubmitted,
      totalPoints: 0,
    };
  }

  return { status, answerSubmitted: row.answerSubmitted };
}

async function getAnswerResult(
  sessionQuestionId: string,
  playerTokenHash: string,
  now: Date,
): Promise<GetAnswerResultOutcome> {
  const result = await getDb().execute<AnswerResultRow>(sql`
    WITH authenticated_player AS (
      SELECT player.id, player.event_id
      FROM ${playerSessions} AS player_session
      INNER JOIN ${players} AS player ON player.id = player_session.player_id
      WHERE player_session.token_hash = ${playerTokenHash}
        AND player_session.revoked_at IS NULL
        AND player_session.expires_at > ${now}
        AND player.status = 'ACTIVE'
      LIMIT 1
    ), state AS (
      SELECT
        player.id AS player_id,
        player.event_id AS player_event_id,
        occurrence.id AS occurrence_id,
        occurrence.status::text AS question_status,
        session.event_id AS session_event_id,
        question.explanation,
        answer.question_option_id AS selected_option_id,
        answer.is_correct,
        correct_option.id AS correct_option_id
      FROM authenticated_player AS player
      LEFT JOIN ${sessionQuestions} AS occurrence
        ON occurrence.id = ${sessionQuestionId}::uuid
      LEFT JOIN ${quizSessions} AS session
        ON session.id = occurrence.quiz_session_id
      LEFT JOIN ${questions} AS question ON question.id = occurrence.question_id
      LEFT JOIN ${answers} AS answer
        ON answer.player_id = player.id
        AND answer.session_question_id = occurrence.id
      LEFT JOIN ${questionOptions} AS correct_option
        ON correct_option.question_id = question.id
        AND correct_option.is_correct = true
    )
    SELECT
      CASE
        WHEN NOT EXISTS (SELECT 1 FROM authenticated_player) THEN 'UNAUTHENTICATED'
        WHEN (SELECT occurrence_id FROM state) IS NULL
          OR (SELECT player_event_id FROM state) <> (SELECT session_event_id FROM state)
          THEN 'NOT_FOUND'
        ELSE 'FOUND'
      END AS outcome,
      (SELECT question_status FROM state) AS "questionStatus",
      COALESCE((SELECT selected_option_id IS NOT NULL FROM state), false)
        AS "answerSubmitted",
      CASE
        WHEN (SELECT question_status FROM state) = 'REVEALED'
          THEN (SELECT selected_option_id FROM state)
        ELSE NULL
      END AS "selectedOptionId",
      CASE
        WHEN (SELECT question_status FROM state) = 'REVEALED'
          THEN (SELECT correct_option_id FROM state)
        ELSE NULL
      END AS "correctOptionId",
      CASE
        WHEN (SELECT question_status FROM state) = 'REVEALED'
          THEN (SELECT is_correct FROM state)
        ELSE NULL
      END AS "isCorrect",
      CASE
        WHEN (SELECT question_status FROM state) = 'REVEALED'
          THEN (SELECT explanation FROM state)
        ELSE NULL
      END AS explanation,
      CASE WHEN (SELECT question_status FROM state) = 'REVEALED' THEN COALESCE((
        SELECT sum(score.points) FILTER (WHERE score.type = 'ANSWER_CORRECT')::integer
        FROM ${scoreEvents} AS score
        WHERE score.player_id = (SELECT player_id FROM state)
          AND score.session_question_id = (SELECT occurrence_id FROM state)
          AND score.voided_at IS NULL
      ), 0) ELSE 0 END AS "answerPoints",
      CASE WHEN (SELECT question_status FROM state) = 'REVEALED' THEN COALESCE((
        SELECT sum(score.points) FILTER (WHERE score.type = 'DIFFICULTY_BONUS')::integer
        FROM ${scoreEvents} AS score
        WHERE score.player_id = (SELECT player_id FROM state)
          AND score.session_question_id = (SELECT occurrence_id FROM state)
          AND score.voided_at IS NULL
      ), 0) ELSE 0 END AS "difficultyBonus",
      CASE WHEN (SELECT question_status FROM state) = 'REVEALED' THEN COALESCE((
        SELECT sum(score.points) FILTER (WHERE score.type = 'SPEED_BONUS')::integer
        FROM ${scoreEvents} AS score
        WHERE score.player_id = (SELECT player_id FROM state)
          AND score.session_question_id = (SELECT occurrence_id FROM state)
          AND score.voided_at IS NULL
      ), 0) ELSE 0 END AS "speedBonus",
      CASE WHEN (SELECT question_status FROM state) = 'REVEALED' THEN COALESCE((
        SELECT sum(score.points) FILTER (WHERE score.type = 'STREAK_BONUS')::integer
        FROM ${scoreEvents} AS score
        WHERE score.player_id = (SELECT player_id FROM state)
          AND score.session_question_id = (SELECT occurrence_id FROM state)
          AND score.voided_at IS NULL
      ), 0) ELSE 0 END AS "streakBonus",
      CASE WHEN (SELECT question_status FROM state) = 'REVEALED' THEN COALESCE((
        SELECT sum(score.points)::integer
        FROM ${scoreEvents} AS score
        WHERE score.player_id = (SELECT player_id FROM state)
          AND score.session_question_id = (SELECT occurrence_id FROM state)
          AND score.voided_at IS NULL
      ), 0) ELSE 0 END AS "totalPoints"
  `);
  const row = result.rows[0];

  if (!row || row.outcome === "UNAUTHENTICATED") {
    return { outcome: "unauthenticated" };
  }

  if (row.outcome === "NOT_FOUND") {
    return { outcome: "not_found" };
  }

  return { outcome: "found", result: buildFoundResult(row) };
}

export const postgresAnswerScoringRepository: AnswerScoringRepository = {
  submitAnswer,
  getAnswerResult,
};
