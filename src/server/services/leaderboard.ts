import { z } from "zod";

import { hashPlayerSessionToken } from "@/lib/auth/player-session";
import {
  leaderboardQuerySchema,
  type LeaderboardQuery,
} from "@/lib/validation/leaderboard";

export type LeaderboardEntry = {
  position: number;
  publicCode: string;
  nickname: string;
  points: number;
};

export type Leaderboard = {
  event: {
    slug: string;
    name: string;
    status: "DRAFT" | "READY" | "LIVE" | "FINISHED" | "CANCELED";
  };
  scope:
    | { type: "EVENT" }
    | {
        type: "SESSION";
        id: string;
        name: string;
        status: "DRAFT" | "READY" | "LIVE" | "FINISHED" | "CANCELED";
      };
  entries: LeaderboardEntry[];
  currentPlayer: LeaderboardEntry | null;
  participantCount: number;
};

export type FindLeaderboardInput = LeaderboardQuery & {
  playerTokenHash: string | null;
  now: Date;
  limit: number;
};

export interface LeaderboardRepository {
  findLeaderboard(input: FindLeaderboardInput): Promise<Leaderboard | null>;
}

export class LeaderboardInputError extends Error {
  constructor(readonly issues: z.core.$ZodIssue[]) {
    super("Invalid leaderboard query");
    this.name = "LeaderboardInputError";
  }
}

export class LeaderboardNotFoundError extends Error {
  constructor() {
    super("Leaderboard scope not found");
    this.name = "LeaderboardNotFoundError";
  }
}

type LeaderboardDependencies = {
  repository: LeaderboardRepository;
  sessionSecret: string;
  now?: () => Date;
};

export async function getLeaderboard(
  query: unknown,
  playerToken: string | undefined,
  dependencies: LeaderboardDependencies,
): Promise<Leaderboard> {
  const validation = leaderboardQuerySchema.safeParse(query);

  if (!validation.success) {
    throw new LeaderboardInputError(validation.error.issues);
  }

  const leaderboard = await dependencies.repository.findLeaderboard({
    ...validation.data,
    playerTokenHash: playerToken
      ? hashPlayerSessionToken(playerToken, dependencies.sessionSecret)
      : null,
    now: dependencies.now?.() ?? new Date(),
    limit: 10,
  });

  if (!leaderboard) {
    throw new LeaderboardNotFoundError();
  }

  return leaderboard;
}
