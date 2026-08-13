import { independence66Content } from "./data/independence-66-content.mjs";
import {
  applyIndependence66Seed,
  validateIndependence66Content,
} from "./lib/independence-66-seed.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1]?.trim() : undefined;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

async function main() {
  const manifest = validateIndependence66Content(independence66Content);

  if (!hasFlag("apply")) {
    process.stdout.write(
      [
        "Manifest valide — aucune donnée écrite.",
        `Événement : ${independence66Content.event.name}`,
        `Fuseau : ${independence66Content.event.timezone}`,
        `Catégories : ${manifest.categories}`,
        `Questions validées : ${manifest.questions}`,
        `Sessions : ${manifest.sessions}`,
        `Questions de conducteur : ${manifest.sessionQuestions}`,
      ].join("\n") + "\n",
    );
    return;
  }

  const target = argument("target");
  const adminEmail = argument("admin-email")?.toLowerCase();
  const confirmation = argument("confirm");
  const databaseUrl = process.env.DATABASE_URL_UNPOOLED;
  const result = await applyIndependence66Seed({
    content: independence66Content,
    databaseUrl,
    adminEmail,
    target,
    confirmation,
  });

  process.stdout.write(
    [
      `Seed appliqué sur la cible ${result.target}.`,
      `Hôte : ${result.connection.hostname}`,
      `Base : ${result.connection.database}`,
      `Événement : ${result.eventSlug}`,
      `Catégories : ${result.counts.categories}`,
      `Questions validées : ${result.counts.validatedQuestions}`,
      `Sessions : ${result.counts.sessions}`,
      `Questions de conducteur : ${result.counts.sessionQuestions}`,
    ].join("\n") + "\n",
  );
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : "Le seed a échoué.");
});
