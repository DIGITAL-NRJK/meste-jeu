import "server-only";

import { sql } from "drizzle-orm";

import { adminSessions, adminUsers } from "../../../db/schema";
import { getDb } from "@/lib/db/client";
import type {
  AdminAuthRepository,
  AdminIdentity,
  AdminUserForAuthentication,
} from "@/server/services/admin-auth";

type UserRow = AdminUserForAuthentication;
type SessionRow = AdminIdentity;

async function findUserByEmail(email: string) {
  const rows = await getDb().execute<UserRow>(sql`
    SELECT
      ${adminUsers.id} AS id,
      ${adminUsers.email} AS email,
      ${adminUsers.passwordHash} AS "passwordHash",
      ${adminUsers.displayName} AS "displayName",
      ${adminUsers.status}::text AS status,
      ${adminUsers.lockedUntil} AS "lockedUntil"
    FROM ${adminUsers}
    WHERE lower(${adminUsers.email}) = lower(${email})
    LIMIT 1
  `);

  return rows.rows[0] ?? null;
}

async function recordFailedLogin(adminUserId: string, now: Date) {
  await getDb().execute(sql`
    UPDATE ${adminUsers}
    SET
      failed_login_count = CASE
        WHEN locked_until IS NOT NULL AND locked_until <= ${now} THEN 1
        ELSE failed_login_count + 1
      END,
      locked_until = CASE
        WHEN (
          CASE
            WHEN locked_until IS NOT NULL AND locked_until <= ${now} THEN 1
            ELSE failed_login_count + 1
          END
        ) >= 5 THEN ${now}::timestamptz + interval '15 minutes'
        ELSE NULL
      END,
      updated_at = ${now}
    WHERE id = ${adminUserId}::uuid
      AND status = 'ACTIVE'
  `);
}

async function createSession(input: {
  adminUserId: string;
  tokenHash: string;
  now: Date;
  expiresAt: Date;
}) {
  await getDb().execute(sql`
    WITH updated_user AS (
      UPDATE ${adminUsers}
      SET
        last_login_at = ${input.now},
        updated_at = ${input.now},
        failed_login_count = 0,
        locked_until = NULL
      WHERE id = ${input.adminUserId}::uuid
        AND status = 'ACTIVE'
      RETURNING id
    ), revoked_sessions AS (
      UPDATE ${adminSessions}
      SET revoked_at = ${input.now}
      WHERE admin_user_id = ${input.adminUserId}::uuid
        AND revoked_at IS NULL
      RETURNING id
    )
    INSERT INTO ${adminSessions} (
      admin_user_id, token_hash, created_at, expires_at, last_seen_at
    )
    SELECT
      id, ${input.tokenHash}, ${input.now}, ${input.expiresAt}, ${input.now}
    FROM updated_user
  `);
}

async function findActiveSession(tokenHash: string, now: Date) {
  const rows = await getDb().execute<SessionRow>(sql`
    WITH active_session AS (
      UPDATE ${adminSessions} AS session
      SET last_seen_at = ${now}
      FROM ${adminUsers} AS admin_user
      WHERE session.token_hash = ${tokenHash}
        AND session.admin_user_id = admin_user.id
        AND session.revoked_at IS NULL
        AND session.expires_at > ${now}
        AND admin_user.status = 'ACTIVE'
      RETURNING admin_user.id, admin_user.email, admin_user.display_name
    )
    SELECT
      id,
      email,
      display_name AS "displayName"
    FROM active_session
    LIMIT 1
  `);

  return rows.rows[0] ?? null;
}

async function revokeSession(tokenHash: string, now: Date) {
  await getDb()
    .update(adminSessions)
    .set({ revokedAt: now })
    .where(sql`${adminSessions.tokenHash} = ${tokenHash} AND ${adminSessions.revokedAt} IS NULL`);
}

export const postgresAdminAuthRepository: AdminAuthRepository = {
  findUserByEmail,
  recordFailedLogin,
  createSession,
  findActiveSession,
  revokeSession,
};
