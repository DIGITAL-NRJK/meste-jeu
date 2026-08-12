import { z } from "zod";

export function normalizeNickname(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

const nicknameSchema = z
  .string({ error: "Le pseudo est requis." })
  .transform(normalizeNickname)
  .superRefine((nickname, context) => {
    const length = Array.from(nickname).length;

    if (length < 3 || length > 20) {
      context.addIssue({
        code: "custom",
        message: "Le pseudo doit contenir entre 3 et 20 caractères.",
      });
    }

    if (/\p{Cc}|\p{Cf}|\p{Zl}|\p{Zp}/u.test(nickname)) {
      context.addIssue({
        code: "custom",
        message: "Le pseudo contient un caractère non autorisé.",
      });
    }
  });

export const eventSlugSchema = z
  .string({ error: "L’événement est requis." })
  .trim()
  .min(1, "L’événement est requis.")
  .max(100, "L’identifiant de l’événement est trop long.")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "L’identifiant de l’événement est invalide.",
  );

export const playerRegistrationSchema = z
  .object({
    eventSlug: eventSlugSchema,
    nickname: nicknameSchema,
  })
  .strict();

export type PlayerRegistrationInput = z.infer<
  typeof playerRegistrationSchema
>;
