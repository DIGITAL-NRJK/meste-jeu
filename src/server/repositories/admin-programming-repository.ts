import "server-only";

import { asc, desc, eq, inArray, sql } from "drizzle-orm";

import {
  auditLogs,
  events,
  questions,
  quizSessions,
  sessionQuestions,
} from "../../../db/schema";
import { getDb } from "@/lib/db/client";
import {
  type AdminEventDetail,
  type AdminProgrammingRepository,
  type EventFinishOutcome,
  type EventMutationOutcome,
  EventPersistenceError,
  type EventReadyOutcome,
  type EventUpdateOutcome,
  type PersistEvent,
  type UpdateEvent,
} from "@/server/services/admin-programming";
import type { QuizSessionDetail } from "@/server/services/session-engine";

type ReadyRow = {
  outcome: "TRANSITIONED" | "NOT_FOUND" | "INVALID_STATUS" | "NO_READY_SESSION";
};

function isSlugConflict(error: unknown): boolean {
  let candidate: unknown = error;

  for (let depth = 0; depth < 5; depth += 1) {
    if (!candidate || typeof candidate !== "object") return false;
    const record = candidate as Record<string, unknown>;

    if (
      record.code === "23505" &&
      (record.constraint === "events_slug_unique" ||
        (typeof record.message === "string" &&
          record.message.includes("events_slug_unique")))
    ) {
      return true;
    }

    candidate = record.cause;
  }

  return false;
}

async function createEvent(input: PersistEvent): Promise<AdminEventDetail> {
  try {
    const [event] = await getDb()
      .insert(events)
      .values({
        id: input.id,
        slug: input.slug,
        name: input.name,
        description: input.description,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        timezone: input.timezone,
        environment: input.environment,
        status: "DRAFT",
        createdAt: input.now,
        updatedAt: input.now,
      })
      .returning();

    if (!event) throw new Error("Event insertion returned no row");
    return event;
  } catch (error) {
    if (isSlugConflict(error)) {
      throw new EventPersistenceError("slug_conflict");
    }

    throw error;
  }
}

type UpdateEventRow = { outcome: "UPDATED" | "NOT_FOUND" | "INVALID_STATUS" };

async function updateEvent(input: UpdateEvent): Promise<EventUpdateOutcome> {
  const result = await getDb().execute<UpdateEventRow>(sql`
    WITH state AS (
      SELECT event.id, event.status::text AS status
      FROM ${events} AS event
      WHERE event.id = ${input.id}::uuid
    ), updated AS (
      UPDATE ${events} AS event
      SET
        name = ${input.name},
        description = ${input.description},
        starts_at = ${input.startsAt},
        ends_at = ${input.endsAt},
        timezone = ${input.timezone},
        environment = ${input.environment},
        updated_at = ${input.now}
      FROM state
      WHERE event.id = state.id
        AND state.status = 'DRAFT'
      RETURNING event.id, event.environment
    ), written_audit AS (
      INSERT INTO ${auditLogs} (
        admin_user_id, action, entity_type, entity_id, metadata, created_at
      )
      SELECT
        ${input.actorAdminId}::uuid,
        'EVENT_UPDATED',
        'event',
        updated.id,
        jsonb_build_object('environment', updated.environment),
        ${input.now}
      FROM updated
      RETURNING id
    )
    SELECT CASE
      WHEN NOT EXISTS (SELECT 1 FROM state) THEN 'NOT_FOUND'
      WHEN EXISTS (SELECT 1 FROM written_audit) THEN 'UPDATED'
      ELSE 'INVALID_STATUS'
    END::text AS outcome
  `);

  switch (result.rows[0]?.outcome) {
    case "UPDATED":
      return "updated";
    case "INVALID_STATUS":
      return "invalid_status";
    default:
      return "not_found";
  }
}

function listEvents(): Promise<AdminEventDetail[]> {
  return getDb()
    .select()
    .from(events)
    .orderBy(
      sql`CASE ${events.status}::text
        WHEN 'LIVE' THEN 0
        WHEN 'READY' THEN 1
        WHEN 'DRAFT' THEN 2
        WHEN 'FINISHED' THEN 3
        ELSE 4
      END`,
      desc(events.startsAt),
    );
}

