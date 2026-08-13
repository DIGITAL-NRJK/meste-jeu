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
import {
  deleteQuestion,
  getQuestion,
  updateQuestion,
} from "@/server/services/question-library";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type QuestionRouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: QuestionRouteContext) {
  const admin = await authenticateAdminLibraryRequest(request);
  if (!admin) return unauthenticatedAdminLibraryResponse();

  try {
    const { id } = await context.params;
    const question = await getQuestion(id, postgresQuestionLibraryRepository);
    return NextResponse.json({ question }, { headers: adminLibraryHeaders });
  } catch (error) {
    return adminLibraryErrorResponse(error);
  }
}

export async function PUT(request: NextRequest, context: QuestionRouteContext) {
  const admin = await authenticateAdminLibraryRequest(request);
  if (!admin) return unauthenticatedAdminLibraryResponse();

  const parsed = await readAdminLibraryJson(request);
  if (!parsed.ok) return parsed.response;

  try {
    const { id } = await context.params;
    const question = await updateQuestion(id, parsed.body, admin.id, {
      repository: postgresQuestionLibraryRepository,
    });
    return NextResponse.json({ question }, { headers: adminLibraryHeaders });
  } catch (error) {
    return adminLibraryErrorResponse(error);
  }
}

export async function DELETE(
  request: NextRequest,
  context: QuestionRouteContext,
) {
  const admin = await authenticateAdminLibraryRequest(request);
  if (!admin) return unauthenticatedAdminLibraryResponse();

  try {
    const { id } = await context.params;
    await deleteQuestion(id, admin.id, {
      repository: postgresQuestionLibraryRepository,
    });
    return new NextResponse(null, {
      status: 204,
      headers: adminLibraryHeaders,
    });
  } catch (error) {
    return adminLibraryErrorResponse(error);
  }
}
