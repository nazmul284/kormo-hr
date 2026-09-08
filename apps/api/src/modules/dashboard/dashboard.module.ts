import { Module } from '@nestjs/common';

import { AttendanceModule } from '../attendance/attendance.module';
import { EmployeesModule } from '../employees/employees.module';
import { LeaveModule } from '../leave/leave.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [AttendanceModule, LeaveModule, EmployeesModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
