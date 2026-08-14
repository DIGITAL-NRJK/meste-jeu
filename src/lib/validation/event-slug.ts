export const EVENT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Normalise le paramètre `?event=` d'une page de régie.
 *
 * Une valeur absente, vide, dupliquée ou malformée ne doit jamais faire tomber
 * la page : elle est simplement ignorée et la régie retombe sur l'événement par
 * défaut. Seul un slug strictement valide est transmis à la couche métier.
 */
export function readEventSlugParam(
  raw: string | string[] | undefined,
): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return undefined;

  const slug = value.trim();
  if (!slug || slug.length > 120 || !EVENT_SLUG_PATTERN.test(slug)) {
    return undefined;
  }

  return slug;
}
