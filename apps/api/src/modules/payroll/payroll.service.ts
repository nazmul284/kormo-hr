import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PERMISSIONS, initials } from '@kormo/shared';
import { Prisma } from '@prisma/client';

import { paginate } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { SessionPrincipal } from '../../common/types';
import { assertCanViewEmployee, companyFilter } from '../../common/utils/scope';
import { toBigInt } from '../../common/utils/serialize';

export interface PayslipListQuery {
  page: number;
  pageSize: number;
  skip: number;
  sortDir: 'asc' | 'desc';
  search?: string;
  year?: number;
  employeeId?: string;
}

@Injectable()
export class PayrollService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * A payslip is the most sensitive document an employee has. Access is
   * either "it is mine" or an explicit payslip.read.all — a line manager
   * seeing a report's profile is deliberately not enough.
   */
  private async resolveTarget(user: SessionPrincipal, employeeId?: string): Promise<bigint> {
    if (!employeeId) return user.id;
    const target = toBigInt(employeeId, 'employeeId');
    if (target === user.id) return target;
    if (!user.permissions.has(PERMISSIONS.PAYSLIP_READ_ALL)) {
      throw new ForbiddenException("You do not have permission to view another employee's payslips.");
    }
    await assertCanViewEmployee(this.prisma, user, target);
    return target;
  }

  async myPayslips(user: SessionPrincipal, query: PayslipListQuery) {
    const targetId = await this.resolveTarget(user, query.employeeId);

    const where: Prisma.PayslipWhereInput = {
      employeeId: targetId,
      ...(query.year ? { year: query.year } : {}),
    };

    const [rows, total, years] = await Promise.all([
      this.prisma.payslip.findMany({
        where,
        orderBy: [{ year: query.sortDir }, { month: query.sortDir }],
        skip: query.skip,
        take: query.pageSize,
        include: { run: { select: { status: true, salaryDate: true } } },
      }),
      this.prisma.payslip.count({ where }),
      this.prisma.payslip.groupBy({
        by: ['year'],
        where: { employeeId: targetId },
        orderBy: { year: 'desc' },
      }),
    ]);

    return {
      ...paginate(
        rows.map((row, index) => ({
          sn: query.skip + index + 1,
          id: row.id,
          month: row.month,
          year: row.year,
          monthLabel: new Date(Date.UTC(row.year, row.month - 1, 1))
            .toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
          salaryDate: row.salaryDate,
          // Column abbreviations exactly as printed in the payslip grid.
          gs: Number(row.gross),
          ba: Number(row.basicAllowance),
          cam: Number(row.conveyanceAllowanceMedical),
          tax: Number(row.tax),
          pf: Number(row.providentFund),
          dfa: Number(row.deductionForAbsence),
          ta: Number(row.transportAllowance),
          mb: Number(row.mobileBill),
          bonus: Number(row.bonusAmount),
          overtime: Number(row.overtimeAmount),
          netPayable: Number(row.netPayable),
          runStatus: row.run.status,
          // Only a finalised run should be downloadable as a document.
          isFinal: ['APPROVED', 'PAID', 'LOCKED'].includes(row.run.status),
        })),
        total,
        query,
      ),
      availableYears: years.map((y) => y.year),
    };
  }

  async payslipDetail(user: SessionPrincipal, payslipId: bigint) {
    const payslip = await this.prisma.payslip.findUnique({
      where: { id: payslipId },
      include: {
        run: { select: { status: true, salaryDate: true, month: true, year: true } },
        employee: {
          select: {
            id: true, employeeVisibleId: true, firstName: true, lastName: true,
            joiningDate: true, officialEmail: true, tinNumber: true,
            designation: { select: { name: true, grade: true } },
            department: { select: { name: true } },
            company: { select: { name: true, address: true, tin: true } },
            location: { select: { name: true } },
            bankAccounts: {
              where: { isPrimary: true },
              select: { bankName: true, branchName: true, accountNo: true, txnType: true },
            },
          },
        },
      },
    });

    if (!payslip) throw new NotFoundException('Payslip not found.');

    if (payslip.employeeId !== user.id && !user.permissions.has(PERMISSIONS.PAYSLIP_READ_ALL)) {
      throw new ForbiddenException("You do not have permission to view this payslip.");
    }

    const totalEarnings =
      Number(payslip.gross) + Number(payslip.transportAllowance) + Number(payslip.mobileBill) +
      Number(payslip.bonusAmount) + Number(payslip.overtimeAmount) + Number(payslip.otherEarnings);
    const totalDeductions =
      Number(payslip.tax) + Number(payslip.providentFund) + Number(payslip.deductionForAbsence) +
      Number(payslip.loanDeduction) + Number(payslip.otherDeductions);

    return {
      ...payslip,
      employee: {
        ...payslip.employee,
        fullName: `${payslip.employee.firstName} ${payslip.employee.lastName}`,
        initials: initials(payslip.employee.firstName, payslip.employee.lastName),
      },
      totals: {
        totalEarnings,
        totalDeductions,
        netPayable: Number(payslip.netPayable),
      },
    };
  }

  // ── payroll administration ─────────────────────────────────────────

  async listRuns(user: SessionPrincipal, companyId?: number) {
    const companyIds = companyFilter(user, companyId);
    const runs = await this.prisma.payrollRun.findMany({
      where: { companyId: { in: companyIds } },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      include: { company: { select: { name: true, currency: true } }, _count: { select: { payslips: true } } },
    });

    return runs.map((run) => ({
      ...run,
      monthLabel: new Date(Date.UTC(run.year, run.month - 1, 1))
        .toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
      payslipCount: run._count.payslips,
      // The state machine the UI renders its actions from.
      canApprove: run.status === 'REVIEW' || run.status === 'DRAFT',
      canLock: run.status === 'APPROVED' || run.status === 'PAID',
      isEditable: !['LOCKED', 'PAID'].includes(run.status),
    }));
  }

  async runDetail(user: SessionPrincipal, runId: number, query: PayslipListQuery) {
    const run = await this.prisma.payrollRun.findUnique({
      where: { id: runId },
      include: { company: { select: { id: true, name: true, currency: true } } },
    });
    if (!run) throw new NotFoundException('Payroll run not found.');
    if (!user.accessibleCompanyIds.includes(run.companyId)) {
      throw new ForbiddenException('That payroll run belongs to a company you do not have access to.');
    }

    const where: Prisma.PayslipWhereInput = {
      payrollRunId: runId,
      ...(query.search
        ? {
            employee: {
              OR: [
                { firstName: { contains: query.search, mode: 'insensitive' } },
                { lastName: { contains: query.search, mode: 'insensitive' } },
                { employeeVisibleId: { contains: query.search } },
              ],
            },
          }
        : {}),
    };

    const [rows, total, aggregate] = await Promise.all([
      this.prisma.payslip.findMany({
        where,
        orderBy: { employee: { employeeVisibleId: 'asc' } },
        skip: query.skip,
        take: query.pageSize,
        include: {
          employee: {
            select: {
              id: true, employeeVisibleId: true, firstName: true, lastName: true,
              designation: { select: { name: true } },
              department: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.payslip.count({ where }),
      this.prisma.payslip.aggregate({
        where: { payrollRunId: runId },
        _sum: {
          gross: true, tax: true, providentFund: true, deductionForAbsence: true,
          netPayable: true, bonusAmount: true, overtimeAmount: true,
        },
        _avg: { gross: true },
      }),
    ]);

    return {
      run,
      totals: {
        gross: Number(aggregate._sum.gross ?? 0),
        tax: Number(aggregate._sum.tax ?? 0),
        providentFund: Number(aggregate._sum.providentFund ?? 0),
        deductionForAbsence: Number(aggregate._sum.deductionForAbsence ?? 0),
        bonus: Number(aggregate._sum.bonusAmount ?? 0),
        overtime: Number(aggregate._sum.overtimeAmount ?? 0),
        netPayable: Number(aggregate._sum.netPayable ?? 0),
        averageGross: Number(aggregate._avg.gross ?? 0),
      },
      ...paginate(
        rows.map((row) => ({
          ...row,
          employee: {
            ...row.employee,
            fullName: `${row.employee.firstName} ${row.employee.lastName}`,
            initials: initials(row.employee.firstName, row.employee.lastName),
          },
        })),
        total,
        query,
      ),
    };
  }

  /** Company-wide payroll cost trend, for the admin dashboard. */
  async costTrend(user: SessionPrincipal, companyId?: number, months = 12) {
    const companyIds = companyFilter(user, companyId);
    const runs = await this.prisma.payrollRun.findMany({
      where: { companyId: { in: companyIds }, status: { not: 'DRAFT' } },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      take: months,
      select: {
        month: true, year: true, headcount: true,
        totalGross: true, totalNet: true, totalTax: true,
      },
    });

    return runs
      .reverse()
      .map((run) => ({
        month: run.month,
        year: run.year,
        label: new Date(Date.UTC(run.year, run.month - 1, 1))
          .toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
        headcount: run.headcount,
        gross: Number(run.totalGross),
        net: Number(run.totalNet),
        tax: Number(run.totalTax),
      }));
  }
}
