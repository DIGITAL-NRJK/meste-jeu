import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  adminLibraryErrorResponse,
  adminLibraryHeaders,
  authenticateAdminLibraryRequest,
  readAdminLibraryJson,
  unauthenticatedAdminLibraryResponse,
} from "@/app/api/admin/_shared/question-library-response";
import { questionActionInputSchema } from "@/lib/validation/question-library";
import { postgresQuestionLibraryRepository } from "@/server/repositories/question-library-repository";
import {
  QuestionInputError,
  submitQuestionForReview,
  validateQuestion,
} from "@/server/services/question-library";

export const runtime = "nodejs";

type QuestionActionRouteContext = { params: Promise<{ id: string }> };

export async function POST(
  request: NextRequest,
  context: QuestionActionRouteContext,
) {
  const admin = await authenticateAdminLibraryRequest(request);
  if (!admin) return unauthenticatedAdminLibraryResponse();

  const body = await readAdminLibraryJson(request);
  if (!body.ok) return body.response;

  try {
    const parsed = questionActionInputSchema.safeParse(body.body);
    if (!parsed.success) throw new QuestionInputError(parsed.error.issues);

    const { id } = await context.params;
    const dependencies = { repository: postgresQuestionLibraryRepository };
    const question =
      parsed.data.action === "SUBMIT_FOR_REVIEW"
        ? await submitQuestionForReview(id, admin.id, dependencies)
        : await validateQuestion(id, admin.id, dependencies);

    return NextResponse.json(
      { question },
      {
        status: 200,
        headers: adminLibraryHeaders,
      },
    );
  } catch (error) {
    return adminLibraryErrorResponse(error);
  }
}
