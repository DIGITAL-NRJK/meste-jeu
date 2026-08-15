import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";

import {
  answers,
  auditLogs,
  categories,
  events,
  questionOptions,
  questions,
  quizSessions,
  scoreEvents,
  sessionQuestions,
} from "../../../db/schema";
import { getDb } from "@/lib/db/client";
import { toNullableDate } from "@/lib/db/row-values";
import {
  type ConfigureLineupOutcome,
  type PersistQuizSession,
  type PersistSessionLineupItem,
  type PublicSessionState,
  type QuizSessionDetail,
  type SessionEngineRepository,
  SessionPersistenceError,
  type SessionQuestionStatus,
  type SessionTransitionOutcome,
} from "@/server/services/session-engine";

type TransitionRow = {
  outcome:
    | "TRANSITIONED"
    | "NOT_FOUND"
    | "INVALID_STATUS"
    | "ALREADY_PLAYED"
    | "NO_QUESTIONS"
    | "UNVALIDATED_QUESTIONS"
    | "QUESTION_STILL_OPEN"
    | "UNREVEALED_QUESTION"
    | "NO_PENDING_QUESTION"
    | "NO_OPEN_QUESTION"
    | "NO_CLOSED_QUESTION"
    | "UNRESOLVED_QUESTIONS"
    | "SESSION_QUESTION_NOT_FOUND"
    | "QUESTION_ALREADY_CANCELED";
  sessionId?: string | null;
};

type PublicStateRow = {
  sessionId: string;
  sessionName: string;
  sessionSlug: string;
  sessionMode: "DISCOVERY" | "LIVE";
  sessionStatus: "DRAFT" | "READY" | "LIVE" | "FINISHED" | "CANCELED";
  sessionStartsAt: Date | string | null;
  sessionEndsAt: Date | string | null;
  sessionQuestionId: string | null;
  questionId: string | null;
  position: number | null;
  totalQuestions: number;
  durationSeconds: number | null;
  questionStatus: SessionQuestionStatus | null;
  opensAt: Date | string | null;
  closesAt: Date | string | null;
  revealedAt: Date | string | null;
  canceledAt: Date | string | null;
  acceptingAnswers: boolean;
  categoryName: string | null;
  categorySlug: string | null;
  questionText: string | null;
  explanation: string | null;
  difficulty: number | null;
  mediaType: "TEXT" | "IMAGE" | null;
  mediaUrl: string | null;
  correctOptionId: string | null;
};

function findPostgresError(error: unknown) {
  let candidate: unknown = error;
  let firstError:
    | { code: string; constraint: string | undefined; message: string }
    | undefined;

  for (let depth = 0; depth < 5; depth += 1) {
    if (!candidate || typeof candidate !== "object") {
      return undefined;
    }

    const record = candidate as Record<string, unknown>;

    if (typeof record.code === "string") {
      const parsed = {
        code: record.code,
        constraint:
          typeof record.constraint === "string" ? record.constraint : undefined,
        message: typeof record.message === "string" ? record.message : "",
      };

      if (parsed.code === "23503" || parsed.code === "23505") {
        return parsed;
      }

      firstError ??= parsed;
    }

    candidate = record.cause;
  }

  return firstError;
}

function hasConstraint(
  error: unknown,
  code: string,
  constraint: string,
): boolean {
  const postgresError = findPostgresError(error);

  return Boolean(
    postgresError?.code === code &&
      (postgresError.constraint === constraint ||
        postgresError.message.includes(constraint)),
  );
}

function mapCreateError(error: unknown): never {
  if (
    hasConstraint(
      error,
      "23505",
      "quiz_sessions_event_slug_unique",
    )
  ) {
    throw new SessionPersistenceError("slug_conflict");
  }

  if (
    hasConstraint(
      error,
      "23503",
      "quiz_sessions_event_id_events_id_fk",
    )
  ) {
    throw new SessionPersistenceError("event_not_found");
  }

  throw error;
}

