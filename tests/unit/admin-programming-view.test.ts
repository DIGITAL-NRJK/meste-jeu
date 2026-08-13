import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import { AdminProgrammingView } from "../../src/components/admin/admin-programming-view";

const admin = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "admin@example.com",
  displayName: "Régie MESTE",
};
const event = {
  id: "00000000-0000-4000-8000-000000000002",
  slug: "heritage-congo-2026",
  name: "Héritage Congo 2026",
  description: null,
  startsAt: "2026-08-15T16:00:00.000Z",
  endsAt: "2026-08-15T22:00:00.000Z",
  timezone: "Africa/Brazzaville",
  status: "DRAFT" as const,
  createdAt: "2026-08-13T12:00:00.000Z",
  updatedAt: "2026-08-13T12:00:00.000Z",
};
const question = {
  id: "00000000-0000-4000-8000-000000000003",
  questionText: "En quelle année la République du Congo est-elle devenue indépendante ?",
  difficulty: 1,
  category: {
    id: "00000000-0000-4000-8000-000000000004",
    name: "Histoire",
  },
};
const timeZoneOptions = [
  { value: "Africa/Accra", label: "Africa/Accra — Accra, Ghana" },
  {
    value: "Africa/Brazzaville",
    label: "Africa/Brazzaville — Brazzaville, Congo",
  },
];

describe("AdminProgrammingView", () => {
  it("guide la création du premier événement depuis un état vide", () => {
    const html = renderToStaticMarkup(
      createElement(AdminProgrammingView, {
        admin,
        initialEvents: [],
        initialEvent: null,
        initialSessions: [],
        timeZoneOptions,
        validatedQuestions: [],
      }),
    );

    expect(html).toContain("Le conducteur");
    expect(html).toContain("Créer un événement");
    expect(html).toContain("Africa/Accra — Accra, Ghana");
    expect(html).toContain("Africa/Brazzaville");
    expect(html).toContain("<select required=\"\"");
  });

  it("présente uniquement la réserve validée et le conducteur ordonné", () => {
    const html = renderToStaticMarkup(
      createElement(AdminProgrammingView, {
        admin,
        initialEvents: [event],
        initialEvent: event,
        initialSessions: [
          {
            id: "00000000-0000-4000-8000-000000000005",
            eventId: event.id,
            eventSlug: event.slug,
            eventName: event.name,
            name: "Grand Quiz",
            slug: "grand-quiz",
            mode: "LIVE",
            status: "DRAFT",
            startsAt: null,
            endsAt: null,
            resetScore: false,
            createdAt: event.createdAt,
            updatedAt: event.updatedAt,
            questions: [],
          },
        ],
        timeZoneOptions,
        validatedQuestions: [question],
      }),
    );

    expect(html).toContain("Réserve validée");
    expect(html).toContain("Ordre de passage");
    expect(html).toContain("République du Congo");
    expect(html).toContain("Verrouiller et rendre prête");
  });
});
