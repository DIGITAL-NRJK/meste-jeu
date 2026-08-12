import { z } from "zod";

export const adminLiveControlSchema = z
  .object({
    action: z.enum([
      "MARK_READY",
      "START_SESSION",
      "OPEN_NEXT_QUESTION",
      "CLOSE_CURRENT_QUESTION",
      "REVEAL_CURRENT_QUESTION",
      "CANCEL_CURRENT_QUESTION",
      "FINISH_SESSION",
    ]),
    sessionId: z.uuid(),
    sessionQuestionId: z.uuid().optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (
      input.action === "CANCEL_CURRENT_QUESTION" &&
      !input.sessionQuestionId
    ) {
      context.addIssue({
        code: "custom",
        path: ["sessionQuestionId"],
        message: "Question requise.",
      });
    }
  });

export type AdminLiveControlInput = z.infer<typeof adminLiveControlSchema>;
