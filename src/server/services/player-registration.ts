import { randomUUID } from "node:crypto";

import {
  createPlayerPublicCode,
  createPlayerSessionToken,
  hashPlayerSessionToken,
  PLAYER_SESSION_TTL_SECONDS,
} from "@/lib/auth/player-session";
import type { PlayerRegistrationInput } from "@/lib/validation/player-registration";

export type PublicPlayer = {
  publicCode: string;
  nickname: string;
  currentStreak: number;
  totalPoints: number;
};

export type PublicEvent = {
  slug: string;
  name: string;
  timezone: string;
  status: "READY" | "LIVE";
};

export type CurrentPlayer = {
  player: PublicPlayer;
  event: Omit<PublicEvent, "status"> & {
    status: "DRAFT" | "READY" | "LIVE" | "FINISHED" | "CANCELED";
  };
};

export type PersistRegistrationInput = {
  playerId: string;
  sessionId: string;
  eventSlug: string;
  nickname: string;
  publicCode: string;
  tokenHash: string;
  expiresAt: Date;
};

export type PersistRegistrationResult =
  | { outcome: "created"; player: PublicPlayer; event: PublicEvent }
  | { outcome: "event_not_found" }
  | { outcome: "registration_unavailable" };

export interface PlayerRepository {
  createRegistration(
    input: PersistRegistrationInput,
  ): Promise<PersistRegistrationResult>;
  findCurrentPlayer(tokenHash: string, now: Date): Promise<CurrentPlayer | null>;
}

export class RegistrationConflictError extends Error {
  constructor(readonly field: "nickname" | "publicCode") {
    super(`Player registration conflict: ${field}`);
    this.name = "RegistrationConflictError";
  }
}

export class EventNotFoundError extends Error {
  constructor() {
    super("Event not found");
    this.name = "EventNotFoundError";
  }
}

export class RegistrationUnavailableError extends Error {
  constructor() {
    super("Registration unavailable");
    this.name = "RegistrationUnavailableError";
  }
}

export class PublicCodeGenerationError extends Error {
  constructor() {
    super("Public player code unavailable");
    this.name = "PublicCodeGenerationError";
  }
}

export class NicknameAlreadyUsedError extends Error {
  constructor() {
    super("Nickname already used");
    this.name = "NicknameAlreadyUsedError";
  }
}

type RegistrationDependencies = {
  repository: PlayerRepository;
  sessionSecret: string;
  now?: () => Date;
  createId?: () => string;
  createPublicCode?: () => string;
  createToken?: () => string;
};

export type PlayerRegistration = CurrentPlayer & {
  session: {
    token: string;
    expiresAt: Date;
  };
};

const MAX_PUBLIC_CODE_ATTEMPTS = 5;

export async function registerPlayer(
  input: PlayerRegistrationInput,
  dependencies: RegistrationDependencies,
): Promise<PlayerRegistration> {
  const now = dependencies.now?.() ?? new Date();
  const expiresAt = new Date(
    now.getTime() + PLAYER_SESSION_TTL_SECONDS * 1_000,
  );
  const playerId = dependencies.createId?.() ?? randomUUID();
  const sessionId = dependencies.createId?.() ?? randomUUID();
  const token = dependencies.createToken?.() ?? createPlayerSessionToken();
  const tokenHash = hashPlayerSessionToken(token, dependencies.sessionSecret);

  for (let attempt = 0; attempt < MAX_PUBLIC_CODE_ATTEMPTS; attempt += 1) {
    const publicCode =
      dependencies.createPublicCode?.() ?? createPlayerPublicCode();

    try {
      const result = await dependencies.repository.createRegistration({
        playerId,
        sessionId,
        eventSlug: input.eventSlug,
        nickname: input.nickname,
        publicCode,
        tokenHash,
        expiresAt,
      });

      if (result.outcome === "event_not_found") {
        throw new EventNotFoundError();
      }

      if (result.outcome === "registration_unavailable") {
        throw new RegistrationUnavailableError();
      }

      return {
        player: result.player,
        event: result.event,
        session: { token, expiresAt },
      };
    } catch (error) {
      if (!(error instanceof RegistrationConflictError)) {
        throw error;
      }

      if (error.field === "nickname") {
        throw new NicknameAlreadyUsedError();
      }

      if (attempt === MAX_PUBLIC_CODE_ATTEMPTS - 1) {
        throw new PublicCodeGenerationError();
      }
    }
  }

  throw new PublicCodeGenerationError();
}

export async function getCurrentPlayer(
  token: string,
  dependencies: Pick<RegistrationDependencies, "repository" | "sessionSecret" | "now">,
): Promise<CurrentPlayer | null> {
  const tokenHash = hashPlayerSessionToken(token, dependencies.sessionSecret);
  const now = dependencies.now?.() ?? new Date();

  return dependencies.repository.findCurrentPlayer(tokenHash, now);
}
