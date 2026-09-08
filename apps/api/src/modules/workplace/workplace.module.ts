import { Module } from '@nestjs/common';

import { WorkplaceController } from './workplace.controller';
import { WorkplaceService } from './workplace.service';

@Module({
  controllers: [WorkplaceController],
  providers: [WorkplaceService],
  exports: [WorkplaceService],
})
export class WorkplaceModule {}
