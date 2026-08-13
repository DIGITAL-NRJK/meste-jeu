import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { ADMIN_SESSION_COOKIE_NAME } from "../../src/lib/auth/admin-session";

const authRepository = vi.hoisted(() => ({ findActiveSession: vi.fn() }));
const playerRepository = vi.hoisted(() => ({
  listEvents: vi.fn(),
  listPlayers: vi.fn(),
  getPlayer: vi.fn(),
  disablePlayer: vi.fn(),
  appendScoreAdjustment: vi.fn(),
}));

vi.mock("@/lib/env/server", () => ({
  getServerEnv: () => ({
    ADMIN_AUTH_SECRET: "admin-secret-with-at-least-32-characters",
  }),
}));
vi.mock("@/server/repositories/admin-auth-repository", () => ({
  postgresAdminAuthRepository: authRepository,
}));
vi.mock("@/server/repositories/admin-player-management-repository", () => ({
  postgresAdminPlayerManagementRepository: playerRepository,
}));

import { GET as listPlayers } from "../../src/app/api/admin/players/route";
import { GET as getPlayer } from "../../src/app/api/admin/players/[id]/route";
import { POST as runPlayerAction } from "../../src/app/api/admin/players/[id]/actions/route";

const adminId = "00000000-0000-4000-8000-000000000001";
const eventId = "00000000-0000-4000-8000-000000000002";
const playerId = "00000000-0000-4000-8000-000000000003";
const cookie = `${ADMIN_SESSION_COOKIE_NAME}=raw-admin-token`;
const now = new Date("2026-08-13T12:00:00.000Z");
const event = {
  id: eventId,
  slug: "independance-congo-66",
  name: "Tombola — 66e anniversaire",
  status: "READY" as const,
};
const player = {
  id: playerId,
  event,
  publicCode: "AB12CD",
  nickname: "Mwana",
  status: "ACTIVE" as const,
  currentStreak: 2,
  totalPoints: 250,
  answerCount: 0,
  createdAt: now,
  lastSeenAt: now,
  answers: [],
  scoreSessions: [
    {
      id: "00000000-0000-4000-8000-000000000004",
      name: "Session générale",
      mode: "LIVE" as const,
      status: "READY" as const,
      resetScore: false,
      points: 250,
    },
  ],
  scoreAdjustments: [],
};

function request(
  url: string,
  init?: ConstructorParameters<typeof NextRequest>[1],
) {
  const headers = new Headers(init?.headers);
  headers.set("cookie", cookie);
  headers.set("Content-Type", "application/json");
  return new NextRequest(url, { ...init, headers });
}

describe("admin player management API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authRepository.findActiveSession.mockResolvedValue({
      id: adminId,
      email: "admin@example.com",
      displayName: "Régie MESTE",
    });
    playerRepository.listEvents.mockResolvedValue([event]);
    playerRepository.listPlayers.mockResolvedValue([player]);
    playerRepository.getPlayer.mockResolvedValue(player);
    playerRepository.disablePlayer.mockResolvedValue("disabled");
    playerRepository.appendScoreAdjustment.mockResolvedValue("created");
  });

  it("protège la liste avant toute lecture métier", async () => {
    const response = await listPlayers(
      new NextRequest("http://localhost/api/admin/players"),
    );

    expect(response.status).toBe(401);
    expect(playerRepository.listEvents).not.toHaveBeenCalled();
  });

  it("recherche par événement, pseudo ou code et désactive le cache", async () => {
    const response = await listPlayers(
      request(
        `http://localhost/api/admin/players?eventSlug=${event.slug}&search=AB12&status=ACTIVE&limit=25`,
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(playerRepository.listPlayers).toHaveBeenCalledWith({
      eventId,
      search: "AB12",
      status: "ACTIVE",
      limit: 25,
    });
  });

  it("consulte la fiche d’un joueur authentifié", async () => {
    const response = await getPlayer(
      request(`http://localhost/api/admin/players/${playerId}`),
      { params: Promise.resolve({ id: playerId }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      player: { publicCode: "AB12CD", totalPoints: 250 },
    });
  });

  it("désactive avec l’identité de l’administrateur", async () => {
    playerRepository.getPlayer.mockResolvedValue({ ...player, status: "DISABLED" });
    const response = await runPlayerAction(
      request(`http://localhost/api/admin/players/${playerId}/actions`, {
        method: "POST",
        body: JSON.stringify({ action: "DISABLE" }),
      }),
      { params: Promise.resolve({ id: playerId }) },
    );

    expect(response.status).toBe(200);
    expect(playerRepository.disablePlayer).toHaveBeenCalledWith(
      expect.objectContaining({ playerId, actorAdminId: adminId }),
    );
  });

  it("ajoute un ajustement signé avec motif et identité administrateur", async () => {
    playerRepository.getPlayer.mockResolvedValue({ ...player, totalPoints: 200 });
    const response = await runPlayerAction(
      request(`http://localhost/api/admin/players/${playerId}/actions`, {
        method: "POST",
        body: JSON.stringify({
          action: "ADJUST_SCORE",
          quizSessionId: player.scoreSessions[0].id,
          points: -50,
          reason: "Correction validée par la régie",
        }),
      }),
      { params: Promise.resolve({ id: playerId }) },
    );

    expect(response.status).toBe(200);
    expect(playerRepository.appendScoreAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({
        playerId,
        quizSessionId: player.scoreSessions[0].id,
        points: -50,
        reason: "Correction validée par la régie",
        actorAdminId: adminId,
      }),
    );
    await expect(response.json()).resolves.toMatchObject({
      player: { totalPoints: 200 },
    });
  });

  it("refuse un ajustement nul ou sans motif exploitable", async () => {
    const response = await runPlayerAction(
      request(`http://localhost/api/admin/players/${playerId}/actions`, {
        method: "POST",
        body: JSON.stringify({
          action: "ADJUST_SCORE",
          quizSessionId: player.scoreSessions[0].id,
          points: 0,
          reason: "Non",
        }),
      }),
      { params: Promise.resolve({ id: playerId }) },
    );

    expect(response.status).toBe(400);
    expect(playerRepository.appendScoreAdjustment).not.toHaveBeenCalled();
  });

  it("refuse une action inconnue sans modifier le joueur", async () => {
    const response = await runPlayerAction(
      request(`http://localhost/api/admin/players/${playerId}/actions`, {
        method: "POST",
        body: JSON.stringify({ action: "DELETE" }),
      }),
      { params: Promise.resolve({ id: playerId }) },
    );

    expect(response.status).toBe(400);
    expect(playerRepository.disablePlayer).not.toHaveBeenCalled();
    expect(playerRepository.appendScoreAdjustment).not.toHaveBeenCalled();
  });
});
