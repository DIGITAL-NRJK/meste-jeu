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
  createCategory,
  listCategories,
} from "@/server/services/question-library";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const admin = await authenticateAdminLibraryRequest(request);
  if (!admin) return unauthenticatedAdminLibraryResponse();

  const categories = await listCategories(postgresQuestionLibraryRepository);
  return NextResponse.json({ categories }, { headers: adminLibraryHeaders });
}

export async function POST(request: NextRequest) {
  const admin = await authenticateAdminLibraryRequest(request);
  if (!admin) return unauthenticatedAdminLibraryResponse();

  const parsed = await readAdminLibraryJson(request);
  if (!parsed.ok) return parsed.response;

  try {
    const category = await createCategory(
      parsed.body,
      postgresQuestionLibraryRepository,
    );
    return NextResponse.json(
      { category },
      { status: 201, headers: adminLibraryHeaders },
    );
  } catch (error) {
    return adminLibraryErrorResponse(error);
  }
}
