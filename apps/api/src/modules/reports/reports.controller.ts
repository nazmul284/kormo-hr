import { Body, Controller, Get, Param, Post, Res, StreamableFile } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, REPORT_TYPES } from '@kormo/shared';
import { IsIn, IsObject, IsOptional } from 'class-validator';
import { createReadStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Response } from 'express';
import { NotFoundException } from '@nestjs/common';

import { CurrentUser, RequirePermissions } from '../../common/decorators';
import type { SessionPrincipal } from '../../common/types';
import { ReportsService } from './reports.service';

const OUTPUT_DIR = process.env.REPORT_OUTPUT_DIR ?? join(process.cwd(), '.storage', 'reports');

class EnqueueReportDto {
  @ApiProperty({ enum: REPORT_TYPES })
  @IsIn(REPORT_TYPES as unknown as string[])
  reportType!: string;

  @ApiPropertyOptional({ enum: ['xlsx'], default: 'xlsx' })
  @IsOptional() @IsIn(['xlsx'])
  format?: string;

  @ApiPropertyOptional({
    description: 'Report-specific parameters, e.g. { "month": 8, "year": 2026 }',
    example: { month: 8, year: 2026 },
  })
  @IsOptional() @IsObject()
  params?: Record<string, unknown>;
}

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('types')
  @ApiOperation({ summary: 'Report types this service can build' })
  types() {
    return { types: REPORT_TYPES };
  }

  @Post()
  @RequirePermissions(PERMISSIONS.REPORT_GENERATE)
  @ApiOperation({
    summary: 'Queue an export',
    description:
      'Returns immediately with a job id. The build runs detached so a large '
      + 'register never blocks the request; poll the job, then download.',
  })
  enqueue(@CurrentUser() user: SessionPrincipal, @Body() dto: EnqueueReportDto) {
    return this.reports.enqueue(user, dto);
  }

  @Get('mine')
  @ApiOperation({ summary: 'Your recent export jobs' })
  mine(@CurrentUser() user: SessionPrincipal) {
    return this.reports.listMine(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Job status and progress' })
  status(@CurrentUser() user: SessionPrincipal, @Param('id') id: string) {
    return this.reports.status(user, id);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Download a finished export' })
  async download(
    @CurrentUser() user: SessionPrincipal,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    // Ownership is re-checked here, not just when the job was created.
    const job = await this.reports.status(user, id);
    if (job.status !== 'READY' || !job.filePath) {
      throw new NotFoundException('That export is not ready to download.');
    }
    if (job.expiresAt && job.expiresAt < new Date()) {
      throw new NotFoundException('That export has expired. Please generate it again.');
    }

    const fileName = job.filePath.replace(/^reports\//, '');
    const absolute = join(OUTPUT_DIR, fileName);
    if (!existsSync(absolute)) {
      throw new NotFoundException('The generated file is no longer on disk.');
    }

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${job.reportType}-${id}.xlsx"`,
    });
    return new StreamableFile(createReadStream(absolute));
  }
}
