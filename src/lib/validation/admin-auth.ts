import { z } from "zod";

export const adminLoginSchema = z.object({
  email: z
    .string()
    .trim()
    .max(320)
    .pipe(z.email("Saisissez une adresse email valide.")),
  password: z.string().min(1, "Saisissez votre mot de passe.").max(200),
});

export type AdminLoginInput = z.infer<typeof adminLoginSchema>;
