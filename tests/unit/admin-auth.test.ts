import { describe, expect, it, vi } from "vitest";

import {
  hashAdminPassword,
  verifyAdminPassword,
} from "../../src/lib/auth/admin-password";
import { hashAdminSessionToken } from "../../src/lib/auth/admin-session";
import {
  AdminInvalidCredentialsError,
  AdminLoginInputError,
  type AdminAuthRepository,
  getAuthenticatedAdmin,
  loginAdmin,
  logoutAdmin,
} from "../../src/server/services/admin-auth";

const adminId = "00000000-0000-4000-8000-000000000001";
const now = new Date("2026-08-13T10:00:00.000Z");
const authSecret = "admin-secret-with-at-least-32-characters";

function repository(): AdminAuthRepository {
  return {
    findUserByEmail: vi.fn(async () => ({
      id: adminId,
      email: "regie@meste.example",
      displayName: "Régie MESTE",
      passwordHash: "encoded-password",
      status: "ACTIVE" as const,
      lockedUntil: null,
    })),
    recordFailedLogin: vi.fn(async () => undefined),
    createSession: vi.fn(async () => undefined),
    findActiveSession: vi.fn(async () => ({
      id: adminId,
      email: "regie@meste.example",
      displayName: "Régie MESTE",
    })),
    revokeSession: vi.fn(async () => undefined),
  };
}

describe("admin password security", () => {
  it("produit un hash scrypt salé et vérifiable", async () => {
    const first = await hashAdminPassword("Congo!Independance2026");
    const second = await hashAdminPassword("Congo!Independance2026");

    expect(first).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(first).not.toBe(second);
    await expect(
      verifyAdminPassword("Congo!Independance2026", first),
    ).resolves.toBe(true);
    await expect(verifyAdminPassword("mot-de-passe-incorrect", first)).resolves.toBe(
      false,
    );
  });

  it("refuse un format de hash inconnu", async () => {
    await expect(verifyAdminPassword("secret", "bcrypt$invalid")).resolves.toBe(
      false,
    );
  });
});

describe("admin authentication service", () => {
  it("crée une session dont seul le HMAC est transmis au repository", async () => {
    const authRepository = repository();
    const result = await loginAdmin(
      { email: " REGIE@MESTE.EXAMPLE ", password: "mot-de-passe" },
      {
        repository: authRepository,
        authSecret,
        now: () => now,
        createToken: () => "raw-admin-token",
        verifyPassword: vi.fn(async () => true),
      },
    );

    expect(result.admin).toEqual({
      id: adminId,
      email: "regie@meste.example",
      displayName: "Régie MESTE",
    });
    expect(result.session.token).toBe("raw-admin-token");
    expect(authRepository.findUserByEmail).toHaveBeenCalledWith(
      "regie@meste.example",
    );
    expect(authRepository.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUserId: adminId,
        tokenHash: hashAdminSessionToken("raw-admin-token", authSecret),
        now,
      }),
    );
    expect(JSON.stringify(result.admin)).not.toContain("password");
  });

  it("enregistre l’échec sans distinguer mot de passe et compte inconnus", async () => {
    const authRepository = repository();

    await expect(
      loginAdmin(
        { email: "regie@meste.example", password: "incorrect" },
        {
          repository: authRepository,
          authSecret,
          now: () => now,
          verifyPassword: vi.fn(async () => false),
        },
      ),
    ).rejects.toBeInstanceOf(AdminInvalidCredentialsError);
    expect(authRepository.recordFailedLogin).toHaveBeenCalledWith(adminId, now);

    vi.mocked(authRepository.findUserByEmail).mockResolvedValueOnce(null);
    await expect(
      loginAdmin(
        { email: "absent@meste.example", password: "incorrect" },
        {
          repository: authRepository,
          authSecret,
          verifyPassword: vi.fn(async () => false),
        },
      ),
    ).rejects.toBeInstanceOf(AdminInvalidCredentialsError);
  });

  it("refuse un compte verrouillé même avec le bon mot de passe", async () => {
    const authRepository = repository();
    vi.mocked(authRepository.findUserByEmail).mockResolvedValueOnce({
      id: adminId,
      email: "regie@meste.example",
      displayName: "Régie MESTE",
      passwordHash: "encoded-password",
      status: "ACTIVE",
      lockedUntil: new Date("2026-08-13T10:10:00.000Z"),
    });

    await expect(
      loginAdmin(
        { email: "regie@meste.example", password: "correct" },
        {
          repository: authRepository,
          authSecret,
          now: () => now,
          verifyPassword: vi.fn(async () => true),
        },
      ),
    ).rejects.toBeInstanceOf(AdminInvalidCredentialsError);
    expect(authRepository.createSession).not.toHaveBeenCalled();
  });

  it("valide les entrées avant tout accès aux données", async () => {
    const authRepository = repository();
    await expect(
      loginAdmin(
        { email: "invalide", password: "" },
        { repository: authRepository, authSecret },
      ),
    ).rejects.toBeInstanceOf(AdminLoginInputError);
    expect(authRepository.findUserByEmail).not.toHaveBeenCalled();
  });

  it("retrouve et révoque une session depuis son empreinte", async () => {
    const authRepository = repository();
    await expect(
      getAuthenticatedAdmin("raw-admin-token", {
        repository: authRepository,
        authSecret,
        now: () => now,
      }),
    ).resolves.toMatchObject({ id: adminId });
    expect(authRepository.findActiveSession).toHaveBeenCalledWith(
      hashAdminSessionToken("raw-admin-token", authSecret),
      now,
    );

    await logoutAdmin("raw-admin-token", {
      repository: authRepository,
      authSecret,
      now: () => now,
    });
    expect(authRepository.revokeSession).toHaveBeenCalledWith(
      hashAdminSessionToken("raw-admin-token", authSecret),
      now,
    );
  });
});
