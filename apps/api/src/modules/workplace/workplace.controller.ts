import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@kormo/shared';
import {
  IsArray, IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength,
} from 'class-validator';

import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { PaginationQuery } from '../../common/dto/pagination.dto';
import { ToBoolean } from '../../common/dto/transforms';
import { ParseIntIdPipe } from '../../common/pipes/parse-bigint.pipe';
import type { SessionPrincipal } from '../../common/types';
import { WorkplaceService } from './workplace.service';

class NotificationQuery extends PaginationQuery {
  @ApiPropertyOptional() @IsOptional() @ToBoolean() @IsBoolean()
  unreadOnly?: boolean;

  @ApiPropertyOptional({ enum: ['LEAVE', 'ATTENDANCE', 'PAYROLL', 'PERFORMANCE', 'ONBOARDING', 'RESIGNATION', 'BOOKING', 'ANNOUNCEMENT', 'APPROVAL', 'SYSTEM'] })
  @IsOptional() @IsString()
  kind?: string;
}

class MarkReadDto {
  @ApiPropertyOptional({ type: [String], description: 'Omit to mark everything read' })
  @IsOptional() @IsArray() @IsString({ each: true })
  notificationIds?: string[];
}

class TicketQuery extends PaginationQuery {
  @ApiPropertyOptional({ enum: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] })
  @IsOptional() @IsIn(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'])
  status?: string;

  @ApiPropertyOptional({ enum: ['mine', 'assigned', 'all'], default: 'mine' })
  @IsOptional() @IsIn(['mine', 'assigned', 'all'])
  scope?: 'mine' | 'assigned' | 'all';
}

class CreateTicketDto {
  @ApiProperty({ enum: ['HR', 'IT', 'Payroll', 'Facilities'] })
  @IsIn(['HR', 'IT', 'Payroll', 'Facilities'])
  category!: string;

  @ApiProperty({ maxLength: 200 })
  @IsString() @IsNotEmpty() @MaxLength(200)
  subject!: string;

  @ApiProperty({ maxLength: 2000 })
  @IsString() @IsNotEmpty() @MaxLength(2000)
  body!: string;

  @ApiPropertyOptional({ enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] })
  @IsOptional() @IsIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
  priority?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500)
  attachmentPath?: string;
}

class UpdateTicketDto {
  @ApiPropertyOptional({ enum: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] })
  @IsOptional() @IsIn(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'])
  status?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional() @IsString() @MaxLength(1000)
  resolutionNote?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  assigneeId?: string;

  @ApiPropertyOptional({ enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] })
  @IsOptional() @IsIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
  priority?: string;
}

class AuditQuery extends PaginationQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() entityType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() entityId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() action?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() actorId?: string;
}

@ApiTags('workplace')
@Controller()
export class WorkplaceController {
  constructor(private readonly workplace: WorkplaceService) {}

  @Get('notices')
  @ApiOperation({ summary: 'Notice board — pinned notices first' })
  notices(@CurrentUser() user: SessionPrincipal, @Query() query: PaginationQuery) {
    return this.workplace.notices(user, query);
  }

  @Get('policies')
  @ApiOperation({ summary: 'Office policies, grouped by category' })
  policies(@CurrentUser() user: SessionPrincipal, @Query('latestOnly') latestOnly?: string) {
    return this.workplace.policies(user, latestOnly === 'true');
  }

  @Get('notifications')
  @ApiOperation({ summary: 'Your notifications' })
  notifications(@CurrentUser() user: SessionPrincipal, @Query() query: NotificationQuery) {
    return this.workplace.notifications(user, query);
  }

  @Get('notifications/unread-count')
  @ApiOperation({ summary: 'Unread count for the notification bell' })
  unreadCount(@CurrentUser() user: SessionPrincipal) {
    return this.workplace.unreadCount(user);
  }

  @Patch('notifications/read')
  @ApiOperation({ summary: 'Mark notifications read' })
  markRead(@CurrentUser() user: SessionPrincipal, @Body() dto: MarkReadDto) {
    return this.workplace.markRead(
      user,
      dto.notificationIds?.map((id) => BigInt(id)),
    );
  }

  @Get('helpdesk')
  @ApiOperation({ summary: 'Help desk tickets' })
  tickets(@CurrentUser() user: SessionPrincipal, @Query() query: TicketQuery) {
    return this.workplace.tickets(user, query);
  }

  @Post('helpdesk')
  @RequirePermissions(PERMISSIONS.HELPDESK_RAISE)
  @ApiOperation({
    summary: 'Raise a help desk ticket',
    description: 'Routed automatically to the role that owns the chosen category.',
  })
  createTicket(@CurrentUser() user: SessionPrincipal, @Body() dto: CreateTicketDto) {
    return this.workplace.createTicket(user, dto);
  }

  @Patch('helpdesk/:id')
  @ApiOperation({ summary: 'Update or resolve a ticket' })
  updateTicket(
    @CurrentUser() user: SessionPrincipal,
    @Param('id', ParseIntIdPipe) id: number,
    @Body() dto: UpdateTicketDto,
  ) {
    return this.workplace.updateTicket(user, id, dto);
  }

  @Get('audit-log')
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  @ApiOperation({ summary: 'Append-only audit trail' })
  auditLog(@CurrentUser() user: SessionPrincipal, @Query() query: AuditQuery) {
    return this.workplace.auditLog(user, query);
  }
}
