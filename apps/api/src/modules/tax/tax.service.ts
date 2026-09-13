import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  PERMISSIONS, computeTax, fiscalYearLabel, fiscalYearRange, fiscalYearStartIso,
  getCountryPack, initials,
} from '@kormo/shared';
import type { CountryPack, TaxConfigInput, TaxpayerCategory } from '@kormo/shared';

import { PrismaService } from '../../common/prisma/prisma.service';
import type { SessionPrincipal } from '../../common/types';
import { assertCanViewEmployee, companyFilter } from '../../common/utils/scope';
import { toBigInt } from '../../common/utils/serialize';
import { toIsoDate } from '../../common/utils/dates';

@Injectable()
export class TaxService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The tenant's country pack, plus the fiscal-year month it actually
   * runs on.
   *
   * Every figure on this page is jurisdiction-specific — which slab
   * table applies, which filing categories exist, when the tax year
   * opens — so nothing here may assume a country. The fiscal-year month
   * comes off the Company row rather than the pack, because a tenant is
   * allowed to run a fiscal year its country's authority does not.
   */
  private async tenantPack(companyId: number): Promise<{
    pack: CountryPack;
    country: string;
    fyStartMonth: number;
  }> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { country: true, fiscalYearStartMonth: true },
    });
    const pack = getCountryPack(company?.country);
    return {
      pack,
      country: company?.country ?? pack.code,
      fyStartMonth: company?.fiscalYearStartMonth ?? pack.tax?.fiscalYearStartMonth ?? 1,
    };
  }

  /**
   * Label for a filing category, from the pack that defines it.
   *
   * Falls back to the raw enum value rather than throwing: a tenant that
   * switched country and still has last year's rows should render
   * "SENIOR_CITIZEN", not a 500.
   */
  private categoryLabel(pack: CountryPack, category: TaxpayerCategory): string {
    return pack.tax?.categoryLabels[category] ?? category;
  }

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
  async fiscalYears(user: SessionPrincipal) {
    const { country, fyStartMonth } = await this.tenantPack(user.companyId);
    const rows = await this.prisma.taxConfig.groupBy({
      by: ['fiscalYear'],
      where: { country, isActive: true },
      orderBy: { fiscalYear: 'desc' },
    });
    return {
      current: fiscalYearLabel(new Date(), fyStartMonth),
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
    pack: CountryPack,
    country: string,
    fiscalYear: string,
    category: TaxpayerCategory,
  ): Promise<TaxConfigInput> {
    const config = await this.prisma.taxConfig.findFirst({
      where: { country, fiscalYear, category, isActive: true },
      include: { slabs: { orderBy: { seq: 'asc' } } },
    });

    if (!config) {
      throw new NotFoundException(
        `No tax configuration is published for ${fiscalYear} (${this.categoryLabel(pack, category)}).`,
      );
    }

    return {
      fiscalYear: config.fiscalYear,
      category: config.category as TaxpayerCategory,
      nonTaxableDivisor: Number(config.nonTaxableDivisor),
      nonTaxableCap: Number(config.nonTaxableCap),
      // `undefined`, not `null`: the engine treats the key's *presence* as
      // "this country uses a flat standard deduction", so passing null
      // would silently switch every flat-deduction country onto the
      // proportional branch and exempt nothing.
      nonTaxableFlat: config.nonTaxableFlat === null
        ? undefined
        : Number(config.nonTaxableFlat),
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

  /**
   * Picks the filing category for an employee, from those the tenant's
   * country pack actually offers.
   *
   * The reliefs are opt-in per country: Bangladesh grants a wider exempt
   * band to women and to over-65s, India to over-60s, the US and UK to
   * neither. Each candidate is therefore checked against the pack before
   * it is used, and the fallback is the category every pack has.
   *
   * Marital filing statuses are deliberately not inferred from HR data.
   * A married employee may file separately, jointly, or as head of
   * household; the system does not know which, and guessing produces a
   * confidently wrong tax figure. Those categories exist for a payroll
   * officer to set explicitly.
   */
  private categoryFor(
    pack: CountryPack,
    employee: { gender: string | null; birthDate: Date | null },
  ): TaxpayerCategory {
    const offered = pack.tax?.categories ?? [];
    const has = (c: TaxpayerCategory) => offered.includes(c);

    if (employee.birthDate && has('SENIOR_CITIZEN')) {
      const age = (Date.now() - employee.birthDate.getTime()) / (365.25 * 86_400_000);
      // The qualifying age differs (65 in Bangladesh, 60 in India); the
      // wider band is granted from the later of the two, so nobody is
      // given relief they are not yet entitled to.
      if (age >= 65) return 'SENIOR_CITIZEN';
    }
    if (employee.gender === 'FEMALE' && has('FEMALE')) return 'FEMALE';
    return has('GENERAL') ? 'GENERAL' : (offered[0] ?? 'GENERAL');
  }

  /**
   * Recomputes the statement live rather than reading the materialised
   * row, so a salary change or a new deduction is reflected immediately.
   * The stored EmployeeTaxYear row is a cache for reporting, not the
   * source of truth for what the employee is shown.
   */
  async statement(user: SessionPrincipal, fiscalYear?: string, employeeId?: string) {
    const targetId = await this.resolveTarget(user, employeeId);
    const { pack, country, fyStartMonth } = await this.tenantPack(user.companyId);
    const fy = fiscalYear ?? fiscalYearLabel(new Date(), fyStartMonth);
    const { start, end } = fiscalYearRange(fy, fyStartMonth);

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

    const category = this.categoryFor(pack, employee);
    const config = await this.loadConfig(pack, country, fy, category);

    // The gross in force at the start of the fiscal year drives the
    // festival-bonus figure (one month's gross).
    const openingGross = this.grossAt(employee.salaryHistory, start);
    const bonuses = employee.benefit?.hasBonus
      ? [{ label: 'Annual Bonus', amount: openingGross }]
      : [];

    const investment = await this.declaredInvestment(targetId, fy);

    const computation = computeTax({
      fiscalYearStart: fiscalYearStartIso(fy, employee.company.fiscalYearStartMonth),
      segments: employee.salaryHistory.map((row) => ({
        effectiveFrom: toIsoDate(row.effectiveFrom),
        gross: Number(row.gross),
      })),
      components: pack.tax?.earningComponents
        ?? [{ code: 'BASIC', label: 'Basic Salary', pctOfGross: 100 }],
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
      categoryLabel: this.categoryLabel(pack, category),
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
      country: pack.code,
      currency: pack.currency,
      taxAuthority: pack.tax?.authority ?? null,
      config: {
        nonTaxableDivisor: config.nonTaxableDivisor,
        nonTaxableCap: config.nonTaxableCap,
        nonTaxableFlat: config.nonTaxableFlat ?? null,
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
    const { fyStartMonth } = await this.tenantPack(user.companyId);
    const fy = fiscalYear ?? fiscalYearLabel(new Date(), fyStartMonth);

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
  async configuration(user: SessionPrincipal, fiscalYear?: string) {
    const { pack, country, fyStartMonth } = await this.tenantPack(user.companyId);
    const fy = fiscalYear ?? fiscalYearLabel(new Date(), fyStartMonth);
    const configs = await this.prisma.taxConfig.findMany({
      where: { country, fiscalYear: fy },
      include: { slabs: { orderBy: { seq: 'asc' } } },
      orderBy: { category: 'asc' },
    });

    return {
      fiscalYear: fy,
      country: pack.code,
      countryName: pack.name,
      currency: pack.currency,
      taxAuthority: pack.tax?.authority ?? null,
      categories: configs.map((config) => ({
        category: config.category,
        categoryLabel: this.categoryLabel(pack, config.category as TaxpayerCategory),
        nonTaxableDivisor: Number(config.nonTaxableDivisor),
        nonTaxableCap: Number(config.nonTaxableCap),
        nonTaxableFlat: config.nonTaxableFlat === null ? null : Number(config.nonTaxableFlat),
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
    const { fyStartMonth } = await this.tenantPack(companyId ?? user.companyId);
    const fy = fiscalYear ?? fiscalYearLabel(new Date(), fyStartMonth);
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
