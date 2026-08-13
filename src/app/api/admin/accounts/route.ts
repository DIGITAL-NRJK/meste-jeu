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
import {
  createAdminAccount,
  getAdminAccounts,
} from "@/server/services/admin-account-management";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const admin = await authenticateAdminAccountRequest(request);
  if (!admin) return unauthenticatedAdminAccountResponse();

  try {
    const accounts = await getAdminAccounts(
      postgresAdminAccountManagementRepository,
    );
    return NextResponse.json({ accounts }, { headers: adminAccountHeaders });
  } catch (error) {
    return adminAccountErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const admin = await authenticateAdminAccountRequest(request);
  if (!admin) return unauthenticatedAdminAccountResponse();

  const parsed = await readAdminAccountJson(request);
  if (!parsed.ok) return parsed.response;

  try {
    const account = await createAdminAccount(parsed.body, admin.id, {
      repository: postgresAdminAccountManagementRepository,
    });
    return NextResponse.json(
      { account },
      { status: 201, headers: adminAccountHeaders },
    );
  } catch (error) {
    return adminAccountErrorResponse(error);
  }
}
