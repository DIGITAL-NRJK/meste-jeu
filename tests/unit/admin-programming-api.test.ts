import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { ADMIN_SESSION_COOKIE_NAME } from "../../src/lib/auth/admin-session";

const authRepository = vi.hoisted(() => ({ findActiveSession: vi.fn() }));
const programmingRepository = vi.hoisted(() => ({
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  listEvents: vi.fn(),
  listSessions: vi.fn(),
  getEvent: vi.fn(),
  markEventReady: vi.fn(),
  resetEventToDraft: vi.fn(),
  finishEvent: vi.fn(),
}));
const sessionRepository = vi.hoisted(() => ({
  createSession: vi.fn(),
  getSession: vi.fn(),
  configureLineup: vi.fn(),
  markReady: vi.fn(),
  startSession: vi.fn(),
  openNextQuestion: vi.fn(),
  closeCurrentQuestion: vi.fn(),
  revealCurrentQuestion: vi.fn(),
  cancelSessionQuestion: vi.fn(),
  finishSession: vi.fn(),
  getPublicState: vi.fn(),
}));

vi.mock("@/lib/env/server", () => ({
  getServerEnv: () => ({
    ADMIN_AUTH_SECRET: "admin-secret-with-at-least-32-characters",
  }),
}));
vi.mock("@/server/repositories/admin-auth-repository", () => ({
  postgresAdminAuthRepository: authRepository,
}));
vi.mock("@/server/repositories/admin-programming-repository", () => ({
  postgresAdminProgrammingRepository: programmingRepository,
}));
vi.mock("@/server/repositories/session-engine-repository", () => ({
  postgresSessionEngineRepository: sessionRepository,
}));

import { POST as createEvent } from "../../src/app/api/admin/events/route";
import { POST as runEventAction } from "../../src/app/api/admin/events/[id]/actions/route";
import { PUT as updateEvent } from "../../src/app/api/admin/events/[id]/route";
import { POST as createSession } from "../../src/app/api/admin/sessions/route";
import { PUT as configureLineup } from "../../src/app/api/admin/sessions/[id]/lineup/route";

const adminId = "00000000-0000-4000-8000-000000000001";
const eventId = "00000000-0000-4000-8000-000000000002";
const sessionId = "00000000-0000-4000-8000-000000000003";
const questionId = "00000000-0000-4000-8000-000000000004";
const now = new Date("2026-08-13T12:00:00.000Z");
const cookie = `${ADMIN_SESSION_COOKIE_NAME}=raw-admin-token`;

const event = {
  id: eventId,
  slug: "heritage-congo-2026",
  name: "Héritage Congo 2026",
  description: null,
  startsAt: new Date("2026-08-15T16:00:00.000Z"),
  endsAt: new Date("2026-08-15T22:00:00.000Z"),
  timezone: "Africa/Brazzaville",
  environment: "PRODUCTION" as const,
  status: "DRAFT" as const,
  createdAt: now,
  updatedAt: now,
};
const session = {
  id: sessionId,
  eventId,
  eventSlug: event.slug,
  eventName: event.name,
  name: "Grand Quiz",
  slug: "grand-quiz",
  mode: "LIVE" as const,
  status: "DRAFT" as const,
  startsAt: null,
  endsAt: null,
  resetScore: false,
  createdAt: now,
  updatedAt: now,
  questions: [],
};

function request(url: string, body: unknown, authenticated = true) {
  return new NextRequest(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authenticated ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("admin programming API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authRepository.findActiveSession.mockResolvedValue({
      id: adminId,
      email: "admin@example.com",
      displayName: "Régie MESTE",
    });
    programmingRepository.createEvent.mockResolvedValue(event);
    programmingRepository.updateEvent.mockResolvedValue("updated");
    programmingRepository.markEventReady.mockResolvedValue("transitioned");
    programmingRepository.resetEventToDraft.mockResolvedValue("transitioned");
    programmingRepository.finishEvent.mockResolvedValue("transitioned");
    programmingRepository.listSessions.mockResolvedValue([session]);
    programmingRepository.getEvent.mockResolvedValue({ ...event, status: "READY" });
    sessionRepository.createSession.mockResolvedValue(session);
    sessionRepository.getSession.mockResolvedValue(session);
    sessionRepository.configureLineup.mockResolvedValue("configured");
  });

  it("protège les créations avant toute écriture", async () => {
    const response = await createEvent(
      request("http://localhost/api/admin/events", {}, false),
    );

    expect(response.status).toBe(401);
    expect(programmingRepository.createEvent).not.toHaveBeenCalled();
  });

  it("crée un événement brouillon sans mise en cache", async () => {
    const response = await createEvent(
      request("http://localhost/api/admin/events", {
        name: event.name,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        timezone: event.timezone,
      }),
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(programmingRepository.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({ slug: event.slug }),
    );
  });

  it("crée une session auditable avec l’identité admin", async () => {
    const response = await createSession(
      request("http://localhost/api/admin/sessions", {
        eventId,
        name: session.name,
        mode: "LIVE",
      }),
    );

    expect(response.status).toBe(201);
    expect(sessionRepository.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ actorAdminId: adminId, eventId }),
    );
  });

  it("enregistre l’ordre et la durée calculés par le serveur", async () => {
    const response = await configureLineup(
      request(`http://localhost/api/admin/sessions/${sessionId}/lineup`, [
        { questionId, durationSeconds: 45 },
      ]),
      { params: Promise.resolve({ id: sessionId }) },
    );

    expect(response.status).toBe(200);
    expect(sessionRepository.configureLineup).toHaveBeenCalledWith(
      sessionId,
      [expect.objectContaining({ questionId, position: 1, durationSeconds: 45 })],
      expect.any(Date),
    );
  });

  it("ouvre les inscriptions après la commande explicite", async () => {
    const response = await runEventAction(
      request(`http://localhost/api/admin/events/${eventId}/actions`, {
        action: "MARK_READY",
      }),
      { params: Promise.resolve({ id: eventId }) },
    );

    expect(response.status).toBe(200);
    expect(programmingRepository.markEventReady).toHaveBeenCalledWith(
      eventId,
      expect.any(Date),
    );
  });

  it("met à jour un événement brouillon avec l’identité administrateur", async () => {
    programmingRepository.getEvent.mockResolvedValue({
      ...event,
      environment: "TEST",
    });
    const response = await updateEvent(
      request(`http://localhost/api/admin/events/${eventId}`, {
        name: event.name,
        description: event.description ?? "",
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        timezone: event.timezone,
        environment: "TEST",
      }),
      { params: Promise.resolve({ id: eventId }) },
    );

    expect(response.status).toBe(200);
    expect(programmingRepository.updateEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: eventId,
        actorAdminId: adminId,
        environment: "TEST",
      }),
    );
  });

  it("repasse un événement live en brouillon et renvoie les sessions actualisées", async () => {
    programmingRepository.getEvent.mockResolvedValue(event);
    const response = await runEventAction(
      request(`http://localhost/api/admin/events/${eventId}/actions`, {
        action: "RESET_DRAFT",
      }),
      { params: Promise.resolve({ id: eventId }) },
    );

    expect(response.status).toBe(200);
    expect(programmingRepository.resetEventToDraft).toHaveBeenCalledWith(
      expect.objectContaining({ eventId, actorAdminId: adminId }),
    );
    await expect(response.json()).resolves.toMatchObject({
      event: { status: "DRAFT" },
      sessions: [{ id: sessionId }],
    });
  });
});
