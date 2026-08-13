import "server-only";

import { and, desc, eq, ilike, inArray, sql, type SQL } from "drizzle-orm";

import {
  auditLogs,
  categories,
  questionOptions,
  questions,
  questionSources,
} from "../../../db/schema";
import { getDb } from "@/lib/db/client";
import {
  type AdminQuestionDetail,
  type CategoryUpdateOutcome,
  type PersistQuestionDraft,
  type QuestionLibraryRepository,
  QuestionPersistenceError,
  type QuestionTransitionOutcome,
  type QuestionUpdateOutcome,
} from "@/server/services/question-library";

type TransitionRow = {
  outcome:
    | "TRANSITIONED"
    | "NOT_FOUND"
    | "INVALID_STATUS"
    | "INCOMPLETE"
    | "CATEGORY_INACTIVE";
};

function findPostgresError(error: unknown) {
  let candidate: unknown = error;
  let firstError:
    | { code: string; constraint: string | undefined; message: string }
    | undefined;

  for (let depth = 0; depth < 5; depth += 1) {
    if (!candidate || typeof candidate !== "object") {
      return undefined;
    }

    const record = candidate as Record<string, unknown>;

    if (typeof record.code === "string") {
      const parsed = {
        code: record.code,
        constraint:
          typeof record.constraint === "string" ? record.constraint : undefined,
        message: typeof record.message === "string" ? record.message : "",
      };

      if (parsed.code === "23503" || parsed.code === "23505") {
        return parsed;
      }

      firstError ??= parsed;
    }

    candidate = record.cause;
  }

  return firstError;
}

function mapPersistenceError(error: unknown): never {
  const postgresError = findPostgresError(error);

  if (
    postgresError?.code === "23505" &&
    (postgresError.constraint === "categories_slug_unique" ||
      postgresError.message.includes("categories_slug_unique"))
  ) {
    throw new QuestionPersistenceError("category_conflict");
  }

  if (
    postgresError?.code === "23503" &&
    (postgresError.constraint === "questions_category_id_categories_id_fk" ||
      postgresError.message.includes("questions_category_id_categories_id_fk"))
  ) {
    throw new QuestionPersistenceError("category_not_found");
  }

  throw error;
}

async function createCategory(input: {
  name: string;
  slug: string;
  description: string | null;
}) {
  try {
    const [category] = await getDb()
      .insert(categories)
      .values(input)
      .returning();

    if (!category) {
      throw new Error("Category insertion returned no row");
    }

    return category;
  } catch (error) {
    return mapPersistenceError(error);
  }
}

function listCategories(activeOnly: boolean) {
  const query = getDb().select().from(categories).$dynamic();

  return query
    .where(activeOnly ? eq(categories.active, true) : undefined)
    .orderBy(categories.name);
}

async function updateCategory(
  categoryId: string,
  input: {
    name: string;
    slug: string;
    description: string | null;
    active: boolean;
  },
): Promise<CategoryUpdateOutcome> {
  try {
    const [category] = await getDb()
      .update(categories)
      .set(input)
      .where(eq(categories.id, categoryId))
      .returning();

    return category
      ? { outcome: "updated", category }
      : { outcome: "not_found" };
  } catch (error) {
    return mapPersistenceError(error);
  }
}

function questionOptionInsert(input: PersistQuestionDraft) {
  return getDb().execute(sql`
    INSERT INTO ${questionOptions} (
      id,
      question_id,
      label,
      text,
      is_correct,
      position
    )
    SELECT
      item.id::uuid,
      ${input.id}::uuid,
      item.label,
      item.text,
      item."isCorrect",
      item.position
    FROM jsonb_to_recordset(${JSON.stringify(input.options)}::jsonb)
      AS item(id text, label text, text text, "isCorrect" boolean, position integer)
  `);
}

function questionSourceInsert(input: PersistQuestionDraft) {
  return getDb().execute(sql`
    INSERT INTO ${questionSources} (
      id,
      question_id,
      publisher,
      title,
      url,
      verified_at,
      notes
    )
    SELECT
      item.id::uuid,
      ${input.id}::uuid,
      item.publisher,
      item.title,
      item.url,
      item."verifiedAt"::timestamptz,
      item.notes
    FROM jsonb_to_recordset(${JSON.stringify(input.sources)}::jsonb)
      AS item(
        id text,
        publisher text,
        title text,
        url text,
        "verifiedAt" text,
        notes text
      )
  `);
}

