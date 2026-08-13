import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  adminLibraryErrorResponse,
  adminLibraryHeaders,
  authenticateAdminLibraryRequest,
  readAdminLibraryJson,
  unauthenticatedAdminLibraryResponse,
} from "@/app/api/admin/_shared/question-library-response";
import { postgresQuestionLibraryRepository } from "@/server/repositories/question-library-repository";
import { updateCategory } from "@/server/services/question-library";

export const runtime = "nodejs";

type CategoryRouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, context: CategoryRouteContext) {
  const admin = await authenticateAdminLibraryRequest(request);
  if (!admin) return unauthenticatedAdminLibraryResponse();

  const parsed = await readAdminLibraryJson(request);
  if (!parsed.ok) return parsed.response;

  try {
    const { id } = await context.params;
    const category = await updateCategory(
      id,
      parsed.body,
      postgresQuestionLibraryRepository,
    );
    return NextResponse.json({ category }, { headers: adminLibraryHeaders });
  } catch (error) {
    return adminLibraryErrorResponse(error);
  }
}
