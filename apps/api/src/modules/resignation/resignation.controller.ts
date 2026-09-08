import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { FEATURE_FLAGS, PERMISSIONS } from '@kormo/shared';
import { Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional,
  IsString, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';

import { CurrentUser, RequireFeature, RequirePermissions } from '../../common/decorators';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import type { SessionPrincipal } from '../../common/types';
import { ResignationService } from './resignation.service';

class SubmitResignationDto {
  @ApiProperty({ example: '2026-10-31' })
  @IsDateString()
  lastWorkingDay!: string;

  @ApiProperty({ maxLength: 255 })
  @IsString() @IsNotEmpty() @MaxLength(255)
  reason!: string;

  @ApiProperty({ description: 'Path of the uploaded signed resignation letter — mandatory' })
  @IsString() @IsNotEmpty() @MaxLength(500)
  letterPath!: string;
}

class ResignationDecisionDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED'] })
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional() @IsString() @MaxLength(500)
  comment?: string;
}

class ChecklistEntryDto {
  @ApiProperty() @IsString() @IsNotEmpty()
  item!: string;

  @ApiProperty() @IsBoolean()
  returned!: boolean;
}

class ClearItemDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED'] })
  @IsIn(['APPROVED', 'REJECTED'])
  status!: 'APPROVED' | 'REJECTED';

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional() @IsString() @MaxLength(500)
  remarks?: string;

  @ApiPropertyOptional({ description: 'Outstanding dues recovered at clearance' })
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  duesAmount?: number;

  @ApiPropertyOptional({ type: [ChecklistEntryDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ChecklistEntryDto)
  checklistState?: ChecklistEntryDto[];
}

class ExitResponseDto {
  @ApiProperty() @IsString() @IsNotEmpty()
  question!: string;

  @ApiProperty() @IsString()
  answer!: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5)
  rating?: number;
}

class ExitInterviewDto {
  @ApiProperty({ type: [ExitResponseDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => ExitResponseDto)
  responses!: ExitResponseDto[];

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255)
  primaryReason?: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  wouldRejoin?: boolean;

  @ApiPropertyOptional({ minimum: 0, maximum: 10 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10)
  npsScore?: number;
}

@ApiTags('resignation')
@Controller('resignation')
export class ResignationController {
  constructor(private readonly resignation: ResignationService) {}

  @Get('context')
  @RequireFeature(FEATURE_FLAGS.E_RESIGNATION)
  @ApiOperation({
    summary: 'Send e-Resignation form context',
    description:
      'The read-only employee header plus a live notice-period preview: pass '
      + '`lastWorkingDay` to see the days served, the shortfall, and the salary '
      + 'recovery before submitting.',
  })
  context(
    @CurrentUser() user: SessionPrincipal,
    @Query('lastWorkingDay') lastWorkingDay?: string,
  ) {
    return this.resignation.resignationContext(user, lastWorkingDay);
  }

  @Post()
  @RequireFeature(FEATURE_FLAGS.E_RESIGNATION)
  @RequirePermissions(PERMISSIONS.RESIGNATION_SUBMIT)
  @ApiOperation({ summary: 'Submit a resignation (signed letter required)' })
  submit(@CurrentUser() user: SessionPrincipal, @Body() dto: SubmitResignationDto) {
    return this.resignation.submit(user, dto);
  }

  @Get('mine')
  @ApiOperation({ summary: 'Your resignations, with the approval and clearance state' })
  mine(@CurrentUser() user: SessionPrincipal) {
    return this.resignation.myResignations(user);
  }

  @Patch(':id/withdraw')
  @ApiOperation({
    summary: 'Withdraw your resignation',
    description: 'Only possible before HR has signed off.',
  })
  withdraw(@CurrentUser() user: SessionPrincipal, @Param('id', ParseBigIntPipe) id: bigint) {
    return this.resignation.withdraw(user, id);
  }

  @Get('approvals')
  @RequirePermissions(PERMISSIONS.RESIGNATION_APPROVE)
  @ApiOperation({
    summary: 'Resignations awaiting approval',
    description: 'The chain is sequential — only the current link can act.',
  })
  approvals(@CurrentUser() user: SessionPrincipal) {
    return this.resignation.approvalQueue(user);
  }

  @Patch(':id/decide')
  @RequirePermissions(PERMISSIONS.RESIGNATION_APPROVE)
  @ApiOperation({
    summary: 'Approve or reject a resignation',
    description: 'The final approval opens clearance across every department.',
  })
  decide(
    @CurrentUser() user: SessionPrincipal,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: ResignationDecisionDto,
  ) {
    return this.resignation.decide(user, id, dto);
  }

  @Get('clearance')
  @RequirePermissions(PERMISSIONS.CLEARANCE_ACTION)
  @ApiOperation({ summary: 'Clearance lines awaiting sign-off' })
  clearance(@CurrentUser() user: SessionPrincipal) {
    return this.resignation.clearanceQueue(user);
  }

  @Patch('clearance/:id')
  @RequirePermissions(PERMISSIONS.CLEARANCE_ACTION)
  @ApiOperation({
    summary: 'Sign off one clearance line',
    description:
      'When the last department clears, the exit completes: the employee is '
      + 'deactivated and the settlement is recorded net of dues and notice recovery.',
  })
  clearItem(
    @CurrentUser() user: SessionPrincipal,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: ClearItemDto,
  ) {
    return this.resignation.clearItem(user, id, dto);
  }

  @Get('exit-interview/questions')
  @ApiOperation({ summary: 'The exit interview questionnaire' })
  exitQuestions() {
    return this.resignation.exitInterviewQuestions();
  }

  @Post(':id/exit-interview')
  @ApiOperation({ summary: 'Record exit interview responses' })
  submitExitInterview(
    @CurrentUser() user: SessionPrincipal,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: ExitInterviewDto,
  ) {
    return this.resignation.submitExitInterview(user, id, dto);
  }
}
