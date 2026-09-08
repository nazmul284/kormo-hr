import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@kormo/shared';

import { CurrentUser, RequireFeature, RequirePermissions } from '../../common/decorators';
import { FEATURE_FLAGS } from '@kormo/shared';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import type { SessionPrincipal } from '../../common/types';
import { AttendanceService } from './attendance.service';
import {
  ApprovalQueueQuery, AttendanceEditRequestDto, AttendanceQuery, CompensationRequestDto,
  DecisionDto, MonthQuery, OvertimeRequestDto, RosterQuery, ShiftExchangeRequestDto,
} from './dto';

@ApiTags('attendance')
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  // ── views ──────────────────────────────────────────────────────────

  @Get()
  @RequirePermissions(PERMISSIONS.ATTENDANCE_READ_SELF, PERMISSIONS.ATTENDANCE_READ_TEAM, PERMISSIONS.ATTENDANCE_READ_ALL)
  @ApiOperation({
    summary: 'Monthly attendance grid',
    description: 'Columns: SN · Date · Day · Shift · IT · OT · LT · BT · TH · OTH · Status.',
  })
  monthly(@CurrentUser() user: SessionPrincipal, @Query() query: AttendanceQuery) {
    return this.attendance.monthly(user, query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Monthly on-time / late / absent percentages and trend' })
  stats(@CurrentUser() user: SessionPrincipal, @Query() query: MonthQuery) {
    return this.attendance.monthlyStats(user, query);
  }

  @Get('current-week')
  @ApiOperation({ summary: "This week's work-hour totals and averages" })
  currentWeek(@CurrentUser() user: SessionPrincipal) {
    return this.attendance.currentWeek(user);
  }

  @Get('calendar')
  @ApiOperation({ summary: 'Per-day status dots for the mini-calendar' })
  calendar(@CurrentUser() user: SessionPrincipal, @Query() query: MonthQuery) {
    return this.attendance.calendar(user, query);
  }

  @Get('roster')
  @RequirePermissions(PERMISSIONS.ROSTER_READ)
  @ApiOperation({ summary: 'Shift calendar — your roster, or your team\'s' })
  roster(@CurrentUser() user: SessionPrincipal, @Query() query: RosterQuery) {
    return this.attendance.roster(user, query);
  }

  @Get('pending-counts')
  @ApiOperation({ summary: 'Approval-inbox badge counts' })
  pendingCounts(@CurrentUser() user: SessionPrincipal) {
    return this.attendance.pendingCounts(user);
  }

  // ── edit requests ──────────────────────────────────────────────────

  @Post('edit-requests')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_EDIT_REQUEST)
  @ApiOperation({ summary: 'Request a correction to your in/out time' })
  createEditRequest(@CurrentUser() user: SessionPrincipal, @Body() dto: AttendanceEditRequestDto) {
    return this.attendance.createEditRequest(user, dto);
  }

  @Get('edit-requests/mine')
  @ApiOperation({ summary: 'Your attendance correction requests' })
  myEditRequests(@CurrentUser() user: SessionPrincipal, @Query() query: ApprovalQueueQuery) {
    return this.attendance.listMyEditRequests(user, query);
  }

  @Get('edit-requests/queue')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_EDIT_APPROVE, PERMISSIONS.ATTENDANCE_OVERRIDE)
  @ApiOperation({ summary: 'Corrections awaiting your approval' })
  editRequestQueue(@CurrentUser() user: SessionPrincipal, @Query() query: ApprovalQueueQuery) {
    return this.attendance.editRequestQueue(user, query);
  }

  @Patch('edit-requests/:id')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_EDIT_APPROVE, PERMISSIONS.ATTENDANCE_OVERRIDE)
  @ApiOperation({ summary: 'Approve or reject an attendance correction' })
  decideEditRequest(
    @CurrentUser() user: SessionPrincipal,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: DecisionDto,
  ) {
    return this.attendance.decideEditRequest(user, id, dto);
  }

  // ── overtime ───────────────────────────────────────────────────────

  @Post('overtime')
  @RequireFeature(FEATURE_FLAGS.OVERTIME)
  @RequirePermissions(PERMISSIONS.OVERTIME_REQUEST)
  @ApiOperation({ summary: 'Raise an overtime request' })
  createOvertime(@CurrentUser() user: SessionPrincipal, @Body() dto: OvertimeRequestDto) {
    return this.attendance.createOvertimeRequest(user, dto);
  }

  @Get('overtime/mine')
  @ApiOperation({ summary: 'Your overtime requests and approved hours' })
  myOvertime(@CurrentUser() user: SessionPrincipal, @Query() query: ApprovalQueueQuery) {
    return this.attendance.listMyOvertime(user, query);
  }

  @Get('overtime/queue')
  @RequirePermissions(PERMISSIONS.OVERTIME_APPROVE)
  @ApiOperation({ summary: 'Overtime awaiting your approval' })
  overtimeQueue(@CurrentUser() user: SessionPrincipal, @Query() query: ApprovalQueueQuery) {
    return this.attendance.overtimeQueue(user, query);
  }

  @Patch('overtime/:id')
  @RequirePermissions(PERMISSIONS.OVERTIME_APPROVE)
  @ApiOperation({ summary: 'Approve or reject overtime' })
  decideOvertime(
    @CurrentUser() user: SessionPrincipal,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: DecisionDto,
  ) {
    return this.attendance.decideOvertime(user, id, dto);
  }

  // ── compensation (comp-off) ────────────────────────────────────────

  @Post('compensation')
  @RequirePermissions(PERMISSIONS.COMPENSATION_REQUEST)
  @ApiOperation({
    summary: 'Claim compensatory leave for a weekend or holiday worked',
    description: 'Only days whose attendance record is flagged as eligible can be claimed.',
  })
  createCompensation(@CurrentUser() user: SessionPrincipal, @Body() dto: CompensationRequestDto) {
    return this.attendance.createCompensationRequest(user, dto);
  }

  @Get('compensation/mine')
  @ApiOperation({ summary: 'Your compensatory leave claims' })
  myCompensation(@CurrentUser() user: SessionPrincipal, @Query() query: ApprovalQueueQuery) {
    return this.attendance.listMyCompensation(user, query);
  }

  @Get('compensation/queue')
  @RequirePermissions(PERMISSIONS.COMPENSATION_APPROVE)
  @ApiOperation({ summary: 'Compensatory leave claims awaiting your approval' })
  compensationQueue(@CurrentUser() user: SessionPrincipal, @Query() query: ApprovalQueueQuery) {
    return this.attendance.compensationQueue(user, query);
  }

  @Patch('compensation/:id')
  @RequirePermissions(PERMISSIONS.COMPENSATION_APPROVE)
  @ApiOperation({ summary: 'Approve or reject a compensatory leave claim' })
  decideCompensation(
    @CurrentUser() user: SessionPrincipal,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: DecisionDto,
  ) {
    return this.attendance.decideCompensation(user, id, dto);
  }

  // ── shift exchange ─────────────────────────────────────────────────

  @Post('shift-exchange')
  @RequireFeature(FEATURE_FLAGS.SHIFT_EXCHANGE)
  @ApiOperation({ summary: 'Propose a shift swap with a colleague' })
  createShiftExchange(@CurrentUser() user: SessionPrincipal, @Body() dto: ShiftExchangeRequestDto) {
    return this.attendance.createShiftExchange(user, dto);
  }

  @Get('shift-exchange')
  @ApiOperation({ summary: 'Shift swaps you are involved in' })
  listShiftExchanges(@CurrentUser() user: SessionPrincipal, @Query() query: ApprovalQueueQuery) {
    return this.attendance.listShiftExchanges(user, query);
  }

  @Patch('shift-exchange/:id/respond')
  @ApiOperation({ summary: 'Accept or decline a swap proposed to you' })
  respondToShiftExchange(
    @CurrentUser() user: SessionPrincipal,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() body: { accept: boolean },
  ) {
    return this.attendance.respondToShiftExchange(user, id, body.accept !== false);
  }

  @Patch('shift-exchange/:id')
  @RequirePermissions(PERMISSIONS.SHIFT_EXCHANGE_APPROVE)
  @ApiOperation({ summary: 'Approve or reject a shift swap (rewrites both rosters)' })
  decideShiftExchange(
    @CurrentUser() user: SessionPrincipal,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: DecisionDto,
  ) {
    return this.attendance.decideShiftExchange(user, id, dto);
  }
}
