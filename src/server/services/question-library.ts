import { randomUUID } from "node:crypto";

import { z } from "zod";

import {
  categoryInputSchema,
  type CategoryInput,
  questionDraftInputSchema,
  type QuestionDraftInput,
  questionListFiltersSchema,
  type QuestionListFilters,
} from "@/lib/validation/question-library";

export type QuestionStatus = "DRAFT" | "REVIEW" | "VALIDATED" | "ARCHIVED";
export type QuestionMediaType = "TEXT" | "IMAGE";

export type QuestionCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  active: boolean;
};

export type AdminQuestionOption = {
  id: string;
  label: string;
  text: string;
  isCorrect: boolean;
  position: number;
};

export type AdminQuestionSource = {
  id: string;
  publisher: string;
  title: string;
  url: string;
  verifiedAt: Date;
  notes: string | null;
};

export type AdminQuestionDetail = {
  id: string;
  category: QuestionCategory;
  questionText: string;
  explanation: string;
  difficulty: number;
  status: QuestionStatus;
  mediaType: QuestionMediaType;
  mediaUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  validatedAt: Date | null;
  validatedBy: string | null;
  options: AdminQuestionOption[];
  sources: AdminQuestionSource[];
};

export type QuestionSummary = Omit<
  AdminQuestionDetail,
  "explanation" | "options" | "sources" | "validatedBy"
> & {
  optionCount: number;
  sourceCount: number;
};

export type PersistQuestionDraft = Omit<
  QuestionDraftInput,
  "options" | "sources"
> & {
  id: string;
  actorAdminId: string;
  now: Date;
  sourceQuestionId?: string;
  options: Array<AdminQuestionOption>;
  sources: Array<AdminQuestionSource>;
};

export type QuestionTransitionOutcome =
  | "transitioned"
  | "not_found"
  | "invalid_status"
  | "incomplete"
  | "category_inactive";

export type QuestionUpdateOutcome =
  | { outcome: "updated"; question: AdminQuestionDetail }
  | { outcome: "not_found" }
  | { outcome: "not_editable" };

export interface QuestionLibraryRepository {
  createCategory(input: CategoryInput & { slug: string }): Promise<QuestionCategory>;
  listCategories(activeOnly: boolean): Promise<QuestionCategory[]>;
  createQuestion(input: PersistQuestionDraft): Promise<AdminQuestionDetail>;
  updateQuestion(
    questionId: string,
    input: PersistQuestionDraft,
  ): Promise<QuestionUpdateOutcome>;
  getAdminQuestion(questionId: string): Promise<AdminQuestionDetail | null>;
  listQuestions(filters: QuestionListFilters): Promise<QuestionSummary[]>;
  submitForReview(
    questionId: string,
    actorAdminId: string,
    now: Date,
  ): Promise<QuestionTransitionOutcome>;
  validateQuestion(
    questionId: string,
    actorAdminId: string,
    now: Date,
  ): Promise<QuestionTransitionOutcome>;
  archiveQuestion(
    questionId: string,
    actorAdminId: string,
    now: Date,
  ): Promise<QuestionTransitionOutcome>;
}

export class QuestionInputError extends Error {
  constructor(readonly issues: z.core.$ZodIssue[]) {
    super("Invalid question library input");
    this.name = "QuestionInputError";
  }
}

export class QuestionNotFoundError extends Error {
  constructor() {
    super("Question not found");
    this.name = "QuestionNotFoundError";
  }
}

export class QuestionNotEditableError extends Error {
  constructor() {
    super("Question is not editable");
    this.name = "QuestionNotEditableError";
  }
}

export class QuestionInvalidStatusError extends Error {
  constructor() {
    super("Question status does not allow this transition");
    this.name = "QuestionInvalidStatusError";
  }
}

export class QuestionNotReadyError extends Error {
  constructor(readonly reason: "incomplete" | "category_inactive") {
    super(`Question is not ready: ${reason}`);
    this.name = "QuestionNotReadyError";
  }
}

