import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  adminPlayerErrorResponse,
  adminPlayerHeaders,
  authenticateAdminPlayerRequest,
  unauthenticatedAdminPlayerResponse,
} from "@/app/api/admin/_shared/player-management-response";
import { postgresAdminPlayerManagementRepository } from "@/server/repositories/admin-player-management-repository";
import { getAdminPlayer } from "@/server/services/admin-player-management";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PlayerRouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: PlayerRouteContext) {
  const admin = await authenticateAdminPlayerRequest(request);
  if (!admin) return unauthenticatedAdminPlayerResponse();

  try {
    const { id } = await context.params;
    const player = await getAdminPlayer(
      id,
      postgresAdminPlayerManagementRepository,
    );

    return NextResponse.json({ player }, { headers: adminPlayerHeaders });
  } catch (error) {
    return adminPlayerErrorResponse(error);
  }
}
