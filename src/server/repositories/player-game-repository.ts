import "server-only";

import { sql } from "drizzle-orm";

import { events, quizSessions, sessionQuestions } from "../../../db/schema";
import { getDb } from "@/lib/db/client";
import type {
  PlayerGameEventState,
  PlayerGameRepository,
} from "@/server/services/player-game";

type EventStateRow = {
  eventSlug: string;
  eventName: string;
  eventStatus: PlayerGameEventState["event"]["status"];
  sessionId: string | null;
  sessionName: string | null;
  sessionMode: "DISCOVERY" | "LIVE" | null;
  sessionStatus: "DRAFT" | "READY" | "LIVE" | "FINISHED" | "CANCELED" | null;
  sessionStartsAt: Date | null;
  sessionEndsAt: Date | null;
  questionId: string | null;
  questionStatus: "OPEN" | "CLOSED" | "REVEALED" | "CANCELED" | null;
  opensAt: Date | null;
  closesAt: Date | null;
  revealedAt: Date | null;
  canceledAt: Date | null;
};

async function findEventState(
  eventSlug: string,
): Promise<PlayerGameEventState | null> {
  const result = await getDb().execute<EventStateRow>(sql`
    SELECT
      event.slug AS "eventSlug",
      event.name AS "eventName",
      event.status::text AS "eventStatus",
      session.id AS "sessionId",
      session.name AS "sessionName",
      session.mode::text AS "sessionMode",
      session.status::text AS "sessionStatus",
      session.starts_at AS "sessionStartsAt",
      session.ends_at AS "sessionEndsAt",
      occurrence.id AS "questionId",
      occurrence.status::text AS "questionStatus",
      occurrence.opens_at AS "opensAt",
      occurrence.closes_at AS "closesAt",
      occurrence.revealed_at AS "revealedAt",
      occurrence.canceled_at AS "canceledAt"
    FROM ${events} AS event
    LEFT JOIN LATERAL (
      SELECT candidate.*
      FROM ${quizSessions} AS candidate
      WHERE candidate.event_id = event.id
        AND candidate.status IN ('READY', 'LIVE', 'FINISHED')
      ORDER BY
        CASE candidate.status
          WHEN 'LIVE' THEN 0
          WHEN 'READY' THEN 1
          ELSE 2
        END,
        candidate.created_at DESC
      LIMIT 1
    ) AS session ON true
    LEFT JOIN LATERAL (
      SELECT played.*
      FROM ${sessionQuestions} AS played
      WHERE played.quiz_session_id = session.id
        AND played.opens_at IS NOT NULL
      ORDER BY played.position DESC
      LIMIT 1
    ) AS occurrence ON true
    WHERE event.slug = ${eventSlug}
    LIMIT 1
  `);
  const row = result.rows[0];

  if (!row) {
    return null;
  }

  const event = {
    slug: row.eventSlug,
    name: row.eventName,
    status: row.eventStatus,
  };

  if (
    !row.sessionId ||
    !row.sessionName ||
    !row.sessionMode ||
    !row.sessionStatus
  ) {
    return { event, session: null };
  }

  const session: NonNullable<PlayerGameEventState["session"]> = {
    id: row.sessionId,
    name: row.sessionName,
    mode: row.sessionMode,
    status: row.sessionStatus,
    startsAt: row.sessionStartsAt,
    endsAt: row.sessionEndsAt,
    currentQuestion: null,
  };

  if (
    row.questionId &&
    row.questionStatus &&
    row.opensAt &&
    row.closesAt
  ) {
    session.currentQuestion = {
      id: row.questionId,
      status: row.questionStatus,
      opensAt: row.opensAt,
      closesAt: row.closesAt,
      revealedAt: row.revealedAt,
      canceledAt: row.canceledAt,
    };
  }

  return { event, session };
}

export const postgresPlayerGameRepository: PlayerGameRepository = {
  findEventState,
};
