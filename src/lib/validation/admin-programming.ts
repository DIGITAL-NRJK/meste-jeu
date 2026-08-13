import { z } from "zod";

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("fr-FR", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export const eventInputSchema = z
  .object({
    name: z.string().trim().min(3).max(150),
    description: z
      .string()
      .trim()
      .max(1_000)
      .optional()
      .transform((value) => value || null),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    timezone: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .refine(isValidTimeZone, "Le fuseau horaire est invalide."),
  })
  .superRefine((event, context) => {
    if (event.endsAt <= event.startsAt) {
      context.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "La fin de l’événement doit être postérieure au début.",
      });
    }
  });

export const eventActionSchema = z.object({
  action: z.literal("MARK_READY"),
});

export type EventInput = z.infer<typeof eventInputSchema>;
export type EventActionInput = z.infer<typeof eventActionSchema>;
