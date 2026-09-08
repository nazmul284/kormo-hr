import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FEATURE_FLAGS, PERMISSIONS } from '@kormo/shared';

import { CurrentUser, RequireFeature, RequirePermissions } from '../../common/decorators';
import { ParseIntIdPipe } from '../../common/pipes/parse-bigint.pipe';
import type { SessionPrincipal } from '../../common/types';
import {
  ConfirmationDecisionDto, CreateGoalDto, SubmitReviewDto, UpdateGoalDto,
} from './dto';
import { PerformanceService } from './performance.service';

@ApiTags('performance')
@Controller('performance')
export class PerformanceController {
  constructor(private readonly performance: PerformanceService) {}

  @Get('cycles')
  @ApiOperation({ summary: 'Goal cycles you are enrolled in, with their current phase' })
  myCycles(@CurrentUser() user: SessionPrincipal) {
    return this.performance.myCycles(user);
  }

  @Get('cycles/all')
  @RequirePermissions(PERMISSIONS.GOAL_CYCLE_WRITE)
  @ApiOperation({ summary: 'All goal cycles, for administration' })
  listCycles(@CurrentUser() user: SessionPrincipal, @Query('companyId') companyId?: string) {
    return this.performance.listCycles(user, companyId ? Number(companyId) : undefined);
  }

  @Get('goals/mine')
  @RequireFeature(FEATURE_FLAGS.PMS)
  @ApiOperation({
    summary: 'My Goal',
    description: 'Returns an explicit not-enrolled state rather than an empty list.',
  })
  myGoals(@CurrentUser() user: SessionPrincipal, @Query('goalCycleId') goalCycleId?: string) {
    return this.performance.myGoals(user, goalCycleId ? Number(goalCycleId) : undefined);
  }

  @Get('goals/team')
  @RequireFeature(FEATURE_FLAGS.PMS)
  @RequirePermissions(PERMISSIONS.GOAL_READ_TEAM)
  @ApiOperation({ summary: 'My Team Goal — reports\' goals and review status' })
  teamGoals(@CurrentUser() user: SessionPrincipal, @Query('goalCycleId') goalCycleId?: string) {
    return this.performance.teamGoals(user, goalCycleId ? Number(goalCycleId) : undefined);
  }

  @Post('goals')
  @RequireFeature(FEATURE_FLAGS.PMS)
  @RequirePermissions(PERMISSIONS.GOAL_WRITE_SELF)
  @ApiOperation({
    summary: 'Create a goal inside a cycle',
    description: 'Rejects a goal whose weight would push the cycle total past 100%.',
  })
  createGoal(@CurrentUser() user: SessionPrincipal, @Body() dto: CreateGoalDto) {
    return this.performance.createGoal(user, dto);
  }

  @Patch('goals/:id')
  @RequirePermissions(PERMISSIONS.GOAL_WRITE_SELF)
  @ApiOperation({ summary: 'Update your own goal progress or wording' })
  updateGoal(
    @CurrentUser() user: SessionPrincipal,
    @Param('id', ParseIntIdPipe) id: number,
    @Body() dto: UpdateGoalDto,
  ) {
    return this.performance.updateGoalProgress(user, id, dto);
  }

  @Post('goals/:id/reviews')
  @ApiOperation({ summary: 'Submit a self-assessment or manager review' })
  submitReview(
    @CurrentUser() user: SessionPrincipal,
    @Param('id', ParseIntIdPipe) id: number,
    @Body() dto: SubmitReviewDto,
  ) {
    return this.performance.submitReview(user, id, dto);
  }

  // ── job confirmation ───────────────────────────────────────────────

  @Get('job-confirmation')
  @RequireFeature(FEATURE_FLAGS.JOB_CONFIRMATION)
  @ApiOperation({
    summary: 'Probation confirmation reviews',
    description: 'Includes the Review Completed / Review Remaining counters.',
  })
  confirmationReviews(
    @CurrentUser() user: SessionPrincipal,
    @Query('scope') scope?: 'mine' | 'all',
  ) {
    return this.performance.confirmationReviews(user, scope === 'all' ? 'all' : 'mine');
  }

  @Patch('job-confirmation/:id')
  @RequireFeature(FEATURE_FLAGS.JOB_CONFIRMATION)
  @RequirePermissions(PERMISSIONS.CONFIRMATION_REVIEW)
  @ApiOperation({
    summary: 'Record a confirmation decision',
    description:
      'Confirming flips the employee to PERMANENT and stamps the confirmation date, '
      + 'which changes their leave and benefit eligibility.',
  })
  decideConfirmation(
    @CurrentUser() user: SessionPrincipal,
    @Param('id', ParseIntIdPipe) id: number,
    @Body() dto: ConfirmationDecisionDto,
  ) {
    return this.performance.decideConfirmation(user, id, dto);
  }
}
