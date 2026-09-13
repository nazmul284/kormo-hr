import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AppConfigModule } from './common/config/config.module';
import { loadConfig } from './common/config/configuration';
import { PrismaModule } from './common/prisma/prisma.module';
import { TenantModule } from './common/tenant/tenant.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { AuthModule } from './modules/auth/auth.module';
import { FeatureGuard, JwtAuthGuard, PermissionsGuard } from './modules/auth/guards';
import { BookingModule } from './modules/booking/booking.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { FieldModule } from './modules/field/field.module';
import { FoodModule } from './modules/food/food.module';
import { HealthModule } from './modules/health/health.module';
import { HolidayModule } from './modules/holiday/holiday.module';
import { LeaveModule } from './modules/leave/leave.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { PerformanceModule } from './modules/performance/performance.module';
import { ReportsModule } from './modules/reports/reports.module';
import { ResignationModule } from './modules/resignation/resignation.module';
import { TaxModule } from './modules/tax/tax.module';
import { TenancyModule } from './modules/tenancy/tenancy.module';
import { WorkplaceModule } from './modules/workplace/workplace.module';

const config = loadConfig();

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AppConfigModule,
    ThrottlerModule.forRoot([
      { name: 'default', ttl: config.throttle.ttl * 1000, limit: config.throttle.limit },
    ]),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    PrismaModule,
    TenantModule,
    AuthModule,
    HealthModule,
    TenancyModule,
    EmployeesModule,
    AttendanceModule,
    LeaveModule,
    HolidayModule,
    PayrollModule,
    TaxModule,
    PerformanceModule,
    FieldModule,
    OnboardingModule,
    ResignationModule,
    BookingModule,
    FoodModule,
    WorkplaceModule,
    ReportsModule,
    DashboardModule,
  ],
  providers: [
    // Order matters: throttle, then authenticate, then authorise, then
    // check the tenant feature flag.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: FeatureGuard },
  ],
})
export class AppModule {}
