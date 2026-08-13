import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

import { AdminAccountManagementView } from "../../src/components/admin/admin-account-management-view";

describe("AdminAccountManagementView", () => {
  it("présente la création et protège visuellement le dernier compte actif", () => {
    const html = renderToStaticMarkup(
      createElement(AdminAccountManagementView, {
        admin: {
          id: "00000000-0000-4000-8000-000000000001",
          email: "admin@example.com",
          displayName: "Régie principale",
        },
        initialAccounts: [
          {
            id: "00000000-0000-4000-8000-000000000001",
            email: "admin@example.com",
            displayName: "Régie principale",
            status: "ACTIVE",
            createdAt: "2026-08-13T12:00:00.000Z",
            updatedAt: "2026-08-13T12:00:00.000Z",
            lastLoginAt: "2026-08-13T12:15:00.000Z",
          },
        ],
      }),
    );

    expect(html).toContain("Accès administrateurs");
    expect(html).toContain('aria-label="Navigation de la régie"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("Créer un compte");
    expect(html).toContain('autoComplete="new-password"');
    expect(html).toContain("Dernier compte actif protégé");
    expect(html).not.toContain("passwordHash");
  });
});
