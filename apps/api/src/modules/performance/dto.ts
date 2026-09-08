import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray, IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max,
  MaxLength, Min, ValidateNested,
} from 'class-validator';

export class CreateGoalDto {
  @ApiProperty() @Type(() => Number) @IsInt()
  goalCycleId!: number;

  @ApiProperty({ maxLength: 200 })
  @IsString() @IsNotEmpty() @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional() @IsString() @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ example: 'p95 latency' })
  @IsOptional() @IsString() @MaxLength(120)
  metric?: string;

  @ApiPropertyOptional({ example: '< 400 ms' })
  @IsOptional() @IsString() @MaxLength(120)
  target?: string;

  @ApiProperty({ minimum: 1, maximum: 100, description: 'Weights must total 100 across the cycle' })
  @Type(() => Number) @IsInt() @Min(1) @Max(100)
  weight!: number;

  @ApiPropertyOptional() @IsOptional() @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ description: "The manager's goal this one cascades from" })
  @IsOptional() @Type(() => Number) @IsInt()
  parentGoalId?: number;
}

export class UpdateGoalDto {
  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100)
  progressPct?: number;

  @ApiPropertyOptional({ enum: ['DRAFT', 'ACTIVE', 'SUBMITTED', 'CANCELLED'] })
  @IsOptional()
  @IsIn(['DRAFT', 'ACTIVE', 'SUBMITTED', 'CANCELLED'])
  status?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional() @IsString() @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional() @IsString() @MaxLength(1000)
  description?: string;
}

export class SubmitReviewDto {
  @ApiProperty({ enum: ['SELF_ASSESSMENT', 'MANAGER_REVIEW', 'HR_REVIEW'] })
  @IsIn(['SELF_ASSESSMENT', 'MANAGER_REVIEW', 'HR_REVIEW'])
  stage!: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5)
  rating?: number;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional() @IsString() @MaxLength(1000)
  comment?: string;
}

export class ScorecardEntryDto {
  @ApiProperty() @IsString() @IsNotEmpty()
  criterion!: string;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @Type(() => Number) @IsInt() @Min(1) @Max(5)
  score!: number;
}

export class ConfirmationDecisionDto {
  @ApiProperty({ enum: ['CONFIRMED', 'EXTENDED', 'TERMINATED'] })
  @IsIn(['CONFIRMED', 'EXTENDED', 'TERMINATED'])
  decision!: 'CONFIRMED' | 'EXTENDED' | 'TERMINATED';

  @ApiPropertyOptional({ type: [ScorecardEntryDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ScorecardEntryDto)
  scorecard?: ScorecardEntryDto[];

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional() @IsString() @MaxLength(1000)
  strengths?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional() @IsString() @MaxLength(1000)
  improvements?: string;

  @ApiPropertyOptional({ description: 'Required when the decision is EXTENDED' })
  @IsOptional() @IsDateString()
  extendedToDate?: string;
}
