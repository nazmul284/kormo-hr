import { BANGLADESH_DEMO } from './bangladesh';
import { INDIA_DEMO } from './india';
import { INTERNATIONAL_DEMO } from './international';
import { UNITED_ARAB_EMIRATES_DEMO } from './uae';
import { UNITED_KINGDOM_DEMO } from './united-kingdom';
import { UNITED_STATES_DEMO } from './us';
import type { DemoPack } from './types';

export type { DemoPack, GeoPoint } from './types';

export const DEMO_PACKS: Record<string, DemoPack> = {
  INTL: INTERNATIONAL_DEMO,
  US: UNITED_STATES_DEMO,
  GB: UNITED_KINGDOM_DEMO,
  IN: INDIA_DEMO,
  AE: UNITED_ARAB_EMIRATES_DEMO,
  BD: BANGLADESH_DEMO,
};

/**
 * Resolves the demo pool for a country code.
 *
 * Unlike the runtime pack lookup this one throws: seeding an unknown
 * country would silently produce a dataset from the wrong place, and the
 * seed is the one context where failing loudly costs nothing.
 */
export function getDemoPack(code: string): DemoPack {
  const pack = DEMO_PACKS[code.toUpperCase()];
  if (!pack) {
    throw new Error(
      `No demo data pack for country "${code}". ` +
        `Available: ${Object.keys(DEMO_PACKS).join(', ')}. ` +
        `Add one under prisma/seed/packs/ to seed a new country.`,
    );
  }
  return pack;
}
