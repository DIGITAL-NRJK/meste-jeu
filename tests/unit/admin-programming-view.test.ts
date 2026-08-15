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
  environment: "TEST" as const,
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
    const readyEvent = { ...event, status: "READY" as const };
    const html = renderToStaticMarkup(
      createElement(AdminProgrammingView, {
        admin,
        initialEvents: [readyEvent],
        initialEvent: readyEvent,
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
    expect(html).toContain("Test — joueurs supprimables");
    expect(html).toContain("Ouvrir l’espace joueur");
    expect(html).toContain('href="/play/heritage-congo-2026"');
  });

  it("propose de rouvrir le conducteur d’une session prête, jamais lancée", () => {
    const readyEvent = { ...event, status: "READY" as const };
    const html = renderToStaticMarkup(
      createElement(AdminProgrammingView, {
        admin,
        initialEvents: [readyEvent],
        initialEvent: readyEvent,
        initialSessions: [
          {
            id: "00000000-0000-4000-8000-000000000006",
            eventId: event.id,
            eventSlug: event.slug,
            eventName: event.name,
            name: "Séquence 1",
            slug: "sequence-1",
            mode: "LIVE",
            status: "READY",
            startsAt: null,
            endsAt: null,
            resetScore: false,
            createdAt: event.createdAt,
            updatedAt: event.updatedAt,
            questions: [
              {
                id: "00000000-0000-4000-8000-000000000007",
                questionId: question.id,
                questionText: question.questionText,
                questionStatus: "VALIDATED",
                position: 1,
                durationSeconds: 30,
                status: "PENDING",
                opensAt: null,
                closesAt: null,
                revealedAt: null,
                canceledAt: null,
              },
            ],
          },
        ],
        timeZoneOptions,
        validatedQuestions: [question],
      }),
    );

    expect(html).toContain("Rouvrir le conducteur");
    expect(html).toContain("tant que la session n’a pas été lancée");
  });

  it("ne propose pas de rouvrir une session en direct", () => {
    const liveEvent = { ...event, status: "LIVE" as const };
    const html = renderToStaticMarkup(
      createElement(AdminProgrammingView, {
        admin,
        initialEvents: [liveEvent],
        initialEvent: liveEvent,
        initialSessions: [
          {
            id: "00000000-0000-4000-8000-000000000008",
            eventId: event.id,
            eventSlug: event.slug,
            eventName: event.name,
            name: "Séquence en direct",
            slug: "sequence-live",
            mode: "LIVE",
            status: "LIVE",
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

    expect(html).not.toContain("Rouvrir le conducteur");
  });
});
