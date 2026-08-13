import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  adminPlayerErrorResponse,
  adminPlayerHeaders,
  authenticateAdminPlayerRequest,
  readAdminPlayerJson,
  unauthenticatedAdminPlayerResponse,
} from "@/app/api/admin/_shared/player-management-response";
import { postgresAdminPlayerManagementRepository } from "@/server/repositories/admin-player-management-repository";
import {
  AdminPlayerInputError,
  disableAdminPlayer,
} from "@/server/services/admin-player-management";

export const runtime = "nodejs";

type PlayerActionRouteContext = { params: Promise<{ id: string }> };

export async function POST(
  request: NextRequest,
  context: PlayerActionRouteContext,
) {
  const admin = await authenticateAdminPlayerRequest(request);
  if (!admin) return unauthenticatedAdminPlayerResponse();

  const parsed = await readAdminPlayerJson(request);
  if (!parsed.ok) return parsed.response;

  try {
    if (
      !parsed.body ||
      typeof parsed.body !== "object" ||
      (parsed.body as { action?: unknown }).action !== "DISABLE"
    ) {
      throw new AdminPlayerInputError();
    }

    const { id } = await context.params;
    const player = await disableAdminPlayer(id, admin.id, {
      repository: postgresAdminPlayerManagementRepository,
    });

    return NextResponse.json({ player }, { headers: adminPlayerHeaders });
  } catch (error) {
    return adminPlayerErrorResponse(error);
  }
}
