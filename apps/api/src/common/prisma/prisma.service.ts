import { INestApplication, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log:
        process.env.NODE_ENV === 'development'
          ? [{ emit: 'event', level: 'query' }, 'warn', 'error']
          : ['warn', 'error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('connected to postgres');

    if (process.env.PRISMA_LOG_SLOW_QUERIES === 'true') {
      // Surfacing slow queries beats guessing at N+1s later.
      (this as any).$on('query', (event: { duration: number; query: string }) => {
        if (event.duration > 200) {
          this.logger.warn(`slow query ${event.duration}ms: ${event.query.slice(0, 200)}`);
        }
      });
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Lets Nest close the Prisma pool cleanly on SIGTERM. */
  enableShutdownHooks(app: INestApplication): void {
    process.on('beforeExit', () => {
      void app.close();
    });
  }
}
