import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { SessionPrincipal } from '../../common/types';
import { companyFilter } from '../../common/utils/scope';
import { currentYear } from '../../common/utils/dates';

@ApiTags('holiday')
@Controller('holidays')
export class HolidayController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({
    summary: 'Public holiday calendar for a year',
    description:
      'Location-specific holidays override company-wide ones; optional (religious) '
      + 'holidays are flagged rather than filtered out.',
  })
  async list(
    @CurrentUser() user: SessionPrincipal,
    @Query('year') year?: string,
    @Query('companyId') companyId?: string,
    @Query('locationId') locationId?: string,
  ) {
    const targetYear = year ? Number(year) : currentYear();
    const companyIds = companyFilter(user, companyId ? Number(companyId) : undefined);
    const location = locationId ? Number(locationId) : user.locationId;

    const holidays = await this.prisma.holiday.findMany({
      where: {
        companyId: { in: companyIds },
        year: targetYear,
        // A null locationId means the holiday applies everywhere.
        OR: [{ locationId: null }, ...(location ? [{ locationId: location }] : [])],
      },
      orderBy: { startDate: 'asc' },
      include: { location: { select: { id: true, name: true } } },
    });

    const today = new Date();
    const totalDays = holidays
      .filter((h) => !h.isOptional)
      .reduce((sum, h) => sum + h.duration, 0);

    return {
      year: targetYear,
      holidays: holidays.map((h) => ({
        ...h,
        isPast: h.endDate < today,
        isUpcoming: h.startDate > today,
        isOngoing: h.startDate <= today && h.endDate >= today,
      })),
      summary: {
        count: holidays.length,
        mandatoryDays: totalDays,
        optionalCount: holidays.filter((h) => h.isOptional).length,
        upcoming: holidays.filter((h) => h.startDate > today).length,
      },
    };
  }

  @Get('years')
  @ApiOperation({ summary: 'Years with a published holiday calendar' })
  async years(@CurrentUser() user: SessionPrincipal) {
    const rows = await this.prisma.holiday.groupBy({
      by: ['year'],
      where: { companyId: { in: user.accessibleCompanyIds } },
      orderBy: { year: 'desc' },
    });
    return rows.map((row) => row.year);
  }

  @Get('next')
  @ApiOperation({ summary: 'The next upcoming holiday' })
  async next(@CurrentUser() user: SessionPrincipal) {
    return this.prisma.holiday.findFirst({
      where: {
        companyId: { in: user.accessibleCompanyIds },
        isOptional: false,
        endDate: { gte: new Date() },
      },
      orderBy: { startDate: 'asc' },
    });
  }
}
