import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { adminUsers, auditLogs, events, quizSessions } from "../../db/schema";
import { getDb } from "../../src/lib/db/client";
import { postgresAdminProgrammingRepository } from "../../src/server/repositories/admin-programming-repository";
import {
  createEvent,
  finishEvent,
  markEventReady,
  resetEventToDraft,
  updateEvent,
} from "../../src/server/services/admin-programming";

if (
  process.env.DATABASE_INTEGRATION_TARGET !== "neon-preview" ||
  process.env.GITHUB_EVENT_NAME !== "pull_request"
) {
  throw new Error(
    "Database integration tests are restricted to Neon pull request branches.",
  );
}

const db = getDb();
const eventId = randomUUID();
const sessionId = randomUUID();
const adminId = randomUUID();
const now = new Date("2026-08-13T12:00:00.000Z");

describe("admin programming with PostgreSQL", () => {
  afterAll(async () => {
    await db.delete(auditLogs).where(eq(auditLogs.adminUserId, adminId));
    await db.delete(quizSessions).where(eq(quizSessions.id, sessionId));
    await db.delete(events).where(eq(events.id, eventId));
    await db.delete(adminUsers).where(eq(adminUsers.id, adminId));
  });

  it("crée l’événement puis ouvre les inscriptions après une session prête", async () => {
    await db.insert(adminUsers).values({
      id: adminId,
      email: `integration-programming-${adminId}@example.com`,
      passwordHash: "integration-test-only",
      displayName: "Régie programmation intégration",
    });
    const event = await createEvent(
      {
        name: `Héritage Congo intégration ${eventId}`,
        description: "Programmation testée sur la branche Neon éphémère.",
        startsAt: new Date("2026-08-15T16:00:00.000Z"),
        endsAt: new Date("2026-08-15T22:00:00.000Z"),
        timezone: "Africa/Brazzaville",
      },
      {
        repository: postgresAdminProgrammingRepository,
        createId: () => eventId,
        now: () => now,
      },
    );
    expect(event.status).toBe("DRAFT");

    await expect(
      updateEvent(
        event.id,
        {
          name: event.name,
          description: event.description ?? "",
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          timezone: "Africa/Accra",
          environment: "TEST",
        },
        adminId,
        { repository: postgresAdminProgrammingRepository, now: () => now },
      ),
    ).resolves.toMatchObject({ environment: "TEST", timezone: "Africa/Accra" });

    await expect(
      markEventReady(event.id, {
        repository: postgresAdminProgrammingRepository,
        now: () => now,
      }),
    ).rejects.toMatchObject({ name: "EventNotReadyError" });

    await db.insert(quizSessions).values({
      id: sessionId,
      eventId,
      name: "Grand Quiz intégration",
      slug: "grand-quiz-integration",
      mode: "LIVE",
      status: "READY",
    });

    await expect(
      markEventReady(event.id, {
        repository: postgresAdminProgrammingRepository,
        now: () => now,
      }),
    ).resolves.toMatchObject({ status: "READY" });

    await expect(
      postgresAdminProgrammingRepository.listSessions(event.id),
    ).resolves.toEqual([
      expect.objectContaining({ id: sessionId, status: "READY", questions: [] }),
    ]);

    await db.update(events).set({ status: "LIVE" }).where(eq(events.id, eventId));
    await db
      .update(quizSessions)
      .set({ status: "LIVE" })
      .where(eq(quizSessions.id, sessionId));

    await expect(
      resetEventToDraft(event.id, adminId, {
        repository: postgresAdminProgrammingRepository,
        now: () => now,
      }),
    ).resolves.toMatchObject({ status: "DRAFT" });
    await expect(
      postgresAdminProgrammingRepository.listSessions(event.id),
    ).resolves.toEqual([
      expect.objectContaining({ id: sessionId, status: "READY" }),
    ]);

    await markEventReady(event.id, {
      repository: postgresAdminProgrammingRepository,
      now: () => now,
    });
    await expect(
      finishEvent(event.id, adminId, {
        repository: postgresAdminProgrammingRepository,
        now: () => now,
      }),
    ).resolves.toMatchObject({ status: "FINISHED" });
    await expect(
      postgresAdminProgrammingRepository.listSessions(event.id),
    ).resolves.toEqual([
      expect.objectContaining({ id: sessionId, status: "CANCELED" }),
    ]);
  });
});
