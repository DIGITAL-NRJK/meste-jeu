import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AdminDashboardView } from "@/components/admin/admin-dashboard-view";
import { ADMIN_SESSION_COOKIE_NAME } from "@/lib/auth/admin-session";
import { getServerEnv } from "@/lib/env/server";
import { postgresAdminAuthRepository } from "@/server/repositories/admin-auth-repository";
import { postgresAdminDashboardRepository } from "@/server/repositories/admin-dashboard-repository";
import { postgresAdminReportingRepository } from "@/server/repositories/admin-reporting-repository";
import { getAuthenticatedAdmin } from "@/server/services/admin-auth";
import {
  AdminDashboardEventNotFoundError,
  getAdminDashboard,
} from "@/server/services/admin-dashboard";
import {
  getAdminAuditLogs,
  type AdminAuditLogEntry,
} from "@/server/services/admin-reporting";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Régie — Héritage Congo",
  robots: { index: false, follow: false },
};

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string | string[] }>;
}) {
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

  const rawEvent = (await searchParams).event;
  const eventSlug = Array.isArray(rawEvent) ? rawEvent[0] : rawEvent;
  let dashboard;

  try {
    dashboard = await getAdminDashboard(eventSlug, {
      repository: postgresAdminDashboardRepository,
    });
  } catch (error) {
    if (error instanceof AdminDashboardEventNotFoundError) {
      redirect("/admin");
    }
    throw error;
  }

  const auditLogs = await getAdminAuditLogs(
    30,
    postgresAdminReportingRepository,
  ).catch((): AdminAuditLogEntry[] => []);

  return (
    <AdminDashboardView
      admin={admin}
      initialAuditLogs={auditLogs}
      initialDashboard={dashboard}
    />
  );
}
