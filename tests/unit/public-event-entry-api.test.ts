import { beforeEach, describe, expect, it, vi } from "vitest";

const { getPublicEventEntry } = vi.hoisted(() => ({
  getPublicEventEntry: vi.fn(),
}));

vi.mock("../../src/server/services/public-event-entry", () => ({
  getPublicEventEntry,
}));

vi.mock("../../src/server/repositories/public-event-entry-repository", () => ({
  postgresPublicEventEntryRepository: {},
}));

import { GET } from "../../src/app/api/events/active/route";

describe("public event entry API", () => {
  beforeEach(() => {
    getPublicEventEntry.mockReset();
  });

  it("retourne l’événement de production ouvert sans mise en cache", async () => {
    getPublicEventEntry.mockResolvedValue({
      slug: "tombola-fete-independance-republique-congo-66e-anniversaire",
      name: "Tombola — 66e anniversaire",
      status: "READY",
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      event: {
        slug: "tombola-fete-independance-republique-congo-66e-anniversaire",
      },
    });
  });

  it("ne remplace pas une erreur serveur par un faux événement", async () => {
    getPublicEventEntry.mockRejectedValue(new Error("database unavailable"));

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "PUBLIC_EVENT_UNAVAILABLE" },
    });
  });
});
