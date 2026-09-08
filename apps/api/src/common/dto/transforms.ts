import { Transform } from 'class-transformer';

/**
 * Coerces a query-string value to a real boolean.
 *
 * Necessary because a query string only carries text: `?flag=false`
 * arrives as the string "false", which is truthy. Relying on
 * `enableImplicitConversion` is not enough either — it leaves the value
 * as a string and `@IsBoolean()` then rejects it.
 */
export const ToBoolean = () =>
  Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'boolean') return value;
    const text = String(value).trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(text)) return true;
    if (['false', '0', 'no', 'off'].includes(text)) return false;
    // Anything else stays as-is so @IsBoolean() reports a clear error
    // rather than silently defaulting.
    return value;
  });

/** Comma-separated query list → number[]. */
export const ToNumberArray = () =>
  Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    const items = Array.isArray(value) ? value : String(value).split(',');
    return items
      .map((item) => Number(String(item).trim()))
      .filter((item) => Number.isFinite(item));
  });
