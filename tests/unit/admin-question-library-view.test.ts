import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

import { AdminQuestionLibraryView } from "../../src/components/admin/admin-question-library-view";

const category = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Histoire",
  slug: "histoire",
  description: "Repères historiques de la République du Congo.",
  active: true,
};

describe("AdminQuestionLibraryView", () => {
  it("présente la bibliothèque, le cycle éditorial et les catégories", () => {
    const html = renderToStaticMarkup(
      createElement(AdminQuestionLibraryView, {
        admin: {
          id: "00000000-0000-4000-8000-000000000002",
          email: "admin@example.com",
          displayName: "Régie MESTE",
        },
        initialCategories: [category],
        initialQuestions: [
          {
            id: "00000000-0000-4000-8000-000000000003",
            category,
            questionText:
              "En quelle année le Congo a-t-il accédé à l’indépendance ?",
            difficulty: 1,
            status: "DRAFT",
            mediaType: "TEXT",
            mediaUrl: null,
            createdAt: "2026-08-13T12:00:00.000Z",
            updatedAt: "2026-08-13T12:00:00.000Z",
            validatedAt: null,
            optionCount: 2,
            sourceCount: 1,
          },
        ],
      }),
    );

    expect(html).toContain("Questions &amp; catégories");
    expect(html).toContain("Brouillon");
    expect(html).toContain("Revue");
    expect(html).toContain("Validée");
    expect(html).toContain("Nouvelle question");
    expect(html).toContain("Histoire");
    expect(html).toContain("Choisissez une fiche");
  });
});
