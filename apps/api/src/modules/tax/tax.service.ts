import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  BD_CATEGORY_LABELS, BD_EARNING_COMPONENTS, PERMISSIONS, computeTax, fiscalYearLabel,
  fiscalYearRange, fiscalYearStartIso, initials,
} from '@kormo/shared';
import type { TaxConfigInput, TaxpayerCategory } from '@kormo/shared';

import { PrismaService } from '../../common/prisma/prisma.service';
import type { SessionPrincipal } from '../../common/types';
import { assertCanViewEmployee, companyFilter } from '../../common/utils/scope';
import { toBigInt } from '../../common/utils/serialize';
import { toIsoDate } from '../../common/utils/dates';

@Injectable()
export class TaxService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveTarget(user: SessionPrincipal, employeeId?: string): Promise<bigint> {
    if (!employeeId) return user.id;
    const target = toBigInt(employeeId, 'employeeId');
    if (target === user.id) return target;
    if (!user.permissions.has(PERMISSIONS.TAX_READ_ALL)) {
      throw new ForbiddenException("You do not have permission to view another employee's tax.");
    }
    await assertCanViewEmployee(this.prisma, user, target);
    return target;
  }

  /** Fiscal years with a published slab configuration. */
  async fiscalYears() {
    const rows = await this.prisma.taxConfig.groupBy({
      by: ['fiscalYear'],
      where: { country: 'BD', isActive: true },
      orderBy: { fiscalYear: 'desc' },
    });
    return {
      current: fiscalYearLabel(new Date()),
      years: rows.map((row) => row.fiscalYear),
    };
  }

  /**
   * Loads the slab configuration from the database.
   *
   * Slabs, the exemption divisor and the rebate percentages all change
   * with each national budget and vary by taxpayer category, so none of
   * it is hardcoded — the engine is handed data.
   */
  private async loadConfig(
    fiscalYear: string,
    category: TaxpayerCategory,
  ): Promise<TaxConfigInput> {
    const config = await this.prisma.taxConfig.findFirst({
      where: { country: 'BD', fiscalYear, category, isActive: true },
      include: { slabs: { orderBy: { seq: 'asc' } } },
    });

    if (!config) {
      throw new NotFoundException(
        `No tax configuration is published for ${fiscalYear} (${BD_CATEGORY_LABELS[category]}).`,
      );
    }

    return {
      fiscalYear: config.fiscalYear,
      category: config.category as TaxpayerCategory,
      nonTaxableDivisor: Number(config.nonTaxableDivisor),
      nonTaxableCap: Number(config.nonTaxableCap),
      investmentAllowancePct: Number(config.investmentAllowancePct),
      rebatePct: Number(config.rebatePct),
      minimumTax: Number(config.minimumTax),
      slabs: config.slabs.map((slab) => ({
        seq: slab.seq,
        slabAmount: slab.slabAmount === null ? null : Number(slab.slabAmount),
        rate: Number(slab.rate),
        label: slab.label ?? undefined,
      })),
    };
  }

  /** The taxpayer category to use, from the employee's own attributes. */
  private categoryFor(employee: { gender: string | null; birthDate: Date | null }): TaxpayerCategory {
    if (employee.birthDate) {
      const age = (Date.now() - employee.birthDate.getTime()) / (365.25 * 86_400_000);
      // The NBR grants senior citizens a higher exempt band from 65.
      if (age >= 65) return 'SENIOR_CITIZEN';
    }
    return employee.gender === 'FEMALE' ? 'FEMALE' : 'GENERAL';
  }

  /**
   * Recomputes the statement live rather than reading the materialised
   * row, so a salary change or a new deduction is reflected immediately.
   * The stored EmployeeTaxYear row is a cache for reporting, not the
   * source of truth for what the employee is shown.
   */
  async statement(user: SessionPrincipal, fiscalYear?: string, employeeId?: string) {
    const targetId = await this.resolveTarget(user, employeeId);
    const fy = fiscalYear ?? fiscalYearLabel(new Date());
    const { start, end } = fiscalYearRange(fy);

    const employee = await this.prisma.employee.findUnique({
      where: { id: targetId },
      select: {
        id: true, employeeVisibleId: true, firstName: true, lastName: true,
        gender: true, birthDate: true, joiningDate: true, tinNumber: true,
        designation: { select: { name: true, grade: true } },
        department: { select: { name: true } },
        company: { select: { name: true, fiscalYearStartMonth: true } },
        benefit: true,
        salaryHistory: { orderBy: { effectiveFrom: 'asc' }, select: { effectiveFrom: true, gross: true, status: true } },
        taxPayments: { where: { fiscalYear: fy }, orderBy: [{ year: 'asc' }, { month: 'asc' }] },
      },
    });
    if (!employee) throw new NotFoundException('Employee not found.');

    if (employee.benefit && !employee.benefit.isTaxApplicable) {
      return {
        fiscalYear: fy,
        taxApplicable: false,
        message: 'Income tax is not applicable to this employee.',
        employee: this.employeeHeader(employee),
      };
    }

    if (employee.salaryHistory.length === 0) {
      return {
        fiscalYear: fy,
        taxApplicable: true,
        message: 'No salary record exists yet, so there is nothing to compute.',
        employee: this.employeeHeader(employee),
      };
    }

    const category = this.categoryFor(employee);
    const config = await this.loadConfig(fy, category);

    // The gross in force at the start of the fiscal year drives the
    // festival-bonus figure (one month's gross).
    const openingGross = this.grossAt(employee.salaryHistory, start);
    const bonuses = employee.benefit?.hasBonus
      ? [{ label: 'Festival Bonus', amount: openingGross }]
      : [];

    const investment = await this.declaredInvestment(targetId, fy);

    const computation = computeTax({
      fiscalYearStart: fiscalYearStartIso(fy, employee.company.fiscalYearStartMonth),
      segments: employee.salaryHistory.map((row) => ({
        effectiveFrom: toIsoDate(row.effectiveFrom),
        gross: Number(row.gross),
      })),
      components: BD_EARNING_COMPONENTS,
      bonuses,
      actualInvestment: investment.declared,
      advanceIncomeTax: investment.advanceIncomeTax,
      payments: employee.taxPayments.map((p) => ({
        month: p.month,
        year: p.year,
        amount: Number(p.amount),
      })),
      asOf: toIsoDate(new Date()),
      config,
    });

    return {
      fiscalYear: fy,
      fiscalYearStart: start,
      fiscalYearEnd: end,
      taxApplicable: true,
      category,
      categoryLabel: BD_CATEGORY_LABELS[category],
      employee: this.employeeHeader(employee),
      /** Every intermediate step, so the number can be explained. */
      computation,
      /** The right-rail "Monthly × No. of Months = Total" restatement. */
      monthlyRestatement: computation.earningBreakup.map((row) => ({
        label: row.label,
        monthly: row.monthly,
        months: row.months,
        total: row.total,
      })),
      config: {
        nonTaxableDivisor: config.nonTaxableDivisor,
        nonTaxableCap: config.nonTaxableCap,
        investmentAllowancePct: config.investmentAllowancePct,
        rebatePct: config.rebatePct,
        minimumTax: config.minimumTax,
        slabs: config.slabs,
      },
    };
  }

  private employeeHeader(employee: {
    id: bigint; employeeVisibleId: string; firstName: string; lastName: string;
    tinNumber: string | null; joiningDate: Date;
    designation: { name: string; grade: string | null } | null;
    department: { name: string } | null;
    company: { name: string };
  }) {
    return {
      id: employee.id,
      employeeVisibleId: employee.employeeVisibleId,
      fullName: `${employee.firstName} ${employee.lastName}`,
      initials: initials(employee.firstName, employee.lastName),
      tinNumber: employee.tinNumber,
      joiningDate: employee.joiningDate,
      designation: employee.designation?.name ?? null,
      grade: employee.designation?.grade ?? null,
      department: employee.department?.name ?? null,
      company: employee.company.name,
    };
  }

  private grossAt(
    history: { effectiveFrom: Date; gross: unknown }[],
    asOf: string,
  ): number {
    const cutoff = new Date(`${asOf}T12:00:00Z`);
    let current = 0;
    for (const row of history) {
      if (row.effectiveFrom <= cutoff) current = Number(row.gross);
    }
    // A mid-year joiner has no salary in force at the FY start; use their
    // first record instead so the bonus is not zero.
    return current || Number(history[0]?.gross ?? 0);
  }

  private async declaredInvestment(employeeId: bigint, fiscalYear: string) {
    const stored = await this.prisma.employeeTaxYear.findUnique({
      where: { employeeId_fiscalYear: { employeeId, fiscalYear } },
      select: { actualInvestment: true, advanceIncomeTax: true },
    });
    return {
      declared: Number(stored?.actualInvestment ?? 0),
      advanceIncomeTax: Number(stored?.advanceIncomeTax ?? 0),
    };
  }

  /** The month-by-month deduction ledger behind "already paid". */
  async paymentLedger(user: SessionPrincipal, fiscalYear?: string, employeeId?: string) {
    const targetId = await this.resolveTarget(user, employeeId);
    const fy = fiscalYear ?? fiscalYearLabel(new Date());

    const payments = await this.prisma.taxPayment.findMany({
      where: { employeeId: targetId, fiscalYear: fy },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });

    return {
      fiscalYear: fy,
      payments: payments.map((p) => ({
        ...p,
        amount: Number(p.amount),
        label: new Date(Date.UTC(p.year, p.month - 1, 1))
          .toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
      })),
      totalPaid: payments.reduce((sum, p) => sum + Number(p.amount), 0),
    };
  }

  /** The published slab ladder, for the configuration screen. */
  async configuration(fiscalYear?: string) {
    const fy = fiscalYear ?? fiscalYearLabel(new Date());
    const configs = await this.prisma.taxConfig.findMany({
      where: { country: 'BD', fiscalYear: fy },
      include: { slabs: { orderBy: { seq: 'asc' } } },
      orderBy: { category: 'asc' },
    });

    return {
      fiscalYear: fy,
      categories: configs.map((config) => ({
        category: config.category,
        categoryLabel: BD_CATEGORY_LABELS[config.category as TaxpayerCategory],
        nonTaxableDivisor: Number(config.nonTaxableDivisor),
        nonTaxableCap: Number(config.nonTaxableCap),
        investmentAllowancePct: Number(config.investmentAllowancePct),
        rebatePct: Number(config.rebatePct),
        minimumTax: Number(config.minimumTax),
        effectiveFrom: config.effectiveFrom,
        effectiveTo: config.effectiveTo,
        notes: config.notes,
        slabs: config.slabs.map((slab) => ({
          seq: slab.seq,
          label: slab.label,
          slabAmount: slab.slabAmount === null ? null : Number(slab.slabAmount),
          rate: Number(slab.rate),
        })),
      })),
    };
  }

  /** Company-wide tax summary for payroll/finance. */
  async companySummary(user: SessionPrincipal, fiscalYear?: string, companyId?: number) {
    if (!user.permissions.has(PERMISSIONS.TAX_READ_ALL)) {
      throw new ForbiddenException('You do not have permission to view company tax figures.');
    }
    const fy = fiscalYear ?? fiscalYearLabel(new Date());
    const companyIds = companyFilter(user, companyId);

    const rows = await this.prisma.employeeTaxYear.findMany({
      where: { fiscalYear: fy, employee: { companyId: { in: companyIds } } },
      include: {
        employee: {
          select: {
            id: true, employeeVisibleId: true, firstName: true, lastName: true,
            designation: { select: { name: true } },
            department: { select: { name: true } },
          },
        },
      },
      orderBy: { liability: 'desc' },
    });

    const sum = (pick: (row: (typeof rows)[number]) => number) =>
      rows.reduce((total, row) => total + pick(row), 0);

    return {
      fiscalYear: fy,
      employeeCount: rows.length,
      totals: {
        totalEarning: sum((r) => Number(r.totalEarning)),
        taxable: sum((r) => Number(r.taxable)),
        totalTax: sum((r) => Number(r.totalTax)),
        rebate: sum((r) => Number(r.rebate)),
        liability: sum((r) => Number(r.liability)),
        paidToDate: sum((r) => Number(r.paidToDate)),
        remaining: sum((r) => Number(r.remainingLiability)),
      },
      employees: rows.map((row) => ({
        employee: {
          ...row.employee,
          fullName: `${row.employee.firstName} ${row.employee.lastName}`,
          initials: initials(row.employee.firstName, row.employee.lastName),
        },
        category: row.category,
        totalEarning: Number(row.totalEarning),
        taxable: Number(row.taxable),
        totalTax: Number(row.totalTax),
        rebate: Number(row.rebate),
        liability: Number(row.liability),
        paidToDate: Number(row.paidToDate),
        remainingLiability: Number(row.remainingLiability),
        monthlyLiability: Number(row.monthlyLiability),
      })),
    };
  }
}
