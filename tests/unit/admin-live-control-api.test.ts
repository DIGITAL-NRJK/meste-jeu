import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE_NAME } from "../../src/lib/auth/admin-session";

const authRepository = vi.hoisted(() => ({ findActiveSession: vi.fn() }));
const sessionRepository = vi.hoisted(() => ({ getSession: vi.fn(), markReady: vi.fn(), resetToDraft: vi.fn() }));
vi.mock("@/lib/env/server", () => ({ getServerEnv: () => ({ ADMIN_AUTH_SECRET: "admin-secret-with-at-least-32-characters" }) }));
vi.mock("@/server/repositories/admin-auth-repository", () => ({ postgresAdminAuthRepository: authRepository }));
vi.mock("@/server/repositories/session-engine-repository", () => ({ postgresSessionEngineRepository: sessionRepository }));

import { POST } from "../../src/app/api/admin/live-control/route";

const sessionId = "00000000-0000-4000-8000-000000000002";
const session = { id: sessionId, eventId: sessionId, eventSlug: "event", eventName: "Event", name: "Live", slug: "live", mode: "LIVE", status: "READY", startsAt: null, endsAt: null, resetScore: false, createdAt: new Date(), updatedAt: new Date(), questions: [] };

describe("admin live control API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authRepository.findActiveSession.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000001", email: "admin@example.com", displayName: "Admin" });
    sessionRepository.markReady.mockResolvedValue("transitioned");
    sessionRepository.resetToDraft.mockResolvedValue("transitioned");
    sessionRepository.getSession.mockResolvedValue(session);
  });

  it("refuse une commande sans session admin", async () => {
    const response = await POST(new NextRequest("http://localhost/api/admin/live-control", { method: "POST", body: "{}" }));
    expect(response.status).toBe(401);
    expect(sessionRepository.markReady).not.toHaveBeenCalled();
  });

  it("exécute une transition authentifiée sans mise en cache", async () => {
    const response = await POST(new NextRequest("http://localhost/api/admin/live-control", { method: "POST", headers: { cookie: `${ADMIN_SESSION_COOKIE_NAME}=token` }, body: JSON.stringify({ action: "MARK_READY", sessionId }) }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(sessionRepository.markReady).toHaveBeenCalled();
  });

  it("refuse une commande mal formée", async () => {
    const response = await POST(new NextRequest("http://localhost/api/admin/live-control", { method: "POST", headers: { cookie: `${ADMIN_SESSION_COOKIE_NAME}=token` }, body: JSON.stringify({ action: "INVENTED", sessionId }) }));
    expect(response.status).toBe(400);
  });

  it("rouvre le conducteur d’une session prête", async () => {
    const response = await POST(new NextRequest("http://localhost/api/admin/live-control", { method: "POST", headers: { cookie: `${ADMIN_SESSION_COOKIE_NAME}=token` }, body: JSON.stringify({ action: "RESET_SESSION_DRAFT", sessionId }) }));
    expect(response.status).toBe(200);
    expect(sessionRepository.resetToDraft).toHaveBeenCalled();
  });

  it("explique le refus quand la session a déjà été jouée", async () => {
    sessionRepository.resetToDraft.mockResolvedValue("already_played");
    const response = await POST(new NextRequest("http://localhost/api/admin/live-control", { method: "POST", headers: { cookie: `${ADMIN_SESSION_COOKIE_NAME}=token` }, body: JSON.stringify({ action: "RESET_SESSION_DRAFT", sessionId }) }));
    expect(response.status).toBe(409);
    const payload = (await response.json()) as { error: { code: string; message: string } };
    expect(payload.error.code).toBe("SESSION_ALREADY_PLAYED");
    expect(payload.error.message).toContain("déjà été jouée");
  });
});
