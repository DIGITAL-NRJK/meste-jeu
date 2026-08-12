export const CORRECT_ANSWER_POINTS = 100;
export const MAX_SPEED_BONUS = 30;

export const DIFFICULTY_BONUS = {
  1: 0,
  2: 20,
  3: 40,
  4: 60,
} as const;

export const STREAK_BONUS = {
  3: 20,
  5: 30,
  8: 50,
} as const;

export type Difficulty = keyof typeof DIFFICULTY_BONUS;

export type ScoreBreakdown = {
  answerPoints: number;
  difficultyBonus: number;
  speedBonus: number;
  streakBonus: number;
  totalPoints: number;
  newStreak: number;
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function calculateSpeedBonus(
  opensAt: Date,
  closesAt: Date,
  receivedAt: Date,
): number {
  const durationMs = closesAt.getTime() - opensAt.getTime();

  if (durationMs <= 0) {
    return 0;
  }

  const remainingMs = clamp(
    closesAt.getTime() - receivedAt.getTime(),
    0,
    durationMs,
  );

  return Math.floor((MAX_SPEED_BONUS * remainingMs) / durationMs);
}

export function calculateStreak(
  currentStreak: number,
  isCorrect: boolean,
): { newStreak: number; bonus: number } {
  if (!isCorrect) {
    return { newStreak: 0, bonus: 0 };
  }

  const newStreak = Math.max(0, currentStreak) + 1;

  return {
    newStreak,
    bonus: STREAK_BONUS[newStreak as keyof typeof STREAK_BONUS] ?? 0,
  };
}

export function calculateScore(input: {
  isCorrect: boolean;
  difficulty: Difficulty;
  currentStreak: number;
  opensAt: Date;
  closesAt: Date;
  receivedAt: Date;
}): ScoreBreakdown {
  const streak = calculateStreak(input.currentStreak, input.isCorrect);

  if (!input.isCorrect) {
    return {
      answerPoints: 0,
      difficultyBonus: 0,
      speedBonus: 0,
      streakBonus: 0,
      totalPoints: 0,
      newStreak: streak.newStreak,
    };
  }

  const difficultyBonus = DIFFICULTY_BONUS[input.difficulty];
  const speedBonus = calculateSpeedBonus(
    input.opensAt,
    input.closesAt,
    input.receivedAt,
  );
  const totalPoints =
    CORRECT_ANSWER_POINTS + difficultyBonus + speedBonus + streak.bonus;

  return {
    answerPoints: CORRECT_ANSWER_POINTS,
    difficultyBonus,
    speedBonus,
    streakBonus: streak.bonus,
    totalPoints,
    newStreak: streak.newStreak,
  };
}