async function createQuestion(input: PersistQuestionDraft) {
  const db = getDb();

  try {
    await db.batch([
      db.insert(questions).values({
        id: input.id,
        categoryId: input.categoryId,
        questionText: input.questionText,
        explanation: input.explanation,
        difficulty: input.difficulty,
        mediaType: input.mediaType,
        mediaUrl: input.mediaUrl,
        status: "DRAFT",
        createdAt: input.now,
        updatedAt: input.now,
      }),
      questionOptionInsert(input),
      questionSourceInsert(input),
      db.insert(auditLogs).values({
        adminUserId: input.actorAdminId,
        action: "QUESTION_CREATED",
        entityType: "question",
        entityId: input.id,
        metadata: input.sourceQuestionId
          ? { sourceQuestionId: input.sourceQuestionId }
          : {},
        createdAt: input.now,
      }),
    ]);
  } catch (error) {
    return mapPersistenceError(error);
  }

  const question = await getAdminQuestion(input.id);

  if (!question) {
    throw new Error("Created question could not be read");
  }

  return question;
}

async function getAdminQuestion(
  questionId: string,
): Promise<AdminQuestionDetail | null> {
  const db = getDb();
  const [questionRows, optionRows, sourceRows] = await db.batch([
    db
      .select({
        id: questions.id,
        questionText: questions.questionText,
        explanation: questions.explanation,
        difficulty: questions.difficulty,
        status: questions.status,
        mediaType: questions.mediaType,
        mediaUrl: questions.mediaUrl,
        createdAt: questions.createdAt,
        updatedAt: questions.updatedAt,
        validatedAt: questions.validatedAt,
        validatedBy: questions.validatedBy,
        categoryId: categories.id,
        categoryName: categories.name,
        categorySlug: categories.slug,
        categoryDescription: categories.description,
        categoryActive: categories.active,
      })
      .from(questions)
      .innerJoin(categories, eq(categories.id, questions.categoryId))
      .where(eq(questions.id, questionId))
      .limit(1),
    db
      .select()
      .from(questionOptions)
      .where(eq(questionOptions.questionId, questionId))
      .orderBy(questionOptions.position),
    db
      .select()
      .from(questionSources)
      .where(eq(questionSources.questionId, questionId))
      .orderBy(questionSources.publisher, questionSources.title),
  ]);

  const question = questionRows[0];

  if (!question) {
    return null;
  }

  return {
    id: question.id,
    questionText: question.questionText,
    explanation: question.explanation,
    difficulty: question.difficulty,
    status: question.status,
    mediaType: question.mediaType,
    mediaUrl: question.mediaUrl,
    createdAt: question.createdAt,
    updatedAt: question.updatedAt,
    validatedAt: question.validatedAt,
    validatedBy: question.validatedBy,
    category: {
      id: question.categoryId,
      name: question.categoryName,
      slug: question.categorySlug,
      description: question.categoryDescription,
      active: question.categoryActive,
    },
    options: optionRows.map((option) => ({
      id: option.id,
      label: option.label,
      text: option.text,
      isCorrect: option.isCorrect,
      position: option.position,
    })),
    sources: sourceRows.map((source) => ({
      id: source.id,
      publisher: source.publisher,
      title: source.title,
      url: source.url,
      verifiedAt: source.verifiedAt,
      notes: source.notes,
    })),
  };
}

