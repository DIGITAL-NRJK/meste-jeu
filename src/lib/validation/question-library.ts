import { z } from "zod";

const optionalTrimmedText = z
  .string()
  .trim()
  .max(2_000)
  .optional()
  .transform((value) => value || null);

export const categoryInputSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: optionalTrimmedText,
});

export const categoryUpdateInputSchema = categoryInputSchema.extend({
  active: z.boolean(),
});

export const questionOptionInputSchema = z.object({
  text: z.string().trim().min(1).max(500),
  isCorrect: z.boolean().default(false),
});

export const questionSourceInputSchema = z.object({
  publisher: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(500),
  url: z.url().max(2_000),
  verifiedAt: z.coerce.date(),
  notes: optionalTrimmedText,
});

export const questionDraftInputSchema = z
  .object({
    categoryId: z.uuid(),
    questionText: z.string().trim().min(5).max(500),
    explanation: z.string().trim().min(1).max(2_000),
    difficulty: z.number().int().min(1).max(4),
    mediaType: z.enum(["TEXT", "IMAGE"]).default("TEXT"),
    mediaUrl: z.url().max(2_000).nullable().optional().default(null),
    options: z.array(questionOptionInputSchema).max(4).default([]),
    sources: z.array(questionSourceInputSchema).max(10).default([]),
  })
  .superRefine((question, context) => {
    if (
      question.options.filter((option) => option.isCorrect).length > 1
    ) {
      context.addIssue({
        code: "custom",
        path: ["options"],
        message: "Une question ne peut avoir qu’une seule bonne réponse.",
      });
    }

    if (question.mediaType === "IMAGE" && !question.mediaUrl) {
      context.addIssue({
        code: "custom",
        path: ["mediaUrl"],
        message: "Une question avec image doit définir une URL.",
      });
    }

    if (question.mediaType === "TEXT" && question.mediaUrl) {
      context.addIssue({
        code: "custom",
        path: ["mediaUrl"],
        message: "Une question texte ne doit pas définir de média.",
      });
    }

    const sourceUrls = question.sources.map((source) => source.url);

    if (new Set(sourceUrls).size !== sourceUrls.length) {
      context.addIssue({
        code: "custom",
        path: ["sources"],
        message: "Une même source ne peut être ajoutée qu’une fois.",
      });
    }
  });

export const questionListFiltersSchema = z.object({
  categoryId: z.uuid().optional(),
  status: z
    .enum(["DRAFT", "REVIEW", "VALIDATED", "ARCHIVED"])
    .optional(),
  search: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const questionActionInputSchema = z.object({
  action: z.enum(["SUBMIT_FOR_REVIEW", "VALIDATE"]),
});

export type CategoryInput = z.infer<typeof categoryInputSchema>;
export type CategoryUpdateInput = z.infer<typeof categoryUpdateInputSchema>;
export type QuestionDraftInput = z.infer<typeof questionDraftInputSchema>;
export type QuestionListFilters = z.infer<typeof questionListFiltersSchema>;
export type QuestionActionInput = z.infer<typeof questionActionInputSchema>;
