import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { authenticateRewardRequest, readRewardJson, rewardErrorResponse, rewardHeaders, unauthenticatedRewardResponse } from "@/app/api/admin/_shared/reward-response";
import { postgresAdminRewardsRepository } from "@/server/repositories/admin-rewards-repository";
import { createAdminReward, getAdminRewards } from "@/server/services/admin-rewards";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!(await authenticateRewardRequest(request))) return unauthenticatedRewardResponse();
  try {
    return NextResponse.json(
      await getAdminRewards(request.nextUrl.searchParams.get("eventSlug") || undefined, postgresAdminRewardsRepository),
      { headers: rewardHeaders },
    );
  } catch (error) { return rewardErrorResponse(error); }
}

export async function POST(request: NextRequest) {
  if (!(await authenticateRewardRequest(request))) return unauthenticatedRewardResponse();
  const parsed = await readRewardJson(request);
  if (!parsed.ok) return parsed.response;
  try {
    const reward = await createAdminReward(parsed.body, { repository: postgresAdminRewardsRepository });
    return NextResponse.json({ reward }, { status: 201, headers: rewardHeaders });
  } catch (error) { return rewardErrorResponse(error); }
}
