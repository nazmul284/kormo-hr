import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FEATURE_FLAGS, PERMISSIONS } from '@kormo/shared';

import { CurrentUser, RequireFeature, RequirePermissions } from '../../common/decorators';
import type { SessionPrincipal } from '../../common/types';
import { TaxService } from './tax.service';

@ApiTags('tax')
@Controller('tax')
export class TaxController {
  constructor(private readonly tax: TaxService) {}

  @Get('fiscal-years')
  @ApiOperation({ summary: 'Fiscal years with a published slab configuration' })
  fiscalYears() {
    return this.tax.fiscalYears();
  }

  @Get('statement')
  @RequireFeature(FEATURE_FLAGS.TAX_CALCULATION)
  @RequirePermissions(PERMISSIONS.TAX_READ_SELF, PERMISSIONS.TAX_READ_ALL)
  @ApiOperation({
    summary: 'Full Bangladesh (NBR) tax computation for a fiscal year',
    description:
      'Recomputed live from the salary timeline, bonuses, declared investment and the '
      + 'deduction-at-source ledger. Every intermediate step is returned — gross timeline, '
      + 'earning breakup, exemption, slab-by-slab working, rebate, liability and the '
      + 'monthly instalment — so the figure on a payslip can always be explained.',
  })
  statement(
    @CurrentUser() user: SessionPrincipal,
    @Query('fiscalYear') fiscalYear?: string,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.tax.statement(user, fiscalYear, employeeId);
  }

  @Get('payments')
  @RequirePermissions(PERMISSIONS.TAX_READ_SELF, PERMISSIONS.TAX_READ_ALL)
  @ApiOperation({ summary: 'Month-by-month deduction-at-source ledger' })
  payments(
    @CurrentUser() user: SessionPrincipal,
    @Query('fiscalYear') fiscalYear?: string,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.tax.paymentLedger(user, fiscalYear, employeeId);
  }

  @Get('configuration')
  @ApiOperation({
    summary: 'Published slab ladder per taxpayer category',
    description: 'Data-driven: superseding a year means adding rows, never editing code.',
  })
  configuration(@Query('fiscalYear') fiscalYear?: string) {
    return this.tax.configuration(fiscalYear);
  }

  @Get('company-summary')
  @RequirePermissions(PERMISSIONS.TAX_READ_ALL)
  @ApiOperation({ summary: 'Company-wide tax position for the fiscal year' })
  companySummary(
    @CurrentUser() user: SessionPrincipal,
    @Query('fiscalYear') fiscalYear?: string,
    @Query('companyId') companyId?: string,
  ) {
    return this.tax.companySummary(
      user,
      fiscalYear,
      companyId ? Number(companyId) : undefined,
    );
  }
}
