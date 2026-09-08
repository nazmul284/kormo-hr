import { Decimal } from '@prisma/client/runtime/library';

/**
 * Normalises Prisma's non-JSON-native types for the wire.
 *
 * BigInt throws on JSON.stringify and Decimal serialises to an object, so
 * both are converted at the response boundary. Doing it here — rather
 * than hand-mapping in every service — means a newly added field can
 * never leak a `{ s, e, d }` Decimal blob to the client.
 */
export function serialize<T>(value: T): T {
  return normalise(value) as T;
}

function normalise(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === 'bigint') {
    // Employee ids are well inside Number.MAX_SAFE_INTEGER; emitting a
    // plain number keeps the JSON API idiomatic for clients.
    return Number(value);
  }

  if (value instanceof Decimal) return Number(value);
  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) return value.map(normalise);

  // Decimal instances created by a different copy of the runtime library
  // fail the instanceof check, so fall back to a structural test.
  if (typeof value === 'object') {
    const candidate = value as Record<string, unknown>;
    if (
      typeof candidate.toFixed === 'function' &&
      typeof candidate.toNumber === 'function' &&
      's' in candidate && 'e' in candidate && 'd' in candidate
    ) {
      return Number((candidate as unknown as Decimal).toNumber());
    }

    if (candidate.constructor === Object || candidate.constructor === undefined) {
      const out: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(candidate)) out[key] = normalise(item);
      return out;
    }
  }

  return value;
}

/** Coerces a route/query id into BigInt, rejecting junk. */
export function toBigInt(value: string | number | bigint, field = 'id'): bigint {
  if (typeof value === 'bigint') return value;
  const text = String(value).trim();
  // Guard the exact failure the reference system shipped: building URLs
  // from unvalidated state produced live requests to /undefined and /null.
  if (!/^\d{1,19}$/.test(text)) {
    throw new Error(`Invalid ${field}: ${text}`);
  }
  return BigInt(text);
}
