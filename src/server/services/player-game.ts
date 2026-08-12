import { z } from "zod";

import { eventSlugSchema } from "@/lib/validation/player-registration";

export type PlayerGameEventState = {
  event: {
    slug: string;
    name: string;
    status: "DRAFT" | "READY" | "LIVE" | "FINISHED" | "CANCELED";
  };
  session: {
    id: string;
    name: string;
    mode: "DISCOVERY" | "LIVE";
    status: "DRAFT" | "READY" | "LIVE" | "FINISHED" | "CANCELED";
    startsAt: Date | null;
    endsAt: Date | null;
    currentQuestion: {
      id: string;
      status: "OPEN" | "CLOSED" | "REVEALED" | "CANCELED";
      opensAt: Date;
      closesAt: Date;
      revealedAt: Date | null;
      canceledAt: Date | null;
    } | null;
  } | null;
};

export interface PlayerGameRepository {
  findEventState(eventSlug: string): Promise<PlayerGameEventState | null>;
}

export class PlayerGameInputError extends Error {
  constructor(readonly issues: z.core.$ZodIssue[]) {
    super("Invalid player game input");
    this.name = "PlayerGameInputError";
  }
}

export class PlayerGameEventNotFoundError extends Error {
  constructor() {
    super("Player game event not found");
    this.name = "PlayerGameEventNotFoundError";
  }
}

export async function getPlayerGameEventState(
  eventSlug: string,
  repository: PlayerGameRepository,
): Promise<PlayerGameEventState> {
  const validation = eventSlugSchema.safeParse(eventSlug);

  if (!validation.success) {
    throw new PlayerGameInputError(validation.error.issues);
  }

  const state = await repository.findEventState(validation.data);

  if (!state) {
    throw new PlayerGameEventNotFoundError();
  }

  return state;
}
