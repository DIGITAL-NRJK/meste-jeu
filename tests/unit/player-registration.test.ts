import { describe, expect, it, vi } from "vitest";

import { hashPlayerSessionToken } from "../../src/lib/auth/player-session";
import {
  EventNotFoundError,
  getCurrentPlayer,
  NicknameAlreadyUsedError,
  PublicCodeGenerationError,
  registerPlayer,
  RegistrationConflictError,
  RegistrationUnavailableError,
  type PersistRegistrationInput,
  type PlayerRepository,
} from "../../src/server/services/player-registration";

const now = new Date("2026-08-12T12:00:00.000Z");
const sessionSecret = "session-secret-with-at-least-32-characters";

function createdResult(input: PersistRegistrationInput) {
  return {
    outcome: "created" as const,
    player: {
      publicCode: input.publicCode,
      nickname: input.nickname,
      currentStreak: 0,
      totalPoints: 0,
    },
    event: {
      slug: input.eventSlug,
      name: "Héritage Congo 2026",
      timezone: "Africa/Accra",
      status: "READY" as const,
    },
  };
}

function createRepository(
  createRegistration: PlayerRepository["createRegistration"],
): PlayerRepository {
  return {
    createRegistration,
    findCurrentPlayer: vi.fn().mockResolvedValue(null),
  };
}

describe("registerPlayer", () => {
  it("crée le joueur et persiste uniquement l’empreinte du token", async () => {
    const persistedInputs: PersistRegistrationInput[] = [];
    const repository = createRepository(async (input) => {
      persistedInputs.push(input);
      return createdResult(input);
    });

    const registration = await registerPlayer(
      { eventSlug: "heritage-congo-2026", nickname: "Makaya" },
      {
        repository,
        sessionSecret,
        now: () => now,
        createId: vi
          .fn()
          .mockReturnValueOnce("00000000-0000-4000-8000-000000000001")
          .mockReturnValueOnce("00000000-0000-4000-8000-000000000002"),
        createPublicCode: () => "HC-084200",
        createToken: () => "raw-session-token",
      },
    );

    expect(registration).toMatchObject({
      player: {
        publicCode: "HC-084200",
        nickname: "Makaya",
        currentStreak: 0,
        totalPoints: 0,
      },
      event: { slug: "heritage-congo-2026", status: "READY" },
      session: { token: "raw-session-token" },
    });
    expect(registration.session.expiresAt.toISOString()).toBe(
      "2026-09-11T12:00:00.000Z",
    );
    expect(persistedInputs).toHaveLength(1);
    expect(persistedInputs[0]).not.toHaveProperty("token");
    expect(persistedInputs[0]?.tokenHash).toBe(
      hashPlayerSessionToken("raw-session-token", sessionSecret),
    );
  });

  it("refuse un pseudo déjà utilisé sans créer une seconde identité", async () => {
    const repository = createRepository(async () => {
      throw new RegistrationConflictError("nickname");
    });

    await expect(
      registerPlayer(
        { eventSlug: "heritage-congo-2026", nickname: "Makaya" },
        { repository, sessionSecret },
      ),
    ).rejects.toBeInstanceOf(NicknameAlreadyUsedError);
  });

  it("retente automatiquement une collision de code public", async () => {
    const createPublicCode = vi
      .fn()
      .mockReturnValueOnce("HC-000001")
      .mockReturnValueOnce("HC-000002");
    const createRegistration = vi
      .fn<PlayerRepository["createRegistration"]>()
      .mockRejectedValueOnce(new RegistrationConflictError("publicCode"))
      .mockImplementationOnce(async (input) => createdResult(input));
    const repository = createRepository(createRegistration);

    const result = await registerPlayer(
      { eventSlug: "heritage-congo-2026", nickname: "Makaya" },
      { repository, sessionSecret, createPublicCode },
    );

    expect(result.player.publicCode).toBe("HC-000002");
    expect(createRegistration).toHaveBeenCalledTimes(2);
  });

  it("échoue proprement si aucun code public ne peut être réservé", async () => {
    const createRegistration = vi
      .fn<PlayerRepository["createRegistration"]>()
      .mockRejectedValue(new RegistrationConflictError("publicCode"));

    await expect(
      registerPlayer(
        { eventSlug: "heritage-congo-2026", nickname: "Makaya" },
        {
          repository: createRepository(createRegistration),
          sessionSecret,
          createPublicCode: () => "HC-000001",
        },
      ),
    ).rejects.toBeInstanceOf(PublicCodeGenerationError);
    expect(createRegistration).toHaveBeenCalledTimes(5);
  });

  it("distingue un événement absent d’une inscription fermée", async () => {
    const missingEventRepository = createRepository(async () => ({
      outcome: "event_not_found",
    }));
    const closedEventRepository = createRepository(async () => ({
      outcome: "registration_unavailable",
    }));

    await expect(
      registerPlayer(
        { eventSlug: "missing", nickname: "Makaya" },
        { repository: missingEventRepository, sessionSecret },
      ),
    ).rejects.toBeInstanceOf(EventNotFoundError);

    await expect(
      registerPlayer(
        { eventSlug: "closed", nickname: "Makaya" },
        { repository: closedEventRepository, sessionSecret },
      ),
    ).rejects.toBeInstanceOf(RegistrationUnavailableError);
  });
});

describe("getCurrentPlayer", () => {
  it("retrouve le joueur à partir de l’empreinte du cookie", async () => {
    const findCurrentPlayer = vi.fn().mockResolvedValue({
      player: {
        publicCode: "HC-084200",
        nickname: "Makaya",
        currentStreak: 0,
        totalPoints: 0,
      },
      event: {
        slug: "heritage-congo-2026",
        name: "Héritage Congo 2026",
        timezone: "Africa/Accra",
        status: "READY",
      },
    });
    const repository: PlayerRepository = {
      createRegistration: vi.fn(),
      findCurrentPlayer,
    };

    const result = await getCurrentPlayer("raw-session-token", {
      repository,
      sessionSecret,
      now: () => now,
    });

    expect(result?.player.nickname).toBe("Makaya");
    expect(findCurrentPlayer).toHaveBeenCalledWith(
      hashPlayerSessionToken("raw-session-token", sessionSecret),
      now,
    );
  });
});
