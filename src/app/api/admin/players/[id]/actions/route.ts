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
  adjustAdminPlayerScore,
  deleteAdminTestPlayer,
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
    if (!parsed.body || typeof parsed.body !== "object") {
      throw new AdminPlayerInputError();
    }

    const { id } = await context.params;
    const action = (parsed.body as { action?: unknown }).action;
    const dependencies = {
      repository: postgresAdminPlayerManagementRepository,
    };
    const player =
      action === "DISABLE"
        ? await disableAdminPlayer(id, admin.id, dependencies)
        : action === "ADJUST_SCORE"
          ? await adjustAdminPlayerScore(id, parsed.body, admin.id, dependencies)
          : null;

    if (!player) throw new AdminPlayerInputError();

    return NextResponse.json({ player }, { headers: adminPlayerHeaders });
  } catch (error) {
    return adminPlayerErrorResponse(error);
  }
}

export async function DELETE(
  request: NextRequest,
  context: PlayerActionRouteContext,
) {
  const admin = await authenticateAdminPlayerRequest(request);
  if (!admin) return unauthenticatedAdminPlayerResponse();

  try {
    const { id } = await context.params;
    const result = await deleteAdminTestPlayer(id, admin.id, {
      repository: postgresAdminPlayerManagementRepository,
    });

    return NextResponse.json(result, { headers: adminPlayerHeaders });
  } catch (error) {
    return adminPlayerErrorResponse(error);
  }
}
