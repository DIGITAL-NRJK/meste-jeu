import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

import { AdminRewardsView } from "../../src/components/admin/admin-rewards-view";

describe("AdminRewardsView", () => {
  it("présente la création, l’attribution et la remise des lots", () => {
    const html = renderToStaticMarkup(createElement(AdminRewardsView, {
      admin: { id: "00000000-0000-4000-8000-000000000001", email: "admin@example.com", displayName: "Régie" },
      initialEvents: [{ id: "00000000-0000-4000-8000-000000000002", slug: "independance-congo-66", name: "Tombola Congo", status: "READY" }],
      initialEvent: { id: "00000000-0000-4000-8000-000000000002", slug: "independance-congo-66", name: "Tombola Congo", status: "READY" },
      initialRewards: [{ id: "00000000-0000-4000-8000-000000000003", eventId: "00000000-0000-4000-8000-000000000002", name: "Premier prix", description: null, awardPosition: 1, awardCondition: null, active: true, createdAt: "2026-08-13T12:00:00.000Z", updatedAt: "2026-08-13T12:00:00.000Z", awards: [] }],
      initialPlayers: [{ id: "00000000-0000-4000-8000-000000000004", publicCode: "AB12CD", nickname: "Mwana", status: "ACTIVE", totalPoints: 250 }],
    }));

    expect(html).toContain("Gestion des lots");
    expect(html).toContain("Règle d’attribution");
    expect(html).toContain("Premier prix");
    expect(html).toContain("Joueur gagnant");
    expect(html).toContain("Attribuer ce lot");
  });
});
