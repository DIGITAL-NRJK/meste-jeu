import { beforeEach, describe, expect, it, vi } from "vitest";

const gameRepository = vi.hoisted(() => ({ findEventState: vi.fn() }));
const sessionRepository = vi.hoisted(() => ({ getPublicState: vi.fn() }));

vi.mock("@/server/repositories/player-game-repository", () => ({
  postgresPlayerGameRepository: gameRepository,
}));

vi.mock("@/server/repositories/session-engine-repository", () => ({
  postgresSessionEngineRepository: sessionRepository,
}));

import { GET as getEventState } from "../../src/app/api/events/[eventSlug]/state/route";
import { GET as getCurrentQuestion } from "../../src/app/api/sessions/[id]/current-question/route";

const sessionId = "00000000-0000-4000-8000-000000000001";

describe("player game API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gameRepository.findEventState.mockResolvedValue({
      event: {
        slug: "heritage-congo-2026",
        name: "Héritage Congo 2026",
        status: "LIVE",
      },
      session: null,
    });
    sessionRepository.getPublicState.mockResolvedValue({
      session: {
        id: sessionId,
        name: "Grand Quiz de l’Indépendance",
        slug: "grand-quiz",
        mode: "LIVE",
        status: "LIVE",
        startsAt: new Date("2026-08-15T18:30:00.000Z"),
        endsAt: null,
      },
      currentQuestion: null,
    });
  });

  it("expose un état d’événement léger non mis en cache", async () => {
    const response = await getEventState(
      new Request("http://localhost/api/events/heritage-congo-2026/state"),
      { params: Promise.resolve({ eventSlug: "heritage-congo-2026" }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      event: { slug: "heritage-congo-2026", status: "LIVE" },
      session: null,
    });
  });

  it("refuse un slug invalide avant PostgreSQL", async () => {
    const response = await getEventState(
      new Request("http://localhost/api/events/invalid/state"),
      { params: Promise.resolve({ eventSlug: "Héritage Congo" }) },
    );

    expect(response.status).toBe(400);
    expect(gameRepository.findEventState).not.toHaveBeenCalled();
  });

  it("expose le DTO public minimal préparé par le moteur de session", async () => {
    const response = await getCurrentQuestion(
      new Request(`http://localhost/api/sessions/${sessionId}/current-question`),
      { params: Promise.resolve({ id: sessionId }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(sessionRepository.getPublicState).toHaveBeenCalledWith(
      sessionId,
      expect.any(Date),
    );
  });
});
