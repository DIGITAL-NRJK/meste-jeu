import { describe, expect, it, vi } from "vitest";

import {
  AdminRewardAlreadyDeliveredError,
  AdminRewardDuplicateAwardError,
  AdminRewardEventNotFoundError,
  AdminRewardInputError,
  AdminRewardNotFoundError,
  AdminRewardPlayerNotFoundError,
  awardAdminReward,
  createAdminReward,
  deliverAdminReward,
  getAdminRewards,
  updateAdminReward,
  type AdminRewardsRepository,
} from "../../src/server/services/admin-rewards";

const eventId = "00000000-0000-4000-8000-000000000001";
const rewardId = "00000000-0000-4000-8000-000000000002";
const playerId = "00000000-0000-4000-8000-000000000003";
const adminId = "00000000-0000-4000-8000-000000000004";
const awardId = "00000000-0000-4000-8000-000000000005";
const now = new Date("2026-08-13T12:00:00.000Z");
const event = {
  id: eventId,
  slug: "independance-congo-66",
  name: "Tombola — 66e anniversaire",
  status: "READY" as const,
};
const reward = {
  id: rewardId,
  eventId,
  name: "Premier prix",
  description: "Lot du vainqueur",
  awardPosition: 1,
  awardCondition: null,
  active: true,
  createdAt: now,
  updatedAt: now,
  awards: [],
};

function repository(
  overrides: Partial<AdminRewardsRepository> = {},
): AdminRewardsRepository {
  return {
    listEvents: vi.fn(async () => [event]),
    listRewards: vi.fn(async () => [reward]),
    createReward: vi.fn(async () => reward),
    updateReward: vi.fn(async () => "written" as const),
    awardReward: vi.fn(async () => "written" as const),
    deliverAward: vi.fn(async () => "written" as const),
    ...overrides,
  };
}

describe("admin rewards service", () => {
  it("sélectionne l’événement demandé et charge ses lots", async () => {
    const rewardsRepository = repository();
    await expect(
      getAdminRewards(event.slug, rewardsRepository),
    ).resolves.toEqual({ events: [event], event, rewards: [reward] });
    expect(rewardsRepository.listRewards).toHaveBeenCalledWith(eventId);

    await expect(
      getAdminRewards("evenement-inconnu", rewardsRepository),
    ).rejects.toBeInstanceOf(AdminRewardEventNotFoundError);
  });

  it("crée un lot rattaché à un événement avec l’heure serveur", async () => {
    const rewardsRepository = repository();
    await createAdminReward(
      {
        eventId,
        name: "  Premier prix  ",
        description: "  Lot du vainqueur  ",
        awardPosition: "1",
        awardCondition: null,
      },
      { repository: rewardsRepository, createId: () => rewardId, now: () => now },
    );
    expect(rewardsRepository.createReward).toHaveBeenCalledWith({
      id: rewardId,
      eventId,
      name: "Premier prix",
      description: "Lot du vainqueur",
      awardPosition: 1,
      awardCondition: null,
      now,
    });
  });

  it("impose une position positive ou une condition exploitable", async () => {
    await expect(
      createAdminReward(
        {
          eventId,
          name: "Premier prix",
          description: null,
          awardPosition: null,
          awardCondition: null,
        },
        { repository: repository() },
      ),
    ).rejects.toBeInstanceOf(AdminRewardInputError);
    await expect(
      createAdminReward(
        {
          eventId,
          name: "Premier prix",
          description: null,
          awardPosition: 0,
          awardCondition: null,
        },
        { repository: repository() },
      ),
    ).rejects.toBeInstanceOf(AdminRewardInputError);
  });

  it("refuse de rattacher un lot à un événement inconnu", async () => {
    const rewardsRepository = repository({
      listEvents: vi.fn(async () => []),
    });
    await expect(
      createAdminReward(
        {
          eventId,
          name: "Premier prix",
          description: null,
          awardPosition: 1,
          awardCondition: null,
        },
        { repository: rewardsRepository },
      ),
    ).rejects.toBeInstanceOf(AdminRewardEventNotFoundError);
    expect(rewardsRepository.createReward).not.toHaveBeenCalled();
  });

  it("met à jour la règle et permet la désactivation", async () => {
    const rewardsRepository = repository();
    await updateAdminReward(
      rewardId,
      {
        name: "Prix culture",
        description: null,
        awardPosition: null,
        awardCondition: "Meilleur score de la session Culture",
        active: false,
      },
      { repository: rewardsRepository, now: () => now },
    );
    expect(rewardsRepository.updateReward).toHaveBeenCalledWith({
      rewardId,
      name: "Prix culture",
      description: null,
      awardPosition: null,
      awardCondition: "Meilleur score de la session Culture",
      active: false,
      now,
    });

    await expect(
      updateAdminReward(
        rewardId,
        {
          name: "Prix",
          description: null,
          awardPosition: 1,
          awardCondition: null,
          active: true,
        },
        {
          repository: repository({
            updateReward: vi.fn(async () => "not_found" as const),
          }),
        },
      ),
    ).rejects.toBeInstanceOf(AdminRewardNotFoundError);
  });

  it("attribue avec l’identité admin, la note et l’heure serveur", async () => {
    const rewardsRepository = repository();
    await awardAdminReward(
      rewardId,
      { playerId, notes: "Remise après la finale" },
      adminId,
      { repository: rewardsRepository, createId: () => awardId, now: () => now },
    );
    expect(rewardsRepository.awardReward).toHaveBeenCalledWith({
      awardId,
      rewardId,
      playerId,
      notes: "Remise après la finale",
      actorAdminId: adminId,
      now,
    });
  });

  it("distingue un joueur étranger et une attribution en double", async () => {
    await expect(
      awardAdminReward(rewardId, { playerId }, adminId, {
        repository: repository({
          awardReward: vi.fn(async () => "player_not_found" as const),
        }),
      }),
    ).rejects.toBeInstanceOf(AdminRewardPlayerNotFoundError);
    await expect(
      awardAdminReward(rewardId, { playerId }, adminId, {
        repository: repository({
          awardReward: vi.fn(async () => "duplicate" as const),
        }),
      }),
    ).rejects.toBeInstanceOf(AdminRewardDuplicateAwardError);
  });

  it("horodate la remise une seule fois", async () => {
    const rewardsRepository = repository();
    await deliverAdminReward(awardId, { notes: null }, adminId, {
      repository: rewardsRepository,
      now: () => now,
    });
    expect(rewardsRepository.deliverAward).toHaveBeenCalledWith({
      awardId,
      notes: null,
      actorAdminId: adminId,
      now,
    });

    await expect(
      deliverAdminReward(awardId, { notes: null }, adminId, {
        repository: repository({
          deliverAward: vi.fn(async () => "already_delivered" as const),
        }),
      }),
    ).rejects.toBeInstanceOf(AdminRewardAlreadyDeliveredError);
  });
});
