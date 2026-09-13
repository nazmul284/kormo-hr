import { Injectable } from '@nestjs/common';
import { getCountryPack } from '@kormo/shared';
import type { CountryPack } from '@kormo/shared';

import { PrismaService } from '../prisma/prisma.service';

/**
 * Everything about a tenant that changes how a date, a duration or an
 * amount of money is interpreted.
 *
 * Before country packs, all of this was a constant: UTC+6, a Friday–
 * Saturday weekend, taka. That is fine until the second tenant is
 * somewhere else, at which point a US company's clock-ins are computed
 * on Dhaka time and their leave requests burn the wrong two days a week.
 */
export interface TenantContext {
  companyId: number;
  country: string;
  pack: CountryPack;
  /** IANA timezone. Attendance and booking windows are computed in it. */
  timezone: string;
  /** 0 = Sunday … 6 = Saturday. */
  weekendDays: number[];
  currency: CountryPack['currency'];
  locale: string;
  fiscalYearStartMonth: number;
}

/**
 * Caches the per-tenant settings that almost every request needs.
 *
 * These live on the Company row and change perhaps once in the life of a
 * tenant, but they are read on nearly every attendance, leave and
 * booking call — so they are cached rather than re-queried. The TTL is
 * short enough that an admin changing a company's weekend sees it take
 * effect while they are still on the settings page, and long enough that
 * a dashboard firing a dozen parallel requests does a single lookup.
 *
 * Note that this caches *settings*, never authorisation: permissions are
 * still re-read from the database on every request.
 */
@Injectable()
export class TenantContextService {
  private static readonly TTL_MS = 30_000;

  private readonly cache = new Map<number, { value: TenantContext; expiresAt: number }>();

  constructor(private readonly prisma: PrismaService) {}

  async get(companyId: number): Promise<TenantContext> {
    const cached = this.cache.get(companyId);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        country: true, timezone: true, weekendDays: true,
        currency: true, locale: true, fiscalYearStartMonth: true,
      },
    });

    // A missing company means a stale session pointing at a deleted
    // tenant. Falling back to the neutral pack keeps the request
    // answerable; the authorisation layer is what refuses it.
    const pack = getCountryPack(company?.country);
    const value: TenantContext = {
      companyId,
      country: company?.country ?? pack.code,
      pack,
      timezone: company?.timezone || pack.timezone,
      // An empty array is a legitimate setting (a seven-day operation),
      // so only a missing row falls back to the pack.
      weekendDays: company?.weekendDays ?? pack.weekendDays,
      currency: pack.currency,
      locale: company?.locale || pack.locale,
      fiscalYearStartMonth:
        company?.fiscalYearStartMonth ?? pack.tax?.fiscalYearStartMonth ?? 1,
    };

    this.cache.set(companyId, { value, expiresAt: Date.now() + TenantContextService.TTL_MS });
    return value;
  }

  /** Drops a tenant's cached settings — call after updating a Company row. */
  invalidate(companyId: number): void {
    this.cache.delete(companyId);
  }
}