function mapTransitionOutcome(
  row: TransitionRow | undefined,
): SessionTransitionOutcome {
  switch (row?.outcome) {
    case "TRANSITIONED":
      return "transitioned";
    case "INVALID_STATUS":
      return "invalid_status";
    case "ALREADY_PLAYED":
      return "already_played";
    case "NO_QUESTIONS":
      return "no_questions";
    case "UNVALIDATED_QUESTIONS":
      return "unvalidated_questions";
    case "QUESTION_STILL_OPEN":
      return "question_still_open";
    case "UNREVEALED_QUESTION":
      return "unrevealed_question";
    case "NO_PENDING_QUESTION":
      return "no_pending_question";
    case "NO_OPEN_QUESTION":
      return "no_open_question";
    case "NO_CLOSED_QUESTION":
      return "no_closed_question";
    case "UNRESOLVED_QUESTIONS":
      return "unresolved_questions";
    case "SESSION_QUESTION_NOT_FOUND":
      return "session_question_not_found";
    case "QUESTION_ALREADY_CANCELED":
      return "question_already_canceled";
    default:
      return "not_found";
  }
}

async function createSession(
  input: PersistQuizSession,
): Promise<QuizSessionDetail> {
  const db = getDb();

  try {
    await db.batch([
      db.insert(quizSessions).values({
        id: input.id,
        eventId: input.eventId,
        name: input.name,
        slug: input.slug,
        mode: input.mode,
        status: "DRAFT",
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        resetScore: input.resetScore,
        createdAt: input.now,
        updatedAt: input.now,
      }),
      db.insert(auditLogs).values({
        adminUserId: input.actorAdminId,
        action: "SESSION_CREATED",
        entityType: "quiz_session",
        entityId: input.id,
        metadata: {},
        createdAt: input.now,
      }),
    ]);
  } catch (error) {
    return mapCreateError(error);
  }

  const session = await getSession(input.id);

  if (!session) {
    throw new Error("Created quiz session could not be read");
  }

  return session;
}

async function getSession(
  sessionId: string,
): Promise<QuizSessionDetail | null> {
  const db = getDb();
  const [sessionRows, questionRows] = await db.batch([
    db
      .select({
        id: quizSessions.id,
        eventId: quizSessions.eventId,
        eventSlug: events.slug,
        eventName: events.name,
        name: quizSessions.name,
        slug: quizSessions.slug,
        mode: quizSessions.mode,
        status: quizSessions.status,
        startsAt: quizSessions.startsAt,
        endsAt: quizSessions.endsAt,
        resetScore: quizSessions.resetScore,
        createdAt: quizSessions.createdAt,
        updatedAt: quizSessions.updatedAt,
      })
      .from(quizSessions)
      .innerJoin(events, eq(events.id, quizSessions.eventId))
      .where(eq(quizSessions.id, sessionId))
      .limit(1),
    db
      .select({
        id: sessionQuestions.id,
        questionId: sessionQuestions.questionId,
        questionText: questions.questionText,
        questionStatus: questions.status,
        position: sessionQuestions.position,
        durationSeconds: sessionQuestions.durationSeconds,
        status: sessionQuestions.status,
        opensAt: sessionQuestions.opensAt,
        closesAt: sessionQuestions.closesAt,
        revealedAt: sessionQuestions.revealedAt,
        canceledAt: sessionQuestions.canceledAt,
      })
      .from(sessionQuestions)
      .innerJoin(questions, eq(questions.id, sessionQuestions.questionId))
      .where(eq(sessionQuestions.quizSessionId, sessionId))
      .orderBy(asc(sessionQuestions.position)),
  ]);

  const session = sessionRows[0];

  return session ? { ...session, questions: questionRows } : null;
}

