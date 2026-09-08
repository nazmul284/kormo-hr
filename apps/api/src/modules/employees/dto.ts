import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min,
} from 'class-validator';

import { PaginationQuery } from '../../common/dto/pagination.dto';
import { ToBoolean } from '../../common/dto/transforms';

export class EmployeeListQuery extends PaginationQuery {
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() companyId?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() departmentId?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() designationId?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() locationId?: number;

  @ApiPropertyOptional({ enum: ['PERMANENT', 'PROBATION', 'CONTRACT', 'INTERN', 'SEPARATED'] })
  @IsOptional()
  @IsIn(['PERMANENT', 'PROBATION', 'CONTRACT', 'INTERN', 'SEPARATED'])
  employmentStatus?: string;

  @ApiPropertyOptional({ description: 'Restrict to the caller\'s reporting line' })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  myTeamOnly?: boolean;

  @ApiPropertyOptional({ default: true, description: 'Exclude separated employees' })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  activeOnly?: boolean = true;

  @ApiPropertyOptional({ enum: ['name', 'joiningDate', 'employeeVisibleId', 'designation'] })
  @IsOptional()
  @IsIn(['name', 'joiningDate', 'employeeVisibleId', 'designation'])
  sortBy: 'name' | 'joiningDate' | 'employeeVisibleId' | 'designation' = 'name';
}

export class DirectoryQuery extends PaginationQuery {
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() departmentId?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() companyId?: number;
}

export class HierarchyQuery {
  @ApiPropertyOptional({ default: 2, description: 'Levels of subordinates to expand' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxLevel = 2;

  @ApiPropertyOptional({ default: false, description: 'Include the chain of managers above the root' })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  generateUpperTree = false;
}

export class ChangeRequestDto {
  @ApiPropertyOptional({ example: 'personalEmail' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  fieldPath!: string;

  @ApiPropertyOptional({ example: 'new.address@gmail.com' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  requestedValue!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}

export class ReviewChangeRequestDto {
  @ApiPropertyOptional({ enum: ['APPROVED', 'REJECTED'] })
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reviewNote?: string;
}
