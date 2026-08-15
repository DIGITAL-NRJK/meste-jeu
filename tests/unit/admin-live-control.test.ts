import { describe, expect, it, vi } from "vitest";

import { getLiveControlActions } from "../../src/lib/game/admin-live-controls";
import { AdminLiveControlInputError, executeAdminLiveControl } from "../../src/server/services/admin-live-control";
import type { QuizSessionDetail, SessionEngineRepository } from "../../src/server/services/session-engine";

const adminId = "00000000-0000-4000-8000-000000000001";
const sessionId = "00000000-0000-4000-8000-000000000002";
const occurrenceId = "00000000-0000-4000-8000-000000000003";

function detail(): QuizSessionDetail {
  return {
    id: sessionId,
    eventId: adminId,
    eventSlug: "heritage-congo-2026",
    eventName: "Héritage Congo",
    name: "Live",
    slug: "live",
    mode: "LIVE",
    status: "LIVE",
    startsAt: null,
    endsAt: null,
    resetScore: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    questions: [
      {
        id: occurrenceId,
        questionId: "00000000-0000-4000-8000-000000000004",
        questionText: "Question",
        questionStatus: "VALIDATED",
        position: 1,
        durationSeconds: 20,
        status: "REVEALED",
        opensAt: new Date(),
        closesAt: new Date(),
        revealedAt: new Date(),
        canceledAt: null,
      },
    ],
  };
}

function repository(): SessionEngineRepository {
  return {
    createSession: vi.fn(),
    configureLineup: vi.fn(),
    getPublicState: vi.fn(),
    getSession: vi.fn(async () => detail()),
    markReady: vi.fn(async () => "transitioned" as const),
    resetToDraft: vi.fn(async () => "transitioned" as const),
    startSession: vi.fn(async () => "transitioned" as const),
    openNextQuestion: vi.fn(async () => "transitioned" as const),
    closeCurrentQuestion: vi.fn(async () => "transitioned" as const),
    revealCurrentQuestion: vi.fn(async () => "transitioned" as const),
    cancelSessionQuestion: vi.fn(async () => ({ outcome: "transitioned" as const, sessionId })),
    finishSession: vi.fn(async () => "transitioned" as const),
  };
}

describe("admin live controls", () => {
  it("propose une seule transition principale selon l’état", () => {
    expect(getLiveControlActions("DRAFT", null).map(({ action }) => action)).toEqual(["MARK_READY"]);
    expect(getLiveControlActions("READY", null).map(({ action }) => action)).toEqual(["START_SESSION"]);
    expect(getLiveControlActions("LIVE", "OPEN").map(({ action }) => action)).toEqual(["CLOSE_CURRENT_QUESTION", "CANCEL_CURRENT_QUESTION", "FINISH_SESSION"]);
    expect(getLiveControlActions("LIVE", "CLOSED")[0]?.action).toBe("REVEAL_CURRENT_QUESTION");
    expect(getLiveControlActions("FINISHED", "REVEALED")).toEqual([]);
  });

  it("délègue chaque commande au moteur serveur avec l’administrateur", async () => {
    const repo = repository();
    await executeAdminLiveControl(
      { action: "CANCEL_CURRENT_QUESTION", sessionId, sessionQuestionId: occurrenceId },
      adminId,
      repo,
    );
    expect(repo.cancelSessionQuestion).toHaveBeenCalledWith(occurrenceId, adminId, expect.any(Date));
    expect(repo.getSession).toHaveBeenCalledWith(sessionId);
  });

  it("refuse une annulation sans occurrence", async () => {
    await expect(
      executeAdminLiveControl(
        { action: "CANCEL_CURRENT_QUESTION", sessionId },
        adminId,
        repository(),
      ),
    ).rejects.toBeInstanceOf(AdminLiveControlInputError);
  });

  it("refuse d’annuler une occurrence d’une autre session", async () => {
    await expect(
      executeAdminLiveControl(
        {
          action: "CANCEL_CURRENT_QUESTION",
          sessionId,
          sessionQuestionId: "00000000-0000-4000-8000-000000000099",
        },
        adminId,
        repository(),
      ),
    ).rejects.toMatchObject({ reason: "session_question_not_found" });
  });
});
