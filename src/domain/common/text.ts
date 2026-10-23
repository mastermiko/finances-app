/** Text helpers shared by entry, import, rules and duplicate detection. */

export const LABEL_MAX_LENGTH = 120;
export const NOTE_MAX_LENGTH = 1000;

/** Trims and collapses inner whitespace (incl. non-breaking spaces). Keeps case. */
export function cleanLabel(value: string): string {
  return value.replace(/[\s  ]+/g, ' ').trim();
}

/** Removes diacritics: "Planète" → "Planete". */
export function stripDiacritics(value: string): string {
  return value.normalize('NFD').replace(/\p{M}+/gu, '');
}

/**
 * Normalized comparison key: case-, accent-, punctuation- and spacing-insensitive.
 * "Carter-Cash", "carter cash " and "Carter Cash" share the key "carter cash".
 */
export function labelKey(value: string): string {
  return stripDiacritics(value)
    .toLocaleLowerCase('fr')
    .replace(/[-_'’`.,;:/\\|+*!?()[\]{}"«»]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Case- and accent-insensitive "contains" used by search filters. */
export function matchesText(haystack: string, needleKey: string): boolean {
  if (needleKey === '') return true;
  return labelKey(haystack).includes(needleKey);
}
