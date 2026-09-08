import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { FEATURE_FLAGS, PERMISSIONS } from '@kormo/shared';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

import { CurrentUser, RequireFeature, RequirePermissions } from '../../common/decorators';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import type { SessionPrincipal } from '../../common/types';
import { OnboardingService } from './onboarding.service';

class UpdateTaskDto {
  @ApiProperty({ enum: ['PENDING', 'IN_PROGRESS', 'DONE', 'BLOCKED', 'SKIPPED'] })
  @IsIn(['PENDING', 'IN_PROGRESS', 'DONE', 'BLOCKED', 'SKIPPED'])
  status!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional() @IsString() @MaxLength(500)
  note?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500)
  attachmentPath?: string;
}

class ProvisionDto {
  @ApiPropertyOptional({ description: 'Defaults to the company\'s default template' })
  @IsOptional() @Type(() => Number) @IsInt()
  templateId?: number;
}

@ApiTags('onboarding')
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get('pending-employees')
  @RequireFeature(FEATURE_FLAGS.ONBOARDING_FLOW)
  @ApiOperation({
    summary: 'Pending joiner cards with the four-lane checklist status',
    description: 'Lanes: Employee · HR · IT · Manager, each with pending/overdue/blocked counts.',
  })
  pendingEmployees(@CurrentUser() user: SessionPrincipal, @Query('companyId') companyId?: string) {
    return this.onboarding.pendingEmployees(user, companyId ? Number(companyId) : undefined);
  }

  @Get('tasks/mine')
  @ApiOperation({ summary: 'Onboarding tasks assigned to you' })
  myTasks(@CurrentUser() user: SessionPrincipal) {
    return this.onboarding.myTasks(user);
  }

  @Get('templates')
  @RequirePermissions(PERMISSIONS.ONBOARDING_TEMPLATE_WRITE)
  @ApiOperation({ summary: 'Onboarding templates' })
  templates(@CurrentUser() user: SessionPrincipal, @Query('companyId') companyId?: string) {
    return this.onboarding.templates(user, companyId ? Number(companyId) : undefined);
  }

  @Get('employees/:id')
  @RequireFeature(FEATURE_FLAGS.ONBOARDING_FLOW)
  @ApiOperation({ summary: "One joiner's full checklist, grouped by lane" })
  checklist(@CurrentUser() user: SessionPrincipal, @Param('id', ParseBigIntPipe) id: bigint) {
    return this.onboarding.employeeChecklist(user, id);
  }

  @Post('employees/:id/provision')
  @RequirePermissions(PERMISSIONS.ONBOARDING_TEMPLATE_WRITE)
  @ApiOperation({
    summary: 'Create a checklist for a joiner from a template',
    description: 'Lane owners are resolved from the role holders at provisioning time.',
  })
  provision(
    @CurrentUser() user: SessionPrincipal,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: ProvisionDto,
  ) {
    return this.onboarding.provision(user, id, dto.templateId);
  }

  @Patch('tasks/:id')
  @RequirePermissions(PERMISSIONS.ONBOARDING_TASK_ACTION)
  @ApiOperation({
    summary: 'Advance an onboarding task',
    description: 'A task whose blockers are unfinished cannot be marked done.',
  })
  updateTask(
    @CurrentUser() user: SessionPrincipal,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.onboarding.updateTask(user, id, dto);
  }
}