async function configureLineup(
  sessionId: string,
  items: PersistSessionLineupItem[],
  now: Date,
): Promise<ConfigureLineupOutcome> {
  const db = getDb();
  const serializedItems = JSON.stringify(items);

  const [updatedRows] = await db.batch([
    db
      .update(quizSessions)
      .set({ updatedAt: now })
      .where(
        and(
          eq(quizSessions.id, sessionId),
          eq(quizSessions.status, "DRAFT"),
          sql`NOT EXISTS (
            SELECT 1
            FROM jsonb_to_recordset(${serializedItems}::jsonb)
              AS item("questionId" text)
            LEFT JOIN ${questions} AS question
              ON question.id = item."questionId"::uuid
            WHERE question.id IS NULL OR question.status <> 'VALIDATED'
          )`,
        ),
      )
      .returning({ id: quizSessions.id }),
    db.execute(sql`
      DELETE FROM ${sessionQuestions}
      WHERE quiz_session_id = ${sessionId}::uuid
        AND EXISTS (
          SELECT 1 FROM ${quizSessions}
          WHERE id = ${sessionId}::uuid
            AND status = 'DRAFT'
            AND updated_at = ${now}
        )
    `),
    db.execute(sql`
      INSERT INTO ${sessionQuestions} (
        id,
        quiz_session_id,
        question_id,
        position,
        duration_seconds,
        status
      )
      SELECT
        item.id::uuid,
        ${sessionId}::uuid,
        item."questionId"::uuid,
        item.position,
        item."durationSeconds",
        'PENDING'
      FROM jsonb_to_recordset(${serializedItems}::jsonb)
        AS item(
          id text,
          "questionId" text,
          position integer,
          "durationSeconds" integer
        )
      WHERE EXISTS (
        SELECT 1 FROM ${quizSessions}
        WHERE id = ${sessionId}::uuid
          AND status = 'DRAFT'
          AND updated_at = ${now}
      )
    `),
  ]);

  if (updatedRows.length > 0) {
    return "configured";
  }

  const [session] = await db
    .select({ status: quizSessions.status })
    .from(quizSessions)
    .where(eq(quizSessions.id, sessionId))
    .limit(1);

  if (!session) {
    return "not_found";
  }

  return session.status === "DRAFT" ? "invalid_questions" : "invalid_status";
}

async function markReady(
  sessionId: string,
  now: Date,
): Promise<SessionTransitionOutcome> {
  const result = await getDb().execute<TransitionRow>(sql`
    WITH state AS (
      SELECT
        session.id,
        session.status::text AS status,
        count(occurrence.id)::integer AS question_count,
        count(occurrence.id) FILTER (
          WHERE question.status <> 'VALIDATED'
        )::integer AS invalid_question_count
      FROM ${quizSessions} AS session
      LEFT JOIN ${sessionQuestions} AS occurrence
        ON occurrence.quiz_session_id = session.id
      LEFT JOIN ${questions} AS question ON question.id = occurrence.question_id
      WHERE session.id = ${sessionId}::uuid
      GROUP BY session.id, session.status
    ), updated AS (
      UPDATE ${quizSessions} AS session
      SET status = 'READY', updated_at = ${now}
      FROM state
      WHERE session.id = state.id
        AND state.status = 'DRAFT'
        AND state.question_count > 0
        AND state.invalid_question_count = 0
      RETURNING session.id
    )
    SELECT CASE
      WHEN NOT EXISTS (SELECT 1 FROM state) THEN 'NOT_FOUND'
      WHEN EXISTS (SELECT 1 FROM updated) THEN 'TRANSITIONED'
      WHEN (SELECT status FROM state) <> 'DRAFT' THEN 'INVALID_STATUS'
      WHEN (SELECT question_count FROM state) = 0 THEN 'NO_QUESTIONS'
      ELSE 'UNVALIDATED_QUESTIONS'
    END AS outcome
  `);

  return mapTransitionOutcome(result.rows[0]);
}

