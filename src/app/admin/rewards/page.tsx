import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  AdminRewardsView,
  type AdminRewardView,
} from "@/components/admin/admin-rewards-view";
import { ADMIN_SESSION_COOKIE_NAME } from "@/lib/auth/admin-session";
import { getServerEnv } from "@/lib/env/server";
import { postgresAdminAuthRepository } from "@/server/repositories/admin-auth-repository";
import { postgresAdminPlayerManagementRepository } from "@/server/repositories/admin-player-management-repository";
import { postgresAdminRewardsRepository } from "@/server/repositories/admin-rewards-repository";
import { getAuthenticatedAdmin } from "@/server/services/admin-auth";
import { getAdminPlayerManagement } from "@/server/services/admin-player-management";
import {
  AdminRewardEventNotFoundError,
  getAdminRewards,
} from "@/server/services/admin-rewards";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Lots — Régie MESTE",
  robots: { index: false, follow: false },
};

export default async function AdminRewardsPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string | string[] }>;
}) {
  const cookieStore = await cookies();
  const env = getServerEnv();
  const admin = await getAuthenticatedAdmin(
    cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value,
    { repository: postgresAdminAuthRepository, authSecret: env.ADMIN_AUTH_SECRET },
  );
  if (!admin) redirect("/admin/login");

  const rawEvent = (await searchParams).event;
  const eventSlug = Array.isArray(rawEvent) ? rawEvent[0] : rawEvent;
  let management;

  try {
    management = await getAdminRewards(eventSlug, postgresAdminRewardsRepository);
  } catch (error) {
    if (error instanceof AdminRewardEventNotFoundError) redirect("/admin/rewards");
    throw error;
  }

  const playerManagement = management.event
    ? await getAdminPlayerManagement(
        { eventSlug: management.event.slug, limit: 100 },
        postgresAdminPlayerManagementRepository,
      )
    : null;
  const rewards: AdminRewardView[] = management.rewards.map((reward) => ({
    ...reward,
    createdAt: reward.createdAt.toISOString(),
    updatedAt: reward.updatedAt.toISOString(),
    awards: reward.awards.map((award) => ({
      ...award,
      awardedAt: award.awardedAt.toISOString(),
      deliveredAt: award.deliveredAt?.toISOString() ?? null,
    })),
  }));

  return (
    <AdminRewardsView
      admin={admin}
      initialEvents={management.events}
      initialEvent={management.event}
      initialRewards={rewards}
      initialPlayers={(playerManagement?.players ?? []).map((player) => ({
        id: player.id,
        publicCode: player.publicCode,
        nickname: player.nickname,
        status: player.status,
        totalPoints: player.totalPoints,
      }))}
    />
  );
}
