import "server-only";

import { randomUUID } from "node:crypto";

import { and, desc, eq, ilike, sql, type SQL } from "drizzle-orm";

import {
  auditLogs,
  categories,
  questionOptions,
  questions,
  questionSources,
  quizSessions,
  sessionQuestions,
} from "../../../db/schema";
import { getDb } from "@/lib/db/client";
import {
  type AdminQuestionDetail,
  type CategoryUpdateOutcome,
  type PersistQuestionDraft,
  type QuestionDeleteOutcome,
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
  const mutationId = randomUUID();
  const isComplete =
    input.options.length >= 2 &&
    input.options.length <= 4 &&
    input.options.filter((option) => option.isCorrect).length === 1 &&
    input.sources.length >= 1;

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
          updatedAt: input.now,
          validatedAt: sql`CASE
            WHEN ${questions.status} = 'VALIDATED' THEN ${input.now}
            ELSE ${questions.validatedAt}
          END`,
          validatedBy: sql`CASE
            WHEN ${questions.status} = 'VALIDATED' THEN ${input.actorAdminId}::uuid
            ELSE ${questions.validatedBy}
          END`,
        })
        .where(
          and(
            eq(questions.id, questionId),
            sql`${questions.status} <> 'ARCHIVED'`,
            sql`NOT EXISTS (
              SELECT 1
              FROM ${sessionQuestions} AS occurrence
              INNER JOIN ${quizSessions} AS session
                ON session.id = occurrence.quiz_session_id
              WHERE occurrence.question_id = ${questionId}::uuid
                AND (
                  occurrence.status <> 'PENDING'
                  OR session.status <> 'DRAFT'
                )
            )`,
            sql`(
              ${questions.status} = 'DRAFT'
              OR ${isComplete}::boolean = true
            )`,
            sql`(
              ${questions.status} <> 'VALIDATED'
              OR EXISTS (
                SELECT 1
                FROM ${categories} AS category
                WHERE category.id = ${input.categoryId}::uuid
                  AND category.active = true
              )
            )`,
          ),
        )
        .returning({ id: questions.id }),
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
          question.id,
          jsonb_build_object(
            'mutationId', ${mutationId}::text,
            'status', question.status::text
          ),
          ${input.now}
        FROM ${questions} AS question
        WHERE question.id = ${questionId}::uuid
          AND question.updated_at = ${input.now}
          AND question.status <> 'ARCHIVED'
          AND NOT EXISTS (
            SELECT 1
            FROM ${sessionQuestions} AS occurrence
            INNER JOIN ${quizSessions} AS session
              ON session.id = occurrence.quiz_session_id
            WHERE occurrence.question_id = question.id
              AND (
                occurrence.status <> 'PENDING'
                OR session.status <> 'DRAFT'
              )
          )
          AND (question.status = 'DRAFT' OR ${isComplete}::boolean = true)
          AND (
            question.status <> 'VALIDATED'
            OR EXISTS (
              SELECT 1
              FROM ${categories} AS category
              WHERE category.id = ${input.categoryId}::uuid
                AND category.active = true
            )
          )
      `),
      db.execute(sql`
        UPDATE ${questionOptions}
        SET is_correct = false
        WHERE question_id = ${questionId}::uuid
          AND EXISTS (
            SELECT 1
            FROM ${auditLogs}
            WHERE entity_type = 'question'
              AND entity_id = ${questionId}::uuid
              AND metadata ->> 'mutationId' = ${mutationId}::text
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
          FROM ${auditLogs}
          WHERE entity_type = 'question'
            AND entity_id = ${questionId}::uuid
            AND metadata ->> 'mutationId' = ${mutationId}::text
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
            FROM ${auditLogs}
            WHERE entity_type = 'question'
              AND entity_id = ${questionId}::uuid
              AND metadata ->> 'mutationId' = ${mutationId}::text
          )
      `),
      db.execute(sql`
        DELETE FROM ${questionSources}
        WHERE question_id = ${questionId}::uuid
          AND EXISTS (
            SELECT 1
            FROM ${auditLogs}
            WHERE entity_type = 'question'
              AND entity_id = ${questionId}::uuid
              AND metadata ->> 'mutationId' = ${mutationId}::text
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
          FROM ${auditLogs}
          WHERE entity_type = 'question'
            AND entity_id = ${questionId}::uuid
            AND metadata ->> 'mutationId' = ${mutationId}::text
        )
      `),
    ]);

    if (updatedRows.length === 0) {
      const existing = await getAdminQuestion(questionId);
      if (!existing) return { outcome: "not_found" };
      if (existing.status === "ARCHIVED") return { outcome: "not_editable" };

      const [protectedOccurrence] = await db
        .select({ id: sessionQuestions.id })
        .from(sessionQuestions)
        .innerJoin(
          quizSessions,
          eq(quizSessions.id, sessionQuestions.quizSessionId),
        )
        .where(
          and(
            eq(sessionQuestions.questionId, questionId),
            sql`(
              ${sessionQuestions.status} <> 'PENDING'
              OR ${quizSessions.status} <> 'DRAFT'
            )`,
          ),
        )
        .limit(1);

      if (protectedOccurrence) return { outcome: "protected" };
      if (existing.status !== "DRAFT" && !isComplete) {
        return { outcome: "incomplete" };
      }

      if (existing.status === "VALIDATED") {
        const [category] = await db
          .select({ active: categories.active })
          .from(categories)
          .where(eq(categories.id, input.categoryId))
          .limit(1);

        if (!category) {
          throw new QuestionPersistenceError("category_not_found");
        }

        if (!category.active) return { outcome: "category_inactive" };
      }

      return { outcome: "not_editable" };
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

type DeleteQuestionRow = {
  outcome: "DELETED" | "NOT_FOUND" | "PROTECTED";
};

async function deleteQuestion(
  questionId: string,
  actorAdminId: string,
  now: Date,
): Promise<QuestionDeleteOutcome> {
  const db = getDb();
  const mutationId = randomUUID();
  const [result] = await db.batch([
    db.execute<DeleteQuestionRow>(sql`
      WITH state AS (
        SELECT
          question.id,
          question.status::text AS status,
          EXISTS (
            SELECT 1
            FROM ${sessionQuestions} AS occurrence
            INNER JOIN ${quizSessions} AS session
              ON session.id = occurrence.quiz_session_id
            WHERE occurrence.question_id = question.id
              AND (
                occurrence.status <> 'PENDING'
                OR session.status <> 'DRAFT'
              )
          ) AS is_protected
        FROM ${questions} AS question
        WHERE question.id = ${questionId}::uuid
        FOR UPDATE
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
          state.id,
          jsonb_build_object(
            'operation', 'DELETED',
            'mutationId', ${mutationId}::text,
            'previousStatus', state.status,
            'removedFromSessions', (
              SELECT count(*)
              FROM ${sessionQuestions}
              WHERE question_id = state.id
            ),
            'sessionIds', COALESCE(
              (
                SELECT jsonb_agg(DISTINCT occurrence.quiz_session_id::text)
                FROM ${sessionQuestions} AS occurrence
                WHERE occurrence.question_id = state.id
              ),
              '[]'::jsonb
            )
          ),
          ${now}
        FROM state
        WHERE state.is_protected = false
        RETURNING id
      )
      SELECT CASE
        WHEN NOT EXISTS (SELECT 1 FROM state) THEN 'NOT_FOUND'
        WHEN EXISTS (SELECT 1 FROM written_audit) THEN 'DELETED'
        ELSE 'PROTECTED'
      END::text AS outcome
    `),
    db.execute(sql`
      DELETE FROM ${sessionQuestions} AS occurrence
      WHERE occurrence.question_id = ${questionId}::uuid
        AND EXISTS (
          SELECT 1
          FROM ${auditLogs} AS log
          WHERE log.entity_type = 'question'
            AND log.entity_id = ${questionId}::uuid
            AND log.metadata ->> 'mutationId' = ${mutationId}::text
        )
    `),
    db.execute(sql`
      DELETE FROM ${questionSources} AS source
      WHERE source.question_id = ${questionId}::uuid
        AND EXISTS (
          SELECT 1
          FROM ${auditLogs} AS log
          WHERE log.entity_type = 'question'
            AND log.entity_id = ${questionId}::uuid
            AND log.metadata ->> 'mutationId' = ${mutationId}::text
        )
    `),
    db.execute(sql`
      DELETE FROM ${questionOptions} AS option
      WHERE option.question_id = ${questionId}::uuid
        AND EXISTS (
          SELECT 1
          FROM ${auditLogs} AS log
          WHERE log.entity_type = 'question'
            AND log.entity_id = ${questionId}::uuid
            AND log.metadata ->> 'mutationId' = ${mutationId}::text
        )
    `),
    db.execute(sql`
      DELETE FROM ${questions} AS question
      WHERE question.id = ${questionId}::uuid
        AND EXISTS (
          SELECT 1
          FROM ${auditLogs} AS log
          WHERE log.entity_type = 'question'
            AND log.entity_id = ${questionId}::uuid
            AND log.metadata ->> 'mutationId' = ${mutationId}::text
        )
    `),
    db.execute(sql`
      UPDATE ${sessionQuestions} AS occurrence
      SET position = occurrence.position + (
        SELECT COALESCE(max(current.position), 0) + 1
        FROM ${sessionQuestions} AS current
        WHERE current.quiz_session_id = occurrence.quiz_session_id
      )
      WHERE occurrence.quiz_session_id IN (
        SELECT jsonb_array_elements_text(log.metadata -> 'sessionIds')::uuid
        FROM ${auditLogs} AS log
        WHERE log.admin_user_id = ${actorAdminId}::uuid
          AND log.entity_type = 'question'
          AND log.entity_id = ${questionId}::uuid
          AND log.action = 'QUESTION_UPDATED'
          AND log.metadata ->> 'operation' = 'DELETED'
          AND log.metadata ->> 'mutationId' = ${mutationId}::text
      )
    `),
    db.execute(sql`
      WITH ranked AS (
        SELECT
          occurrence.id,
          row_number() OVER (
            PARTITION BY occurrence.quiz_session_id
            ORDER BY occurrence.position
          )::integer AS next_position
        FROM ${sessionQuestions} AS occurrence
        WHERE occurrence.quiz_session_id IN (
          SELECT jsonb_array_elements_text(log.metadata -> 'sessionIds')::uuid
          FROM ${auditLogs} AS log
          WHERE log.entity_type = 'question'
            AND log.entity_id = ${questionId}::uuid
            AND log.metadata ->> 'mutationId' = ${mutationId}::text
        )
      )
      UPDATE ${sessionQuestions} AS occurrence
      SET position = ranked.next_position
      FROM ranked
      WHERE occurrence.id = ranked.id
    `),
  ]);

  switch (result.rows[0]?.outcome) {
    case "DELETED":
      return "deleted";
    case "PROTECTED":
      return "protected";
    default:
      return "not_found";
  }
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
  deleteQuestion,
  getAdminQuestion,
  listQuestions,
  submitForReview,
  validateQuestion,
  archiveQuestion,
};
