import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { FEATURE_FLAGS, PERMISSIONS } from '@kormo/shared';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { CurrentUser, RequireFeature, RequirePermissions } from '../../common/decorators';
import { ParseBigIntPipe, ParseIntIdPipe } from '../../common/pipes/parse-bigint.pipe';
import type { SessionPrincipal } from '../../common/types';
import { FoodService } from './food.service';

class CancelMealDto {
  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional() @IsString() @MaxLength(255)
  reason?: string;
}

class GuestMealDto {
  @ApiProperty({ minimum: 0, maximum: 5 })
  @Type(() => Number) @IsInt() @Min(0) @Max(5)
  guestCount!: number;
}

@ApiTags('food')
@Controller('food')
export class FoodController {
  constructor(private readonly food: FoodService) {}

  @Get('programs')
  @RequireFeature(FEATURE_FLAGS.FOOD_PROGRAM)
  @ApiOperation({ summary: 'Meal programmes, the rotating weekly menu, and your subscription' })
  programs(@CurrentUser() user: SessionPrincipal) {
    return this.food.programs(user);
  }

  @Get('monthly')
  @RequireFeature(FEATURE_FLAGS.FOOD_PROGRAM)
  @ApiOperation({
    summary: 'Monthly tab',
    description: 'Columns: SN · Date · Day · Time · Menu · Guest Meal Cost · Self Cost.',
  })
  monthly(
    @CurrentUser() user: SessionPrincipal,
    @Query('programId') programId?: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    return this.food.monthly(
      user,
      programId ? Number(programId) : undefined,
      month ? Number(month) : undefined,
      year ? Number(year) : undefined,
    );
  }

  @Get('report')
  @RequireFeature(FEATURE_FLAGS.FOOD_PROGRAM)
  @ApiOperation({ summary: 'Report tab — monthly consumption and cost' })
  report(
    @CurrentUser() user: SessionPrincipal,
    @Query('programId') programId?: string,
    @Query('year') year?: string,
  ) {
    return this.food.report(
      user,
      programId ? Number(programId) : undefined,
      year ? Number(year) : undefined,
    );
  }

  @Post('programs/:id/subscribe')
  @RequireFeature(FEATURE_FLAGS.FOOD_PROGRAM)
  @RequirePermissions(PERMISSIONS.FOOD_SUBSCRIBE)
  @ApiOperation({ summary: 'Subscribe to a meal programme' })
  subscribe(@CurrentUser() user: SessionPrincipal, @Param('id', ParseIntIdPipe) id: number) {
    return this.food.subscribe(user, id);
  }

  @Post('programs/:id/unsubscribe')
  @RequireFeature(FEATURE_FLAGS.FOOD_PROGRAM)
  @ApiOperation({
    summary: 'Unsubscribe from a meal programme',
    description: 'Cancels future scheduled meals; history is retained for billing.',
  })
  unsubscribe(@CurrentUser() user: SessionPrincipal, @Param('id', ParseIntIdPipe) id: number) {
    return this.food.unsubscribe(user, id);
  }

  @Patch('meals/:id/cancel')
  @RequireFeature(FEATURE_FLAGS.FOOD_PROGRAM)
  @ApiOperation({
    summary: 'Cancel one meal',
    description: 'Blocked after the morning cut-off, once the kitchen has the headcount.',
  })
  cancelMeal(
    @CurrentUser() user: SessionPrincipal,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: CancelMealDto,
  ) {
    return this.food.cancelMeal(user, id, dto.reason);
  }

  @Patch('meals/:id/guests')
  @RequireFeature(FEATURE_FLAGS.FOOD_PROGRAM)
  @ApiOperation({ summary: 'Add chargeable guest meals to a day' })
  addGuests(
    @CurrentUser() user: SessionPrincipal,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: GuestMealDto,
  ) {
    return this.food.addGuestMeal(user, id, dto.guestCount);
  }

  @Get('consumption')
  @RequirePermissions(PERMISSIONS.FOOD_MANAGE)
  @ApiOperation({ summary: 'Programme-wide consumption for the kitchen and finance' })
  consumption(
    @CurrentUser() user: SessionPrincipal,
    @Query('month') month?: string,
    @Query('year') year?: string,
    @Query('companyId') companyId?: string,
  ) {
    return this.food.consumptionSummary(
      user,
      month ? Number(month) : undefined,
      year ? Number(year) : undefined,
      companyId ? Number(companyId) : undefined,
    );
  }
}
