import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  AdminPlayerManagementView,
  type AdminPlayerSummaryView,
} from "@/components/admin/admin-player-management-view";
import { ADMIN_SESSION_COOKIE_NAME } from "@/lib/auth/admin-session";
import { getServerEnv } from "@/lib/env/server";
import { readEventSlugParam } from "@/lib/validation/event-slug";
import { postgresAdminAuthRepository } from "@/server/repositories/admin-auth-repository";
import { postgresAdminPlayerManagementRepository } from "@/server/repositories/admin-player-management-repository";
import { getAuthenticatedAdmin } from "@/server/services/admin-auth";
import {
  AdminPlayerEventNotFoundError,
  getAdminPlayerManagement,
} from "@/server/services/admin-player-management";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Joueurs — Régie MESTE",
  robots: { index: false, follow: false },
};

export default async function AdminPlayersPage({
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

  const eventSlug = readEventSlugParam((await searchParams).event);
  let management;

  try {
    management = await getAdminPlayerManagement(
      { eventSlug, limit: 100 },
      postgresAdminPlayerManagementRepository,
    );
  } catch (error) {
    if (error instanceof AdminPlayerEventNotFoundError) redirect("/admin/players");
    console.error(
      `[REGIE] /admin/players a échoué (event=${eventSlug ?? "défaut"})`,
      error,
    );
    throw error;
  }

  const players: AdminPlayerSummaryView[] = management.players.map((player) => ({
    ...player,
    createdAt: player.createdAt.toISOString(),
    lastSeenAt: player.lastSeenAt.toISOString(),
  }));

  return (
    <AdminPlayerManagementView
      admin={admin}
      initialEvents={management.events}
      initialEvent={management.event}
      initialPlayers={players}
    />
  );
}
