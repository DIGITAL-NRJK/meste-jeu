import { describe, expect, it, vi } from "vitest";

import {
  getPublicEventEntry,
  type PublicEventEntryRepository,
} from "../../src/server/services/public-event-entry";

describe("public event entry", () => {
  it("utilise l’événement de production actuellement ouvert", async () => {
    const event = {
      slug: "tombola-fete-independance-republique-congo-66e-anniversaire",
      name: "Tombola — 66e anniversaire",
      status: "READY" as const,
    };
    const repository: PublicEventEntryRepository = {
      findOpenProductionEvent: vi.fn(async () => event),
    };

    await expect(getPublicEventEntry(repository)).resolves.toEqual(event);
    expect(repository.findOpenProductionEvent).toHaveBeenCalledOnce();
  });

  it("signale qu’aucune inscription de production n’est ouverte", async () => {
    const repository: PublicEventEntryRepository = {
      findOpenProductionEvent: vi.fn(async () => null),
    };

    await expect(getPublicEventEntry(repository)).resolves.toBeNull();
  });
});
