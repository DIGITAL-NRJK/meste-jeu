/**
 * Normalisation des valeurs renvoyées par une requête SQL brute.
 *
 * Le pilote HTTP Neon ne convertit pas les colonnes `timestamptz` en `Date`
 * lorsque la requête est écrite en SQL brut : il renvoie le texte PostgreSQL,
 * par exemple `2026-08-15 18:30:00.123456+00`. Cette chaîne n'est pas de
 * l'ISO 8601 : `Date.parse` la refuse sur certains navigateurs mobiles, et tout
 * appel à `toISOString()` échoue côté serveur.
 *
 * Toute couche d'accès aux données qui déclare renvoyer une `Date` doit donc
 * passer ses colonnes temporelles par ces fonctions.
 */

const POSTGRES_TIMESTAMP_PATTERN =
  /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d+)?)\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/;

function parseTimestamp(value: string): Date {
  const match = POSTGRES_TIMESTAMP_PATTERN.exec(value.trim());

  if (!match) {
    return new Date(value);
  }

  const [, day, time, rawOffset] = match;
  let offset = rawOffset ?? "Z";

  if (offset !== "Z") {
    const sign = offset.slice(0, 1);
    const digits = offset.slice(1).replace(":", "");
    const hours = digits.slice(0, 2);
    const minutes = digits.slice(2, 4) || "00";
    offset = `${sign}${hours}:${minutes}`;
  }

  return new Date(`${day}T${time}${offset}`);
}

/** Convertit une colonne temporelle non nulle en `Date`. */
export function toDate(value: Date | string | number): Date {
  if (value instanceof Date) return value;

  const parsed =
    typeof value === "number" ? new Date(value) : parseTimestamp(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new TypeError(
      "Valeur temporelle illisible renvoyée par la base de données.",
    );
  }

  return parsed;
}

/** Convertit une colonne temporelle nullable en `Date` ou `null`. */
export function toNullableDate(
  value: Date | string | number | null | undefined,
): Date | null {
  return value === null || value === undefined ? null : toDate(value);
}