export class CategoryConflictError extends Error {
  constructor() {
    super("Category slug already exists");
    this.name = "CategoryConflictError";
  }
}

export class QuestionCategoryNotFoundError extends Error {
  constructor() {
    super("Question category not found");
    this.name = "QuestionCategoryNotFoundError";
  }
}

export class QuestionPersistenceError extends Error {
  constructor(readonly kind: "category_not_found" | "category_conflict") {
    super(`Question library persistence error: ${kind}`);
    this.name = "QuestionPersistenceError";
  }
}

type QuestionServiceDependencies = {
  repository: QuestionLibraryRepository;
  now?: () => Date;
  createId?: () => string;
};

const optionLabels = ["A", "B", "C", "D"] as const;

export function normalizeCategorySlug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseInput<T>(result: { success: true; data: T } | { success: false; error: z.ZodError }): T {
  if (!result.success) {
    throw new QuestionInputError(result.error.issues);
  }

  return result.data;
}

function buildPersistedDraft(
  input: QuestionDraftInput,
  actorAdminId: string,
  dependencies: QuestionServiceDependencies,
  questionId = dependencies.createId?.() ?? randomUUID(),
  sourceQuestionId?: string,
): PersistQuestionDraft {
  const createId = dependencies.createId ?? randomUUID;

  return {
    ...input,
    id: questionId,
    actorAdminId,
    now: dependencies.now?.() ?? new Date(),
    sourceQuestionId,
    mediaUrl: input.mediaType === "TEXT" ? null : input.mediaUrl,
    options: input.options.map((option, index) => ({
      id: createId(),
      label: optionLabels[index],
      text: option.text,
      isCorrect: option.isCorrect,
      position: index + 1,
    })),
    sources: input.sources.map((source) => ({
      id: createId(),
      publisher: source.publisher,
      title: source.title,
      url: source.url,
      verifiedAt: source.verifiedAt,
      notes: source.notes,
    })),
  };
}

function assertActorId(actorAdminId: string): void {
  const result = z.string().uuid().safeParse(actorAdminId);

  if (!result.success) {
    throw new QuestionInputError(result.error.issues);
  }
}

function mapPersistenceError(error: unknown): never {
  if (error instanceof QuestionPersistenceError) {
    if (error.kind === "category_conflict") {
      throw new CategoryConflictError();
    }

    throw new QuestionCategoryNotFoundError();
  }

  throw error;
}

export async function createCategory(
  input: unknown,
  repository: QuestionLibraryRepository,
): Promise<QuestionCategory> {
  const category = parseInput(categoryInputSchema.safeParse(input));
  const slug = normalizeCategorySlug(category.name);

  if (!slug) {
    throw new QuestionInputError([]);
  }

  try {
    return await repository.createCategory({ ...category, slug });
  } catch (error) {
    return mapPersistenceError(error);
  }
}

export function listCategories(
  repository: QuestionLibraryRepository,
  activeOnly = false,
) {
  return repository.listCategories(activeOnly);
}

export async function createQuestionDraft(
  input: unknown,
  actorAdminId: string,
  dependencies: QuestionServiceDependencies,
  sourceQuestionId?: string,
): Promise<AdminQuestionDetail> {
  assertActorId(actorAdminId);
  const question = parseInput(questionDraftInputSchema.safeParse(input));
  const persisted = buildPersistedDraft(
    question,
    actorAdminId,
    dependencies,
    undefined,
    sourceQuestionId,
  );

  try {
    return await dependencies.repository.createQuestion(persisted);
  } catch (error) {
    return mapPersistenceError(error);
  }
}

