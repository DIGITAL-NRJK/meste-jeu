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
import { createQuizSession } from "@/server/services/session-engine";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const admin = await authenticateAdminProgrammingRequest(request);
  if (!admin) return unauthenticatedAdminProgrammingResponse();

  const parsed = await readAdminProgrammingJson(request);
  if (!parsed.ok) return parsed.response;

  try {
    const session = await createQuizSession(parsed.body, admin.id, {
      repository: postgresSessionEngineRepository,
    });

    return NextResponse.json(
      { session },
      { status: 201, headers: adminProgrammingHeaders },
    );
  } catch (error) {
    return adminProgrammingErrorResponse(error);
  }
}
