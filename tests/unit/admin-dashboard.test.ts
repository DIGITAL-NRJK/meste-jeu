import { describe, expect, it, vi } from "vitest";

import {
  AdminDashboardEventNotFoundError,
  AdminDashboardInputError,
  type AdminDashboardRepository,
  getAdminDashboard,
} from "../../src/server/services/admin-dashboard";

const now = new Date("2026-08-13T12:00:00.000Z");
const firstEvent = {
  id: "00000000-0000-4000-8000-000000000001",
  slug: "heritage-congo-2026",
  name: "Héritage Congo 2026",
  status: "LIVE" as const,
};
const secondEvent = {
  id: "00000000-0000-4000-8000-000000000002",
  slug: "autre-evenement",
  name: "Autre événement",
  status: "READY" as const,
};

function repository(): AdminDashboardRepository {
  return {
    listEvents: vi.fn(async () => [firstEvent, secondEvent]),
    getDashboard: vi.fn(async (event) => ({
      serverNow: now.toISOString(),
      event,
      participants: { registered: 42, activeRecently: 18 },
      session: null,
      currentQuestion: null,
      leaderboard: [],
      questionLibrary: { total: 20, drafts: 3, inReview: 2, validated: 15 },
    })),
  };
}

describe("admin dashboard service", () => {
  it("sélectionne en priorité le premier événement ordonné", async () => {
    const dashboardRepository = repository();
    const dashboard = await getAdminDashboard(undefined, {
      repository: dashboardRepository,
      now: () => now,
    });

    expect(dashboard.event).toEqual(firstEvent);
    expect(dashboard.events).toHaveLength(2);
    expect(dashboardRepository.getDashboard).toHaveBeenCalledWith(firstEvent, now);
  });

  it("respecte l’événement explicitement demandé", async () => {
    const dashboardRepository = repository();
    const dashboard = await getAdminDashboard("autre-evenement", {
      repository: dashboardRepository,
      now: () => now,
    });

    expect(dashboard.event).toEqual(secondEvent);
  });

  it("retourne un état vide exploitable quand aucun événement n’existe", async () => {
    const dashboardRepository = repository();
    vi.mocked(dashboardRepository.listEvents).mockResolvedValueOnce([]);

    await expect(
      getAdminDashboard(undefined, {
        repository: dashboardRepository,
        now: () => now,
      }),
    ).resolves.toMatchObject({
      event: null,
      participants: { registered: 0, activeRecently: 0 },
      leaderboard: [],
    });
    expect(dashboardRepository.getDashboard).not.toHaveBeenCalled();
  });

  it("refuse un slug invalide ou absent de la liste", async () => {
    const dashboardRepository = repository();
    await expect(
      getAdminDashboard("Slug invalide", { repository: dashboardRepository }),
    ).rejects.toBeInstanceOf(AdminDashboardInputError);
    await expect(
      getAdminDashboard("evenement-inconnu", { repository: dashboardRepository }),
    ).rejects.toBeInstanceOf(AdminDashboardEventNotFoundError);
  });
});
