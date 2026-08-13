import { describe, expect, it } from "vitest";

// @ts-expect-error Le manifeste JavaScript reste directement exécutable par Node.
import { independence66Content } from "../../scripts/data/independence-66-content.mjs";
// @ts-expect-error Le script Node reste exécutable directement sans compilation TypeScript.
import { deterministicUuid, inspectDatabaseUrl, prepareIndependence66Seed, validateIndependence66Content } from "../../scripts/lib/independence-66-seed.mjs";

describe("seed du 66e anniversaire de l’indépendance", () => {
  it("valide le volume éditorial et les six conducteurs", () => {
    expect(validateIndependence66Content(independence66Content)).toEqual({
      categories: 5,
      questions: 50,
      sessions: 6,
      sessionQuestions: 60,
    });
  });

  it("prépare des identifiants stables et les relations attendues", () => {
    const prepared = prepareIndependence66Seed(
      independence66Content,
      "00000000-0000-4000-8000-000000000001",
      new Date("2026-08-13T12:00:00.000Z"),
    );

    expect(prepared.event.timezone).toBe("Africa/Accra");
    expect(prepared.questions).toHaveLength(50);
    expect(prepared.options).toHaveLength(200);
    expect(prepared.questionSources).toHaveLength(50);
    expect(prepared.sessions).toHaveLength(6);
    expect(prepared.sessionQuestions).toHaveLength(60);
    expect(
      new Set(prepared.questions.map(({ id }: { id: string }) => id)).size,
    ).toBe(50);
    expect(deterministicUuid("event", prepared.event.slug)).toBe(
      prepared.event.id,
    );
  });

  it("refuse une URL poolée pour une opération administrative", () => {
    expect(() =>
      inspectDatabaseUrl(
        "postgresql://user:password@example-pooler.neon.tech/database",
      ),
    ).toThrow("URL Neon directe");
  });
});
