import "server-only";

import { asc, desc, eq, inArray, sql } from "drizzle-orm";

import {
  events,
  questions,
  quizSessions,
  sessionQuestions,
} from "../../../db/schema";
import { getDb } from "@/lib/db/client";
import {
  type AdminEventDetail,
  type AdminProgrammingRepository,
  EventPersistenceError,
  type EventReadyOutcome,
  type PersistEvent,
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

export const postgresAdminProgrammingRepository: AdminProgrammingRepository = {
  createEvent,
  listEvents,
  listSessions,
  getEvent,
  markEventReady,
};
