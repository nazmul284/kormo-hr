import { Global, Module } from '@nestjs/common';

import { CONFIG, loadConfig, type AppConfig } from './configuration';

/**
 * Global so any module can inject `@Inject(CONFIG)` without re-importing.
 * The config is loaded (and validated) exactly once at boot.
 */
@Global()
@Module({
  providers: [{ provide: CONFIG, useValue: loadConfig() }],
  exports: [CONFIG],
})
export class AppConfigModule {}

export type { AppConfig };
