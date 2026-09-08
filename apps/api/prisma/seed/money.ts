import {
  BD_EARNING_COMPONENTS, BD_TAXPAYER_CATEGORIES, bdTaxConfig, computeTax,
  fiscalYearLabel, fiscalYearStartIso,
} from '@kormo/shared';
import type { TaxpayerCategory } from '@kormo/shared';

import type { AttendanceResult } from './attendance';
import type { OrgResult } from './org';
import {
  TODAY, addDays, chance, d, endOfMonth, iso, log, pick,
  prisma, randInt, round2, section, startOfMonth,
} from './lib';

/** Months of payroll history to generate, ending with the month just closed. */
const PAYROLL_MONTHS = 8;

export interface MoneyResult {
  payrollRuns: { id: number; month: number; year: number; status: string }[];
  fiscalYears: string[];
}

export async function seedMoney(org: OrgResult, attendance: AttendanceResult): Promise<MoneyResult> {
  section('Tax configuration');

  // ── tax configs: two fiscal years x six taxpayer categories ────────
  const fyThis = fiscalYearLabel(TODAY);                       // e.g. 2026-27
  const fyPrev = fiscalYearLabel(addDays(TODAY, -365));        // e.g. 2025-26
  const fiscalYears = [fyPrev, fyThis];

  const configIdByKey = new Map<string, number>();
  for (const fy of fiscalYears) {
    for (const category of BD_TAXPAYER_CATEGORIES) {
      const spec = bdTaxConfig(fy, category);
      const startYear = Number(fy.slice(0, 4));
      const config = await prisma.taxConfig.create({
        data: {
          country: 'BD',
          fiscalYear: fy,
          category,
          nonTaxableDivisor: spec.nonTaxableDivisor,
          nonTaxableCap: spec.nonTaxableCap,
          investmentAllowancePct: spec.investmentAllowancePct,
          rebatePct: spec.rebatePct,
          minimumTax: spec.minimumTax,
          effectiveFrom: d(`${startYear}-07-01`),
          effectiveTo: d(`${startYear + 1}-06-30`),
          notes:
            'Slabs and the exemption arithmetic are data, not code — the NBR revises them every budget. '
            + 'Supersede a year by adding a new row rather than editing this one.',
          slabs: {
            create: spec.slabs.map((s) => ({
              seq: s.seq,
              slabAmount: s.slabAmount,
              rate: s.rate,
              label: s.label,
            })),
          },
        },
      });
      configIdByKey.set(`${fy}:${category}`, config.id);
    }
  }
  log('created tax configs', `${fiscalYears.length} fiscal years x ${BD_TAXPAYER_CATEGORIES.length} categories`);
  log('created tax slabs', `${fiscalYears.length * BD_TAXPAYER_CATEGORIES.length * 6} bands`);

  // ── inputs the engine needs, per employee ──────────────────────────
  const salaryHistory = await prisma.salaryHistory.findMany({
    select: { employeeId: true, effectiveFrom: true, gross: true },
    orderBy: { effectiveFrom: 'asc' },
  });
  const segmentsByEmp = new Map<string, { effectiveFrom: string; gross: number }[]>();
  for (const row of salaryHistory) {
    const key = String(row.employeeId);
    const list = segmentsByEmp.get(key) ?? [];
    list.push({ effectiveFrom: iso(row.effectiveFrom), gross: Number(row.gross) });
    segmentsByEmp.set(key, list);
  }

  const benefits = await prisma.employeeBenefit.findMany();
  const benefitByEmp = new Map(benefits.map((b) => [String(b.employeeId), b]));

  /**
   * Investment and advance-income-tax inputs are drawn ONCE per employee
   * and reused by both the monthly payroll withholding and the annual
   * statement. Drawing them twice made the year-end statement disagree
   * with the tax actually deducted, which is precisely the bug an
   * employee would notice first.
   */
  const taxInputByEmp = new Map<string, { actualInvestment: number; advanceIncomeTax: number }>();
  for (const emp of org.employees) {
    const benefit = benefitByEmp.get(String(emp.id));
    // `employee` is the pinned demo account: it declares no investment and
    // no advance tax, so its statement stays stable across reseeds and the
    // docs can quote concrete figures for it.
    const pinned = emp.username === 'employee';
    taxInputByEmp.set(String(emp.id), {
      actualInvestment: !pinned && benefit?.hasInvestment
        // A DPS-style annual contribution: roughly a quarter to a full
        // month of gross, not an implausible multiple of it.
        ? round2((emp.gross * randInt(3, 12)) / 12)
        : 0,
      advanceIncomeTax: !pinned && benefit?.advanceIncomeTax ? randInt(2, 15) * 1_000 : 0,
    });
  }

  /** Taxpayer category follows gender/age; everything else is General. */
  function categoryFor(emp: OrgResult['employees'][number]): TaxpayerCategory {
    return emp.gender === 'FEMALE' ? 'FEMALE' : 'GENERAL';
  }

  /** Gross in force during a given month. */
  function grossAt(empKey: string, monthStart: Date): number {
    const segments = segmentsByEmp.get(empKey) ?? [];
    let current = 0;
    for (const s of segments) {
      if (d(s.effectiveFrom) <= monthStart) current = s.gross;
    }
    return current || 0;
  }

  // ══ payroll ════════════════════════════════════════════════════════
  section('Payroll runs & payslips');

  // The Eid-ul-Azha month carries the festival bonus.
  const bonusMonth = 5;

  const runs: { id: number; month: number; year: number; status: string }[] = [];
  const taxPaymentRows: any[] = [];

  // Rolling FY-to-date tax paid, so each month's deduction is recomputed
  // against what has already been withheld — exactly how payroll behaves.
  const paidSoFar = new Map<string, { fy: string; payments: { month: number; year: number; amount: number }[] }>();

  for (let offset = PAYROLL_MONTHS; offset >= 1; offset--) {
    const monthDate = startOfMonth(new Date(Date.UTC(TODAY.getUTCFullYear(), TODAY.getUTCMonth() - offset, 1, 12)));
    const month = monthDate.getUTCMonth() + 1;
    const year = monthDate.getUTCFullYear();
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    const isLatest = offset === 1;

    // Salary is disbursed in the first working days of the following month.
    const salaryDate = addDays(endOfMonth(monthDate), 3);
    const fy = fiscalYearLabel(monthDate);

    const run = await prisma.payrollRun.create({
      data: {
        companyId: org.primaryCompanyId,
        month,
        year,
        status: isLatest ? 'APPROVED' : 'LOCKED',
        salaryDate,
        lockedAt: isLatest ? null : addDays(salaryDate, 1),
        notes: isLatest ? 'Awaiting disbursement instruction to the bank.' : null,
      },
    });

    const payslipRows: any[] = [];
    let totalGross = 0;
    let totalNet = 0;
    let totalTax = 0;

    for (const emp of org.employees) {
      if (emp.companyId !== org.primaryCompanyId) continue;
      if (emp.joiningDate > endOfMonth(monthDate)) continue; // not yet hired

      const empKey = String(emp.id);
      const gross = grossAt(empKey, monthDate);
      if (gross <= 0) continue;

      const benefit = benefitByEmp.get(empKey);
      const stats = attendance.monthlyStats.get(empKey)?.get(monthKey);

      const basic = round2(gross * 0.5);
      const houseRent = round2(gross * 0.3);
      const conveyance = round2(gross * 0.1);
      const medical = round2(gross * 0.1);

      const basicAllowance = round2(basic + houseRent);
      const cam = round2(conveyance + medical);
      const transportAllowance = benefit?.isTransportUser ? 2_500 : 0;
      const mobileBill = benefit?.hasMobileAllowance ? 1_000 : 0;
      const bonusAmount = month === bonusMonth && benefit?.hasBonus ? gross : 0;

      // Overtime is paid at 2x the hourly basic rate (Labour Act).
      const otMinutes = stats?.otMinutes ?? 0;
      const hourlyBasic = basic / 208; // 26 days x 8 hours
      const overtimeAmount = emp.level <= 4 ? round2((otMinutes / 60) * hourlyBasic * 2) : 0;

      // Deduction for absence: unapproved absent days only.
      const workingDays = Math.max(1, stats?.working ?? 22);
      const absentDays = stats?.absent ?? 0;
      const deductionForAbsence = round2((gross / workingDays) * absentDays);

      const providentFund = benefit?.hasProvidentFund ? round2(basic * 0.1) : 0;

      // ── tax: recompute FY-to-date, then withhold this month's share ──
      let tax = 0;
      if (benefit?.isTaxApplicable) {
        const category = categoryFor(emp);
        const ledger = paidSoFar.get(empKey);
        const payments = ledger?.fy === fy ? ledger.payments : [];

        const computation = computeTax({
          fiscalYearStart: fiscalYearStartIso(fy),
          segments: segmentsByEmp.get(empKey) ?? [{ effectiveFrom: iso(emp.joiningDate), gross }],
          components: BD_EARNING_COMPONENTS,
          bonuses: benefit.hasBonus ? [{ label: 'Festival Bonus', amount: gross }] : [],
          actualInvestment: taxInputByEmp.get(empKey)!.actualInvestment,
          advanceIncomeTax: taxInputByEmp.get(empKey)!.advanceIncomeTax,
          payments,
          asOf: iso(monthDate),
          config: bdTaxConfig(fy, category),
        });
        tax = computation.monthlyLiability;

        if (tax > 0) {
          const next = [...payments, { month, year, amount: tax }];
          paidSoFar.set(empKey, { fy, payments: next });
          taxPaymentRows.push({
            employeeId: emp.id,
            fiscalYear: fy,
            month,
            year,
            amount: tax,
            kind: 'deducted_at_source',
            paidAt: salaryDate,
          });
        }
      }

      const earnings = round2(gross + transportAllowance + mobileBill + bonusAmount + overtimeAmount);
      const deductions = round2(tax + providentFund + deductionForAbsence);
      const netPayable = round2(earnings - deductions);

      totalGross = round2(totalGross + gross);
      totalNet = round2(totalNet + netPayable);
      totalTax = round2(totalTax + tax);

      payslipRows.push({
        payrollRunId: run.id,
        employeeId: emp.id,
        month,
        year,
        salaryDate,
        gross,
        basicAllowance,
        conveyanceAllowanceMedical: cam,
        transportAllowance,
        mobileBill,
        overtimeAmount,
        bonusAmount,
        otherEarnings: 0,
        tax,
        providentFund,
        deductionForAbsence,
        loanDeduction: 0,
        otherDeductions: 0,
        netPayable,
        payslipPath: `payslips/${year}/${String(month).padStart(2, '0')}/${emp.visibleId}.pdf`,
        breakdown: {
          earnings: [
            { code: 'BASIC', label: 'Basic Salary', amount: basic },
            { code: 'HOUSE_RENT', label: 'House Rent Allowance', amount: houseRent },
            { code: 'CONVEYANCE', label: 'Conveyance Allowance', amount: conveyance },
            { code: 'MEDICAL', label: 'Medical Allowance', amount: medical },
            ...(transportAllowance ? [{ code: 'TRANSPORT', label: 'Transport Allowance', amount: transportAllowance }] : []),
            ...(mobileBill ? [{ code: 'MOBILE', label: 'Mobile Allowance', amount: mobileBill }] : []),
            ...(bonusAmount ? [{ code: 'BONUS', label: 'Festival Bonus', amount: bonusAmount }] : []),
            ...(overtimeAmount ? [{ code: 'OT', label: `Overtime (${round2(otMinutes / 60)} h @ 2x)`, amount: overtimeAmount }] : []),
          ],
          deductions: [
            ...(tax ? [{ code: 'TAX', label: 'Income tax deducted at source', amount: tax }] : []),
            ...(providentFund ? [{ code: 'PF', label: 'Provident Fund (10% of basic)', amount: providentFund }] : []),
            ...(deductionForAbsence ? [{ code: 'DFA', label: `Deduction for absence (${absentDays} of ${workingDays} days)`, amount: deductionForAbsence }] : []),
          ],
          attendance: {
            workingDays,
            presentDays: stats?.present ?? 0,
            lateDays: stats?.late ?? 0,
            absentDays,
            leaveDays: stats?.leave ?? 0,
            overtimeMinutes: otMinutes,
          },
        },
      });
    }

    await prisma.payslip.createMany({ data: payslipRows });
    await prisma.payrollRun.update({
      where: { id: run.id },
      data: { headcount: payslipRows.length, totalGross, totalNet, totalTax },
    });
    runs.push({ id: run.id, month, year, status: run.status });
  }

  // The current month is still open — a draft run with nothing computed.
  const draft = await prisma.payrollRun.create({
    data: {
      companyId: org.primaryCompanyId,
      month: TODAY.getUTCMonth() + 1,
      year: TODAY.getUTCFullYear(),
      status: 'DRAFT',
      salaryDate: addDays(endOfMonth(TODAY), 3),
      notes: 'Month still open — attendance is not final.',
    },
  });
  runs.push({ id: draft.id, month: draft.month, year: draft.year, status: draft.status });

  const payslipCount = await prisma.payslip.count();
  log('created payroll runs', `${runs.length} (${PAYROLL_MONTHS} closed, 1 approved, 1 draft)`);
  log('created payslips', payslipCount);

  await prisma.taxPayment.createMany({ data: taxPaymentRows, skipDuplicates: true });
  log('created tax payments (deducted at source)', taxPaymentRows.length);

  // ══ materialised tax year statements ═══════════════════════════════
  section('Tax statements');

  const paymentsByEmpFy = new Map<string, { month: number; year: number; amount: number }[]>();
  for (const row of taxPaymentRows) {
    const key = `${row.employeeId}:${row.fiscalYear}`;
    const list = paymentsByEmpFy.get(key) ?? [];
    list.push({ month: row.month, year: row.year, amount: row.amount });
    paymentsByEmpFy.set(key, list);
  }

  const taxYearRows: any[] = [];
  for (const emp of org.employees) {
    if (emp.companyId !== org.primaryCompanyId) continue;
    const empKey = String(emp.id);
    const benefit = benefitByEmp.get(empKey);
    if (!benefit?.isTaxApplicable) continue;

    const category = categoryFor(emp);
    const segments = segmentsByEmp.get(empKey) ?? [];
    if (segments.length === 0) continue;

    for (const fy of fiscalYears) {
      const fyStart = fiscalYearStartIso(fy);
      // Nothing to compute for a year the employee had not joined.
      if (d(fyStart) < d(iso(emp.joiningDate)) && d(`${Number(fy.slice(0, 4)) + 1}-06-30`) < emp.joiningDate) continue;

      const gross = grossAt(empKey, d(fyStart)) || segments[segments.length - 1].gross;
      const payments = paymentsByEmpFy.get(`${empKey}:${fy}`) ?? [];
      const isCurrentFy = fy === fyThis;

      const computation = computeTax({
        fiscalYearStart: fyStart,
        segments,
        components: BD_EARNING_COMPONENTS,
        bonuses: benefit.hasBonus ? [{ label: 'Festival Bonus', amount: gross }] : [],
        actualInvestment: taxInputByEmp.get(empKey)!.actualInvestment,
        advanceIncomeTax: taxInputByEmp.get(empKey)!.advanceIncomeTax,
        payments,
        // A closed year is evaluated at its end; the live one as of today.
        asOf: isCurrentFy ? iso(TODAY) : `${Number(fy.slice(0, 4)) + 1}-06-30`,
        config: bdTaxConfig(fy, category),
      });

      if (computation.grossTimeline.length === 0) continue;

      taxYearRows.push({
        employeeId: emp.id,
        fiscalYear: fy,
        category,
        totalGross: computation.totalGross,
        totalEarning: computation.totalEarning,
        nonTaxable: computation.nonTaxable,
        taxable: computation.taxable,
        totalTax: computation.totalTax,
        allowableInvestment: computation.allowableInvestment,
        actualInvestment: computation.actualInvestment,
        rebate: computation.rebate,
        advanceIncomeTax: computation.advanceIncomeTax,
        liability: computation.liability,
        paidToDate: computation.paidToDate,
        remainingLiability: computation.remainingLiability,
        remainingMonths: computation.remainingMonths,
        monthlyLiability: computation.monthlyLiability,
        computation: computation as unknown as object,
        computedAt: TODAY,
      });
    }
  }

  await prisma.employeeTaxYear.createMany({ data: taxYearRows, skipDuplicates: true });
  log('materialised tax statements', `${taxYearRows.length} employee-years`);

  const sample = taxYearRows.find((r) => r.fiscalYear === fyThis);
  if (sample) {
    log(
      'sample statement',
      `earning ${sample.totalEarning.toLocaleString()} → taxable ${sample.taxable.toLocaleString()} → liability ${sample.liability.toLocaleString()} BDT`,
    );
  }

  return { payrollRuns: runs, fiscalYears };
}
