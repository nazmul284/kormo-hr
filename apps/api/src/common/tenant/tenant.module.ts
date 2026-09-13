import { Global, Module } from '@nestjs/common';

import { TenantContextService } from './tenant-context.service';

/**
 * Global so a feature module can inject tenant settings without every
 * module re-importing it — the same reasoning as PrismaModule.
 */
@Global()
@Module({
  providers: [TenantContextService],
  exports: [TenantContextService],
})
export class TenantModule {}
