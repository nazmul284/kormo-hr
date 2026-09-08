import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@kormo/shared';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { PaginationQuery } from '../../common/dto/pagination.dto';
import { ParseBigIntPipe, ParseIntIdPipe } from '../../common/pipes/parse-bigint.pipe';
import type { SessionPrincipal } from '../../common/types';
import { PayrollService } from './payroll.service';

class PayslipQuery extends PaginationQuery {
  @ApiPropertyOptional({ minimum: 2000, maximum: 2100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(2000) @Max(2100)
  year?: number;

  @ApiPropertyOptional({ description: 'Defaults to yourself; requires payslip.read.all otherwise' })
  @IsOptional() @IsString()
  employeeId?: string;
}

@ApiTags('payroll')
@Controller('payroll')
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @Get('payslips')
  @RequirePermissions(PERMISSIONS.PAYSLIP_READ_SELF, PERMISSIONS.PAYSLIP_READ_ALL)
  @ApiOperation({
    summary: 'My Payslips',
    description: 'Columns: SN · Month · Salary Date · GS · BA · CAM · Tax · PF · DFA · TA · MB.',
  })
  payslips(@CurrentUser() user: SessionPrincipal, @Query() query: PayslipQuery) {
    return this.payroll.myPayslips(user, query);
  }

  @Get('payslips/:id')
  @RequirePermissions(PERMISSIONS.PAYSLIP_READ_SELF, PERMISSIONS.PAYSLIP_READ_ALL)
  @ApiOperation({ summary: 'Full payslip, with the earning/deduction breakdown' })
  payslip(@CurrentUser() user: SessionPrincipal, @Param('id', ParseBigIntPipe) id: bigint) {
    return this.payroll.payslipDetail(user, id);
  }

  @Get('runs')
  @RequirePermissions(PERMISSIONS.PAYROLL_RUN, PERMISSIONS.PAYSLIP_READ_ALL)
  @ApiOperation({ summary: 'Payroll runs and their state' })
  runs(@CurrentUser() user: SessionPrincipal, @Query('companyId') companyId?: string) {
    return this.payroll.listRuns(user, companyId ? Number(companyId) : undefined);
  }

  @Get('runs/:id')
  @RequirePermissions(PERMISSIONS.PAYROLL_RUN, PERMISSIONS.PAYSLIP_READ_ALL)
  @ApiOperation({ summary: 'Payroll register for one run, with totals' })
  run(
    @CurrentUser() user: SessionPrincipal,
    @Param('id', ParseIntIdPipe) id: number,
    @Query() query: PayslipQuery,
  ) {
    return this.payroll.runDetail(user, id, query);
  }

  @Get('cost-trend')
  @RequirePermissions(PERMISSIONS.PAYROLL_RUN, PERMISSIONS.PAYSLIP_READ_ALL)
  @ApiOperation({ summary: 'Payroll cost trend over recent months' })
  costTrend(
    @CurrentUser() user: SessionPrincipal,
    @Query('companyId') companyId?: string,
    @Query('months') months?: string,
  ) {
    return this.payroll.costTrend(
      user,
      companyId ? Number(companyId) : undefined,
      months ? Math.min(36, Number(months)) : 12,
    );
  }
}
