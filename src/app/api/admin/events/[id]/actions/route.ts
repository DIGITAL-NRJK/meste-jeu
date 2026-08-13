import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  adminProgrammingErrorResponse,
  adminProgrammingHeaders,
  authenticateAdminProgrammingRequest,
  readAdminProgrammingJson,
  unauthenticatedAdminProgrammingResponse,
} from "@/app/api/admin/_shared/programming-response";
import { eventActionSchema } from "@/lib/validation/admin-programming";
import { postgresAdminProgrammingRepository } from "@/server/repositories/admin-programming-repository";
import {
  AdminProgrammingInputError,
  markEventReady,
} from "@/server/services/admin-programming";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await authenticateAdminProgrammingRequest(request);
  if (!admin) return unauthenticatedAdminProgrammingResponse();

  const parsedBody = await readAdminProgrammingJson(request);
  if (!parsedBody.ok) return parsedBody.response;

  try {
    const action = eventActionSchema.safeParse(parsedBody.body);
    if (!action.success) {
      throw new AdminProgrammingInputError(action.error.issues);
    }

    const event = await markEventReady((await params).id, {
      repository: postgresAdminProgrammingRepository,
    });

    return NextResponse.json({ event }, { headers: adminProgrammingHeaders });
  } catch (error) {
    return adminProgrammingErrorResponse(error);
  }
}
