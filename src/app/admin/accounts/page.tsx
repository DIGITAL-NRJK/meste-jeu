import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  AdminAccountManagementView,
  type AdminAccountView,
} from "@/components/admin/admin-account-management-view";
import { ADMIN_SESSION_COOKIE_NAME } from "@/lib/auth/admin-session";
import { getServerEnv } from "@/lib/env/server";
import { postgresAdminAccountManagementRepository } from "@/server/repositories/admin-account-management-repository";
import { postgresAdminAuthRepository } from "@/server/repositories/admin-auth-repository";
import { getAdminAccounts } from "@/server/services/admin-account-management";
import { getAuthenticatedAdmin } from "@/server/services/admin-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Administrateurs — Régie MESTE",
  robots: { index: false, follow: false },
};

export default async function AdminAccountsPage() {
  const cookieStore = await cookies();
  const env = getServerEnv();
  const admin = await getAuthenticatedAdmin(
    cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value,
    {
      repository: postgresAdminAuthRepository,
      authSecret: env.ADMIN_AUTH_SECRET,
    },
  );

  if (!admin) redirect("/admin/login");

  const accounts: AdminAccountView[] = (
    await getAdminAccounts(postgresAdminAccountManagementRepository)
  ).map((account) => ({
    ...account,
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
    lastLoginAt: account.lastLoginAt?.toISOString() ?? null,
  }));

  return (
    <AdminAccountManagementView admin={admin} initialAccounts={accounts} />
  );
}