async function resetToDraft(
  sessionId: string,
  actorAdminId: string,
  now: Date,
): Promise<SessionTransitionOutcome> {
  const result = await getDb().execute<TransitionRow>(sql`
    WITH state AS (
      SELECT
        session.id,
        session.status::text AS status,
        count(occurrence.id) FILTER (
          WHERE occurrence.opens_at IS NOT NULL
        )::integer AS played_question_count,
        (
          SELECT count(*)
          FROM ${answers} AS answer
          INNER JOIN ${sessionQuestions} AS answered
            ON answered.id = answer.session_question_id
          WHERE answered.quiz_session_id = session.id
        )::integer AS answer_count,
        (
          SELECT count(*)
          FROM ${scoreEvents} AS score
          WHERE score.quiz_session_id = session.id
        )::integer AS score_event_count
      FROM ${quizSessions} AS session
      LEFT JOIN ${sessionQuestions} AS occurrence
        ON occurrence.quiz_session_id = session.id
      WHERE session.id = ${sessionId}::uuid
      GROUP BY session.id, session.status
    ), updated AS (
      UPDATE ${quizSessions} AS session
      SET status = 'DRAFT', updated_at = ${now}
      FROM state
      WHERE session.id = state.id
        AND state.status = 'READY'
        AND state.played_question_count = 0
        AND state.answer_count = 0
        AND state.score_event_count = 0
      RETURNING session.id
    ), written_audit AS (
      INSERT INTO ${auditLogs} (
        admin_user_id, action, entity_type, entity_id, metadata, created_at
      )
      SELECT
        ${actorAdminId}::uuid,
        'SESSION_RESET_DRAFT',
        'quiz_session',
        updated.id,
        jsonb_build_object('from', 'READY', 'to', 'DRAFT'),
        ${now}
      FROM updated
      RETURNING id
    )
    SELECT CASE
      WHEN NOT EXISTS (SELECT 1 FROM state) THEN 'NOT_FOUND'
      WHEN EXISTS (SELECT 1 FROM updated) THEN 'TRANSITIONED'
      WHEN (SELECT status FROM state) <> 'READY' THEN 'INVALID_STATUS'
      ELSE 'ALREADY_PLAYED'
    END AS outcome
  `);

  return mapTransitionOutcome(result.rows[0]);
}

async function startSession(
  sessionId: string,
  actorAdminId: string,
  now: Date,
): Promise<SessionTransitionOutcome> {
  const result = await getDb().execute<TransitionRow>(sql`
    WITH state AS (
      SELECT
        session.id,
        session.event_id,
        session.status::text AS status,
        event.status::text AS event_status,
        count(occurrence.id)::integer AS question_count,
        count(occurrence.id) FILTER (
          WHERE question.status <> 'VALIDATED'
        )::integer AS invalid_question_count
      FROM ${quizSessions} AS session
      INNER JOIN ${events} AS event ON event.id = session.event_id
      LEFT JOIN ${sessionQuestions} AS occurrence
        ON occurrence.quiz_session_id = session.id
      LEFT JOIN ${questions} AS question ON question.id = occurrence.question_id
      WHERE session.id = ${sessionId}::uuid
      GROUP BY session.id, session.event_id, session.status, event.status
    ), eligible AS (
      SELECT *
      FROM state
      WHERE status = 'READY'
        AND event_status IN ('READY', 'LIVE')
        AND question_count > 0
        AND invalid_question_count = 0
    ), updated_event AS (
      UPDATE ${events} AS event
      SET status = 'LIVE', updated_at = ${now}
      FROM eligible
      WHERE event.id = eligible.event_id
        AND event.status IN ('READY', 'LIVE')
      RETURNING event.id
    ), updated AS (
      UPDATE ${quizSessions} AS session
      SET
        status = 'LIVE',
        starts_at = COALESCE(session.starts_at, ${now}),
        ends_at = NULL,
        updated_at = ${now}
      FROM eligible
      INNER JOIN updated_event ON updated_event.id = eligible.event_id
      WHERE session.id = eligible.id
      RETURNING session.id, session.event_id
    ), written_audit AS (
      INSERT INTO ${auditLogs} (
        admin_user_id, action, entity_type, entity_id, metadata, created_at
      )
      SELECT
        ${actorAdminId}::uuid,
        'SESSION_STARTED',
        'quiz_session',
        updated.id,
        '{}'::jsonb,
        ${now}
      FROM updated
      INNER JOIN updated_event ON updated_event.id = updated.event_id
      RETURNING id
    )
    SELECT CASE
      WHEN NOT EXISTS (SELECT 1 FROM state) THEN 'NOT_FOUND'
      WHEN EXISTS (SELECT 1 FROM written_audit) THEN 'TRANSITIONED'
      WHEN (SELECT status FROM state) <> 'READY'
        OR (SELECT event_status FROM state) NOT IN ('READY', 'LIVE')
        THEN 'INVALID_STATUS'
      WHEN (SELECT question_count FROM state) = 0 THEN 'NO_QUESTIONS'
      ELSE 'UNVALIDATED_QUESTIONS'
    END AS outcome
  `);

  return mapTransitionOutcome(result.rows[0]);
}

