import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean, IsDateString, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString,
  Matches, Max, MaxLength, Min,
} from 'class-validator';

import { PaginationQuery } from '../../common/dto/pagination.dto';
import { ToBoolean } from '../../common/dto/transforms';

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class MonthQuery {
  @ApiPropertyOptional({ minimum: 1, maximum: 12 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(12)
  month?: number;

  @ApiPropertyOptional({ minimum: 2000, maximum: 2100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(2000) @Max(2100)
  year?: number;
}

export class AttendanceQuery extends MonthQuery {
  @ApiPropertyOptional({ description: 'Defaults to yourself' })
  @IsOptional() @IsString()
  employeeId?: string;

  @ApiPropertyOptional({ enum: ['PRESENT', 'LATE', 'ABSENT', 'AFL', 'LEAVE', 'HALF_DAY', 'HOLIDAY', 'WEEKEND', 'CONDITIONAL_WEEKEND'] })
  @IsOptional()
  @IsIn(['PRESENT', 'LATE', 'ABSENT', 'AFL', 'LEAVE', 'HALF_DAY', 'HOLIDAY', 'WEEKEND', 'CONDITIONAL_WEEKEND'])
  status?: string;
}

export class AttendanceEditRequestDto {
  @ApiProperty({ example: '2026-09-01' })
  @IsDateString()
  date!: string;

  @ApiPropertyOptional({ example: '10:05', description: 'Corrected in-time (HH:mm)' })
  @IsOptional() @Matches(HHMM, { message: 'requestedInTime must be HH:mm' })
  requestedInTime?: string;

  @ApiPropertyOptional({ example: '19:10', description: 'Corrected out-time (HH:mm)' })
  @IsOptional() @Matches(HHMM, { message: 'requestedOutTime must be HH:mm' })
  requestedOutTime?: string;

  @ApiProperty({ maxLength: 255 })
  @IsString() @IsNotEmpty() @MaxLength(255)
  reason!: string;
}

export class DecisionDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED'] })
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional() @IsString() @MaxLength(255)
  note?: string;
}

export class OvertimeRequestDto {
  @ApiProperty({ example: '2026-09-01' })
  @IsDateString()
  date!: string;

  @ApiProperty({ example: '19:00' })
  @Matches(HHMM, { message: 'fromTime must be HH:mm' })
  fromTime!: string;

  @ApiProperty({ example: '22:00' })
  @Matches(HHMM, { message: 'toTime must be HH:mm' })
  toTime!: string;

  @ApiProperty({ maxLength: 255 })
  @IsString() @IsNotEmpty() @MaxLength(255)
  reason!: string;
}

export class CompensationRequestDto {
  @ApiProperty({ example: '2026-08-29', description: 'The weekend or holiday actually worked' })
  @IsDateString()
  workedDate!: string;

  @ApiPropertyOptional({ example: '2026-09-20', description: 'The day off being claimed' })
  @IsOptional() @IsDateString()
  requestedOffDate?: string;

  @ApiProperty({ maxLength: 255 })
  @IsString() @IsNotEmpty() @MaxLength(255)
  reason!: string;
}

export class ShiftExchangeRequestDto {
  @ApiProperty({ description: 'The colleague you want to swap with' })
  @IsString() @IsNotEmpty()
  counterpartyId!: string;

  @ApiProperty({ example: '2026-09-15', description: 'Your shift date' })
  @IsDateString()
  date!: string;

  @ApiProperty({ example: '2026-09-17', description: 'Their shift date' })
  @IsDateString()
  counterpartyDate!: string;

  @ApiProperty({ maxLength: 255 })
  @IsString() @IsNotEmpty() @MaxLength(255)
  reason!: string;
}

export class RosterQuery extends MonthQuery {
  @ApiPropertyOptional({ description: 'Whose roster — defaults to yourself' })
  @IsOptional() @IsString()
  employeeId?: string;

  @ApiPropertyOptional({ default: false, description: 'Return the whole team\'s roster' })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  subordinates?: boolean;
}

export class ApprovalQueueQuery extends PaginationQuery {
  @ApiPropertyOptional({ enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] })
  @IsOptional()
  @IsIn(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'])
  status?: string;
}
