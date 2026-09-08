import { Module } from '@nestjs/common';

import { HolidayController } from './holiday.controller';

@Module({ controllers: [HolidayController] })
export class HolidayModule {}