async function updateQuestion(
  questionId: string,
  input: PersistQuestionDraft,
): Promise<QuestionUpdateOutcome> {
  const db = getDb();

  try {
    const [updatedRows] = await db.batch([
      db
        .update(questions)
        .set({
          categoryId: input.categoryId,
          questionText: input.questionText,
          explanation: input.explanation,
          difficulty: input.difficulty,
          mediaType: input.mediaType,
          mediaUrl: input.mediaUrl,
          status: "DRAFT",
          updatedAt: input.now,
          validatedAt: null,
          validatedBy: null,
        })
        .where(
          and(
            eq(questions.id, questionId),
            inArray(questions.status, ["DRAFT", "REVIEW"]),
          ),
        )
        .returning({ id: questions.id }),
      db.execute(sql`
        UPDATE ${questionOptions}
        SET is_correct = false
        WHERE question_id = ${questionId}::uuid
          AND EXISTS (
            SELECT 1
            FROM ${questions}
            WHERE id = ${questionId}::uuid
              AND status = 'DRAFT'
              AND updated_at = ${input.now}
          )
      `),
      db.execute(sql`
        INSERT INTO ${questionOptions} (
          id,
          question_id,
          label,
          text,
          is_correct,
          position
        )
        SELECT
          item.id::uuid,
          ${questionId}::uuid,
          item.label,
          item.text,
          item."isCorrect",
          item.position
        FROM jsonb_to_recordset(${JSON.stringify(input.options)}::jsonb)
          AS item(id text, label text, text text, "isCorrect" boolean, position integer)
        WHERE EXISTS (
          SELECT 1
          FROM ${questions}
          WHERE id = ${questionId}::uuid
            AND status = 'DRAFT'
            AND updated_at = ${input.now}
        )
        ON CONFLICT (question_id, position) DO UPDATE SET
          label = EXCLUDED.label,
          text = EXCLUDED.text,
          is_correct = EXCLUDED.is_correct
      `),
      db.execute(sql`
        DELETE FROM ${questionOptions}
        WHERE question_id = ${questionId}::uuid
          AND position > ${input.options.length}
          AND EXISTS (
            SELECT 1
            FROM ${questions}
            WHERE id = ${questionId}::uuid
              AND status = 'DRAFT'
              AND updated_at = ${input.now}
          )
      `),
      db.execute(sql`
        DELETE FROM ${questionSources}
        WHERE question_id = ${questionId}::uuid
          AND EXISTS (
            SELECT 1
            FROM ${questions}
            WHERE id = ${questionId}::uuid
              AND status = 'DRAFT'
              AND updated_at = ${input.now}
          )
      `),
      db.execute(sql`
        INSERT INTO ${questionSources} (
          id,
          question_id,
          publisher,
          title,
          url,
          verified_at,
          notes
        )
        SELECT
          item.id::uuid,
          ${questionId}::uuid,
          item.publisher,
          item.title,
          item.url,
          item."verifiedAt"::timestamptz,
          item.notes
        FROM jsonb_to_recordset(${JSON.stringify(input.sources)}::jsonb)
          AS item(
            id text,
            publisher text,
            title text,
            url text,
            "verifiedAt" text,
            notes text
          )
        WHERE EXISTS (
          SELECT 1
          FROM ${questions}
          WHERE id = ${questionId}::uuid
            AND status = 'DRAFT'
            AND updated_at = ${input.now}
        )
      `),
      db.execute(sql`
        INSERT INTO ${auditLogs} (
          admin_user_id,
          action,
          entity_type,
          entity_id,
          metadata,
          created_at
        )
        SELECT
          ${input.actorAdminId}::uuid,
          'QUESTION_UPDATED',
          'question',
          ${questionId}::uuid,
          '{}'::jsonb,
          ${input.now}
        WHERE EXISTS (
          SELECT 1
          FROM ${questions}
          WHERE id = ${questionId}::uuid
            AND status = 'DRAFT'
            AND updated_at = ${input.now}
        )
      `),
    ]);

    if (updatedRows.length === 0) {
      const existing = await getAdminQuestion(questionId);
      return existing ? { outcome: "not_editable" } : { outcome: "not_found" };
    }
  } catch (error) {
    return mapPersistenceError(error);
  }

  const question = await getAdminQuestion(questionId);

  if (!question) {
    return { outcome: "not_found" };
  }

  return { outcome: "updated", question };
}

