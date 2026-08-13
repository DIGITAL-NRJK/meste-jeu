import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authenticateRewardRequest, readRewardJson, rewardErrorResponse, rewardHeaders, unauthenticatedRewardResponse } from "@/app/api/admin/_shared/reward-response";
import { postgresAdminRewardsRepository } from "@/server/repositories/admin-rewards-repository";
import { updateAdminReward } from "@/server/services/admin-rewards";

export const runtime = "nodejs";
export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!(await authenticateRewardRequest(request))) return unauthenticatedRewardResponse();
  const parsed = await readRewardJson(request);
  if (!parsed.ok) return parsed.response;
  try {
    await updateAdminReward((await context.params).id, parsed.body, { repository: postgresAdminRewardsRepository });
    return NextResponse.json({ ok: true }, { headers: rewardHeaders });
  } catch (error) { return rewardErrorResponse(error); }
}