async function openNextQuestion(
  sessionId: string,
  actorAdminId: string,
  now: Date,
): Promise<SessionTransitionOutcome> {
  try {
    const result = await getDb().execute<TransitionRow>(sql`
      WITH state AS (
        SELECT
          session.id,
          session.status::text AS status,
          count(occurrence.id) FILTER (
            WHERE occurrence.status = 'OPEN'
          )::integer AS open_count,
          count(occurrence.id) FILTER (
            WHERE occurrence.status = 'CLOSED'
          )::integer AS closed_count
        FROM ${quizSessions} AS session
        LEFT JOIN ${sessionQuestions} AS occurrence
          ON occurrence.quiz_session_id = session.id
        WHERE session.id = ${sessionId}::uuid
        GROUP BY session.id, session.status
      ), candidate AS (
        SELECT occurrence.id, occurrence.duration_seconds
        FROM ${sessionQuestions} AS occurrence
        WHERE occurrence.quiz_session_id = ${sessionId}::uuid
          AND occurrence.status = 'PENDING'
        ORDER BY occurrence.position
        LIMIT 1
      ), updated AS (
        UPDATE ${sessionQuestions} AS occurrence
        SET
          status = 'OPEN',
          opens_at = ${now},
          closes_at = ${now}::timestamptz
            + candidate.duration_seconds * interval '1 second',
          revealed_at = NULL,
          canceled_at = NULL
        FROM candidate, state
        WHERE occurrence.id = candidate.id
          AND state.status = 'LIVE'
          AND state.open_count = 0
          AND state.closed_count = 0
        RETURNING occurrence.id
      ), written_audit AS (
        INSERT INTO ${auditLogs} (
          admin_user_id, action, entity_type, entity_id, metadata, created_at
        )
        SELECT
          ${actorAdminId}::uuid,
          'QUESTION_STARTED',
          'session_question',
          updated.id,
          '{}'::jsonb,
          ${now}
        FROM updated
        RETURNING id
      )
      SELECT CASE
        WHEN NOT EXISTS (SELECT 1 FROM state) THEN 'NOT_FOUND'
        WHEN EXISTS (SELECT 1 FROM written_audit) THEN 'TRANSITIONED'
        WHEN (SELECT status FROM state) <> 'LIVE' THEN 'INVALID_STATUS'
        WHEN (SELECT open_count FROM state) > 0 THEN 'QUESTION_STILL_OPEN'
        WHEN (SELECT closed_count FROM state) > 0 THEN 'UNREVEALED_QUESTION'
        ELSE 'NO_PENDING_QUESTION'
      END AS outcome
    `);

    return mapTransitionOutcome(result.rows[0]);
  } catch (error) {
    if (
      hasConstraint(
        error,
        "23505",
        "session_questions_one_open_per_session_unique",
      )
    ) {
      return "question_still_open";
    }

    throw error;
  }
}

