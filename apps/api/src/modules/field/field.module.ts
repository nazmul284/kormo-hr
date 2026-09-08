import { Module } from '@nestjs/common';

import { FieldController } from './field.controller';
import { FieldService } from './field.service';

@Module({
  controllers: [FieldController],
  providers: [FieldService],
  exports: [FieldService],
})
export class FieldModule {}
