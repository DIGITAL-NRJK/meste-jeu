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
  finishEvent,
  markEventReady,
  resetEventToDraft,
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

    const eventId = (await params).id;
    const dependencies = { repository: postgresAdminProgrammingRepository };
    const event = action.data.action === "MARK_READY"
      ? await markEventReady(eventId, dependencies)
      : action.data.action === "RESET_DRAFT"
        ? await resetEventToDraft(eventId, admin.id, dependencies)
        : await finishEvent(eventId, admin.id, dependencies);
    const sessions = await postgresAdminProgrammingRepository.listSessions(event.id);

    return NextResponse.json(
      { event, sessions },
      { headers: adminProgrammingHeaders },
    );
  } catch (error) {
    return adminProgrammingErrorResponse(error);
  }
}
