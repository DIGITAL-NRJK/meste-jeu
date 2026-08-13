import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  adminAccountErrorResponse,
  adminAccountHeaders,
  authenticateAdminAccountRequest,
  readAdminAccountJson,
  unauthenticatedAdminAccountResponse,
} from "@/app/api/admin/_shared/admin-account-response";
import { postgresAdminAccountManagementRepository } from "@/server/repositories/admin-account-management-repository";
import { changeAdminAccountStatus } from "@/server/services/admin-account-management";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AdminAccountActionRouteContext = { params: Promise<{ id: string }> };

export async function POST(
  request: NextRequest,
  context: AdminAccountActionRouteContext,
) {
  const admin = await authenticateAdminAccountRequest(request);
  if (!admin) return unauthenticatedAdminAccountResponse();

  const parsed = await readAdminAccountJson(request);
  if (!parsed.ok) return parsed.response;

  try {
    const { id } = await context.params;
    const account = await changeAdminAccountStatus(
      id,
      parsed.body,
      admin.id,
      { repository: postgresAdminAccountManagementRepository },
    );
    return NextResponse.json({ account }, { headers: adminAccountHeaders });
  } catch (error) {
    return adminAccountErrorResponse(error);
  }
}
