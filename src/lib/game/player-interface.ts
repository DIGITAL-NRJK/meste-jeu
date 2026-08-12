const POLL_MINIMUM_MS = 2_200;
const POLL_JITTER_MS = 1_000;

export const DIFFICULTY_LABELS = {
  1: "Découverte",
  2: "Connaisseur",
  3: "Expert",
  4: "Maître du Congo",
} as const;

export function getDifficultyLabel(difficulty: number): string {
  return DIFFICULTY_LABELS[difficulty as keyof typeof DIFFICULTY_LABELS] ??
    "Découverte";
}

export function getRemainingSeconds(closesAt: string | Date, nowMs: number): number {
  const remainingMs = new Date(closesAt).getTime() - nowMs;
  return Math.max(0, Math.ceil(remainingMs / 1_000));
}

export function getQuestionProgress(
  opensAt: string | Date,
  closesAt: string | Date,
  nowMs: number,
): number {
  const opensAtMs = new Date(opensAt).getTime();
  const closesAtMs = new Date(closesAt).getTime();
  const durationMs = closesAtMs - opensAtMs;

  if (durationMs <= 0) {
    return 0;
  }

  return Math.min(1, Math.max(0, (closesAtMs - nowMs) / durationMs));
}

export function getPollingDelay(randomValue: number): number {
  const normalized = Math.min(1, Math.max(0, randomValue));
  return POLL_MINIMUM_MS + Math.floor(normalized * POLL_JITTER_MS);
}

export function getLeaderboardPollingDelay(randomValue: number): number {
  const normalized = Math.min(1, Math.max(0, randomValue));
  return 5_000 + Math.floor(normalized * 2_000);
}

export function formatPoints(points: number): string {
  return new Intl.NumberFormat("fr-FR").format(points);
}
