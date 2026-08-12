import { z } from "zod";

const nullableDate = z.coerce.date().nullable().optional().default(null);

export const quizSessionInputSchema = z
  .object({
    eventId: z.uuid(),
    name: z.string().trim().min(3).max(150),
    mode: z.enum(["DISCOVERY", "LIVE"]),
    startsAt: nullableDate,
    endsAt: nullableDate,
    resetScore: z.boolean().default(false),
  })
  .superRefine((session, context) => {
    if (
      session.startsAt &&
      session.endsAt &&
      session.endsAt <= session.startsAt
    ) {
      context.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "La fin de session doit être postérieure au début.",
      });
    }
  });

export const sessionLineupItemSchema = z.object({
  questionId: z.uuid(),
  durationSeconds: z.number().int().min(1).max(3_600),
});

export const sessionLineupSchema = z
  .array(sessionLineupItemSchema)
  .max(100)
  .superRefine((items, context) => {
    const questionIds = items.map((item) => item.questionId);

    if (new Set(questionIds).size !== questionIds.length) {
      context.addIssue({
        code: "custom",
        message: "Une question ne peut apparaître qu’une fois dans une session.",
      });
    }
  });

export type QuizSessionInput = z.infer<typeof quizSessionInputSchema>;
export type SessionLineupInput = z.infer<typeof sessionLineupSchema>;
