import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PERMISSIONS, REPORT_TYPES, fiscalYearLabel } from '@kormo/shared';
import type { ReportType } from '@kormo/shared';
import ExcelJS from 'exceljs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { PrismaService } from '../../common/prisma/prisma.service';
import type { SessionPrincipal } from '../../common/types';
import { addDays, monthWindow, toIsoDate } from '../../common/utils/dates';

/** Where generated artefacts land. In production this is object storage. */
const OUTPUT_DIR = process.env.REPORT_OUTPUT_DIR ?? join(process.cwd(), '.storage', 'reports');

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Queues an export.
   *
   * The job row is created first and the build runs detached, so a
   * 20,000-row payroll register never blocks the request. The client
   * polls the job (or gets a socket push) and then downloads.
   */
  async enqueue(
    user: SessionPrincipal,
    dto: { reportType: string; format?: string; params?: Record<string, unknown> },
  ) {
    if (!REPORT_TYPES.includes(dto.reportType as ReportType)) {
      throw new BadRequestException(
        `Unknown report type "${dto.reportType}". Supported: ${REPORT_TYPES.join(', ')}.`,
      );
    }
    if (!user.permissions.has(PERMISSIONS.REPORT_GENERATE)) {
      throw new ForbiddenException('You do not have permission to generate reports.');
    }

    const job = await this.prisma.reportJob.create({
      data: {
        companyId: user.companyId,
        requestedById: user.id,
        reportType: dto.reportType,
        format: dto.format ?? 'xlsx',
        params: (dto.params ?? {}) as never,
        status: 'QUEUED',
        // Generated files are swept after a week.
        expiresAt: addDays(new Date(), 7),
      },
    });

    // Detached on purpose; failures are recorded on the job row.
    void this.run(job.id, user).catch((error) => {
      this.logger.error(`report ${job.id} failed`, error instanceof Error ? error.stack : String(error));
    });

    return { jobId: job.id, status: job.status, reportType: job.reportType };
  }

  async status(user: SessionPrincipal, jobId: string) {
    const job = await this.prisma.reportJob.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Report job not found.');
    if (job.requestedById !== user.id && !user.permissions.has(PERMISSIONS.AUDIT_READ)) {
      throw new ForbiddenException('That report belongs to another user.');
    }
    return job;
  }

  async listMine(user: SessionPrincipal) {
    return this.prisma.reportJob.findMany({
      where: { requestedById: user.id },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });
  }

  private async run(jobId: string, user: SessionPrincipal): Promise<void> {
    await this.prisma.reportJob.update({
      where: { id: jobId },
      data: { status: 'RUNNING', startedAt: new Date(), progressPct: 5 },
    });

    try {
      const job = await this.prisma.reportJob.findUniqueOrThrow({ where: { id: jobId } });
      const params = (job.params ?? {}) as Record<string, unknown>;

      const { rows, columns, sheetName } = await this.buildDataset(
        job.reportType as ReportType,
        user,
        params,
      );

      await this.prisma.reportJob.update({
        where: { id: jobId },
        data: { progressPct: 60, rowCount: rows.length },
      });

      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Kormo HR';
      workbook.created = new Date();
      const sheet = workbook.addWorksheet(sheetName);

      sheet.columns = columns.map((column) => ({
        header: column.header,
        key: column.key,
        width: column.width ?? 18,
      }));
      sheet.getRow(1).font = { bold: true };
      sheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4F46E5' },
      };
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.views = [{ state: 'frozen', ySplit: 1 }];

      for (const row of rows) sheet.addRow(row);
      sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: columns.length },
      };

      await mkdir(OUTPUT_DIR, { recursive: true });
      const fileName = `${job.reportType}-${jobId}.xlsx`;
      const filePath = join(OUTPUT_DIR, fileName);
      const buffer = await workbook.xlsx.writeBuffer();
      await writeFile(filePath, Buffer.from(buffer));

      await this.prisma.reportJob.update({
        where: { id: jobId },
        data: {
          status: 'READY',
          progressPct: 100,
          filePath: `reports/${fileName}`,
          fileSizeBytes: buffer.byteLength,
          finishedAt: new Date(),
        },
      });

      await this.prisma.notification.create({
        data: {
          employeeId: user.id,
          kind: 'SYSTEM',
          title: `Your ${job.reportType} export is ready`,
          body: `${rows.length.toLocaleString('en-US')} rows.`,
          link: '/reports',
          entityType: 'report_job',
          entityId: jobId,
        },
      });
    } catch (error) {
      await this.prisma.reportJob.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          error: error instanceof Error ? error.message : String(error),
          finishedAt: new Date(),
        },
      });
      throw error;
    }
  }

  /**
   * Builds the dataset for a report type.
   *
   * Every query is scoped to the requester's accessible companies, so an
   * export can never become a way around row-level visibility.
   */
  private async buildDataset(
    reportType: ReportType,
    user: SessionPrincipal,
    params: Record<string, unknown>,
  ): Promise<{
    rows: Record<string, unknown>[];
    columns: { header: string; key: string; width?: number }[];
    sheetName: string;
  }> {
    const companyIds = user.accessibleCompanyIds;

    switch (reportType) {
      case 'EmployeeDirectory': {
        const employees = await this.prisma.employee.findMany({
          where: { companyId: { in: companyIds }, active: true },
          include: {
            designation: { select: { name: true, grade: true } },
            department: { select: { name: true } },
            location: { select: { name: true } },
            company: { select: { name: true } },
            lineManager: { select: { firstName: true, lastName: true } },
          },
          orderBy: { employeeVisibleId: 'asc' },
        });
        return {
          sheetName: 'Employee Directory',
          columns: [
            { header: 'Employee ID', key: 'id', width: 14 },
            { header: 'Name', key: 'name', width: 26 },
            { header: 'Designation', key: 'designation', width: 26 },
            { header: 'Grade', key: 'grade', width: 10 },
            { header: 'Department', key: 'department', width: 22 },
            { header: 'Location', key: 'location', width: 22 },
            { header: 'Company', key: 'company', width: 22 },
            { header: 'Line Manager', key: 'manager', width: 24 },
            { header: 'Employment Status', key: 'status', width: 18 },
            { header: 'Joining Date', key: 'joiningDate', width: 14 },
            { header: 'Official Email', key: 'email', width: 30 },
            { header: 'Contact', key: 'contact', width: 16 },
          ],
          rows: employees.map((e) => ({
            id: e.employeeVisibleId,
            name: `${e.firstName} ${e.lastName}`,
            designation: e.designation?.name ?? '',
            grade: e.designation?.grade ?? '',
            department: e.department?.name ?? '',
            location: e.location?.name ?? '',
            company: e.company.name,
            manager: e.lineManager ? `${e.lineManager.firstName} ${e.lineManager.lastName}` : '',
            status: e.employmentStatus,
            joiningDate: toIsoDate(e.joiningDate),
            email: e.officialEmail ?? e.email,
            contact: e.officialContact ?? '',
          })),
        };
      }

      case 'EmployeeTax': {
        const fiscalYear = (params.fiscalYear as string) ?? fiscalYearLabel(new Date());
        const rows = await this.prisma.employeeTaxYear.findMany({
          where: { fiscalYear, employee: { companyId: { in: companyIds } } },
          include: {
            employee: {
              select: {
                employeeVisibleId: true, firstName: true, lastName: true, tinNumber: true,
                designation: { select: { name: true } },
                department: { select: { name: true } },
              },
            },
          },
          orderBy: { liability: 'desc' },
        });
        return {
          sheetName: `Tax ${fiscalYear}`,
          columns: [
            { header: 'Employee ID', key: 'id', width: 14 },
            { header: 'Name', key: 'name', width: 26 },
            { header: 'TIN', key: 'tin', width: 16 },
            { header: 'Department', key: 'department', width: 22 },
            { header: 'Category', key: 'category', width: 14 },
            { header: 'Total Earning', key: 'totalEarning', width: 16 },
            { header: 'Non-Taxable', key: 'nonTaxable', width: 14 },
            { header: 'Taxable', key: 'taxable', width: 14 },
            { header: 'Total Tax', key: 'totalTax', width: 14 },
            { header: 'Rebate', key: 'rebate', width: 12 },
            { header: 'AIT', key: 'ait', width: 12 },
            { header: 'Liability', key: 'liability', width: 14 },
            { header: 'Paid to Date', key: 'paid', width: 14 },
            { header: 'Remaining', key: 'remaining', width: 14 },
            { header: 'Monthly', key: 'monthly', width: 12 },
          ],
          rows: rows.map((r) => ({
            id: r.employee.employeeVisibleId,
            name: `${r.employee.firstName} ${r.employee.lastName}`,
            tin: r.employee.tinNumber ?? '',
            department: r.employee.department?.name ?? '',
            category: r.category,
            totalEarning: Number(r.totalEarning),
            nonTaxable: Number(r.nonTaxable),
            taxable: Number(r.taxable),
            totalTax: Number(r.totalTax),
            rebate: Number(r.rebate),
            ait: Number(r.advanceIncomeTax),
            liability: Number(r.liability),
            paid: Number(r.paidToDate),
            remaining: Number(r.remainingLiability),
            monthly: Number(r.monthlyLiability),
          })),
        };
      }

      case 'PayrollRegister':
      case 'Payslips': {
        const month = Number(params.month ?? new Date().getUTCMonth() + 1);
        const year = Number(params.year ?? new Date().getUTCFullYear());
        const rows = await this.prisma.payslip.findMany({
          where: { month, year, employee: { companyId: { in: companyIds } } },
          include: {
            employee: {
              select: {
                employeeVisibleId: true, firstName: true, lastName: true,
                designation: { select: { name: true } },
                department: { select: { name: true } },
                bankAccounts: { where: { isPrimary: true }, select: { bankName: true, accountNo: true } },
              },
            },
          },
          orderBy: { employee: { employeeVisibleId: 'asc' } },
        });
        return {
          sheetName: `Payroll ${month}-${year}`,
          columns: [
            { header: 'Employee ID', key: 'id', width: 14 },
            { header: 'Name', key: 'name', width: 26 },
            { header: 'Department', key: 'department', width: 22 },
            { header: 'Bank', key: 'bank', width: 24 },
            { header: 'Account No', key: 'account', width: 20 },
            { header: 'Gross (GS)', key: 'gs', width: 14 },
            { header: 'Basic+Allow (BA)', key: 'ba', width: 16 },
            { header: 'Conv/Med (CAM)', key: 'cam', width: 16 },
            { header: 'Transport (TA)', key: 'ta', width: 14 },
            { header: 'Mobile (MB)', key: 'mb', width: 12 },
            { header: 'Bonus', key: 'bonus', width: 12 },
            { header: 'Overtime', key: 'ot', width: 12 },
            { header: 'Tax', key: 'tax', width: 12 },
            { header: 'PF', key: 'pf', width: 12 },
            { header: 'Absence (DFA)', key: 'dfa', width: 14 },
            { header: 'Net Payable', key: 'net', width: 16 },
          ],
          rows: rows.map((p) => ({
            id: p.employee.employeeVisibleId,
            name: `${p.employee.firstName} ${p.employee.lastName}`,
            department: p.employee.department?.name ?? '',
            bank: p.employee.bankAccounts[0]?.bankName ?? '',
            account: p.employee.bankAccounts[0]?.accountNo ?? '',
            gs: Number(p.gross),
            ba: Number(p.basicAllowance),
            cam: Number(p.conveyanceAllowanceMedical),
            ta: Number(p.transportAllowance),
            mb: Number(p.mobileBill),
            bonus: Number(p.bonusAmount),
            ot: Number(p.overtimeAmount),
            tax: Number(p.tax),
            pf: Number(p.providentFund),
            dfa: Number(p.deductionForAbsence),
            net: Number(p.netPayable),
          })),
        };
      }

      case 'AttendanceMonthly': {
        const month = Number(params.month ?? new Date().getUTCMonth() + 1);
        const year = Number(params.year ?? new Date().getUTCFullYear());
        const { start, end } = monthWindow(month, year);
        const rows = await this.prisma.attendance.findMany({
          where: {
            companyId: { in: companyIds },
            date: { gte: start, lte: end },
          },
          include: {
            employee: {
              select: {
                employeeVisibleId: true, firstName: true, lastName: true,
                department: { select: { name: true } },
              },
            },
          },
          orderBy: [{ employeeVisibleId: 'asc' }, { date: 'asc' }],
        });
        return {
          sheetName: `Attendance ${month}-${year}`,
          columns: [
            { header: 'Employee ID', key: 'id', width: 14 },
            { header: 'Name', key: 'name', width: 26 },
            { header: 'Department', key: 'department', width: 22 },
            { header: 'Date', key: 'date', width: 12 },
            { header: 'Day', key: 'day', width: 12 },
            { header: 'Shift', key: 'shift', width: 14 },
            { header: 'In Time (IT)', key: 'it', width: 12 },
            { header: 'Out Time (OT)', key: 'ot', width: 12 },
            { header: 'Late (LT) min', key: 'lt', width: 14 },
            { header: 'Break (BT) min', key: 'bt', width: 14 },
            { header: 'Total (TH) min', key: 'th', width: 14 },
            { header: 'Overtime (OTH) min', key: 'oth', width: 18 },
            { header: 'Status', key: 'status', width: 20 },
          ],
          rows: rows.map((a) => ({
            id: a.employee.employeeVisibleId,
            name: `${a.employee.firstName} ${a.employee.lastName}`,
            department: a.employee.department?.name ?? '',
            date: toIsoDate(a.date),
            day: a.date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
            shift: a.attendanceRosterShiftName ?? '',
            it: a.inTime ? a.inTime.toISOString().slice(11, 19) : '',
            ot: a.outTime ? a.outTime.toISOString().slice(11, 19) : '',
            lt: a.lateTimeMinutes,
            bt: a.breakTimeMinutes,
            th: a.totalWorkMinutes,
            oth: Math.round(a.otTimeInSeconds / 60),
            status: a.status,
          })),
        };
      }

      case 'LeaveLedger': {
        const year = Number(params.year ?? new Date().getUTCFullYear());
        const rows = await this.prisma.leaveRequest.findMany({
          where: {
            employee: { companyId: { in: companyIds } },
            startDate: { gte: new Date(Date.UTC(year, 0, 1, 12)), lte: new Date(Date.UTC(year, 11, 31, 12)) },
          },
          include: {
            leaveType: { select: { label: true } },
            employee: {
              select: {
                employeeVisibleId: true, firstName: true, lastName: true,
                department: { select: { name: true } },
              },
            },
            approver: { select: { firstName: true, lastName: true } },
          },
          orderBy: { appliedDate: 'desc' },
        });
        return {
          sheetName: `Leave ${year}`,
          columns: [
            { header: 'Employee ID', key: 'id', width: 14 },
            { header: 'Name', key: 'name', width: 26 },
            { header: 'Department', key: 'department', width: 22 },
            { header: 'Leave Type (LT)', key: 'lt', width: 20 },
            { header: 'Start Date (SD)', key: 'sd', width: 14 },
            { header: 'End Date (ED)', key: 'ed', width: 14 },
            { header: 'Leave Days (LD)', key: 'ld', width: 14 },
            { header: 'Calendar Days', key: 'cd', width: 14 },
            { header: 'Applied Date (AD)', key: 'ad', width: 16 },
            { header: 'Status', key: 'status', width: 12 },
            { header: 'Approver', key: 'approver', width: 24 },
            { header: 'Reason', key: 'reason', width: 44 },
          ],
          rows: rows.map((r) => ({
            id: r.employee.employeeVisibleId,
            name: `${r.employee.firstName} ${r.employee.lastName}`,
            department: r.employee.department?.name ?? '',
            lt: r.leaveType.label,
            sd: toIsoDate(r.startDate),
            ed: toIsoDate(r.endDate),
            ld: Number(r.leaveDays),
            cd: r.calendarDays,
            ad: toIsoDate(r.appliedDate),
            status: r.status,
            approver: r.approver ? `${r.approver.firstName} ${r.approver.lastName}` : '',
            reason: r.reason,
          })),
        };
      }

      case 'LeaveBalance': {
        const year = Number(params.year ?? new Date().getUTCFullYear());
        const rows = await this.prisma.leaveBalance.findMany({
          where: { year, employee: { companyId: { in: companyIds } } },
          include: {
            leaveType: { select: { label: true } },
            employee: {
              select: {
                employeeVisibleId: true, firstName: true, lastName: true,
                department: { select: { name: true } },
              },
            },
          },
          orderBy: [{ employee: { employeeVisibleId: 'asc' } }],
        });
        return {
          sheetName: `Leave Balance ${year}`,
          columns: [
            { header: 'Employee ID', key: 'id', width: 14 },
            { header: 'Name', key: 'name', width: 26 },
            { header: 'Department', key: 'department', width: 22 },
            { header: 'Leave Type', key: 'type', width: 20 },
            { header: 'Entitled', key: 'entitled', width: 12 },
            { header: 'Carried Forward', key: 'carried', width: 16 },
            { header: 'Consumed', key: 'consumed', width: 12 },
            { header: 'Pending', key: 'pending', width: 12 },
            { header: 'Remaining', key: 'remaining', width: 12 },
          ],
          rows: rows.map((b) => ({
            id: b.employee.employeeVisibleId,
            name: `${b.employee.firstName} ${b.employee.lastName}`,
            department: b.employee.department?.name ?? '',
            type: b.leaveType.label,
            entitled: Number(b.actualLeaveCount),
            carried: Number(b.carriedForward),
            consumed: Number(b.consumedCount),
            pending: Number(b.pendingCount),
            remaining: Number(b.remainingLeaveCount),
          })),
        };
      }

      case 'CustomerVisits': {
        const month = Number(params.month ?? new Date().getUTCMonth() + 1);
        const year = Number(params.year ?? new Date().getUTCFullYear());
        const { start, end } = monthWindow(month, year);
        const rows = await this.prisma.customerVisit.findMany({
          where: {
            visitDate: { gte: start, lte: end },
            customer: { companyId: { in: companyIds } },
          },
          include: {
            customer: { select: { name: true, city: true, contactLevel: true } },
            employee: { select: { employeeVisibleId: true, firstName: true, lastName: true } },
            participants: { include: { employee: { select: { firstName: true, lastName: true } } } },
          },
          orderBy: { visitDate: 'desc' },
        });
        return {
          sheetName: `Visits ${month}-${year}`,
          columns: [
            { header: 'Visit Date', key: 'date', width: 12 },
            { header: 'Customer', key: 'customer', width: 34 },
            { header: 'City', key: 'city', width: 16 },
            { header: 'Contact Level', key: 'level', width: 14 },
            { header: 'Employee ID', key: 'empId', width: 14 },
            { header: 'Visited By', key: 'employee', width: 26 },
            { header: 'Joint With', key: 'joint', width: 30 },
            { header: 'Person Visited', key: 'person', width: 22 },
            { header: 'Purpose', key: 'purpose', width: 34 },
            { header: 'Outcome', key: 'outcome', width: 28 },
            { header: 'Order Value', key: 'order', width: 14 },
            { header: 'Distance (m)', key: 'distance', width: 14 },
          ],
          rows: rows.map((v) => ({
            date: toIsoDate(v.visitDate),
            customer: v.customer.name,
            city: v.customer.city ?? '',
            level: v.customer.contactLevel,
            empId: v.employee.employeeVisibleId,
            employee: `${v.employee.firstName} ${v.employee.lastName}`,
            joint: v.participants.map((p) => `${p.employee.firstName} ${p.employee.lastName}`).join(', '),
            person: v.personVisited ?? '',
            purpose: v.purpose ?? '',
            outcome: v.outcome ?? '',
            order: v.orderValue === null ? '' : Number(v.orderValue),
            distance: v.distanceM ?? '',
          })),
        };
      }

      case 'OnboardingStatus': {
        const rows = await this.prisma.onboardingTask.findMany({
          where: { employee: { companyId: { in: companyIds } } },
          include: {
            employee: {
              select: {
                employeeVisibleId: true, firstName: true, lastName: true, joiningDate: true,
                department: { select: { name: true } },
              },
            },
            assignee: { select: { firstName: true, lastName: true } },
          },
          orderBy: [{ employee: { joiningDate: 'desc' } }, { lane: 'asc' }, { sortOrder: 'asc' }],
        });
        return {
          sheetName: 'Onboarding',
          columns: [
            { header: 'Employee ID', key: 'id', width: 14 },
            { header: 'Joiner', key: 'name', width: 26 },
            { header: 'Department', key: 'department', width: 22 },
            { header: 'Joining Date', key: 'joining', width: 14 },
            { header: 'Lane', key: 'lane', width: 12 },
            { header: 'Task', key: 'task', width: 44 },
            { header: 'Assignee', key: 'assignee', width: 24 },
            { header: 'Due Date', key: 'due', width: 14 },
            { header: 'Status', key: 'status', width: 14 },
            { header: 'Completed', key: 'completed', width: 14 },
          ],
          rows: rows.map((t) => ({
            id: t.employee.employeeVisibleId,
            name: `${t.employee.firstName} ${t.employee.lastName}`,
            department: t.employee.department?.name ?? '',
            joining: toIsoDate(t.employee.joiningDate),
            lane: t.lane,
            task: t.title,
            assignee: t.assignee ? `${t.assignee.firstName} ${t.assignee.lastName}` : '',
            due: t.dueDate ? toIsoDate(t.dueDate) : '',
            status: t.status,
            completed: t.completedAt ? toIsoDate(t.completedAt) : '',
          })),
        };
      }

      default:
        throw new BadRequestException(
          `Report type "${reportType}" is recognised but not yet implemented.`,
        );
    }
  }
}