export async function updateQuestionDraft(
  questionId: string,
  input: unknown,
  actorAdminId: string,
  dependencies: QuestionServiceDependencies,
): Promise<AdminQuestionDetail> {
  assertActorId(actorAdminId);
  const id = parseInput(z.uuid().safeParse(questionId));
  const question = parseInput(questionDraftInputSchema.safeParse(input));
  let result: QuestionUpdateOutcome;

  try {
    result = await dependencies.repository.updateQuestion(
      id,
      buildPersistedDraft(question, actorAdminId, dependencies, id),
    );
  } catch (error) {
    return mapPersistenceError(error);
  }

  if (result.outcome === "not_found") {
    throw new QuestionNotFoundError();
  }

  if (result.outcome === "not_editable") {
    throw new QuestionNotEditableError();
  }

  return result.question;
}

export async function getQuestion(
  questionId: string,
  repository: QuestionLibraryRepository,
): Promise<AdminQuestionDetail> {
  const id = parseInput(z.uuid().safeParse(questionId));
  const question = await repository.getAdminQuestion(id);

  if (!question) {
    throw new QuestionNotFoundError();
  }

  return question;
}

export async function duplicateQuestion(
  questionId: string,
  actorAdminId: string,
  dependencies: QuestionServiceDependencies,
): Promise<AdminQuestionDetail> {
  assertActorId(actorAdminId);
  const id = parseInput(z.uuid().safeParse(questionId));
  const source = await dependencies.repository.getAdminQuestion(id);

  if (!source) {
    throw new QuestionNotFoundError();
  }

  const suffix = " (copie)";
  const questionText = `${source.questionText.slice(0, 500 - suffix.length)}${suffix}`;

  return createQuestionDraft(
    {
      categoryId: source.category.id,
      questionText,
      explanation: source.explanation,
      difficulty: source.difficulty,
      mediaType: source.mediaType,
      mediaUrl: source.mediaUrl,
      options: source.options.map(({ text, isCorrect }) => ({ text, isCorrect })),
      sources: source.sources.map(({ publisher, title, url, verifiedAt, notes }) => ({
        publisher,
        title,
        url,
        verifiedAt,
        notes: notes ?? undefined,
      })),
    },
    actorAdminId,
    dependencies,
    source.id,
  );
}

function handleTransitionOutcome(outcome: QuestionTransitionOutcome): void {
  if (outcome === "transitioned") {
    return;
  }

  if (outcome === "not_found") {
    throw new QuestionNotFoundError();
  }

  if (outcome === "invalid_status") {
    throw new QuestionInvalidStatusError();
  }

  throw new QuestionNotReadyError(outcome);
}

async function transitionQuestion(
  questionId: string,
  actorAdminId: string,
  dependencies: QuestionServiceDependencies,
  transition: QuestionLibraryRepository["submitForReview"],
): Promise<AdminQuestionDetail> {
  assertActorId(actorAdminId);
  const id = parseInput(z.uuid().safeParse(questionId));
  const outcome = await transition(
    id,
    actorAdminId,
    dependencies.now?.() ?? new Date(),
  );
  handleTransitionOutcome(outcome);

  const question = await dependencies.repository.getAdminQuestion(id);

  if (!question) {
    throw new QuestionNotFoundError();
  }

  return question;
}

export function submitQuestionForReview(
  questionId: string,
  actorAdminId: string,
  dependencies: QuestionServiceDependencies,
) {
  return transitionQuestion(
    questionId,
    actorAdminId,
    dependencies,
    dependencies.repository.submitForReview.bind(dependencies.repository),
  );
}

export function validateQuestion(
  questionId: string,
  actorAdminId: string,
  dependencies: QuestionServiceDependencies,
) {
  return transitionQuestion(
    questionId,
    actorAdminId,
    dependencies,
    dependencies.repository.validateQuestion.bind(dependencies.repository),
  );
}

export function archiveQuestion(
  questionId: string,
  actorAdminId: string,
  dependencies: QuestionServiceDependencies,
) {
  return transitionQuestion(
    questionId,
    actorAdminId,
    dependencies,
    dependencies.repository.archiveQuestion.bind(dependencies.repository),
  );
}

export function listQuestions(
  filters: unknown,
  repository: QuestionLibraryRepository,
) {
  return repository.listQuestions(
    parseInput(questionListFiltersSchema.safeParse(filters)),
  );
}
