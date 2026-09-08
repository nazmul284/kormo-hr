import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@kormo/shared';

import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { ParseBigIntPipe, ParseIntIdPipe } from '../../common/pipes/parse-bigint.pipe';
import type { SessionPrincipal } from '../../common/types';
import {
  ChangeRequestDto, DirectoryQuery, EmployeeListQuery, HierarchyQuery, ReviewChangeRequestDto,
} from './dto';
import { EmployeesService } from './employees.service';

@ApiTags('employees')
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  // ── collections ────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'List employees within your visibility scope' })
  list(@CurrentUser() user: SessionPrincipal, @Query() query: EmployeeListQuery) {
    return this.employees.list(user, query);
  }

  @Get('directory')
  @RequirePermissions(PERMISSIONS.EMPLOYEE_DIRECTORY)
  @ApiOperation({ summary: 'Co-worker contact directory' })
  directory(@CurrentUser() user: SessionPrincipal, @Query() query: DirectoryQuery) {
    return this.employees.directory(user, query);
  }

  @Get('my-team')
  @ApiOperation({ summary: 'Your direct reports' })
  myTeam(@CurrentUser() user: SessionPrincipal) {
    return this.employees.myTeam(user);
  }

  @Get('birthdays')
  @ApiOperation({ summary: "Birthdays today, or across the current month" })
  birthdays(
    @CurrentUser() user: SessionPrincipal,
    @Query('scope') scope?: 'today' | 'month',
  ) {
    return this.employees.birthdays(user, scope === 'month' ? 'month' : 'today');
  }

  @Get('anniversaries')
  @ApiOperation({ summary: 'Work anniversaries in the current month' })
  anniversaries(
    @CurrentUser() user: SessionPrincipal,
    @Query('scope') scope?: 'today' | 'month',
  ) {
    return this.employees.anniversaries(user, scope === 'today' ? 'today' : 'month');
  }

  // ── change requests (before /:id so the paths cannot collide) ──────

  @Get('change-requests/mine')
  @ApiOperation({ summary: 'Your own profile change requests' })
  myChangeRequests(@CurrentUser() user: SessionPrincipal) {
    return this.employees.listMyChangeRequests(user);
  }

  @Post('change-requests')
  @ApiOperation({ summary: 'Request a change to a self-serviceable profile field' })
  createChangeRequest(@CurrentUser() user: SessionPrincipal, @Body() dto: ChangeRequestDto) {
    return this.employees.createChangeRequest(user, dto);
  }

  @Get('change-requests/pending')
  @RequirePermissions(PERMISSIONS.PROFILE_CHANGE_APPROVE)
  @ApiOperation({ summary: 'Profile change requests awaiting HR review' })
  pendingChangeRequests(@CurrentUser() user: SessionPrincipal) {
    return this.employees.listPendingChangeRequests(user);
  }

  @Patch('change-requests/:id')
  @RequirePermissions(PERMISSIONS.PROFILE_CHANGE_APPROVE)
  @ApiOperation({ summary: 'Approve or reject a profile change request' })
  reviewChangeRequest(
    @CurrentUser() user: SessionPrincipal,
    @Param('id', ParseIntIdPipe) id: number,
    @Body() dto: ReviewChangeRequestDto,
  ) {
    return this.employees.reviewChangeRequest(user, id, dto);
  }

  // ── org charts ─────────────────────────────────────────────────────

  @Get('hierarchy/department')
  @RequirePermissions(PERMISSIONS.EMPLOYEE_HIERARCHY)
  @ApiOperation({ summary: 'Department tree with headcount and heads' })
  departmentTree(
    @CurrentUser() user: SessionPrincipal,
    @Query('companyId') companyId?: string,
  ) {
    return this.employees.getDepartmentTree(
      user,
      companyId ? Number(companyId) : undefined,
    );
  }

  @Get(':id/hierarchy')
  @RequirePermissions(PERMISSIONS.EMPLOYEE_HIERARCHY)
  @ApiOperation({
    summary: 'Employee org tree rooted at an employee',
    description:
      'Expands `maxLevel` levels at a time and reports `hasChildren` per node, so the '
      + 'client can lazy-load deeper instead of downloading the whole tree.',
  })
  employeeTree(
    @CurrentUser() user: SessionPrincipal,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Query() query: HierarchyQuery,
  ) {
    return this.employees.getEmployeeTree(user, id, query);
  }

  // ── profile tabs ───────────────────────────────────────────────────

  @Get(':id')
  @ApiOperation({ summary: 'Profile header and Company Details tab' })
  profile(@CurrentUser() user: SessionPrincipal, @Param('id', ParseBigIntPipe) id: bigint) {
    return this.employees.getProfile(user, id);
  }

  @Get(':id/personal-details')
  @ApiOperation({ summary: 'Personal Details tab' })
  personalDetails(@CurrentUser() user: SessionPrincipal, @Param('id', ParseBigIntPipe) id: bigint) {
    return this.employees.getPersonalDetails(user, id);
  }

  @Get(':id/compensation')
  @ApiOperation({
    summary: 'Compensation tab — bank, benefits, salary and promotion history',
    description: 'Requires salary.read unless you are viewing your own record.',
  })
  compensation(@CurrentUser() user: SessionPrincipal, @Param('id', ParseBigIntPipe) id: bigint) {
    return this.employees.getCompensation(user, id);
  }

  @Get(':id/nominees')
  @ApiOperation({ summary: 'Nominee tab' })
  nominees(@CurrentUser() user: SessionPrincipal, @Param('id', ParseBigIntPipe) id: bigint) {
    return this.employees.getNominees(user, id);
  }

  @Get(':id/education-experience')
  @ApiOperation({ summary: 'Education & Experience tab' })
  educationAndExperience(
    @CurrentUser() user: SessionPrincipal,
    @Param('id', ParseBigIntPipe) id: bigint,
  ) {
    return this.employees.getEducationAndExperience(user, id);
  }

  @Get(':id/documents')
  @ApiOperation({ summary: 'Documents tab' })
  documents(@CurrentUser() user: SessionPrincipal, @Param('id', ParseBigIntPipe) id: bigint) {
    return this.employees.getDocuments(user, id);
  }

  @Get(':id/allowed-fields')
  @ApiOperation({
    summary: 'Which profile fields this employee may self-service',
    description: 'Drives the edit affordances on the profile page.',
  })
  allowedFields(@CurrentUser() user: SessionPrincipal, @Param('id', ParseBigIntPipe) id: bigint) {
    return this.employees.getAllowedFields(user, id);
  }
}
