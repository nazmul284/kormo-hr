import { Module } from '@nestjs/common';

import { TenancyController } from './tenancy.controller';

@Module({ controllers: [TenancyController] })
export class TenancyModule {}
