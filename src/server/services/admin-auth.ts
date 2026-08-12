import {
  ADMIN_SESSION_DURATION_MS,
  createAdminSessionToken,
  hashAdminSessionToken,
} from "@/lib/auth/admin-session";
import {
  DUMMY_ADMIN_PASSWORD_HASH,
  verifyAdminPassword,
} from "@/lib/auth/admin-password";
import {
  adminLoginSchema,
  type AdminLoginInput,
} from "@/lib/validation/admin-auth";

export type AdminIdentity = {
  id: string;
  email: string;
  displayName: string;
};

export type AdminUserForAuthentication = AdminIdentity & {
  passwordHash: string;
  status: "ACTIVE" | "DISABLED";
  lockedUntil: Date | null;
};

export interface AdminAuthRepository {
  findUserByEmail(email: string): Promise<AdminUserForAuthentication | null>;
  recordFailedLogin(adminUserId: string, now: Date): Promise<void>;
  createSession(input: {
    adminUserId: string;
    tokenHash: string;
    now: Date;
    expiresAt: Date;
  }): Promise<void>;
  findActiveSession(tokenHash: string, now: Date): Promise<AdminIdentity | null>;
  revokeSession(tokenHash: string, now: Date): Promise<void>;
}

export class AdminLoginInputError extends Error {
  constructor() {
    super("Invalid admin login input");
    this.name = "AdminLoginInputError";
  }
}

export class AdminInvalidCredentialsError extends Error {
  constructor() {
    super("Invalid admin credentials");
    this.name = "AdminInvalidCredentialsError";
  }
}

type AdminAuthDependencies = {
  repository: AdminAuthRepository;
  authSecret: string;
  now?: () => Date;
  createToken?: () => string;
  verifyPassword?: (password: string, encodedHash: string) => Promise<boolean>;
};

function parseLoginInput(input: unknown): AdminLoginInput {
  const result = adminLoginSchema.safeParse(input);

  if (!result.success) {
    throw new AdminLoginInputError();
  }

  return result.data;
}

export async function loginAdmin(
  input: unknown,
  dependencies: AdminAuthDependencies,
): Promise<{
  admin: AdminIdentity;
  session: { token: string; expiresAt: Date };
}> {
  const credentials = parseLoginInput(input);
  const now = dependencies.now?.() ?? new Date();
  const user = await dependencies.repository.findUserByEmail(
    credentials.email.toLowerCase(),
  );
  const passwordMatches = await (
    dependencies.verifyPassword ?? verifyAdminPassword
  )(
    credentials.password,
    user?.passwordHash ?? DUMMY_ADMIN_PASSWORD_HASH,
  );

  const accountLocked = Boolean(user?.lockedUntil && user.lockedUntil > now);

  if (!user || user.status !== "ACTIVE" || accountLocked || !passwordMatches) {
    if (user?.status === "ACTIVE" && !accountLocked && !passwordMatches) {
      await dependencies.repository.recordFailedLogin(user.id, now);
    }
    throw new AdminInvalidCredentialsError();
  }

  const expiresAt = new Date(now.getTime() + ADMIN_SESSION_DURATION_MS);
  const token = dependencies.createToken?.() ?? createAdminSessionToken();

  await dependencies.repository.createSession({
    adminUserId: user.id,
    tokenHash: hashAdminSessionToken(token, dependencies.authSecret),
    now,
    expiresAt,
  });

  return {
    admin: { id: user.id, email: user.email, displayName: user.displayName },
    session: { token, expiresAt },
  };
}

export async function getAuthenticatedAdmin(
  token: string | undefined,
  dependencies: Pick<AdminAuthDependencies, "repository" | "authSecret" | "now">,
): Promise<AdminIdentity | null> {
  if (!token) return null;

  return dependencies.repository.findActiveSession(
    hashAdminSessionToken(token, dependencies.authSecret),
    dependencies.now?.() ?? new Date(),
  );
}

export async function logoutAdmin(
  token: string | undefined,
  dependencies: Pick<AdminAuthDependencies, "repository" | "authSecret" | "now">,
): Promise<void> {
  if (!token) return;

  await dependencies.repository.revokeSession(
    hashAdminSessionToken(token, dependencies.authSecret),
    dependencies.now?.() ?? new Date(),
  );
}
