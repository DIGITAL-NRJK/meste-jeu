import { randomUUID } from "node:crypto";

import { z } from "zod";

import {
  eventInputSchema,
  type EventInput,
} from "@/lib/validation/admin-programming";
import type { QuizSessionDetail } from "@/server/services/session-engine";

export type EventStatus =
  | "DRAFT"
  | "READY"
  | "LIVE"
  | "FINISHED"
  | "CANCELED";

export type AdminEventDetail = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  status: EventStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type PersistEvent = EventInput & {
  id: string;
  slug: string;
  now: Date;
};

export type EventReadyOutcome =
  | "transitioned"
  | "not_found"
  | "invalid_status"
  | "no_ready_session";

export interface AdminProgrammingRepository {
  createEvent(input: PersistEvent): Promise<AdminEventDetail>;
  listEvents(): Promise<AdminEventDetail[]>;
  listSessions(eventId: string): Promise<QuizSessionDetail[]>;
  getEvent(eventId: string): Promise<AdminEventDetail | null>;
  markEventReady(eventId: string, now: Date): Promise<EventReadyOutcome>;
}

export type AdminProgramming = {
  events: AdminEventDetail[];
  event: AdminEventDetail | null;
  sessions: QuizSessionDetail[];
};

export class AdminProgrammingInputError extends Error {
  constructor(readonly issues: z.core.$ZodIssue[]) {
    super("Invalid admin programming input");
    this.name = "AdminProgrammingInputError";
  }
}

export class EventNotFoundError extends Error {
  constructor() {
    super("Event not found");
    this.name = "EventNotFoundError";
  }
}

export class EventSlugConflictError extends Error {
  constructor() {
    super("Event slug already exists");
    this.name = "EventSlugConflictError";
  }
}

export class EventInvalidStatusError extends Error {
  constructor() {
    super("Event status does not allow this operation");
    this.name = "EventInvalidStatusError";
  }
}

export class EventNotReadyError extends Error {
  constructor() {
    super("Event has no ready quiz session");
    this.name = "EventNotReadyError";
  }
}

export class EventPersistenceError extends Error {
  constructor(readonly kind: "slug_conflict") {
    super(`Event persistence error: ${kind}`);
    this.name = "EventPersistenceError";
  }
}

export function normalizeEventSlug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseInput<T>(result: z.ZodSafeParseResult<T>): T {
  if (!result.success) {
    throw new AdminProgrammingInputError(result.error.issues);
  }

  return result.data;
}

function parseId(value: string): string {
  return parseInput(z.uuid().safeParse(value));
}

export async function createEvent(
  input: unknown,
  dependencies: {
    repository: AdminProgrammingRepository;
    now?: () => Date;
    createId?: () => string;
  },
): Promise<AdminEventDetail> {
  const event = parseInput(eventInputSchema.safeParse(input));
  const slug = normalizeEventSlug(event.name);

  if (!slug) {
    throw new AdminProgrammingInputError([]);
  }

  try {
    return await dependencies.repository.createEvent({
      ...event,
      id: dependencies.createId?.() ?? randomUUID(),
      slug,
      now: dependencies.now?.() ?? new Date(),
    });
  } catch (error) {
    if (
      error instanceof EventPersistenceError &&
      error.kind === "slug_conflict"
    ) {
      throw new EventSlugConflictError();
    }

    throw error;
  }
}

export async function getAdminProgramming(
  eventSlug: unknown,
  repository: AdminProgrammingRepository,
): Promise<AdminProgramming> {
  const parsedSlug = z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional()
    .safeParse(eventSlug || undefined);

  if (!parsedSlug.success) {
    throw new AdminProgrammingInputError(parsedSlug.error.issues);
  }

  const events = await repository.listEvents();
  const event = parsedSlug.data
    ? events.find((candidate) => candidate.slug === parsedSlug.data)
    : events[0];

  if (parsedSlug.data && !event) {
    throw new EventNotFoundError();
  }

  return {
    events,
    event: event ?? null,
    sessions: event ? await repository.listSessions(event.id) : [],
  };
}

export async function markEventReady(
  eventId: string,
  dependencies: {
    repository: AdminProgrammingRepository;
    now?: () => Date;
  },
): Promise<AdminEventDetail> {
  const id = parseId(eventId);
  const outcome = await dependencies.repository.markEventReady(
    id,
    dependencies.now?.() ?? new Date(),
  );

  if (outcome === "not_found") {
    throw new EventNotFoundError();
  }

  if (outcome === "invalid_status") {
    throw new EventInvalidStatusError();
  }

  if (outcome === "no_ready_session") {
    throw new EventNotReadyError();
  }

  const event = await dependencies.repository.getEvent(id);

  if (!event) {
    throw new EventNotFoundError();
  }

  return event;
}
