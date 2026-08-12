import { z } from "zod";

const serverEnvSchema = z.object({
  DATABASE_URL: z.url().startsWith("postgresql://"),
  DATABASE_URL_UNPOOLED: z.url().startsWith("postgresql://").optional(),
  APP_URL: z.url(),
  SESSION_SECRET: z.string().min(32),
  ADMIN_AUTH_SECRET: z.string().min(32),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedEnv: ServerEnv | undefined;

export function getServerEnv(
  source: Record<string, string | undefined> = process.env,
): ServerEnv {
  if (source === process.env && cachedEnv) {
    return cachedEnv;
  }

  const result = serverEnvSchema.safeParse(source);

  if (!result.success) {
    const invalidKeys = result.error.issues
      .map((issue) => issue.path.join("."))
      .filter(Boolean)
      .join(", ");

    throw new Error(
      `Variables d'environnement serveur invalides ou absentes : ${invalidKeys}`,
    );
  }

  if (source === process.env) {
    cachedEnv = result.data;
  }

  return result.data;
}
