import { describe, expect, it } from "vitest";

import {
  getTimeZoneOptions,
  localDateTimeToUtcIso,
} from "../../src/lib/date/timezone";

describe("localDateTimeToUtcIso", () => {
  it("interprète l’heure saisie dans le fuseau de Brazzaville", () => {
    expect(
      localDateTimeToUtcIso("2026-08-15T18:00", "Africa/Brazzaville"),
    ).toBe("2026-08-15T17:00:00.000Z");
  });

  it("ne dépend pas du fuseau du navigateur de l’opérateur", () => {
    expect(localDateTimeToUtcIso("2026-08-15T18:00", "Europe/Paris")).toBe(
      "2026-08-15T16:00:00.000Z",
    );
  });

  it("refuse une date locale illisible", () => {
    expect(() =>
      localDateTimeToUtcIso("15 août 2026 à 18 h", "Africa/Brazzaville"),
    ).toThrow(RangeError);
  });

  it("propose les fuseaux techniques attendus en tête de liste", () => {
    expect(getTimeZoneOptions().slice(0, 4)).toEqual([
      { value: "Africa/Accra", label: "Africa/Accra — Accra, Ghana" },
      {
        value: "Africa/Brazzaville",
        label: "Africa/Brazzaville — Brazzaville, Congo",
      },
      { value: "Europe/Paris", label: "Europe/Paris — Paris, France" },
      { value: "UTC", label: "UTC — Temps universel coordonné" },
    ]);
  });
});
