import { describe, expect, it } from "vitest";

import {
  formatPoints,
  getDifficultyLabel,
  getLeaderboardPollingDelay,
  getPollingDelay,
  getQuestionProgress,
  getRemainingSeconds,
} from "../../src/lib/game/player-interface";

describe("player interface helpers", () => {
  it("traduit les quatre niveaux sans confondre le Congo avec la RDC", () => {
    expect([1, 2, 3, 4].map(getDifficultyLabel)).toEqual([
      "Découverte",
      "Connaisseur",
      "Expert",
      "Maître du Congo",
    ]);
  });

  it("calcule un compte à rebours borné à partir de l’heure locale informative", () => {
    const closesAt = "2026-08-15T18:31:00.000Z";

    expect(getRemainingSeconds(closesAt, Date.parse("2026-08-15T18:30:30.200Z"))).toBe(30);
    expect(getRemainingSeconds(closesAt, Date.parse("2026-08-15T18:31:01.000Z"))).toBe(0);
  });

  it("borne la progression visuelle entre zéro et un", () => {
    const opensAt = "2026-08-15T18:30:00.000Z";
    const closesAt = "2026-08-15T18:31:00.000Z";

    expect(getQuestionProgress(opensAt, closesAt, Date.parse(opensAt))).toBe(1);
    expect(
      getQuestionProgress(opensAt, closesAt, Date.parse("2026-08-15T18:30:30.000Z")),
    ).toBe(0.5);
    expect(getQuestionProgress(opensAt, closesAt, Date.parse(closesAt))).toBe(0);
  });

  it("ajoute un jitter borné au polling", () => {
    expect(getPollingDelay(-1)).toBe(2_200);
    expect(getPollingDelay(0.5)).toBe(2_700);
    expect(getPollingDelay(2)).toBe(3_200);
  });

  it("rafraîchit le classement avec un polling plus espacé", () => {
    expect(getLeaderboardPollingDelay(-1)).toBe(5_000);
    expect(getLeaderboardPollingDelay(0.5)).toBe(6_000);
    expect(getLeaderboardPollingDelay(2)).toBe(7_000);
  });

  it("formate le score en français", () => {
    expect(formatPoints(1382).replace(/\s/u, " ")).toBe("1 382");
  });
});
