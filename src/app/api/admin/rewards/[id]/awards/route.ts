import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authenticateRewardRequest, readRewardJson, rewardErrorResponse, rewardHeaders, unauthenticatedRewardResponse } from "@/app/api/admin/_shared/reward-response";
import { postgresAdminRewardsRepository } from "@/server/repositories/admin-rewards-repository";
import { awardAdminReward } from "@/server/services/admin-rewards";

export const runtime = "nodejs";
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const admin = await authenticateRewardRequest(request);
  if (!admin) return unauthenticatedRewardResponse();
  const parsed = await readRewardJson(request);
  if (!parsed.ok) return parsed.response;
  try {
    await awardAdminReward((await context.params).id, parsed.body, admin.id, { repository: postgresAdminRewardsRepository });
    return NextResponse.json({ ok: true }, { status: 201, headers: rewardHeaders });
  } catch (error) { return rewardErrorResponse(error); }
}
