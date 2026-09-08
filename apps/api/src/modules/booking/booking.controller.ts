import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { FEATURE_FLAGS, PERMISSIONS } from '@kormo/shared';
import { Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max,
  MaxLength, Min, ValidateNested,
} from 'class-validator';

import { CurrentUser, RequireFeature, RequirePermissions } from '../../common/decorators';
import { ParseBigIntPipe, ParseIntIdPipe } from '../../common/pipes/parse-bigint.pipe';
import type { SessionPrincipal } from '../../common/types';
import { BookingService } from './booking.service';

class RecurrenceDto {
  @ApiProperty({ enum: ['WEEKLY', 'DAILY'] })
  @IsIn(['WEEKLY', 'DAILY'])
  freq!: 'WEEKLY' | 'DAILY';

  @ApiProperty({ minimum: 2, maximum: 52 })
  @Type(() => Number) @IsInt() @Min(2) @Max(52)
  count!: number;
}

class CreateBookingDto {
  @ApiProperty() @Type(() => Number) @IsInt()
  roomId!: number;

  @ApiProperty({ maxLength: 200 })
  @IsString() @IsNotEmpty() @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional() @IsString() @MaxLength(1000)
  agenda?: string;

  @ApiProperty({ example: '2026-09-10T10:00:00.000Z' })
  @IsString() @IsNotEmpty()
  startAt!: string;

  @ApiProperty({ example: '2026-09-10T11:00:00.000Z' })
  @IsString() @IsNotEmpty()
  endAt!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true })
  attendeeIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true })
  externalGuests?: string[];

  @ApiPropertyOptional({ type: RecurrenceDto })
  @IsOptional() @ValidateNested() @Type(() => RecurrenceDto)
  recurrence?: RecurrenceDto;
}

class CancelBookingDto {
  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional() @IsString() @MaxLength(255)
  reason?: string;

  @ApiPropertyOptional({ default: false, description: 'Cancel every future occurrence in the series' })
  @IsOptional() @IsBoolean()
  wholeSeries?: boolean;
}

@ApiTags('booking')
@Controller('booking')
export class BookingController {
  constructor(private readonly booking: BookingService) {}

  @Get('rooms')
  @RequireFeature(FEATURE_FLAGS.ROOM_BOOKING)
  @ApiOperation({ summary: 'Bookable rooms, with capacity and amenities' })
  rooms(
    @CurrentUser() user: SessionPrincipal,
    @Query('companyId') companyId?: string,
    @Query('locationId') locationId?: string,
  ) {
    return this.booking.rooms(
      user,
      companyId ? Number(companyId) : undefined,
      locationId ? Number(locationId) : undefined,
    );
  }

  @Get('grid')
  @RequireFeature(FEATURE_FLAGS.ROOM_BOOKING)
  @ApiOperation({
    summary: 'Day / Week / Month booking grid',
    description: 'Rooms as columns, hours as rows. One call covers the whole window.',
  })
  grid(
    @CurrentUser() user: SessionPrincipal,
    @Query('view') view?: 'day' | 'week' | 'month',
    @Query('date') date?: string,
    @Query('roomIds') roomIds?: string,
    @Query('companyId') companyId?: string,
    @Query('locationId') locationId?: string,
  ) {
    const parsedRooms = roomIds
      ? roomIds.split(',').map((x) => Number(x.trim())).filter((x) => Number.isInteger(x))
      : undefined;
    return this.booking.grid(
      user,
      view === 'week' || view === 'month' ? view : 'day',
      date,
      parsedRooms,
      companyId ? Number(companyId) : undefined,
      locationId ? Number(locationId) : undefined,
    );
  }

  @Get('mine')
  @ApiOperation({ summary: 'Bookings you organise or are invited to' })
  mine(@CurrentUser() user: SessionPrincipal, @Query('past') past?: string) {
    return this.booking.myBookings(user, past !== 'true');
  }

  @Get('rooms/:id/availability')
  @RequireFeature(FEATURE_FLAGS.ROOM_BOOKING)
  @ApiOperation({ summary: 'Hourly availability for one room on one day' })
  availability(
    @CurrentUser() user: SessionPrincipal,
    @Param('id', ParseIntIdPipe) id: number,
    @Query('date') date: string,
  ) {
    return this.booking.availability(user, id, date ?? new Date().toISOString().slice(0, 10));
  }

  @Post()
  @RequireFeature(FEATURE_FLAGS.ROOM_BOOKING)
  @RequirePermissions(PERMISSIONS.BOOKING_CREATE)
  @ApiOperation({
    summary: 'Book a room, optionally as a recurring series',
    description:
      'Conflicts are checked against every occurrence inside one transaction, so a '
      + 'series that collides on any date is rejected whole rather than half-created.',
  })
  create(@CurrentUser() user: SessionPrincipal, @Body() dto: CreateBookingDto) {
    return this.booking.create(user, dto);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancel a booking, or every future occurrence of a series' })
  cancel(
    @CurrentUser() user: SessionPrincipal,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: CancelBookingDto,
  ) {
    return this.booking.cancel(user, id, dto.reason, dto.wholeSeries === true);
  }

  @Patch(':id/respond')
  @ApiOperation({ summary: 'Accept or decline a meeting invitation' })
  respond(
    @CurrentUser() user: SessionPrincipal,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() body: { accept: boolean },
  ) {
    return this.booking.respond(user, id, body.accept !== false);
  }
}
