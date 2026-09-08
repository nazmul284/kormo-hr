import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean, IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max,
  MaxLength, Min,
} from 'class-validator';

import { PaginationQuery } from '../../common/dto/pagination.dto';
import { ToBoolean } from '../../common/dto/transforms';

export class ApplyLeaveDto {
  @ApiProperty({ example: 3 })
  @Type(() => Number) @IsInt()
  leaveTypeId!: number;

  @ApiProperty({ example: '2026-09-20' })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ example: '2026-09-24', description: 'Same as startDate for a one-day request' })
  @IsDateString()
  endDate!: string;

  @ApiPropertyOptional({ enum: ['FULL_DAY', 'FIRST_HALF', 'SECOND_HALF'], default: 'FULL_DAY' })
  @IsOptional()
  @IsIn(['FULL_DAY', 'FIRST_HALF', 'SECOND_HALF'])
  dayPart?: 'FULL_DAY' | 'FIRST_HALF' | 'SECOND_HALF';

  @ApiProperty({ maxLength: 255 })
  @IsString() @IsNotEmpty() @MaxLength(255)
  reason!: string;

  @ApiPropertyOptional({ description: 'Uploaded medical certificate path, where the type requires one' })
  @IsOptional() @IsString() @MaxLength(500)
  documentPath?: string;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional() @IsString() @MaxLength(255)
  contactWhileAway?: string;

  @ApiPropertyOptional({ description: 'Colleague picking up your work' })
  @IsOptional() @IsString()
  handoverToId?: string;
}

/** Dry-run body for the live "Leave Days vs Calendar Days" preview. */
export class PreviewLeaveDto {
  @ApiProperty() @Type(() => Number) @IsInt()
  leaveTypeId!: number;

  @ApiProperty({ example: '2026-09-20' })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ example: '2026-09-24' })
  @IsDateString()
  endDate!: string;

  @ApiPropertyOptional({ enum: ['FULL_DAY', 'FIRST_HALF', 'SECOND_HALF'] })
  @IsOptional()
  @IsIn(['FULL_DAY', 'FIRST_HALF', 'SECOND_HALF'])
  dayPart?: 'FULL_DAY' | 'FIRST_HALF' | 'SECOND_HALF';
}

export class LeaveDecisionDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED'] })
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional() @IsString() @MaxLength(255)
  note?: string;
}

export class LeaveListQuery extends PaginationQuery {
  @ApiPropertyOptional({ enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] })
  @IsOptional()
  @IsIn(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'])
  status?: string;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt()
  leaveTypeId?: number;

  @ApiPropertyOptional({ minimum: 2000, maximum: 2100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(2000) @Max(2100)
  year?: number;
}

export class ColleaguesOnLeaveQuery extends PaginationQuery {
  @ApiPropertyOptional({ example: '2026-09-08', description: 'Defaults to today' })
  @IsOptional() @IsDateString()
  date?: string;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt()
  departmentId?: number;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt()
  companyId?: number;
}

export class BalanceQuery {
  @ApiPropertyOptional({ minimum: 2000, maximum: 2100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(2000) @Max(2100)
  year?: number;

  @ApiPropertyOptional({ description: 'Defaults to yourself' })
  @IsOptional() @IsString()
  employeeId?: string;
}

export class BradfordQuery {
  @ApiPropertyOptional({ minimum: 2000, maximum: 2100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(2000) @Max(2100)
  year?: number;

  @ApiPropertyOptional({ default: false, description: 'Score the whole team rather than yourself' })
  @IsOptional() @ToBoolean() @IsBoolean()
  team?: boolean;
}
