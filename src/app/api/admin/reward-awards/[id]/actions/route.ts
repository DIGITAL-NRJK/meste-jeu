import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authenticateRewardRequest, readRewardJson, rewardErrorResponse, rewardHeaders, unauthenticatedRewardResponse } from "@/app/api/admin/_shared/reward-response";
import { postgresAdminRewardsRepository } from "@/server/repositories/admin-rewards-repository";
import {
  AdminRewardInputError,
  deliverAdminReward,
} from "@/server/services/admin-rewards";

export const runtime = "nodejs";
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const admin = await authenticateRewardRequest(request);
  if (!admin) return unauthenticatedRewardResponse();
  const parsed = await readRewardJson(request);
  if (!parsed.ok) return parsed.response;
  try {
    const body = parsed.body && typeof parsed.body === "object" ? parsed.body as { action?: unknown; notes?: unknown } : {};
    if (body.action !== "MARK_DELIVERED") {
      throw new AdminRewardInputError();
    }
    await deliverAdminReward((await context.params).id, { notes: body.notes }, admin.id, { repository: postgresAdminRewardsRepository });
    return NextResponse.json({ ok: true }, { headers: rewardHeaders });
  } catch (error) { return rewardErrorResponse(error); }
}
