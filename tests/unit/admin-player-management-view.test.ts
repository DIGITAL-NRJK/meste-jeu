import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

import { AdminPlayerManagementView } from "../../src/components/admin/admin-player-management-view";

describe("AdminPlayerManagementView", () => {
  it("présente la recherche, les codes publics, scores et statuts", () => {
    const html = renderToStaticMarkup(
      createElement(AdminPlayerManagementView, {
        admin: {
          id: "00000000-0000-4000-8000-000000000001",
          email: "admin@example.com",
          displayName: "Régie MESTE",
        },
        initialEvents: [
          {
            id: "00000000-0000-4000-8000-000000000002",
            slug: "independance-congo-66",
            name: "Tombola — 66e anniversaire",
            status: "READY",
          },
        ],
        initialEvent: {
          id: "00000000-0000-4000-8000-000000000002",
          slug: "independance-congo-66",
          name: "Tombola — 66e anniversaire",
          status: "READY",
        },
        initialPlayers: [
          {
            id: "00000000-0000-4000-8000-000000000003",
            publicCode: "AB12CD",
            nickname: "Mwana",
            status: "ACTIVE",
            currentStreak: 2,
            totalPoints: 250,
            answerCount: 4,
            createdAt: "2026-08-13T12:00:00.000Z",
            lastSeenAt: "2026-08-13T12:00:00.000Z",
          },
        ],
      }),
    );

    expect(html).toContain("Gestion des joueurs");
    expect(html).toContain("Pseudo ou code public");
    expect(html).toContain("AB12CD");
    expect(html).toContain("250 pts");
    expect(html).toContain("Actif");
    expect(html).toContain("Choisissez un joueur");
  });
});
