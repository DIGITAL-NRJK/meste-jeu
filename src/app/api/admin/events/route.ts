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
import { createEvent } from "@/server/services/admin-programming";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const admin = await authenticateAdminProgrammingRequest(request);
  if (!admin) return unauthenticatedAdminProgrammingResponse();

  const parsed = await readAdminProgrammingJson(request);
  if (!parsed.ok) return parsed.response;

  try {
    const event = await createEvent(parsed.body, {
      repository: postgresAdminProgrammingRepository,
    });

    return NextResponse.json(
      { event },
      { status: 201, headers: adminProgrammingHeaders },
    );
  } catch (error) {
    return adminProgrammingErrorResponse(error);
  }
}
