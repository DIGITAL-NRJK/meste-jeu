import { describe, expect, it, vi } from "vitest";

import {
  AdminPlayerAlreadyDisabledError,
  AdminPlayerEventNotFoundError,
  AdminPlayerInputError,
  AdminPlayerNotFoundError,
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
};

function repository(
  overrides: Partial<AdminPlayerManagementRepository> = {},
): AdminPlayerManagementRepository {
  return {
    listEvents: vi.fn(async () => [event]),
    listPlayers: vi.fn(async () => [player]),
    getPlayer: vi.fn(async () => player),
    disablePlayer: vi.fn(async () => "disabled" as const),
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
});
