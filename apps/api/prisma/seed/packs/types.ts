/**
 * Demo-data pools, one file per country.
 *
 * Kept out of `packages/shared` on purpose. The runtime country pack —
 * currency, weekend, tax slabs — is loaded by the API and shipped to the
 * browser; these pools are only ever read by the seed script, and there
 * is no reason for a few thousand names to travel to anyone's browser.
 *
 * ── Everything in here is invented ───────────────────────────────────
 * Company names, banks, universities, previous employers and customer
 * chains are fictional. Any resemblance to a real organisation is
 * accidental, and if you spot one that is too close, it is a bug worth
 * reporting: this repository is public and its demo data ends up in
 * screenshots, issue reports and forks.
 */

export interface GeoPoint {
  name: string;
  lat: number;
  lng: number;
}

export interface DemoPack {
  /** Must match a `CountryPack.code` in packages/shared/src/locale. */
  country: string;

  /**
   * Multiplier applied to the one shared designation salary table.
   *
   * The table is written in Bangladeshi taka (scale 1) because that is
   * where it came from. Every other pack scales it, so adding a country
   * does not mean re-inventing twenty salary figures — and a number that
   * reads as a senior salary in taka does not read as a rounding error
   * in dollars.
   */
  salaryScale: number;

  /** Default identity of the two seeded tenants. Overridable by env. */
  tenant: {
    name: string;
    alias: string;
    /** Prefix for the HR-facing unique tag on each employee (ACME-101…). */
    tagPrefix: string;
    /** Mail domain. Always under the reserved `.example` TLD. */
    domain: string;
    secondName: string;
    secondAlias: string;
  };

  /** Nationality written onto employee records. */
  nationality: string;
  /** Country name written onto postal addresses. */
  countryName: string;

  /** Head office, and the map centre the field-force module scatters around. */
  headOffice: {
    addressLine: string;
    city: string;
    region: string;
    postalCode: string;
    lat: number;
    lng: number;
  };
  /** Second site — the logistics tenant's address. */
  secondSite: { addressLine: string; city: string; postalCode: string };

  names: {
    male: string[];
    female: string[];
    surnames: string[];
  };

  /** Neighbourhoods within the head-office city. */
  areas: string[];
  /** Provinces, states or districts — used for home addresses. */
  regions: string[];
  /** Secondary cities with real coordinates, for out-of-town customers. */
  cities: GeoPoint[];

  banks: { name: string; branches: string[]; txn: string }[];
  universities: string[];
  degrees: { degree: string; major: string }[];
  employers: string[];

  /**
   * Weighted religion pool. Repetition is the weighting — the seed picks
   * uniformly from the array, so a value listed three times is three
   * times as likely. Used only to demonstrate the optional-holiday
   * feature, never to gate anything.
   */
  religions: string[];

  /** Customer names for the field-force module, assembled prefix + suffix. */
  customerChains: { prefix: string[]; suffix: string[] };

  /** Office and meeting-room naming, so the workplace module reads local. */
  floorLabels: string[];
}
