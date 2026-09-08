import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators';
import type { SessionPrincipal } from '../../common/types';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @ApiOperation({
    summary: 'All nine home-screen widgets in one call',
    description:
      'Identity, attendance donut and sparkline, notice board, leave balances, '
      + 'Bradford score, mini-calendar, current-week stats, birthdays and '
      + 'anniversaries, office policy, plus the approval-inbox badges.',
  })
  summary(@CurrentUser() user: SessionPrincipal) {
    return this.dashboard.summary(user);
  }

  @Get('company-overview')
  @ApiOperation({
    summary: 'Organisation KPIs for HR and leadership',
    description: 'Returns `{ available: false }` when the caller lacks company-wide access.',
  })
  companyOverview(@CurrentUser() user: SessionPrincipal) {
    return this.dashboard.companyOverview(user);
  }
}