async function closeCurrentQuestion(
  sessionId: string,
  actorAdminId: string,
  now: Date,
): Promise<SessionTransitionOutcome> {
  const result = await getDb().execute<TransitionRow>(sql`
    WITH state AS (
      SELECT id, status::text AS status
      FROM ${quizSessions}
      WHERE id = ${sessionId}::uuid
    ), candidate AS (
      SELECT id
      FROM ${sessionQuestions}
      WHERE quiz_session_id = ${sessionId}::uuid
        AND status = 'OPEN'
      LIMIT 1
    ), updated AS (
      UPDATE ${sessionQuestions} AS occurrence
      SET
        status = 'CLOSED',
        closes_at = GREATEST(
          occurrence.opens_at + interval '1 millisecond',
          LEAST(occurrence.closes_at, ${now})
        )
      FROM candidate, state
      WHERE occurrence.id = candidate.id
        AND state.status = 'LIVE'
      RETURNING occurrence.id
    ), written_audit AS (
      INSERT INTO ${auditLogs} (
        admin_user_id, action, entity_type, entity_id, metadata, created_at
      )
      SELECT
        ${actorAdminId}::uuid,
        'QUESTION_CLOSED',
        'session_question',
        updated.id,
        '{}'::jsonb,
        ${now}
      FROM updated
      RETURNING id
    )
    SELECT CASE
      WHEN NOT EXISTS (SELECT 1 FROM state) THEN 'NOT_FOUND'
      WHEN EXISTS (SELECT 1 FROM written_audit) THEN 'TRANSITIONED'
      WHEN (SELECT status FROM state) <> 'LIVE' THEN 'INVALID_STATUS'
      ELSE 'NO_OPEN_QUESTION'
    END AS outcome
  `);

  return mapTransitionOutcome(result.rows[0]);
}

async function revealCurrentQuestion(
  sessionId: string,
  actorAdminId: string,
  now: Date,
): Promise<SessionTransitionOutcome> {
  const result = await getDb().execute<TransitionRow>(sql`
    WITH state AS (
      SELECT id, status::text AS status
      FROM ${quizSessions}
      WHERE id = ${sessionId}::uuid
    ), candidate AS (
      SELECT id
      FROM ${sessionQuestions}
      WHERE quiz_session_id = ${sessionId}::uuid
        AND status = 'CLOSED'
      LIMIT 1
    ), updated AS (
      UPDATE ${sessionQuestions} AS occurrence
      SET
        status = 'REVEALED',
        revealed_at = GREATEST(occurrence.closes_at, ${now})
      FROM candidate, state
      WHERE occurrence.id = candidate.id
        AND state.status = 'LIVE'
      RETURNING occurrence.id
    ), written_audit AS (
      INSERT INTO ${auditLogs} (
        admin_user_id, action, entity_type, entity_id, metadata, created_at
      )
      SELECT
        ${actorAdminId}::uuid,
        'QUESTION_REVEALED',
        'session_question',
        updated.id,
        '{}'::jsonb,
        ${now}
      FROM updated
      RETURNING id
    )
    SELECT CASE
      WHEN NOT EXISTS (SELECT 1 FROM state) THEN 'NOT_FOUND'
      WHEN EXISTS (SELECT 1 FROM written_audit) THEN 'TRANSITIONED'
      WHEN (SELECT status FROM state) <> 'LIVE' THEN 'INVALID_STATUS'
      ELSE 'NO_CLOSED_QUESTION'
    END AS outcome
  `);

  return mapTransitionOutcome(result.rows[0]);
}

async function cancelSessionQuestion(
  sessionQuestionId: string,
  actorAdminId: string,
  now: Date,
) {
  const result = await getDb().execute<TransitionRow>(sql`
    WITH state AS (
      SELECT
        occurrence.id,
        occurrence.quiz_session_id,
        occurrence.status::text AS status,
        session.status::text AS session_status
      FROM ${sessionQuestions} AS occurrence
      INNER JOIN ${quizSessions} AS session
        ON session.id = occurrence.quiz_session_id
      WHERE occurrence.id = ${sessionQuestionId}::uuid
    ), updated AS (
      UPDATE ${sessionQuestions} AS occurrence
      SET status = 'CANCELED', canceled_at = ${now}
      FROM state
      WHERE occurrence.id = state.id
        AND state.status <> 'CANCELED'
        AND state.session_status IN ('LIVE', 'FINISHED')
      RETURNING occurrence.id, occurrence.quiz_session_id
    ), voided_scores AS (
      UPDATE ${scoreEvents} AS score
      SET voided_at = ${now}
      FROM updated
      WHERE score.session_question_id = updated.id
        AND score.voided_at IS NULL
      RETURNING score.id
    ), written_audit AS (
      INSERT INTO ${auditLogs} (
        admin_user_id, action, entity_type, entity_id, metadata, created_at
      )
      SELECT
        ${actorAdminId}::uuid,
        'QUESTION_CANCELED',
        'session_question',
        updated.id,
        jsonb_build_object(
          'voidedScoreEvents', (SELECT count(*) FROM voided_scores)
        ),
        ${now}
      FROM updated
      RETURNING id
    )
    SELECT
      CASE
        WHEN NOT EXISTS (SELECT 1 FROM state) THEN 'SESSION_QUESTION_NOT_FOUND'
        WHEN EXISTS (SELECT 1 FROM written_audit) THEN 'TRANSITIONED'
        WHEN (SELECT session_status FROM state) NOT IN ('LIVE', 'FINISHED')
          THEN 'INVALID_STATUS'
        ELSE 'QUESTION_ALREADY_CANCELED'
      END AS outcome,
      COALESCE(
        (SELECT quiz_session_id FROM updated),
        (SELECT quiz_session_id FROM state)
      ) AS "sessionId"
  `);
  const row = result.rows[0];

  return {
    outcome: mapTransitionOutcome(row),
    sessionId: row?.sessionId ?? undefined,
  };
}

