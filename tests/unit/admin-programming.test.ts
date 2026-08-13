import { describe, expect, it, vi } from "vitest";

import {
  createEvent,
  type AdminEventDetail,
  type AdminProgrammingRepository,
  EventNotReadyError,
  EventPersistenceError,
  EventSlugConflictError,
  getAdminProgramming,
  markEventReady,
  normalizeEventSlug,
} from "../../src/server/services/admin-programming";

const eventId = "00000000-0000-4000-8000-000000000001";
const now = new Date("2026-08-13T12:00:00.000Z");

function eventDetail(input?: Partial<AdminEventDetail>): AdminEventDetail {
  return {
    id: eventId,
    slug: "heritage-congo-2026",
    name: "Héritage Congo 2026",
    description: "Quiz culturel de la République du Congo.",
    startsAt: new Date("2026-08-15T16:00:00.000Z"),
    endsAt: new Date("2026-08-15T22:00:00.000Z"),
    timezone: "Africa/Brazzaville",
    status: "DRAFT",
    createdAt: now,
    updatedAt: now,
    ...input,
  };
}

function repository(
  overrides: Partial<AdminProgrammingRepository> = {},
): AdminProgrammingRepository {
  return {
    createEvent: vi.fn(async () => eventDetail()),
    listEvents: vi.fn(async () => [eventDetail()]),
    listSessions: vi.fn(async () => []),
    getEvent: vi.fn(async () => eventDetail({ status: "READY" })),
    markEventReady: vi.fn(async () => "transitioned" as const),
    ...overrides,
  };
}

describe("admin programming service", () => {
  it("normalise le nom de l’événement pour une URL stable", () => {
    expect(normalizeEventSlug("MESTE — Héritage Congo 2026")).toBe(
      "meste-heritage-congo-2026",
    );
  });

  it("crée un événement brouillon avec les dates et le fuseau contrôlés", async () => {
    const createEventRepository = repository({
      createEvent: vi.fn(async (input) =>
        eventDetail({ id: input.id, slug: input.slug }),
      ),
    });

    const event = await createEvent(
      {
        name: "Héritage Congo 2026",
        description: "Quiz culturel de la République du Congo.",
        startsAt: "2026-08-15T16:00:00.000Z",
        endsAt: "2026-08-15T22:00:00.000Z",
        timezone: "Africa/Brazzaville",
      },
      {
        repository: createEventRepository,
        createId: () => eventId,
        now: () => now,
      },
    );

    expect(event.slug).toBe("heritage-congo-2026");
    expect(createEventRepository.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: eventId,
        slug: "heritage-congo-2026",
        timezone: "Africa/Brazzaville",
        now,
      }),
    );
  });

  it("refuse les dates inversées et un fuseau inconnu", async () => {
    await expect(
      createEvent(
        {
          name: "Héritage Congo 2026",
          startsAt: "2026-08-15T22:00:00.000Z",
          endsAt: "2026-08-15T16:00:00.000Z",
          timezone: "Congo/Imaginaire",
        },
        { repository: repository() },
      ),
    ).rejects.toMatchObject({ name: "AdminProgrammingInputError" });
  });

  it("traduit le conflit de slug et sélectionne un événement demandé", async () => {
    await expect(
      createEvent(
        {
          name: "Héritage Congo 2026",
          startsAt: "2026-08-15T16:00:00.000Z",
          endsAt: "2026-08-15T22:00:00.000Z",
          timezone: "Africa/Brazzaville",
        },
        {
          repository: repository({
            createEvent: vi.fn(async () => {
              throw new EventPersistenceError("slug_conflict");
            }),
          }),
        },
      ),
    ).rejects.toBeInstanceOf(EventSlugConflictError);

    const selected = eventDetail({
      id: "00000000-0000-4000-8000-000000000002",
      slug: "finale-congo-2026",
      name: "Finale Congo 2026",
    });
    const programmingRepository = repository({
      listEvents: vi.fn(async () => [eventDetail(), selected]),
    });

    const programming = await getAdminProgramming(
      selected.slug,
      programmingRepository,
    );
    expect(programming.event).toEqual(selected);
    expect(programmingRepository.listSessions).toHaveBeenCalledWith(selected.id);
  });

  it("n’ouvre les inscriptions qu’après préparation d’une session", async () => {
    await expect(
      markEventReady(eventId, {
        repository: repository({
          markEventReady: vi.fn(async () => "no_ready_session" as const),
        }),
      }),
    ).rejects.toBeInstanceOf(EventNotReadyError);

    await expect(
      markEventReady(eventId, { repository: repository() }),
    ).resolves.toMatchObject({ status: "READY" });
  });
});
