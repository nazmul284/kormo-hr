// MUST be first: populates process.env before any module reads config.
import './load-env';

import 'reflect-metadata';

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { CONFIG, type AppConfig } from './common/config/configuration';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { RequestIdInterceptor } from './common/interceptors/request-id.interceptor';
import { SerializeInterceptor } from './common/interceptors/serialize.interceptor';
import { PrismaService } from './common/prisma/prisma.service';

/**
 * Prisma returns BigInt for bigserial columns and JSON.stringify throws on
 * them. The SerializeInterceptor handles normal responses; this is the
 * belt-and-braces net for anything that bypasses it (logs, error bodies).
 */
(BigInt.prototype as unknown as { toJSON(): number }).toJSON = function toJSON(this: bigint) {
  return Number(this);
};

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get<AppConfig>(CONFIG);

  app.setGlobalPrefix(config.apiPrefix);

  app.use(cookieParser());
  app.use(compression());
  app.use(
    helmet({
      // The API serves JSON only; a CSP here would just fight the SPA's own.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // In development the Next.js rewrite proxies /api to this process, so
  // requests are same-origin and CORS never fires. The allowlist exists
  // for direct API clients and for deployments that split the origins.
  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    maxAge: 86_400, // cache the preflight for a day instead of per-request
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalInterceptors(new RequestIdInterceptor(), new SerializeInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  app.get(PrismaService).enableShutdownHooks(app);
  app.enableShutdownHooks();

  const swagger = new DocumentBuilder()
    .setTitle('Kormo HR API')
    .setDescription(
      'Multi-tenant HRMS covering the full employee lifecycle: onboarding, profile, '
      + 'attendance and shift, leave, payroll and tax, performance, field force, '
      + 'resignation and clearance.\n\n'
      + 'Authentication uses httpOnly cookies. Call `POST /api/auth/login` first; '
      + 'Swagger will carry the cookie automatically.',
    )
    .setVersion('1.0')
    .addCookieAuth('kormo_at')
    .addBearerAuth()
    .addTag('auth', 'Sign-in, refresh, password management')
    .addTag('dashboard', 'Aggregated home-screen widgets')
    .addTag('employees', 'Profiles, directory, org tree, change requests')
    .addTag('attendance', 'Attendance, rosters, edit requests, overtime, comp-off')
    .addTag('leave', 'Applications, approvals, balances, Bradford factor')
    .addTag('holiday', 'Public holiday calendar')
    .addTag('payroll', 'Payroll runs and payslips')
    .addTag('tax', 'Income-tax computation, driven by the tenant\'s country pack')
    .addTag('performance', 'Goals, reviews, job confirmation')
    .addTag('field-force', 'Customer visits and GPS tracking')
    .addTag('onboarding', 'New joiner task checklists')
    .addTag('resignation', 'E-resignation, clearance, exit interview')
    .addTag('booking', 'Meeting room booking')
    .addTag('food', 'Meal programme')
    .addTag('workplace', 'Notices, policies, notifications, help desk')
    .addTag('reports', 'Async exports')
    .addTag('tenancy', 'Companies, locations, departments, designations')
    .build();

  const document = SwaggerModule.createDocument(app, swagger);
  SwaggerModule.setup(`${config.apiPrefix}/docs`, app, document, {
    swaggerOptions: { persistAuthorization: true, withCredentials: true },
    customSiteTitle: 'Kormo HR API',
  });

  await app.listen(config.port, '0.0.0.0');

  logger.log(`Kormo HR API listening on http://localhost:${config.port}/${config.apiPrefix}`);
  logger.log(`API reference at http://localhost:${config.port}/${config.apiPrefix}/docs`);
}

void bootstrap();
