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
