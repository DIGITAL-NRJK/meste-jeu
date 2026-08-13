import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  adminPlayerErrorResponse,
  adminPlayerHeaders,
  authenticateAdminPlayerRequest,
  unauthenticatedAdminPlayerResponse,
} from "@/app/api/admin/_shared/player-management-response";
import { postgresAdminPlayerManagementRepository } from "@/server/repositories/admin-player-management-repository";
import { getAdminPlayerManagement } from "@/server/services/admin-player-management";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const admin = await authenticateAdminPlayerRequest(request);
  if (!admin) return unauthenticatedAdminPlayerResponse();

  try {
    const management = await getAdminPlayerManagement(
      {
        eventSlug: request.nextUrl.searchParams.get("eventSlug") || undefined,
        search: request.nextUrl.searchParams.get("search") || undefined,
        status: request.nextUrl.searchParams.get("status") || undefined,
        limit: request.nextUrl.searchParams.get("limit") || undefined,
      },
      postgresAdminPlayerManagementRepository,
    );

    return NextResponse.json(management, { headers: adminPlayerHeaders });
  } catch (error) {
    return adminPlayerErrorResponse(error);
  }
}
