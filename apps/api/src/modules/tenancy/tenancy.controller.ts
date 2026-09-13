import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { SessionPrincipal } from '../../common/types';
import { companyFilter } from '../../common/utils/scope';

/**
 * Reference data for filter dropdowns. Everything is scoped to the
 * companies the caller can actually reach.
 */
@ApiTags('tenancy')
@Controller('tenancy')
export class TenancyController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('companies')
  @ApiOperation({ summary: 'Companies you have access to' })
  companies(@CurrentUser() user: SessionPrincipal) {
    return this.prisma.company.findMany({
      where: { id: { in: user.accessibleCompanyIds } },
      select: {
        id: true, name: true, alias: true, logoPath: true, timezone: true,
        country: true, currency: true, locale: true, weekendDays: true,
        fiscalYearStartMonth: true, isActive: true,
        _count: { select: { employees: { where: { active: true } } } },
      },
      orderBy: { id: 'asc' },
    });
  }

  @Get('locations')
  @ApiOperation({ summary: 'Locations' })
  locations(@CurrentUser() user: SessionPrincipal, @Query('companyId') companyId?: string) {
    return this.prisma.location.findMany({
      where: {
        companyId: { in: companyFilter(user, companyId ? Number(companyId) : undefined) },
        isActive: true,
      },
      select: { id: true, companyId: true, name: true, alias: true, city: true, lat: true, lng: true },
      orderBy: { name: 'asc' },
    });
  }

  @Get('departments')
  @ApiOperation({ summary: 'Departments with active headcount' })
  async departments(@CurrentUser() user: SessionPrincipal, @Query('companyId') companyId?: string) {
    const rows = await this.prisma.department.findMany({
      where: {
        companyId: { in: companyFilter(user, companyId ? Number(companyId) : undefined) },
        isActive: true,
      },
      select: {
        id: true, companyId: true, name: true, code: true, parentDepartmentId: true,
        _count: { select: { employees: { where: { active: true } } } },
      },
      orderBy: { name: 'asc' },
    });
    return rows.map(({ _count, ...rest }) => ({ ...rest, headcount: _count.employees }));
  }

  @Get('designations')
  @ApiOperation({ summary: 'Designations, most senior first' })
  designations(@CurrentUser() user: SessionPrincipal, @Query('companyId') companyId?: string) {
    return this.prisma.designation.findMany({
      where: {
        companyId: { in: companyFilter(user, companyId ? Number(companyId) : undefined) },
        isActive: true,
      },
      select: { id: true, companyId: true, name: true, grade: true, level: true },
      orderBy: [{ level: 'desc' }, { name: 'asc' }],
    });
  }

  @Get('shifts')
  @ApiOperation({ summary: 'Shift definitions' })
  shifts(@CurrentUser() user: SessionPrincipal, @Query('companyId') companyId?: string) {
    return this.prisma.shift.findMany({
      where: {
        companyId: { in: companyFilter(user, companyId ? Number(companyId) : undefined) },
        isActive: true,
      },
      orderBy: { startTime: 'asc' },
    });
  }

  @Get('features')
  @ApiOperation({ summary: 'Feature flags for your company (UI hints only)' })
  features(@CurrentUser() user: SessionPrincipal) {
    return user.features;
  }
}
