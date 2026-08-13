import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  adminProgrammingErrorResponse,
  adminProgrammingHeaders,
  authenticateAdminProgrammingRequest,
  readAdminProgrammingJson,
  unauthenticatedAdminProgrammingResponse,
} from "@/app/api/admin/_shared/programming-response";
import { postgresAdminProgrammingRepository } from "@/server/repositories/admin-programming-repository";
import { updateEvent } from "@/server/services/admin-programming";

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
    const event = await updateEvent(
      (await params).id,
      parsed.body,
      admin.id,
      { repository: postgresAdminProgrammingRepository },
    );

    return NextResponse.json({ event }, { headers: adminProgrammingHeaders });
  } catch (error) {
    return adminProgrammingErrorResponse(error);
  }
}
