import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

import { AdminDashboardView } from "../../src/components/admin/admin-dashboard-view";

describe("AdminDashboardView", () => {
  it("annonce le nombre réel d’actions dans le journal borné", () => {
    const html = renderToStaticMarkup(
      createElement(AdminDashboardView, {
        admin: {
          id: "00000000-0000-4000-8000-000000000001",
          email: "admin@example.com",
          displayName: "Régie MESTE",
        },
        initialAuditLogs: [
          {
            id: "00000000-0000-4000-8000-000000000002",
            action: "SESSION_CREATED",
            entityType: "quiz_session",
            entityId: "00000000-0000-4000-8000-000000000003",
            adminDisplayName: "Régie MESTE",
            createdAt: "2026-08-13T12:00:00.000Z",
          },
        ],
        initialDashboard: {
          serverNow: "2026-08-13T12:00:00.000Z",
          events: [
            {
              id: "00000000-0000-4000-8000-000000000004",
              slug: "independance-congo-66",
              name: "Tombola — Fête de l’indépendance de la République du Congo — 66e anniversaire",
              environment: "TEST",
              status: "DRAFT",
            },
          ],
          event: {
            id: "00000000-0000-4000-8000-000000000004",
            slug: "independance-congo-66",
            name: "Tombola — Fête de l’indépendance de la République du Congo — 66e anniversaire",
            environment: "TEST",
            status: "DRAFT",
          },
          participants: { registered: 0, activeRecently: 0 },
          session: null,
          currentQuestion: null,
          leaderboard: [],
          questionLibrary: {
            total: 50,
            drafts: 0,
            inReview: 0,
            validated: 50,
          },
        },
      }),
    );

    expect(html).toContain("Journal administrateur");
    expect(html).toContain('href="/admin/accounts"');
    expect(html).toContain('aria-label="Journal des dernières actions administratives"');
    expect(html).toContain("Session créée");
    expect(html).toContain('<span class="admin-panel-index">1</span>');
  });
});
