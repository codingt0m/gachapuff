/** Stable, URL-safe slug: "Big Mac 100K" -> "big-mac-100k", "Pêche Glacée" -> "peche-glacee". */
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\+/g, '-plus')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Puff capacity from a model name: "Chicspire 26.5K" -> 26500, "Cruiser" -> null. */
export function parsePuffCount(model: string): number | null {
  const match = /(\d+(?:[.,]\d+)?)\s*K\b/i.exec(model);
  if (!match?.[1]) return null;
  return Math.round(Number(match[1].replace(',', '.')) * 1000);
}
