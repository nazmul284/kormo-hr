import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@kormo/shared';

import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import type { SessionPrincipal } from '../../common/types';
import {
  ApplyLeaveDto, BalanceQuery, BradfordQuery, ColleaguesOnLeaveQuery, LeaveDecisionDto,
  LeaveListQuery, PreviewLeaveDto,
} from './dto';
import { LeaveService } from './leave.service';

@ApiTags('leave')
@Controller('leave')
export class LeaveController {
  constructor(private readonly leave: LeaveService) {}

  // ── reference ──────────────────────────────────────────────────────

  @Get('types')
  @ApiOperation({
    summary: 'Leave types you are eligible for',
    description: 'Gender-restricted types are filtered server-side, not just hidden in the UI.',
  })
  types(@CurrentUser() user: SessionPrincipal) {
    return this.leave.myLeaveTypes(user);
  }

  @Get('balances')
  @ApiOperation({ summary: 'Leave balances for a year, including fractional accrual' })
  balances(@CurrentUser() user: SessionPrincipal, @Query() query: BalanceQuery) {
    return this.leave.balances(user, query);
  }

  // ── applying ───────────────────────────────────────────────────────

  @Post('preview')
  @ApiOperation({
    summary: 'Dry-run the day maths before submitting',
    description:
      'Returns Leave Days vs Calendar Days, the weekend/holiday breakdown, and any '
      + 'warnings. Uses the same implementation as submit, so the two cannot disagree.',
  })
  preview(@CurrentUser() user: SessionPrincipal, @Body() dto: PreviewLeaveDto) {
    return this.leave.preview(user, dto);
  }

  @Post('apply')
  @RequirePermissions(PERMISSIONS.LEAVE_APPLY)
  @ApiOperation({ summary: 'Apply for leave' })
  apply(@CurrentUser() user: SessionPrincipal, @Body() dto: ApplyLeaveDto) {
    return this.leave.apply(user, dto);
  }

  @Get('requests/mine')
  @ApiOperation({ summary: 'Your leave requests' })
  myRequests(@CurrentUser() user: SessionPrincipal, @Query() query: LeaveListQuery) {
    return this.leave.myRequests(user, query);
  }

  @Get('report')
  @ApiOperation({ summary: 'My Leave Report — consumption by type and by month' })
  report(@CurrentUser() user: SessionPrincipal, @Query('year') year?: string) {
    return this.leave.myReport(user, year ? Number(year) : undefined);
  }

  @Get('carry-forward')
  @ApiOperation({ summary: 'Your carry-forward history, with caps and expiry' })
  carryForward(@CurrentUser() user: SessionPrincipal) {
    return this.leave.myCarryForward(user);
  }

  @Patch('requests/:id/cancel')
  @ApiOperation({ summary: 'Withdraw your own leave request' })
  cancel(@CurrentUser() user: SessionPrincipal, @Param('id', ParseBigIntPipe) id: bigint) {
    return this.leave.cancel(user, id);
  }

  // ── approvals ──────────────────────────────────────────────────────

  @Get('approvals/pending')
  @RequirePermissions(PERMISSIONS.LEAVE_APPROVE)
  @ApiOperation({
    summary: 'Leave requests awaiting your approval',
    description: 'Columns: SN · Name · SD · ED · LD · LT · AD.',
  })
  approvalQueue(@CurrentUser() user: SessionPrincipal, @Query() query: LeaveListQuery) {
    return this.leave.approvalQueue(user, query);
  }

  @Get('approvals/archive')
  @RequirePermissions(PERMISSIONS.LEAVE_APPROVE)
  @ApiOperation({ summary: 'Leave requests you have already decided' })
  archive(@CurrentUser() user: SessionPrincipal, @Query() query: LeaveListQuery) {
    return this.leave.archive(user, query);
  }

  @Patch('requests/:id/decide')
  @RequirePermissions(PERMISSIONS.LEAVE_APPROVE)
  @ApiOperation({
    summary: 'Approve or reject a leave request',
    description:
      'Moves the balance from pending to consumed and stamps the attendance rows, '
      + 'so the monthly grid and payroll reflect the decision immediately.',
  })
  decide(
    @CurrentUser() user: SessionPrincipal,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: LeaveDecisionDto,
  ) {
    return this.leave.decide(user, id, dto);
  }

  @Get('bradford')
  @ApiOperation({
    summary: 'Bradford Factor score (S² × D)',
    description:
      'Counts unplanned absence only — sick, casual and unpaid leave. Planned annual '
      + 'leave is excluded, since scoring it would make the metric meaningless.',
  })
  bradford(@CurrentUser() user: SessionPrincipal, @Query() query: BradfordQuery) {
    return this.leave.bradford(user, query);
  }

  // ── org-wide absence ───────────────────────────────────────────────

  @Get('colleagues-on-leave')
  @ApiOperation({ summary: 'Who is on leave on a given date' })
  colleaguesOnLeave(@CurrentUser() user: SessionPrincipal, @Query() query: ColleaguesOnLeaveQuery) {
    return this.leave.colleaguesOnLeave(user, query);
  }
}
