import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { ADMIN_SESSION_COOKIE_NAME } from "../../src/lib/auth/admin-session";

const authRepository = vi.hoisted(() => ({ findActiveSession: vi.fn() }));
const rewardRepository = vi.hoisted(() => ({
  listEvents: vi.fn(),
  listRewards: vi.fn(),
  createReward: vi.fn(),
  updateReward: vi.fn(),
  awardReward: vi.fn(),
  deliverAward: vi.fn(),
}));

vi.mock("@/lib/env/server", () => ({
  getServerEnv: () => ({ ADMIN_AUTH_SECRET: "admin-secret-with-at-least-32-characters" }),
}));
vi.mock("@/server/repositories/admin-auth-repository", () => ({
  postgresAdminAuthRepository: authRepository,
}));
vi.mock("@/server/repositories/admin-rewards-repository", () => ({
  postgresAdminRewardsRepository: rewardRepository,
}));

import { POST as deliverAward } from "../../src/app/api/admin/reward-awards/[id]/actions/route";
import { PUT as updateReward } from "../../src/app/api/admin/rewards/[id]/route";
import { POST as awardReward } from "../../src/app/api/admin/rewards/[id]/awards/route";
import { GET as listRewards, POST as createReward } from "../../src/app/api/admin/rewards/route";

const adminId = "00000000-0000-4000-8000-000000000001";
const eventId = "00000000-0000-4000-8000-000000000002";
const rewardId = "00000000-0000-4000-8000-000000000003";
const playerId = "00000000-0000-4000-8000-000000000004";
const awardId = "00000000-0000-4000-8000-000000000005";
const cookie = `${ADMIN_SESSION_COOKIE_NAME}=raw-admin-token`;
const now = new Date("2026-08-13T12:00:00.000Z");
const event = { id: eventId, slug: "independance-congo-66", name: "Tombola Congo", status: "READY" as const };
const reward = { id: rewardId, eventId, name: "Premier prix", description: null, awardPosition: 1, awardCondition: null, active: true, createdAt: now, updatedAt: now, awards: [] };

function request(url: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  const headers = new Headers(init?.headers);
  headers.set("cookie", cookie);
  headers.set("Content-Type", "application/json");
  return new NextRequest(url, { ...init, headers });
}

describe("admin rewards API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authRepository.findActiveSession.mockResolvedValue({ id: adminId, email: "admin@example.com", displayName: "Régie" });
    rewardRepository.listEvents.mockResolvedValue([event]);
    rewardRepository.listRewards.mockResolvedValue([reward]);
    rewardRepository.createReward.mockResolvedValue(reward);
    rewardRepository.updateReward.mockResolvedValue("written");
    rewardRepository.awardReward.mockResolvedValue("written");
    rewardRepository.deliverAward.mockResolvedValue("written");
  });

  it("protège la liste avant toute lecture métier", async () => {
    const response = await listRewards(new NextRequest("http://localhost/api/admin/rewards"));
    expect(response.status).toBe(401);
    expect(rewardRepository.listEvents).not.toHaveBeenCalled();
  });

  it("liste les lots de l’événement sans cache", async () => {
    const response = await listRewards(request(`http://localhost/api/admin/rewards?eventSlug=${event.slug}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ rewards: [{ name: "Premier prix" }] });
  });

  it("crée et met à jour un lot", async () => {
    const creation = await createReward(request("http://localhost/api/admin/rewards", {
      method: "POST",
      body: JSON.stringify({ eventId, name: "Premier prix", description: null, awardPosition: 1, awardCondition: null }),
    }));
    expect(creation.status).toBe(201);

    const update = await updateReward(request(`http://localhost/api/admin/rewards/${rewardId}`, {
      method: "PUT",
      body: JSON.stringify({ name: "Premier prix", description: null, awardPosition: 1, awardCondition: null, active: false }),
    }), { params: Promise.resolve({ id: rewardId }) });
    expect(update.status).toBe(200);
    expect(rewardRepository.updateReward).toHaveBeenCalledWith(expect.objectContaining({ rewardId, active: false }));
  });

  it("attribue un lot avec l’administrateur authentifié", async () => {
    const response = await awardReward(request(`http://localhost/api/admin/rewards/${rewardId}/awards`, {
      method: "POST",
      body: JSON.stringify({ playerId, notes: "Remise après la finale" }),
    }), { params: Promise.resolve({ id: rewardId }) });
    expect(response.status).toBe(201);
    expect(rewardRepository.awardReward).toHaveBeenCalledWith(expect.objectContaining({ rewardId, playerId, actorAdminId: adminId }));
  });

  it("confirme la remise et refuse toute action inconnue", async () => {
    const response = await deliverAward(request(`http://localhost/api/admin/reward-awards/${awardId}/actions`, {
      method: "POST",
      body: JSON.stringify({ action: "MARK_DELIVERED", notes: null }),
    }), { params: Promise.resolve({ id: awardId }) });
    expect(response.status).toBe(200);
    expect(rewardRepository.deliverAward).toHaveBeenCalledWith(expect.objectContaining({ awardId, actorAdminId: adminId }));

    const invalid = await deliverAward(request(`http://localhost/api/admin/reward-awards/${awardId}/actions`, {
      method: "POST",
      body: JSON.stringify({ action: "DELETE" }),
    }), { params: Promise.resolve({ id: awardId }) });
    expect(invalid.status).toBe(400);
  });
});
