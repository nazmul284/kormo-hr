import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

/**
 * Route-param pipe for BigInt ids.
 *
 * The system this replaces fired live requests to `/undefined` and
 * `/null` because it built URLs straight from unvalidated client state.
 * Rejecting those here turns a confusing 503 into an honest 400.
 */
@Injectable()
export class ParseBigIntPipe implements PipeTransform<string, bigint> {
  transform(value: string): bigint {
    const text = String(value ?? '').trim();
    if (!/^\d{1,19}$/.test(text)) {
      throw new BadRequestException(`Expected a numeric id, received "${text}".`);
    }
    try {
      return BigInt(text);
    } catch {
      throw new BadRequestException(`Expected a numeric id, received "${text}".`);
    }
  }
}

/** Same guard for plain integer ids (companies, departments, …). */
@Injectable()
export class ParseIntIdPipe implements PipeTransform<string, number> {
  transform(value: string): number {
    const text = String(value ?? '').trim();
    if (!/^\d{1,9}$/.test(text)) {
      throw new BadRequestException(`Expected a numeric id, received "${text}".`);
    }
    return Number(text);
  }
}
