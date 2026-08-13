import "server-only";

import { sql } from "drizzle-orm";

import { adminSessions, adminUsers, auditLogs } from "../../../db/schema";
import { getDb } from "@/lib/db/client";
import type {
  AdminAccount,
  AdminAccountManagementRepository,
  AdminAccountStatusOutcome,
} from "@/server/services/admin-account-management";

type AdminAccountRow = Omit<
  AdminAccount,
  "createdAt" | "updatedAt" | "lastLoginAt"
> & {
  createdAt: Date | string;
  updatedAt: Date | string;
  lastLoginAt: Date | string | null;
};

type WriteOutcomeRow<T extends string> = { outcome: T };

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function toAdminAccount(row: AdminAccountRow): AdminAccount {
  return {
    ...row,
    createdAt: asDate(row.createdAt),
    updatedAt: asDate(row.updatedAt),
    lastLoginAt: row.lastLoginAt ? asDate(row.lastLoginAt) : null,
  };
}

const accountColumns = sql`
  admin_user.id,
  admin_user.email,
  admin_user.display_name AS "displayName",
  admin_user.status::text AS status,
  admin_user.created_at AS "createdAt",
  admin_user.updated_at AS "updatedAt",
  admin_user.last_login_at AS "lastLoginAt"
`;

async function listAccounts(): Promise<AdminAccount[]> {
  const result = await getDb().execute<AdminAccountRow>(sql`
    SELECT ${accountColumns}
    FROM ${adminUsers} AS admin_user
    ORDER BY
      CASE WHEN admin_user.status = 'ACTIVE' THEN 0 ELSE 1 END,
      lower(admin_user.display_name),
      lower(admin_user.email)
  `);

  return result.rows.map(toAdminAccount);
}

async function findAccountById(accountId: string): Promise<AdminAccount | null> {
  const result = await getDb().execute<AdminAccountRow>(sql`
    SELECT ${accountColumns}
    FROM ${adminUsers} AS admin_user
    WHERE admin_user.id = ${accountId}::uuid
    LIMIT 1
  `);

  return result.rows[0] ? toAdminAccount(result.rows[0]) : null;
}

async function createAccount(input: {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  actorAdminId: string;
  now: Date;
}): Promise<"written" | "email_conflict"> {
  const result = await getDb().execute<
    WriteOutcomeRow<"written" | "email_conflict">
  >(sql`
    WITH inserted AS (
      INSERT INTO ${adminUsers} (
        id,
        email,
        password_hash,
        display_name,
        status,
        created_at,
        updated_at
      )
      VALUES (
        ${input.id}::uuid,
        ${input.email},
        ${input.passwordHash},
        ${input.displayName},
        'ACTIVE',
        ${input.now},
        ${input.now}
      )
      ON CONFLICT DO NOTHING
      RETURNING id, email, display_name
    ), logged AS (
      INSERT INTO ${auditLogs} (
        admin_user_id,
        action,
        entity_type,
        entity_id,
        metadata,
        created_at
      )
      SELECT
        ${input.actorAdminId}::uuid,
        'ADMIN_USER_CREATED',
        'admin_user',
        inserted.id,
        jsonb_build_object(
          'email', inserted.email,
          'displayName', inserted.display_name
        ),
        ${input.now}
      FROM inserted
      RETURNING id
    )
    SELECT
      CASE
        WHEN EXISTS (SELECT 1 FROM inserted) THEN 'written'
        ELSE 'email_conflict'
      END AS outcome,
      (SELECT count(*) FROM logged) AS "auditCount"
  `);

  return result.rows[0]?.outcome ?? "email_conflict";
}

async function setAccountStatus(input: {
  accountId: string;
  status: AdminAccount["status"];
  actorAdminId: string;
  now: Date;
}): Promise<AdminAccountStatusOutcome> {
  const db = getDb();
  const [, result] = await db.batch([
    db.execute(sql`SELECT pg_advisory_xact_lock(202608150020)`),
    db.execute<WriteOutcomeRow<AdminAccountStatusOutcome>>(sql`
      WITH target AS (
        SELECT
          admin_user.id,
          admin_user.email,
          admin_user.display_name,
          admin_user.status,
          (
            SELECT count(*)::integer
            FROM ${adminUsers}
            WHERE status = 'ACTIVE'
          ) AS active_count
        FROM ${adminUsers} AS admin_user
        WHERE admin_user.id = ${input.accountId}::uuid
      ), updated AS (
        UPDATE ${adminUsers} AS admin_user
        SET
          status = ${input.status}::admin_user_status,
          failed_login_count = 0,
          locked_until = NULL,
          updated_at = ${input.now}
        FROM target
        WHERE admin_user.id = target.id
          AND target.status <> ${input.status}::admin_user_status
          AND (
            ${input.status}::admin_user_status = 'ACTIVE'
            OR target.status <> 'ACTIVE'
            OR target.active_count > 1
          )
        RETURNING admin_user.id, admin_user.email, admin_user.display_name
      ), revoked_sessions AS (
        UPDATE ${adminSessions} AS admin_session
        SET revoked_at = ${input.now}
        FROM updated
        WHERE ${input.status}::admin_user_status = 'DISABLED'
          AND admin_session.admin_user_id = updated.id
          AND admin_session.revoked_at IS NULL
        RETURNING admin_session.id
      ), logged AS (
        INSERT INTO ${auditLogs} (
          admin_user_id,
          action,
          entity_type,
          entity_id,
          metadata,
          created_at
        )
        SELECT
          ${input.actorAdminId}::uuid,
          CASE
            WHEN ${input.status}::admin_user_status = 'DISABLED'
              THEN 'ADMIN_USER_DISABLED'::audit_action
            ELSE 'ADMIN_USER_REACTIVATED'::audit_action
          END,
          'admin_user',
          updated.id,
          jsonb_build_object(
            'email', updated.email,
            'displayName', updated.display_name,
            'revokedSessions', (SELECT count(*) FROM revoked_sessions)
          ),
          ${input.now}
        FROM updated
        RETURNING id
      )
      SELECT
        CASE
          WHEN NOT EXISTS (SELECT 1 FROM target) THEN 'not_found'
          WHEN EXISTS (
            SELECT 1 FROM target
            WHERE status = ${input.status}::admin_user_status
          ) THEN 'already_status'
          WHEN ${input.status}::admin_user_status = 'DISABLED'
            AND EXISTS (
              SELECT 1 FROM target
              WHERE status = 'ACTIVE' AND active_count <= 1
            ) THEN 'last_active'
          WHEN EXISTS (SELECT 1 FROM updated) THEN 'written'
          ELSE 'not_found'
        END AS outcome,
        (SELECT count(*) FROM logged) AS "auditCount"
    `),
  ]);

  return result.rows[0]?.outcome ?? "not_found";
}

export const postgresAdminAccountManagementRepository: AdminAccountManagementRepository = {
  listAccounts,
  findAccountById,
  createAccount,
  setAccountStatus,
};
