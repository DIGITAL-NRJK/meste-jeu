import { describe, expect, it } from "vitest";

import {
  calculateScore,
  calculateSpeedBonus,
  calculateStreak,
} from "../../src/lib/game/scoring";

const opensAt = new Date("2026-08-15T18:30:00.000Z");
const closesAt = new Date("2026-08-15T18:31:00.000Z");

describe("calculateSpeedBonus", () => {
  it("accorde le maximum à l’ouverture", () => {
    expect(calculateSpeedBonus(opensAt, closesAt, opensAt)).toBe(30);
  });

  it("calcule le bonus proportionnel avec un arrondi inférieur", () => {
    expect(
      calculateSpeedBonus(
        opensAt,
        closesAt,
        new Date("2026-08-15T18:30:21.000Z"),
      ),
    ).toBe(19);
  });

  it("borne le bonus entre zéro et trente", () => {
    expect(
      calculateSpeedBonus(
        opensAt,
        closesAt,
        new Date("2026-08-15T18:29:00.000Z"),
      ),
    ).toBe(30);
    expect(calculateSpeedBonus(opensAt, closesAt, closesAt)).toBe(0);
    expect(
      calculateSpeedBonus(
        opensAt,
        closesAt,
        new Date("2026-08-15T18:32:00.000Z"),
      ),
    ).toBe(0);
  });
});

describe("calculateStreak", () => {
  it.each([
    [2, 3, 20],
    [4, 5, 30],
    [7, 8, 50],
  ])(
    "accorde le bonus uniquement au franchissement de %i",
    (currentStreak, newStreak, bonus) => {
      expect(calculateStreak(currentStreak, true)).toEqual({
        newStreak,
        bonus,
      });
      expect(calculateStreak(newStreak, true).bonus).toBe(0);
    },
  );

  it("remet la série à zéro après une mauvaise réponse", () => {
    expect(calculateStreak(7, false)).toEqual({ newStreak: 0, bonus: 0 });
  });
});

describe("calculateScore", () => {
  it.each([
    [1, 0],
    [2, 20],
    [3, 40],
    [4, 60],
  ] as const)("applique le bonus de difficulté %i", (difficulty, bonus) => {
    const score = calculateScore({
      isCorrect: true,
      difficulty,
      currentStreak: 0,
      opensAt,
      closesAt,
      receivedAt: closesAt,
    });

    expect(score.difficultyBonus).toBe(bonus);
    expect(score.totalPoints).toBe(100 + bonus);
  });

  it("additionne réponse, difficulté, vitesse et streak", () => {
    expect(
      calculateScore({
        isCorrect: true,
        difficulty: 3,
        currentStreak: 2,
        opensAt,
        closesAt,
        receivedAt: new Date("2026-08-15T18:30:30.000Z"),
      }),
    ).toEqual({
      answerPoints: 100,
      difficultyBonus: 40,
      speedBonus: 15,
      streakBonus: 20,
      totalPoints: 175,
      newStreak: 3,
    });
  });

  it("n’accorde aucun point et réinitialise le streak en cas d’erreur", () => {
    expect(
      calculateScore({
        isCorrect: false,
        difficulty: 4,
        currentStreak: 7,
        opensAt,
        closesAt,
        receivedAt: opensAt,
      }),
    ).toEqual({
      answerPoints: 0,
      difficultyBonus: 0,
      speedBonus: 0,
      streakBonus: 0,
      totalPoints: 0,
      newStreak: 0,
    });
  });
});
