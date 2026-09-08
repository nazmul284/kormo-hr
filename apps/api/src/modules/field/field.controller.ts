import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiPropertyOptional, ApiProperty, ApiTags } from '@nestjs/swagger';
import { FEATURE_FLAGS, PERMISSIONS } from '@kormo/shared';
import { Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString,
  Max, MaxLength, Min,
} from 'class-validator';

import { CurrentUser, RequireFeature, RequirePermissions } from '../../common/decorators';
import { PaginationQuery } from '../../common/dto/pagination.dto';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import type { SessionPrincipal } from '../../common/types';
import { FieldService } from './field.service';

class VisitListQuery extends PaginationQuery {
  @ApiPropertyOptional({ minimum: 1, maximum: 12 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(12)
  month?: number;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(2000) @Max(2100)
  year?: number;
}

class CustomerListQuery extends PaginationQuery {
  @ApiPropertyOptional({ enum: ['A_PLUS', 'A', 'B', 'C', 'D'] })
  @IsOptional() @IsIn(['A_PLUS', 'A', 'B', 'C', 'D'])
  contactLevel?: string;
}

class CreateVisitDto {
  @ApiProperty() @Type(() => Number) @IsInt()
  customerId!: number;

  @ApiProperty({ example: '2026-09-08' })
  @IsDateString()
  visitDate!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120)
  personVisited?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255)
  purpose?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255)
  outcome?: string;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  orderValue?: number;

  @ApiPropertyOptional({ description: 'GPS latitude of the check-in' })
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90)
  lat?: number;

  @ApiPropertyOptional({ description: 'GPS longitude of the check-in' })
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180)
  lng?: number;

  @ApiPropertyOptional({ type: [String], description: 'Colleagues on a joint visit' })
  @IsOptional() @IsArray() @IsString({ each: true })
  participantIds?: string[];
}

class TrackingConsentDto {
  @ApiProperty({ description: 'Your explicit consent to location tracking during working hours' })
  @IsBoolean()
  enabled!: boolean;
}

@ApiTags('field-force')
@Controller('field-force')
export class FieldController {
  constructor(private readonly field: FieldService) {}

  // ── visits ─────────────────────────────────────────────────────────

  @Get('visits/mine')
  @RequireFeature(FEATURE_FLAGS.CUSTOMER_VISIT_MY_VISIT)
  @ApiOperation({ summary: 'Your customer visits for a month' })
  myVisits(@CurrentUser() user: SessionPrincipal, @Query() query: VisitListQuery) {
    return this.field.myVisits(user, query);
  }

  @Post('visits')
  @RequirePermissions(PERMISSIONS.VISIT_CREATE)
  @ApiOperation({
    summary: 'Log a customer visit',
    description:
      'If GPS coordinates are supplied, the distance from the customer\'s registered '
      + 'location is recorded as a verification signal.',
  })
  createVisit(@CurrentUser() user: SessionPrincipal, @Body() dto: CreateVisitDto) {
    return this.field.createVisit(user, dto);
  }

  @Get('visits/dashboard')
  @RequireFeature(FEATURE_FLAGS.CUSTOMER_VISIT_OVERVIEW)
  @RequirePermissions(PERMISSIONS.VISIT_READ_ALL)
  @ApiOperation({
    summary: 'Customer visit dashboard',
    description:
      'Top 20 customers, top 20 employees, distribution by contact level, the daily '
      + 'trend, and the customer-wise joint-visit table.',
  })
  dashboard(
    @CurrentUser() user: SessionPrincipal,
    @Query('month') month?: string,
    @Query('year') year?: string,
    @Query('companyId') companyId?: string,
  ) {
    return this.field.visitDashboard(
      user,
      month ? Number(month) : undefined,
      year ? Number(year) : undefined,
      companyId ? Number(companyId) : undefined,
    );
  }

  @Get('customers')
  @ApiOperation({ summary: 'Customer master list' })
  customers(@CurrentUser() user: SessionPrincipal, @Query() query: CustomerListQuery) {
    return this.field.customers(user, query);
  }

  // ── tracking ───────────────────────────────────────────────────────

  @Get('tracking/overview')
  @RequireFeature(FEATURE_FLAGS.EMPLOYEE_TRACKING)
  @ApiOperation({
    summary: 'Live and recent tracking sessions',
    description:
      'Employees who have not consented are listed separately rather than silently '
      + 'omitted from the map.',
  })
  trackingOverview(
    @CurrentUser() user: SessionPrincipal,
    @Query('scope') scope?: 'ongoing' | 'previous',
    @Query('companyId') companyId?: string,
  ) {
    return this.field.trackingOverview(
      user,
      scope === 'previous' ? 'previous' : 'ongoing',
      companyId ? Number(companyId) : undefined,
    );
  }

  @Get('tracking/config')
  @ApiOperation({ summary: 'Your own tracking consent and window' })
  myTrackingConfig(@CurrentUser() user: SessionPrincipal) {
    return this.field.myTrackingConfig(user);
  }

  @Patch('tracking/config')
  @ApiOperation({
    summary: 'Give or withdraw your consent to location tracking',
    description: 'Consent is the employee\'s to give and to withdraw at any time.',
  })
  setConsent(@CurrentUser() user: SessionPrincipal, @Body() dto: TrackingConsentDto) {
    return this.field.setTrackingConsent(user, dto.enabled);
  }

  @Get('tracking/report')
  @RequireFeature(FEATURE_FLAGS.EMPLOYEE_TRACKING)
  @ApiOperation({ summary: 'Distance, sessions and visits per employee over a range' })
  trackingReport(
    @CurrentUser() user: SessionPrincipal,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('companyId') companyId?: string,
  ) {
    return this.field.trackingReport(user, from, to, companyId ? Number(companyId) : undefined);
  }

  @Get('tracking/sessions/:id')
  @RequireFeature(FEATURE_FLAGS.EMPLOYEE_TRACKING)
  @ApiOperation({ summary: 'Full breadcrumb polyline for one session' })
  trackingSession(@CurrentUser() user: SessionPrincipal, @Param('id', ParseBigIntPipe) id: bigint) {
    return this.field.trackingSession(user, id);
  }
}
