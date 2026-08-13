import { describe, expect, it, vi } from "vitest";

import {
  AdminPlayerAlreadyDisabledError,
  AdminPlayerEventNotFoundError,
  AdminPlayerInputError,
  AdminPlayerNotFoundError,
  AdminPlayerSessionNotFoundError,
  adjustAdminPlayerScore,
  disableAdminPlayer,
  getAdminPlayer,
  getAdminPlayerManagement,
  type AdminPlayerDetail,
  type AdminPlayerManagementRepository,
} from "../../src/server/services/admin-player-management";

const event = {
  id: "00000000-0000-4000-8000-000000000001",
  slug: "independance-congo-66",
  name: "Tombola — 66e anniversaire",
  status: "READY" as const,
};
const playerId = "00000000-0000-4000-8000-000000000002";
const adminId = "00000000-0000-4000-8000-000000000003";
const sessionId = "00000000-0000-4000-8000-000000000004";
const scoreEventId = "00000000-0000-4000-8000-000000000005";
const now = new Date("2026-08-13T12:00:00.000Z");
const player: AdminPlayerDetail = {
  id: playerId,
  event,
  publicCode: "AB12CD",
  nickname: "Mwana",
  status: "ACTIVE",
  currentStreak: 2,
  totalPoints: 250,
  answerCount: 1,
  createdAt: now,
  lastSeenAt: now,
  answers: [],
  scoreSessions: [
    {
      id: sessionId,
      name: "Session générale",
      mode: "LIVE",
      status: "READY",
      resetScore: false,
      points: 250,
    },
  ],
  scoreAdjustments: [],
};

function repository(
  overrides: Partial<AdminPlayerManagementRepository> = {},
): AdminPlayerManagementRepository {
  return {
    listEvents: vi.fn(async () => [event]),
    listPlayers: vi.fn(async () => [player]),
    getPlayer: vi.fn(async () => player),
    disablePlayer: vi.fn(async () => "disabled" as const),
    appendScoreAdjustment: vi.fn(async () => "created" as const),
    ...overrides,
  };
}

describe("admin player management service", () => {
  it("sélectionne l’événement et normalise les filtres de recherche", async () => {
    const playerRepository = repository();

    const management = await getAdminPlayerManagement(
      {
        eventSlug: event.slug,
        search: "  AB12  ",
        status: "ACTIVE",
        limit: "25",
      },
      playerRepository,
    );

    expect(management.event).toEqual(event);
    expect(playerRepository.listPlayers).toHaveBeenCalledWith({
      eventId: event.id,
      search: "AB12",
      status: "ACTIVE",
      limit: 25,
    });
  });

  it("refuse un événement inconnu, un statut invalide et un identifiant invalide", async () => {
    await expect(
      getAdminPlayerManagement({ eventSlug: "inconnu" }, repository()),
    ).rejects.toBeInstanceOf(AdminPlayerEventNotFoundError);
    await expect(
      getAdminPlayerManagement({ status: "BANNED" }, repository()),
    ).rejects.toBeInstanceOf(AdminPlayerInputError);
    await expect(getAdminPlayer("pas-un-uuid", repository())).rejects.toBeInstanceOf(
      AdminPlayerInputError,
    );
  });

  it("retourne une fiche ou signale un joueur absent", async () => {
    await expect(getAdminPlayer(playerId, repository())).resolves.toEqual(player);
    await expect(
      getAdminPlayer(
        playerId,
        repository({ getPlayer: vi.fn(async () => null) }),
      ),
    ).rejects.toBeInstanceOf(AdminPlayerNotFoundError);
  });

  it("désactive avec l’administrateur et l’heure serveur", async () => {
    const playerRepository = repository({
      getPlayer: vi.fn(async () => ({
        ...player,
        status: "DISABLED" as const,
      })),
    });

    await expect(
      disableAdminPlayer(playerId, adminId, {
        repository: playerRepository,
        now: () => now,
      }),
    ).resolves.toMatchObject({ status: "DISABLED" });
    expect(playerRepository.disablePlayer).toHaveBeenCalledWith({
      playerId,
      actorAdminId: adminId,
      now,
    });
  });

  it("ne journalise pas deux fois une désactivation concurrente", async () => {
    await expect(
      disableAdminPlayer(playerId, adminId, {
        repository: repository({
          disablePlayer: vi.fn(async () => "already_disabled" as const),
        }),
      }),
    ).rejects.toBeInstanceOf(AdminPlayerAlreadyDisabledError);
  });

  it.each([50, -50])(
    "ajoute un ajustement signé de %i points sans écraser le score",
    async (points) => {
      const playerRepository = repository({
        getPlayer: vi.fn(async () => ({
          ...player,
          totalPoints: player.totalPoints + points,
        })),
      });

      await expect(
        adjustAdminPlayerScore(
          playerId,
          {
            action: "ADJUST_SCORE",
            quizSessionId: sessionId,
            points,
            reason: "Correction validée après vérification",
          },
          adminId,
          {
            repository: playerRepository,
            createId: () => scoreEventId,
            now: () => now,
          },
        ),
      ).resolves.toMatchObject({ totalPoints: 250 + points });
      expect(playerRepository.appendScoreAdjustment).toHaveBeenCalledWith({
        scoreEventId,
        playerId,
        quizSessionId: sessionId,
        points,
        reason: "Correction validée après vérification",
        actorAdminId: adminId,
        now,
      });
    },
  );

  it("refuse zéro, un motif imprécis et une session étrangère", async () => {
    const playerRepository = repository();
    await expect(
      adjustAdminPlayerScore(
        playerId,
        {
          action: "ADJUST_SCORE",
          quizSessionId: sessionId,
          points: 0,
          reason: "Non",
        },
        adminId,
        { repository: playerRepository },
      ),
    ).rejects.toBeInstanceOf(AdminPlayerInputError);
    expect(playerRepository.appendScoreAdjustment).not.toHaveBeenCalled();

    await expect(
      adjustAdminPlayerScore(
        playerId,
        {
          action: "ADJUST_SCORE",
          quizSessionId: sessionId,
          points: 25,
          reason: "Correction validée après vérification",
        },
        adminId,
        {
          repository: repository({
            appendScoreAdjustment: vi.fn(async () => "session_not_found" as const),
          }),
        },
      ),
    ).rejects.toBeInstanceOf(AdminPlayerSessionNotFoundError);
  });
});
