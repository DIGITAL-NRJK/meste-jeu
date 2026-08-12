import { describe, expect, it } from "vitest";

import {
  quizSessionInputSchema,
  sessionLineupSchema,
} from "../../src/lib/validation/session-engine";

const eventId = "00000000-0000-4000-8000-000000000001";
const questionId = "00000000-0000-4000-8000-000000000002";

describe("quizSessionInputSchema", () => {
  it("normalise les dates et les valeurs par défaut", () => {
    const session = quizSessionInputSchema.parse({
      eventId,
      name: "Grand Quiz de l’Indépendance",
      mode: "LIVE",
      startsAt: "2026-08-15T18:30:00.000Z",
      endsAt: "2026-08-15T20:00:00.000Z",
    });

    expect(session.startsAt).toBeInstanceOf(Date);
    expect(session.endsAt).toBeInstanceOf(Date);
    expect(session.resetScore).toBe(false);
  });

  it("refuse une fin antérieure ou égale au début", () => {
    expect(
      quizSessionInputSchema.safeParse({
        eventId,
        name: "Grand Quiz de l’Indépendance",
        mode: "LIVE",
        startsAt: "2026-08-15T20:00:00.000Z",
        endsAt: "2026-08-15T18:30:00.000Z",
      }).success,
    ).toBe(false);
  });
});

describe("sessionLineupSchema", () => {
  it("accepte une configuration ordonnée avec une durée serveur", () => {
    expect(
      sessionLineupSchema.parse([
        { questionId, durationSeconds: 45 },
      ]),
    ).toEqual([{ questionId, durationSeconds: 45 }]);
  });

  it("refuse une question dupliquée ou une durée non positive", () => {
    expect(
      sessionLineupSchema.safeParse([
        { questionId, durationSeconds: 45 },
        { questionId, durationSeconds: 30 },
      ]).success,
    ).toBe(false);
    expect(
      sessionLineupSchema.safeParse([
        { questionId, durationSeconds: 0 },
      ]).success,
    ).toBe(false);
  });
});
