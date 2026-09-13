import type { Template } from './types';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Fills a generator template.
 *
 * `#` becomes a digit, `A` becomes an uppercase letter, and every other
 * character is copied through. `random` is injected rather than taken
 * from `Math.random` so the seed can drive it from its own deterministic
 * PRNG — reseeding must reproduce the same dataset byte for byte, and a
 * phone number that changes on every reset breaks every screenshot and
 * every piece of documentation written against it.
 */
export function fromTemplate(pattern: Template, random: () => number): string {
  let out = '';
  for (const ch of pattern) {
    if (ch === '#') out += String(Math.floor(random() * 10));
    else if (ch === 'A') out += LETTERS[Math.floor(random() * LETTERS.length)];
    else out += ch;
  }
  return out;
}

/**
 * A full international phone number from a pack's phone spec.
 *
 * Always E.164-prefixed, because a number rendered without its country
 * code is ambiguous the moment the product has tenants in two countries.
 */
export function fictionalPhone(
  spec: { dialCode: string; pattern: Template },
  random: () => number,
): string {
  return `+${spec.dialCode} ${fromTemplate(spec.pattern, random)}`;
}
