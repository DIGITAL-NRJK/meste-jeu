import { randomUUID } from "node:crypto";

import { z } from "zod";

import { hashAdminPassword } from "@/lib/auth/admin-password";

export type AdminAccount = {
  id: string;
  email: string;
  displayName: string;
  status: "ACTIVE" | "DISABLED";
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
};

export type AdminAccountStatusOutcome =
  | "written"
  | "not_found"
  | "already_status"
  | "last_active";

export interface AdminAccountManagementRepository {
  listAccounts(): Promise<AdminAccount[]>;
  findAccountById(accountId: string): Promise<AdminAccount | null>;
  createAccount(input: {
    id: string;
    email: string;
    displayName: string;
    passwordHash: string;
    actorAdminId: string;
    now: Date;
  }): Promise<"written" | "email_conflict">;
  setAccountStatus(input: {
    accountId: string;
    status: AdminAccount["status"];
    actorAdminId: string;
    now: Date;
  }): Promise<AdminAccountStatusOutcome>;
}

export class AdminAccountInputError extends Error {
  constructor(readonly issues: z.core.$ZodIssue[] = []) {
    super("Invalid admin account input");
    this.name = "AdminAccountInputError";
  }
}

export class AdminAccountEmailConflictError extends Error {
  constructor() {
    super("Admin account email already exists");
    this.name = "AdminAccountEmailConflictError";
  }
}

export class AdminAccountNotFoundError extends Error {
  constructor() {
    super("Admin account not found");
    this.name = "AdminAccountNotFoundError";
  }
}

export class AdminAccountAlreadyInStatusError extends Error {
  constructor() {
    super("Admin account already has requested status");
    this.name = "AdminAccountAlreadyInStatusError";
  }
}

export class AdminAccountLastActiveError extends Error {
  constructor() {
    super("Last active admin account cannot be disabled");
    this.name = "AdminAccountLastActiveError";
  }
}

const adminAccountCreationSchema = z
  .object({
    displayName: z.string().trim().min(2).max(100),
    email: z
      .string()
      .trim()
      .pipe(z.email().max(320))
      .transform((value) => value.toLowerCase()),
    password: z
      .string()
      .min(12)
      .max(200)
      .regex(/[A-Za-zÀ-ÿ]/)
      .regex(/\d/)
      .regex(/[^A-Za-zÀ-ÿ\d]/),
    passwordConfirmation: z.string().max(200),
  })
  .strict()
  .refine((input) => input.password === input.passwordConfirmation, {
    message: "Les mots de passe ne correspondent pas.",
    path: ["passwordConfirmation"],
  });

const accountActionSchema = z
  .object({ action: z.enum(["DISABLE", "REACTIVATE"]) })
  .strict();

type AdminAccountManagementDependencies = {
  repository: AdminAccountManagementRepository;
  now?: () => Date;
  createId?: () => string;
  hashPassword?: (password: string) => Promise<string>;
};

function parse<T>(
  result:
    | { success: true; data: T }
    | { success: false; error: z.ZodError },
): T {
  if (!result.success) throw new AdminAccountInputError(result.error.issues);
  return result.data;
}

export async function getAdminAccounts(
  repository: AdminAccountManagementRepository,
): Promise<AdminAccount[]> {
  return repository.listAccounts();
}

export async function createAdminAccount(
  input: unknown,
  actorAdminId: string,
  dependencies: AdminAccountManagementDependencies,
): Promise<AdminAccount> {
  const account = parse(adminAccountCreationSchema.safeParse(input));
  const parsedActorId = parse(z.uuid().safeParse(actorAdminId));
  const accountId = dependencies.createId?.() ?? randomUUID();
  const now = dependencies.now?.() ?? new Date();
  const passwordHash = await (
    dependencies.hashPassword ?? hashAdminPassword
  )(account.password);
  const outcome = await dependencies.repository.createAccount({
    id: accountId,
    email: account.email,
    displayName: account.displayName,
    passwordHash,
    actorAdminId: parsedActorId,
    now,
  });

  if (outcome === "email_conflict") {
    throw new AdminAccountEmailConflictError();
  }

  const created = await dependencies.repository.findAccountById(accountId);
  if (!created) throw new AdminAccountNotFoundError();
  return created;
}

export async function changeAdminAccountStatus(
  accountId: string,
  input: unknown,
  actorAdminId: string,
  dependencies: AdminAccountManagementDependencies,
): Promise<AdminAccount> {
  const parsedAccountId = parse(z.uuid().safeParse(accountId));
  const parsedActorId = parse(z.uuid().safeParse(actorAdminId));
  const action = parse(accountActionSchema.safeParse(input)).action;
  const outcome = await dependencies.repository.setAccountStatus({
    accountId: parsedAccountId,
    status: action === "DISABLE" ? "DISABLED" : "ACTIVE",
    actorAdminId: parsedActorId,
    now: dependencies.now?.() ?? new Date(),
  });

  if (outcome === "not_found") throw new AdminAccountNotFoundError();
  if (outcome === "already_status") {
    throw new AdminAccountAlreadyInStatusError();
  }
  if (outcome === "last_active") throw new AdminAccountLastActiveError();

  const updated = await dependencies.repository.findAccountById(parsedAccountId);
  if (!updated) throw new AdminAccountNotFoundError();
  return updated;
}