async function finishSession(
  sessionId: string,
  actorAdminId: string,
  now: Date,
): Promise<SessionTransitionOutcome> {
  const result = await getDb().execute<TransitionRow>(sql`
    WITH state AS (
      SELECT
        session.id,
        session.status::text AS status,
        session.starts_at,
        count(occurrence.id) FILTER (
          WHERE occurrence.status NOT IN ('REVEALED', 'CANCELED')
        )::integer AS unresolved_count
      FROM ${quizSessions} AS session
      LEFT JOIN ${sessionQuestions} AS occurrence
        ON occurrence.quiz_session_id = session.id
      WHERE session.id = ${sessionId}::uuid
      GROUP BY session.id, session.status, session.starts_at
    ), updated AS (
      UPDATE ${quizSessions} AS session
      SET
        status = 'FINISHED',
        ends_at = GREATEST(state.starts_at + interval '1 millisecond', ${now}),
        updated_at = ${now}
      FROM state
      WHERE session.id = state.id
        AND state.status = 'LIVE'
        AND state.unresolved_count = 0
      RETURNING session.id
    ), written_audit AS (
      INSERT INTO ${auditLogs} (
        admin_user_id, action, entity_type, entity_id, metadata, created_at
      )
      SELECT
        ${actorAdminId}::uuid,
        'SESSION_FINISHED',
        'quiz_session',
        updated.id,
        '{}'::jsonb,
        ${now}
      FROM updated
      RETURNING id
    )
    SELECT CASE
      WHEN NOT EXISTS (SELECT 1 FROM state) THEN 'NOT_FOUND'
      WHEN EXISTS (SELECT 1 FROM written_audit) THEN 'TRANSITIONED'
      WHEN (SELECT status FROM state) <> 'LIVE' THEN 'INVALID_STATUS'
      ELSE 'UNRESOLVED_QUESTIONS'
    END AS outcome
  `);

  return mapTransitionOutcome(result.rows[0]);
}

