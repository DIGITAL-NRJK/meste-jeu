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
  createQuestionDraft,
  listQuestions,
} from "@/server/services/question-library";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const admin = await authenticateAdminLibraryRequest(request);
  if (!admin) return unauthenticatedAdminLibraryResponse();

  try {
    const questions = await listQuestions(
      {
        categoryId: request.nextUrl.searchParams.get("categoryId") || undefined,
        status: request.nextUrl.searchParams.get("status") || undefined,
        search: request.nextUrl.searchParams.get("search") || undefined,
        limit: request.nextUrl.searchParams.get("limit") || undefined,
      },
      postgresQuestionLibraryRepository,
    );

    return NextResponse.json({ questions }, { headers: adminLibraryHeaders });
  } catch (error) {
    return adminLibraryErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const admin = await authenticateAdminLibraryRequest(request);
  if (!admin) return unauthenticatedAdminLibraryResponse();

  const parsed = await readAdminLibraryJson(request);
  if (!parsed.ok) return parsed.response;

  try {
    const question = await createQuestionDraft(parsed.body, admin.id, {
      repository: postgresQuestionLibraryRepository,
    });

    return NextResponse.json(
      { question },
      { status: 201, headers: adminLibraryHeaders },
    );
  } catch (error) {
    return adminLibraryErrorResponse(error);
  }
}
