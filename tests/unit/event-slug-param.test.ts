import { describe, expect, it } from "vitest";

import { readEventSlugParam } from "@/lib/validation/event-slug";

describe("readEventSlugParam", () => {
  it("accepte un slug valide", () => {
    expect(readEventSlugParam("tombola-fete-independance-66e")).toBe(
      "tombola-fete-independance-66e",
    );
  });

  it("retient la première valeur d’un paramètre répété", () => {
    expect(readEventSlugParam(["premier-evenement", "second"])).toBe(
      "premier-evenement",
    );
  });

  it("ignore un paramètre absent", () => {
    expect(readEventSlugParam(undefined)).toBeUndefined();
  });

  it("ignore un paramètre vide plutôt que de faire échouer la page", () => {
    expect(readEventSlugParam("")).toBeUndefined();
    expect(readEventSlugParam("   ")).toBeUndefined();
    expect(readEventSlugParam([])).toBeUndefined();
  });

  it("ignore un slug malformé", () => {
    expect(readEventSlugParam("Tombola-Fete")).toBeUndefined();
    expect(readEventSlugParam("tombola--fete")).toBeUndefined();
    expect(readEventSlugParam("-tombola")).toBeUndefined();
    expect(readEventSlugParam("tombola-")).toBeUndefined();
    expect(readEventSlugParam("fête-independance")).toBeUndefined();
    expect(readEventSlugParam("tombola fete")).toBeUndefined();
  });

  it("ignore un slug trop long", () => {
    expect(readEventSlugParam("a".repeat(121))).toBeUndefined();
    expect(readEventSlugParam("a".repeat(120))).toBe("a".repeat(120));
  });
});

describe("normalizeEventSlug", () => {
  it("produit un slug accept\u00e9 par les \u00e9crans de r\u00e9gie", async () => {
    const { normalizeEventSlug } = await import(
      "@/server/services/admin-programming"
    );
    const longName =
      "\u00c9v\u00e9nement de test pour v\u00e9rifier le parcours joueur avant la f\u00eate de l\u2019ind\u00e9pendance de la R\u00e9publique du Congo au Ghana";
    const slug = normalizeEventSlug(longName);

    expect(slug.length).toBeLessThanOrEqual(120);
    expect(readEventSlugParam(slug)).toBe(slug);
  });

  it("ne laisse jamais de tiret en fin de slug apr\u00e8s troncature", () => {
    expect(readEventSlugParam("a".repeat(119) + "-b")).toBeUndefined();
  });
});
