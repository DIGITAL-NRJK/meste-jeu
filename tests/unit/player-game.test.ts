import { describe, expect, it, vi } from "vitest";

import {
  getPlayerGameEventState,
  PlayerGameEventNotFoundError,
  PlayerGameInputError,
  type PlayerGameEventState,
  type PlayerGameRepository,
} from "../../src/server/services/player-game";

const state: PlayerGameEventState = {
  event: {
    slug: "heritage-congo-2026",
    name: "Héritage Congo 2026",
    status: "LIVE",
  },
  session: {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Grand Quiz de l’Indépendance",
    mode: "LIVE",
    status: "LIVE",
    startsAt: new Date("2026-08-15T18:30:00.000Z"),
    endsAt: null,
    currentQuestion: null,
  },
};

describe("player game service", () => {
  it("retourne le DTO léger de l’événement", async () => {
    const repository: PlayerGameRepository = {
      findEventState: vi.fn(async () => state),
    };

    await expect(
      getPlayerGameEventState("heritage-congo-2026", repository),
    ).resolves.toBe(state);
    expect(repository.findEventState).toHaveBeenCalledWith(
      "heritage-congo-2026",
    );
  });

  it("refuse un slug invalide avant le repository", async () => {
    const repository: PlayerGameRepository = {
      findEventState: vi.fn(async () => state),
    };

    await expect(
      getPlayerGameEventState("Héritage Congo", repository),
    ).rejects.toBeInstanceOf(PlayerGameInputError);
    expect(repository.findEventState).not.toHaveBeenCalled();
  });

  it("signale un événement absent", async () => {
    const repository: PlayerGameRepository = {
      findEventState: vi.fn(async () => null),
    };

    await expect(
      getPlayerGameEventState("heritage-congo-2026", repository),
    ).rejects.toBeInstanceOf(PlayerGameEventNotFoundError);
  });
});