async function getPublicState(
  sessionId: string,
  now: Date,
): Promise<PublicSessionState | null> {
  const db = getDb();
  const result = await db.execute<PublicStateRow>(sql`
    SELECT
      session.id AS "sessionId",
      session.name AS "sessionName",
      session.slug AS "sessionSlug",
      session.mode::text AS "sessionMode",
      session.status::text AS "sessionStatus",
      session.starts_at AS "sessionStartsAt",
      session.ends_at AS "sessionEndsAt",
      occurrence.id AS "sessionQuestionId",
      occurrence.question_id AS "questionId",
      occurrence.position,
      (
        SELECT count(*)::integer
        FROM ${sessionQuestions} AS counted
        WHERE counted.quiz_session_id = session.id
      ) AS "totalQuestions",
      occurrence.duration_seconds AS "durationSeconds",
      occurrence.status::text AS "questionStatus",
      occurrence.opens_at AS "opensAt",
      occurrence.closes_at AS "closesAt",
      occurrence.revealed_at AS "revealedAt",
      occurrence.canceled_at AS "canceledAt",
      COALESCE(
        occurrence.status = 'OPEN'
          AND occurrence.closes_at > ${now}::timestamptz,
        false
      ) AS "acceptingAnswers",
      category.name AS "categoryName",
      category.slug AS "categorySlug",
      question.question_text AS "questionText",
      CASE
        WHEN occurrence.status = 'REVEALED' THEN question.explanation
        ELSE NULL
      END AS explanation,
      question.difficulty,
      question.media_type::text AS "mediaType",
      question.media_url AS "mediaUrl",
      CASE
        WHEN occurrence.status = 'REVEALED' THEN (
          SELECT option.id
          FROM ${questionOptions} AS option
          WHERE option.question_id = question.id
            AND option.is_correct = true
          LIMIT 1
        )
        ELSE NULL
      END AS "correctOptionId"
    FROM ${quizSessions} AS session
    LEFT JOIN LATERAL (
      SELECT played.*
      FROM ${sessionQuestions} AS played
      WHERE played.quiz_session_id = session.id
        AND played.opens_at IS NOT NULL
      ORDER BY played.position DESC
      LIMIT 1
    ) AS occurrence ON true
    LEFT JOIN ${questions} AS question ON question.id = occurrence.question_id
    LEFT JOIN ${categories} AS category ON category.id = question.category_id
    WHERE session.id = ${sessionId}::uuid
    LIMIT 1
  `);
  const row = result.rows[0];

  if (!row) {
    return null;
  }

  const session = {
    id: row.sessionId,
    name: row.sessionName,
    slug: row.sessionSlug,
    mode: row.sessionMode,
    status: row.sessionStatus,
    startsAt: toNullableDate(row.sessionStartsAt),
    endsAt: toNullableDate(row.sessionEndsAt),
  };

  if (
    !row.sessionQuestionId ||
    !row.questionId ||
    row.position === null ||
    row.durationSeconds === null ||
    !row.questionStatus ||
    !row.categoryName ||
    !row.categorySlug ||
    !row.questionText ||
    row.difficulty === null ||
    !row.mediaType
  ) {
    return { session, currentQuestion: null };
  }

  const options = await db
    .select({
      id: questionOptions.id,
      label: questionOptions.label,
      text: questionOptions.text,
    })
    .from(questionOptions)
    .where(eq(questionOptions.questionId, row.questionId))
    .orderBy(asc(questionOptions.position));
  const currentQuestion = {
    id: row.sessionQuestionId,
    position: row.position,
    totalQuestions: row.totalQuestions,
    durationSeconds: row.durationSeconds,
    status: row.questionStatus,
    opensAt: toNullableDate(row.opensAt),
    closesAt: toNullableDate(row.closesAt),
    revealedAt: toNullableDate(row.revealedAt),
    canceledAt: toNullableDate(row.canceledAt),
    acceptingAnswers: row.acceptingAnswers,
    category: { name: row.categoryName, slug: row.categorySlug },
    questionText: row.questionText,
    difficulty: row.difficulty,
    mediaType: row.mediaType,
    mediaUrl: row.mediaUrl,
    options,
  };

  if (row.questionStatus === "REVEALED") {
    if (!row.correctOptionId || !row.explanation) {
      throw new Error("Revealed question is missing its result data");
    }

    return {
      session,
      currentQuestion: {
        ...currentQuestion,
        status: "REVEALED",
        reveal: {
          correctOptionId: row.correctOptionId,
          explanation: row.explanation,
        },
      },
    };
  }

  return {
    session,
    currentQuestion: {
      ...currentQuestion,
      status: row.questionStatus,
    },
  };
}

export const postgresSessionEngineRepository: SessionEngineRepository = {
  createSession,
  getSession,
  configureLineup,
  markReady,
  resetToDraft,
  startSession,
  openNextQuestion,
  closeCurrentQuestion,
  revealCurrentQuestion,
  cancelSessionQuestion,
  finishSession,
  getPublicState,
};
