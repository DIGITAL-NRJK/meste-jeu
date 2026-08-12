import { z } from "zod";

export const answerSubmissionSchema = z.object({
  optionId: z.uuid(),
});

export type AnswerSubmissionInput = z.infer<typeof answerSubmissionSchema>;
