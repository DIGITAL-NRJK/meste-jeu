import { randomBytes, scrypt as nodeScrypt } from "node:crypto";
import { promisify } from "node:util";

import { neon } from "@neondatabase/serverless";
import "dotenv/config";

const scrypt = promisify(nodeScrypt);

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1]?.trim() : undefined;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

async function promptHidden(label) {
  if (!process.stdin.isTTY || !process.stdout.isTTY || !process.stdin.setRawMode) {
    throw new Error("Cette commande doit être exécutée dans un terminal interactif.");
  }

  process.stdout.write(label);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");

  return new Promise((resolve, reject) => {
    let value = "";

    function finish(error) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
      process.stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    }

    function onData(character) {
      if (character === "\u0003") {
        finish(new Error("Création annulée."));
      } else if (character === "\r" || character === "\n") {
        finish();
      } else if (character === "\u007f" || character === "\b") {
        if (value) {
          value = value.slice(0, -1);
          process.stdout.write("\b \b");
        }
      } else if (character >= " ") {
        value += character;
        process.stdout.write("•");
      }
    }

    process.stdin.on("data", onData);
  });
}

async function hashPassword(password) {
  const salt = randomBytes(24);
  const parameters = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1_024 * 1_024 };
  const derived = await scrypt(password, salt, 64, parameters);

  return [
    "scrypt",
    parameters.N,
    parameters.r,
    parameters.p,
    salt.toString("base64url"),
    derived.toString("base64url"),
  ].join("$");
}

async function main() {
  const email = argument("email")?.toLowerCase();
  const displayName = argument("name");
  const databaseUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    fail("Ajoutez une adresse valide avec --email.");
    return;
  }

  if (!displayName || displayName.length < 2 || displayName.length > 100) {
    fail("Ajoutez un nom de 2 à 100 caractères avec --name.");
    return;
  }

  if (!databaseUrl?.startsWith("postgresql://")) {
    fail("DATABASE_URL ou DATABASE_URL_UNPOOLED est absente.");
    return;
  }

  const password = await promptHidden("Mot de passe administrateur : ");
  const confirmation = await promptHidden("Confirmez le mot de passe : ");

  if (password !== confirmation) {
    fail("Les mots de passe ne correspondent pas.");
    return;
  }

  if (
    password.length < 12 ||
    !/[A-Za-zÀ-ÿ]/.test(password) ||
    !/\d/.test(password) ||
    !/[^A-Za-zÀ-ÿ\d]/.test(password)
  ) {
    fail("Utilisez au moins 12 caractères avec lettre, chiffre et caractère spécial.");
    return;
  }

  const sql = neon(databaseUrl);
  const existing = await sql`
    SELECT id FROM admin_users WHERE lower(email) = lower(${email}) LIMIT 1
  `;

  if (existing.length) {
    fail("Un administrateur utilise déjà cette adresse.");
    return;
  }

  const passwordHash = await hashPassword(password);
  await sql`
    INSERT INTO admin_users (email, password_hash, display_name)
    VALUES (${email}, ${passwordHash}, ${displayName})
  `;
  process.stdout.write(`Administrateur créé pour ${email}.\n`);
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : "La création a échoué.");
});
