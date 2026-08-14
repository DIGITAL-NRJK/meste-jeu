import { describe, expect, it } from "vitest";

import { toDate, toNullableDate } from "@/lib/db/row-values";

const STRICT_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe("toDate", () => {
  it("convertit le texte PostgreSQL renvoyé par le pilote HTTP Neon", () => {
    const date = toDate("2026-08-15 18:30:00.123456+00");

    expect(date).toBeInstanceOf(Date);
    expect(date.toISOString()).toBe("2026-08-15T18:30:00.123Z");
  });

  it("produit une date sérialisable en ISO 8601 strict", () => {
    expect(toDate("2026-08-15 18:30:00.123456+00").toISOString()).toMatch(
      STRICT_ISO,
    );
    expect(JSON.parse(JSON.stringify(toDate("2026-08-15 18:30:00+00")))).toMatch(
      STRICT_ISO,
    );
  });

  it("gère un décalage horaire non nul", () => {
    expect(toDate("2026-08-15 20:30:00+02").toISOString()).toBe(
      "2026-08-15T18:30:00.000Z",
    );
    expect(toDate("2026-08-15 15:30:00-03:00").toISOString()).toBe(
      "2026-08-15T18:30:00.000Z",
    );
  });

  it("accepte déjà une Date, un nombre ou une chaîne ISO", () => {
    const reference = new Date("2026-08-15T18:30:00.000Z");

    expect(toDate(reference)).toBe(reference);
    expect(toDate(reference.getTime()).toISOString()).toBe(
      reference.toISOString(),
    );
    expect(toDate("2026-08-15T18:30:00.000Z").toISOString()).toBe(
      reference.toISOString(),
    );
  });

  it("refuse une valeur illisible au lieu de propager une date invalide", () => {
    expect(() => toDate("pas une date")).toThrow(TypeError);
  });
});

describe("toNullableDate", () => {
  it("préserve l’absence de valeur", () => {
    expect(toNullableDate(null)).toBeNull();
    expect(toNullableDate(undefined)).toBeNull();
  });

  it("convertit une valeur présente", () => {
    expect(toNullableDate("2026-08-15 18:30:00+00")?.toISOString()).toBe(
      "2026-08-15T18:30:00.000Z",
    );
  });
});