function listQuestions(filters: {
  categoryId?: string;
  status?: "DRAFT" | "REVIEW" | "VALIDATED" | "ARCHIVED";
  search?: string;
  limit: number;
}) {
  const conditions: SQL[] = [];

  if (filters.categoryId) {
    conditions.push(eq(questions.categoryId, filters.categoryId));
  }

  if (filters.status) {
    conditions.push(eq(questions.status, filters.status));
  }

  if (filters.search) {
    conditions.push(ilike(questions.questionText, `%${filters.search}%`));
  }

  return getDb()
    .select({
      id: questions.id,
      questionText: questions.questionText,
      difficulty: questions.difficulty,
      status: questions.status,
      mediaType: questions.mediaType,
      mediaUrl: questions.mediaUrl,
      createdAt: questions.createdAt,
      updatedAt: questions.updatedAt,
      validatedAt: questions.validatedAt,
      category: {
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        description: categories.description,
        active: categories.active,
      },
      optionCount: sql<number>`(
        SELECT count(*)::integer
        FROM ${questionOptions}
        WHERE ${questionOptions.questionId} = ${questions.id}
      )`.mapWith(Number),
      sourceCount: sql<number>`(
        SELECT count(*)::integer
        FROM ${questionSources}
        WHERE ${questionSources.questionId} = ${questions.id}
      )`.mapWith(Number),
    })
    .from(questions)
    .innerJoin(categories, eq(categories.id, questions.categoryId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(questions.updatedAt))
    .limit(filters.limit);
}

function mapTransitionOutcome(row: TransitionRow | undefined): QuestionTransitionOutcome {
  switch (row?.outcome) {
    case "TRANSITIONED":
      return "transitioned";
    case "INVALID_STATUS":
      return "invalid_status";
    case "INCOMPLETE":
      return "incomplete";
    case "CATEGORY_INACTIVE":
      return "category_inactive";
    default:
      return "not_found";
  }
}

async function runReadinessTransition(
  questionId: string,
  actorAdminId: string,
  now: Date,
  expectedStatus: "DRAFT" | "REVIEW",
  targetStatus: "REVIEW" | "VALIDATED",
  auditAction: "QUESTION_UPDATED" | "QUESTION_VALIDATED",
  requireActiveCategory: boolean,
) {
  const result = await getDb().execute<TransitionRow>(sql`
    WITH state AS (
      SELECT
        question.id,
        question.status::text AS status,
        category.active AS category_active,
        (
          SELECT count(*)::integer
          FROM ${questionOptions}
          WHERE ${questionOptions.questionId} = question.id
        ) AS option_count,
        (
          SELECT count(*)::integer
          FROM ${questionOptions}
          WHERE ${questionOptions.questionId} = question.id
            AND ${questionOptions.isCorrect} = true
        ) AS correct_count,
        (
          SELECT count(*)::integer
          FROM ${questionSources}
          WHERE ${questionSources.questionId} = question.id
        ) AS source_count
      FROM ${questions} AS question
      INNER JOIN ${categories} AS category ON category.id = question.category_id
      WHERE question.id = ${questionId}::uuid
    ), updated AS (
      UPDATE ${questions} AS question
      SET
        status = ${targetStatus}::question_status,
        updated_at = ${now},
        validated_at = CASE
          WHEN ${targetStatus}::text = 'VALIDATED' THEN ${now}
          ELSE question.validated_at
        END,
        validated_by = CASE
          WHEN ${targetStatus}::text = 'VALIDATED' THEN ${actorAdminId}::uuid
          ELSE question.validated_by
        END
      FROM state
      WHERE question.id = state.id
        AND state.status = ${expectedStatus}
        AND state.option_count BETWEEN 2 AND 4
        AND state.correct_count = 1
        AND state.source_count >= 1
        AND (${requireActiveCategory} = false OR state.category_active = true)
      RETURNING question.id
    ), written_audit AS (
      INSERT INTO ${auditLogs} (
        admin_user_id,
        action,
        entity_type,
        entity_id,
        metadata,
        created_at
      )
      SELECT
        ${actorAdminId}::uuid,
        ${auditAction}::audit_action,
        'question',
        updated.id,
        '{}'::jsonb,
        ${now}
      FROM updated
      RETURNING id
    )
    SELECT CASE
      WHEN NOT EXISTS (SELECT 1 FROM state) THEN 'NOT_FOUND'
      WHEN EXISTS (SELECT 1 FROM written_audit) THEN 'TRANSITIONED'
      WHEN (SELECT status FROM state) <> ${expectedStatus} THEN 'INVALID_STATUS'
      WHEN ${requireActiveCategory} = true
        AND (SELECT category_active FROM state) = false THEN 'CATEGORY_INACTIVE'
      ELSE 'INCOMPLETE'
    END AS outcome
  `);

  return mapTransitionOutcome(result.rows[0]);
}

function submitForReview(questionId: string, actorAdminId: string, now: Date) {
  return runReadinessTransition(
    questionId,
    actorAdminId,
    now,
    "DRAFT",
    "REVIEW",
    "QUESTION_UPDATED",
    false,
  );
}

function validateQuestion(questionId: string, actorAdminId: string, now: Date) {
  return runReadinessTransition(
    questionId,
    actorAdminId,
    now,
    "REVIEW",
    "VALIDATED",
    "QUESTION_VALIDATED",
    true,
  );
}

async function archiveQuestion(
  questionId: string,
  actorAdminId: string,
  now: Date,
) {
  const result = await getDb().execute<TransitionRow>(sql`
    WITH state AS (
      SELECT id, status::text AS status
      FROM ${questions}
      WHERE id = ${questionId}::uuid
    ), updated AS (
      UPDATE ${questions} AS question
      SET status = 'ARCHIVED', updated_at = ${now}
      FROM state
      WHERE question.id = state.id
        AND state.status <> 'ARCHIVED'
      RETURNING question.id
    ), written_audit AS (
      INSERT INTO ${auditLogs} (
        admin_user_id,
        action,
        entity_type,
        entity_id,
        metadata,
        created_at
      )
      SELECT
        ${actorAdminId}::uuid,
        'QUESTION_UPDATED',
        'question',
        updated.id,
        '{"status":"ARCHIVED"}'::jsonb,
        ${now}
      FROM updated
      RETURNING id
    )
    SELECT CASE
      WHEN NOT EXISTS (SELECT 1 FROM state) THEN 'NOT_FOUND'
      WHEN EXISTS (SELECT 1 FROM written_audit) THEN 'TRANSITIONED'
      ELSE 'INVALID_STATUS'
    END AS outcome
  `);

  return mapTransitionOutcome(result.rows[0]);
}

export const postgresQuestionLibraryRepository: QuestionLibraryRepository = {
  createCategory,
  listCategories,
  updateCategory,
  createQuestion,
  updateQuestion,
  getAdminQuestion,
  listQuestions,
  submitForReview,
  validateQuestion,
  archiveQuestion,
};