async function listSessions(eventId: string): Promise<QuizSessionDetail[]> {
  const db = getDb();
  const sessionRows = await db
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
    .where(eq(quizSessions.eventId, eventId))
    .orderBy(
      sql`CASE ${quizSessions.status}::text
        WHEN 'LIVE' THEN 0
        WHEN 'READY' THEN 1
        WHEN 'DRAFT' THEN 2
        WHEN 'FINISHED' THEN 3
        ELSE 4
      END`,
      desc(quizSessions.updatedAt),
    );

  if (sessionRows.length === 0) return [];

  const questionRows = await db
    .select({
      id: sessionQuestions.id,
      quizSessionId: sessionQuestions.quizSessionId,
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
    .where(inArray(sessionQuestions.quizSessionId, sessionRows.map(({ id }) => id)))
    .orderBy(asc(sessionQuestions.position));

  return sessionRows.map((session) => ({
    ...session,
    questions: questionRows
      .filter((question) => question.quizSessionId === session.id)
      .map((question) => ({
        id: question.id,
        questionId: question.questionId,
        questionText: question.questionText,
        questionStatus: question.questionStatus,
        position: question.position,
        durationSeconds: question.durationSeconds,
        status: question.status,
        opensAt: question.opensAt,
        closesAt: question.closesAt,
        revealedAt: question.revealedAt,
        canceledAt: question.canceledAt,
      })),
  }));
}

async function getEvent(eventId: string): Promise<AdminEventDetail | null> {
  const [event] = await getDb()
    .select()
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  return event ?? null;
}

async function markEventReady(
  eventId: string,
  now: Date,
): Promise<EventReadyOutcome> {
  const result = await getDb().execute<ReadyRow>(sql`
    WITH state AS (
      SELECT
        event.id,
        event.status::text AS status,
        EXISTS (
          SELECT 1
          FROM ${quizSessions} AS session
          WHERE session.event_id = event.id
            AND session.status = 'READY'
        ) AS has_ready_session
      FROM ${events} AS event
      WHERE event.id = ${eventId}::uuid
    ), updated AS (
      UPDATE ${events} AS event
      SET status = 'READY', updated_at = ${now}
      FROM state
      WHERE event.id = state.id
        AND state.status = 'DRAFT'
        AND state.has_ready_session = true
      RETURNING event.id
    )
    SELECT CASE
      WHEN NOT EXISTS (SELECT 1 FROM state) THEN 'NOT_FOUND'
      WHEN EXISTS (SELECT 1 FROM updated) THEN 'TRANSITIONED'
      WHEN (SELECT status FROM state) <> 'DRAFT' THEN 'INVALID_STATUS'
      ELSE 'NO_READY_SESSION'
    END AS outcome
  `);

  switch (result.rows[0]?.outcome) {
    case "TRANSITIONED":
      return "transitioned";
    case "INVALID_STATUS":
      return "invalid_status";
    case "NO_READY_SESSION":
      return "no_ready_session";
    default:
      return "not_found";
  }
}

type EventTransitionRow = {
  outcome: "TRANSITIONED" | "NOT_FOUND" | "INVALID_STATUS" | "ACTIVE_SESSION";
};

async function resetEventToDraft(input: {
  eventId: string;
  actorAdminId: string;
  now: Date;
}): Promise<EventMutationOutcome> {
  const result = await getDb().execute<EventTransitionRow>(sql`
    WITH state AS (
      SELECT event.id, event.status::text AS status
      FROM ${events} AS event
      WHERE event.id = ${input.eventId}::uuid
    ), closed_questions AS (
      UPDATE ${sessionQuestions} AS occurrence
      SET
        status = 'CLOSED',
        closes_at = GREATEST(
          occurrence.opens_at + interval '1 millisecond',
          LEAST(COALESCE(occurrence.closes_at, ${input.now}), ${input.now})
        )
      FROM ${quizSessions} AS session, state
      WHERE occurrence.quiz_session_id = session.id
        AND session.event_id = state.id
        AND session.status = 'LIVE'
        AND occurrence.status = 'OPEN'
        AND state.status NOT IN ('DRAFT', 'FINISHED')
      RETURNING occurrence.id
    ), paused_sessions AS (
      UPDATE ${quizSessions} AS session
      SET status = 'READY', ends_at = NULL, updated_at = ${input.now}
      FROM state
      WHERE session.event_id = state.id
        AND session.status = 'LIVE'
        AND state.status NOT IN ('DRAFT', 'FINISHED')
      RETURNING session.id
    ), updated AS (
      UPDATE ${events} AS event
      SET status = 'DRAFT', updated_at = ${input.now}
      FROM state
      WHERE event.id = state.id
        AND state.status NOT IN ('DRAFT', 'FINISHED')
      RETURNING event.id
    ), written_audit AS (
      INSERT INTO ${auditLogs} (
        admin_user_id, action, entity_type, entity_id, metadata, created_at
      )
      SELECT
        ${input.actorAdminId}::uuid,
        'EVENT_RESET_DRAFT',
        'event',
        updated.id,
        jsonb_build_object(
          'pausedSessions', (SELECT count(*) FROM paused_sessions),
          'closedQuestions', (SELECT count(*) FROM closed_questions)
        ),
        ${input.now}
      FROM updated
      RETURNING id
    )
    SELECT CASE
      WHEN NOT EXISTS (SELECT 1 FROM state) THEN 'NOT_FOUND'
      WHEN EXISTS (SELECT 1 FROM written_audit) THEN 'TRANSITIONED'
      ELSE 'INVALID_STATUS'
    END::text AS outcome
  `);

  if (result.rows[0]?.outcome === "TRANSITIONED") return "transitioned";
  if (result.rows[0]?.outcome === "INVALID_STATUS") return "invalid_status";
  return "not_found";
}

async function finishEvent(input: {
  eventId: string;
  actorAdminId: string;
  now: Date;
}): Promise<EventFinishOutcome> {
  const result = await getDb().execute<EventTransitionRow>(sql`
    WITH state AS (
      SELECT
        event.id,
        event.status::text AS status,
        EXISTS (
          SELECT 1
          FROM ${quizSessions} AS session
          WHERE session.event_id = event.id
            AND session.status = 'LIVE'
        ) AS has_active_session
      FROM ${events} AS event
      WHERE event.id = ${input.eventId}::uuid
    ), canceled_questions AS (
      UPDATE ${sessionQuestions} AS occurrence
      SET status = 'CANCELED', canceled_at = ${input.now}
      FROM ${quizSessions} AS session, state
      WHERE occurrence.quiz_session_id = session.id
        AND session.event_id = state.id
        AND session.status IN ('DRAFT', 'READY')
        AND occurrence.status = 'PENDING'
        AND state.status <> 'FINISHED'
        AND state.has_active_session = false
      RETURNING occurrence.id
    ), canceled_sessions AS (
      UPDATE ${quizSessions} AS session
      SET status = 'CANCELED', updated_at = ${input.now}
      FROM state
      WHERE session.event_id = state.id
        AND session.status IN ('DRAFT', 'READY')
        AND state.status <> 'FINISHED'
        AND state.has_active_session = false
      RETURNING session.id
    ), updated AS (
      UPDATE ${events} AS event
      SET status = 'FINISHED', updated_at = ${input.now}
      FROM state
      WHERE event.id = state.id
        AND state.status <> 'FINISHED'
        AND state.has_active_session = false
      RETURNING event.id
    ), written_audit AS (
      INSERT INTO ${auditLogs} (
        admin_user_id, action, entity_type, entity_id, metadata, created_at
      )
      SELECT
        ${input.actorAdminId}::uuid,
        'EVENT_FINISHED',
        'event',
        updated.id,
        jsonb_build_object(
          'canceledSessions', (SELECT count(*) FROM canceled_sessions),
          'canceledQuestions', (SELECT count(*) FROM canceled_questions)
        ),
        ${input.now}
      FROM updated
      RETURNING id
    )
    SELECT CASE
      WHEN NOT EXISTS (SELECT 1 FROM state) THEN 'NOT_FOUND'
      WHEN EXISTS (SELECT 1 FROM written_audit) THEN 'TRANSITIONED'
      WHEN (SELECT status FROM state) = 'FINISHED' THEN 'INVALID_STATUS'
      ELSE 'ACTIVE_SESSION'
    END::text AS outcome
  `);

  switch (result.rows[0]?.outcome) {
    case "TRANSITIONED":
      return "transitioned";
    case "INVALID_STATUS":
      return "invalid_status";
    case "ACTIVE_SESSION":
      return "active_session";
    default:
      return "not_found";
  }
}

export const postgresAdminProgrammingRepository: AdminProgrammingRepository = {
  createEvent,
  updateEvent,
  listEvents,
  listSessions,
  getEvent,
  markEventReady,
  resetEventToDraft,
  finishEvent,
};
