import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  adminProgrammingErrorResponse,
  adminProgrammingHeaders,
  authenticateAdminProgrammingRequest,
  readAdminProgrammingJson,
  unauthenticatedAdminProgrammingResponse,
} from "@/app/api/admin/_shared/programming-response";
import { postgresSessionEngineRepository } from "@/server/repositories/session-engine-repository";
import { configureSessionLineup } from "@/server/services/session-engine";

export const runtime = "nodejs";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await authenticateAdminProgrammingRequest(request);
  if (!admin) return unauthenticatedAdminProgrammingResponse();

  const parsed = await readAdminProgrammingJson(request);
  if (!parsed.ok) return parsed.response;

  try {
    const session = await configureSessionLineup(
      (await params).id,
      parsed.body,
      admin.id,
      { repository: postgresSessionEngineRepository },
    );

    return NextResponse.json({ session }, { headers: adminProgrammingHeaders });
  } catch (error) {
    return adminProgrammingErrorResponse(error);
  }
}
