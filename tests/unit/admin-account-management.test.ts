import { describe, expect, it, vi } from "vitest";

import {
  AdminAccountAlreadyInStatusError,
  AdminAccountEmailConflictError,
  AdminAccountInputError,
  AdminAccountLastActiveError,
  AdminAccountNotFoundError,
  changeAdminAccountStatus,
  createAdminAccount,
  getAdminAccounts,
  type AdminAccount,
  type AdminAccountManagementRepository,
} from "../../src/server/services/admin-account-management";

const actorId = "00000000-0000-4000-8000-000000000001";
const accountId = "00000000-0000-4000-8000-000000000002";
const now = new Date("2026-08-13T12:00:00.000Z");
const account: AdminAccount = {
  id: accountId,
  email: "second@example.com",
  displayName: "Seconde régie",
  status: "ACTIVE",
  createdAt: now,
  updatedAt: now,
  lastLoginAt: null,
};

function repository(
  overrides: Partial<AdminAccountManagementRepository> = {},
): AdminAccountManagementRepository {
  return {
    listAccounts: vi.fn(async () => [account]),
    findAccountById: vi.fn(async () => account),
    createAccount: vi.fn(async () => "written" as const),
    setAccountStatus: vi.fn(async () => "written" as const),
    ...overrides,
  };
}

describe("admin account management service", () => {
  it("liste uniquement les DTO administrateurs sûrs", async () => {
    await expect(getAdminAccounts(repository())).resolves.toEqual([account]);
    expect(JSON.stringify(account)).not.toContain("password");
  });

  it("normalise l’adresse et hache le mot de passe avant le repository", async () => {
    const accountsRepository = repository();
    const hashPassword = vi.fn(async () => "scrypt$hash-test");

    await expect(
      createAdminAccount(
        {
          displayName: "  Seconde régie  ",
          email: "  SECOND@EXAMPLE.COM  ",
          password: "MotDePasse!2026",
          passwordConfirmation: "MotDePasse!2026",
        },
        actorId,
        {
          repository: accountsRepository,
          createId: () => accountId,
          now: () => now,
          hashPassword,
        },
      ),
    ).resolves.toEqual(account);

    expect(hashPassword).toHaveBeenCalledWith("MotDePasse!2026");
    expect(accountsRepository.createAccount).toHaveBeenCalledWith({
      id: accountId,
      email: "second@example.com",
      displayName: "Seconde régie",
      passwordHash: "scrypt$hash-test",
      actorAdminId: actorId,
      now,
    });
  });

  it("refuse les mots de passe faibles ou dont la confirmation diffère", async () => {
    const accountsRepository = repository();
    const common = {
      displayName: "Seconde régie",
      email: "second@example.com",
    };

    await expect(
      createAdminAccount(
        { ...common, password: "trop-court", passwordConfirmation: "trop-court" },
        actorId,
        { repository: accountsRepository },
      ),
    ).rejects.toBeInstanceOf(AdminAccountInputError);
    await expect(
      createAdminAccount(
        {
          ...common,
          password: "MotDePasse!2026",
          passwordConfirmation: "AutrePasse!2026",
        },
        actorId,
        { repository: accountsRepository },
      ),
    ).rejects.toBeInstanceOf(AdminAccountInputError);
    expect(accountsRepository.createAccount).not.toHaveBeenCalled();
  });

  it("distingue un conflit d’adresse après la tentative atomique", async () => {
    await expect(
      createAdminAccount(
        {
          displayName: "Seconde régie",
          email: "second@example.com",
          password: "MotDePasse!2026",
          passwordConfirmation: "MotDePasse!2026",
        },
        actorId,
        {
          repository: repository({
            createAccount: vi.fn(async () => "email_conflict" as const),
          }),
          hashPassword: vi.fn(async () => "scrypt$hash-test"),
        },
      ),
    ).rejects.toBeInstanceOf(AdminAccountEmailConflictError);
  });

  it("transmet l’acteur et le statut demandé à la mutation", async () => {
    const accountsRepository = repository({
      findAccountById: vi.fn(async () => ({
        ...account,
        status: "DISABLED" as const,
      })),
    });

    await changeAdminAccountStatus(accountId, { action: "DISABLE" }, actorId, {
      repository: accountsRepository,
      now: () => now,
    });
    expect(accountsRepository.setAccountStatus).toHaveBeenCalledWith({
      accountId,
      status: "DISABLED",
      actorAdminId: actorId,
      now,
    });
  });

  it.each([
    ["not_found", AdminAccountNotFoundError],
    ["already_status", AdminAccountAlreadyInStatusError],
    ["last_active", AdminAccountLastActiveError],
  ] as const)("convertit l’issue repository %s", async (outcome, ErrorType) => {
    await expect(
      changeAdminAccountStatus(accountId, { action: "DISABLE" }, actorId, {
        repository: repository({
          setAccountStatus: vi.fn(async () => outcome),
        }),
      }),
    ).rejects.toBeInstanceOf(ErrorType);
  });
});
