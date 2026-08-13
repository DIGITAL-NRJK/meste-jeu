import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  adminUsers,
  auditLogs,
  categories,
  events,
  questionOptions,
  questions,
  questionSources,
  quizSessions,
  sessionQuestions,
} from "../../db/schema";
// @ts-expect-error Le manifeste JavaScript reste directement exécutable par Node.
import { independence66Content } from "../../scripts/data/independence-66-content.mjs";
// @ts-expect-error Le script Node reste exécutable directement sans compilation TypeScript.
import { applyIndependence66Seed, prepareIndependence66Seed } from "../../scripts/lib/independence-66-seed.mjs";
import { getDb } from "../../src/lib/db/client";

if (
  process.env.DATABASE_INTEGRATION_TARGET !== "neon-preview" ||
  process.env.GITHUB_EVENT_NAME !== "pull_request"
) {
  throw new Error(
    "Database integration tests are restricted to Neon pull request branches.",
  );
}

const databaseUrl = process.env.DATABASE_URL_UNPOOLED;
if (!databaseUrl) {
  throw new Error("DATABASE_URL_UNPOOLED is required for the seed integration test.");
}

const db = getDb();
const adminId = randomUUID();
const adminEmail = `integration-seed-${randomUUID()}@example.com`;
const prepared = prepareIndependence66Seed(
  independence66Content,
  adminId,
  new Date("2026-08-13T12:00:00.000Z"),
);
let createdFixture = false;

describe("independence content seed on Neon preview", () => {
  beforeAll(async () => {
    const existingEvent = await db.query.events.findFirst({
      where: eq(events.id, prepared.event.id),
      columns: { id: true },
    });
    createdFixture = !existingEvent;

    await db.insert(adminUsers).values({
      id: adminId,
      email: adminEmail,
      passwordHash: "integration-test-only",
      displayName: "Admin intégration seed",
    });
  });

  afterAll(async () => {
    if (createdFixture) {
      await db
        .delete(auditLogs)
        .where(inArray(auditLogs.id, prepared.auditLogs.map(({ id }: { id: string }) => id)));
      await db
        .delete(sessionQuestions)
        .where(
          inArray(
            sessionQuestions.id,
            prepared.sessionQuestions.map(({ id }: { id: string }) => id),
          ),
        );
      await db
        .delete(quizSessions)
        .where(inArray(quizSessions.id, prepared.sessions.map(({ id }: { id: string }) => id)));
      await db
        .delete(questionOptions)
        .where(inArray(questionOptions.id, prepared.options.map(({ id }: { id: string }) => id)));
      await db
        .delete(questionSources)
        .where(
          inArray(
            questionSources.id,
            prepared.questionSources.map(({ id }: { id: string }) => id),
          ),
        );
      await db
        .delete(questions)
        .where(inArray(questions.id, prepared.questions.map(({ id }: { id: string }) => id)));
      await db
        .delete(categories)
        .where(inArray(categories.id, prepared.categories.map(({ id }: { id: string }) => id)));
      await db.delete(events).where(eq(events.id, prepared.event.id));
    }

    await db.delete(adminUsers).where(eq(adminUsers.id, adminId));
  });

  it("applique le contenu une seule fois et vérifie tous les volumes", async () => {
    if (!createdFixture) {
      expect(prepared.event.name).toBe(independence66Content.event.name);
      return;
    }

    const first = await applyIndependence66Seed({
      content: independence66Content,
      databaseUrl,
      adminEmail,
      target: "preview",
      confirmation: "SEED-INDEPENDENCE-66-PREVIEW",
      now: new Date("2026-08-13T12:00:00.000Z"),
    });
    const second = await applyIndependence66Seed({
      content: independence66Content,
      databaseUrl,
      adminEmail,
      target: "preview",
      confirmation: "SEED-INDEPENDENCE-66-PREVIEW",
      now: new Date("2026-08-13T12:05:00.000Z"),
    });

    expect(first.counts).toEqual({
      events: 1,
      categories: 5,
      questions: 50,
      validatedQuestions: 50,
      options: 200,
      sources: 50,
      sessions: 6,
      sessionQuestions: 60,
    });
    expect(second.before).toMatchObject({
      eventAlreadyPresent: true,
      existingQuestions: 50,
      existingSessions: 6,
    });
    expect(second.counts).toEqual(first.counts);
  });
});
