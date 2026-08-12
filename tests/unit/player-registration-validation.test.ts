import { describe, expect, it } from "vitest";

import { playerRegistrationSchema } from "../../src/lib/validation/player-registration";

describe("player registration validation", () => {
  it("normalise le pseudo tout en conservant les caractères Unicode", () => {
    const result = playerRegistrationSchema.parse({
      eventSlug: "heritage-congo-2026",
      nickname: "  Nzambé   242  ",
    });

    expect(result).toEqual({
      eventSlug: "heritage-congo-2026",
      nickname: "Nzambé 242",
    });
  });

  it.each(["AB", "A".repeat(21), "Khen\u0000ny"])(
    "refuse le pseudo invalide %j",
    (nickname) => {
      expect(
        playerRegistrationSchema.safeParse({
          eventSlug: "heritage-congo-2026",
          nickname,
        }).success,
      ).toBe(false);
    },
  );

  it("refuse un slug événement non canonique", () => {
    expect(
      playerRegistrationSchema.safeParse({
        eventSlug: "Héritage Congo",
        nickname: "Makaya",
      }).success,
    ).toBe(false);
  });
});
