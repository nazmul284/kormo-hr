'use client';

import { useQuery } from '@tanstack/react-query';
import {
  BadgeInfo, Building2, Calculator, Download, Info, Landmark, Receipt, ShieldCheck,
} from 'lucide-react';
import { useState } from 'react';

import { DataTable, FilterBar, type Column } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { StatTile } from '@/components/shared/stat-tile';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Select } from '@/components/ui/input';
import { SegmentedTabs } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { cn, countOf, formatDate, formatMoney, formatNumber, MONTHS } from '@/lib/utils';

interface TaxStatement {
  fiscalYear: string;
  fiscalYearStart?: string;
  fiscalYearEnd?: string;
  taxApplicable: boolean;
  message?: string;
  category?: string;
  categoryLabel?: string;
  /** The authority whose rules produced these figures, from the country pack. */
  taxAuthority?: string | null;
  country?: string;
  employee: {
    id: number; employeeVisibleId: string; fullName: string; initials: string;
    tinNumber: string | null; designation: string | null; grade: string | null;
    department: string | null; company: string; joiningDate: string;
  };
  computation?: {
    grossTimeline: { effectiveFrom: string; effectiveTo: string; months: number; monthlyGross: number; total: number }[];
    totalGross: number;
    earningBreakup: { code: string; label: string; monthly: number; months: number; total: number; isTaxable: boolean }[];
    totalEarning: number;
    nonTaxable: number;
    taxable: number;
    slabWorking: { seq: number; label: string; slabAmount: number | null; rate: number; taxableInSlab: number; tax: number }[];
    totalTax: number;
    minimumTaxApplied: boolean;
    allowableInvestment: number;
    actualInvestment: number;
    rebate: number;
    advanceIncomeTax: number;
    liability: number;
    paidToDate: number;
    paymentLedger: { month: number; year: number; amount: number }[];
    remainingLiability: number;
    remainingMonths: number;
    monthlyLiability: number;
  };
  config?: {
    nonTaxableDivisor: number;
    nonTaxableCap: number;
    /** Flat standard deduction; set instead of the divisor/cap pair. */
    nonTaxableFlat: number | null;
    investmentAllowancePct: number;
    rebatePct: number;
    minimumTax: number;
    slabs: { seq: number; slabAmount: number | null; rate: number; label?: string }[];
  };
}

export default function TaxPage() {
  const { can } = useSession();
  const [fiscalYear, setFiscalYear] = useState<string>('');
  const [tab, setTab] = useState<'statement' | 'slabs' | 'company'>('statement');

  const years = useQuery({
    queryKey: ['tax', 'fiscal-years'],
    queryFn: () => api.get<{ current: string; years: string[] }>('/tax/fiscal-years'),
  });

  const activeYear = fiscalYear || years.data?.current || '';

  const statement = useQuery({
    queryKey: ['tax', 'statement', activeYear],
    queryFn: () => api.get<TaxStatement>('/tax/statement', { fiscalYear: activeYear }),
    enabled: Boolean(activeYear),
  });

  return (
    <>
      <PageHeader
        title="Tax calculation"
        description={
          `Income tax for the fiscal year${statement.data?.taxAuthority ? ` under ${statement.data.taxAuthority}` : ''}, `
          + 'computed from your salary timeline, bonus, declared investment and the '
          + 'deduction-at-source ledger. Every step is shown so the figure on your payslip can be traced.'
        }
        breadcrumbs={[{ label: 'Pay & Tax' }, { label: 'Tax Calculation' }]}
        actions={
          <Button variant="secondary" asChild>
            <a href={`/api/tax/statement?fiscalYear=${activeYear}`} target="_blank" rel="noreferrer">
              <Download />
              Raw statement (JSON)
            </a>
          </Button>
        }
      />

      <FilterBar>
        <Field label="Fiscal year">
          <Select value={activeYear} onChange={(event) => setFiscalYear(event.target.value)}>
            {(years.data?.years ?? []).map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </Select>
        </Field>
        <div className="pb-0.5">
          <SegmentedTabs
            size="sm"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'statement', label: 'My statement' },
              { value: 'slabs', label: 'Slab configuration' },
              ...(can('tax.read.all') ? [{ value: 'company' as const, label: 'Company summary' }] : []),
            ]}
          />
        </div>
      </FilterBar>

      {tab === 'statement' ? (
        statement.isLoading ? (
          <div className="h-96 skeleton" />
        ) : !statement.data?.taxApplicable || !statement.data.computation ? (
          <Card>
            <EmptyState
              icon={ShieldCheck}
              tone="good"
              title={statement.data?.message ?? 'No tax computation available'}
              description="If you believe this is wrong, raise a payroll ticket on the help desk."
            />
          </Card>
        ) : (
          <StatementView statement={statement.data} />
        )
      ) : tab === 'slabs' ? (
        <SlabConfiguration fiscalYear={activeYear} />
      ) : (
        <CompanySummary fiscalYear={activeYear} />
      )}
    </>
  );
}

// ── the statement ─────────────────────────────────────────────────────

/**
 * Explains, in words, how the exemption was arrived at.
 *
 * The two shapes read completely differently to the person checking
 * their payslip — "a third of earnings, capped" versus "a flat
 * allowance" — so the label has to follow the config rather than
 * describe one and hope.
 */
function exemptionLabel(config: TaxStatement['config']): string {
  if (config?.nonTaxableFlat != null) {
    return `Standard deduction — flat ${formatMoney(config.nonTaxableFlat)}`;
  }
  return (
    `Non-taxable allowance — lesser of one ${ordinal(config?.nonTaxableDivisor ?? 3)} `
    + `of earnings or ${formatMoney(config?.nonTaxableCap ?? 0)}`
  );
}

function StatementView({ statement }: { statement: TaxStatement }) {
  const c = statement.computation!;

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-4">
        {/* Headline numbers first — the four figures anyone actually wants. */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Total earning"
            value={formatMoney(c.totalEarning)}
            hint={`${statement.fiscalYear} fiscal year`}
            icon={Landmark}
          />
          <StatTile label="Taxable income" value={formatMoney(c.taxable)} icon={Calculator} tone="brand" />
          <StatTile
            label="Annual liability"
            value={formatMoney(c.liability)}
            hint={c.minimumTaxApplied ? 'Statutory minimum tax applied' : undefined}
            icon={Receipt}
            tone="warning"
          />
          <StatTile
            label="Monthly deduction"
            value={formatMoney(c.monthlyLiability)}
            hint={`over ${countOf(c.remainingMonths, 'remaining month')}`}
            icon={BadgeInfo}
            tone="critical"
          />
        </div>

        {/* 1 ── gross timeline */}
        <Card>
          <CardHeader>
            <CardTitle>1 · Gross timeline</CardTitle>
            <p className="mt-0.5 text-xs text-ink-muted">
              The fiscal year is segmented on your salary-effective dates, so a mid-year
              increment is counted for the months it actually applied to — never as
              twelve months at the latest figure.
            </p>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Effective from</th>
                  <th>To</th>
                  <th className="text-right">Months</th>
                  <th className="text-right">Monthly gross</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {c.grossTimeline.map((row) => (
                  <tr key={row.effectiveFrom}>
                    <td className="font-medium text-ink">{formatDate(row.effectiveFrom)}</td>
                    <td>{formatDate(row.effectiveTo)}</td>
                    <td className="text-right tabular">{row.months}</td>
                    <td className="text-right tabular">{formatMoney(row.monthlyGross)}</td>
                    <td className="text-right font-medium text-ink tabular">{formatMoney(row.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-surface-sunken font-medium text-ink">
                <tr>
                  <td colSpan={4} className="px-3 py-2.5">Total gross</td>
                  <td className="px-3 py-2.5 text-right tabular">{formatMoney(c.totalGross)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>

        {/* 2 ── earning breakup */}
        <Card>
          <CardHeader>
            <CardTitle>2 · Earning breakup</CardTitle>
            <p className="mt-0.5 text-xs text-ink-muted">
              Gross is split into the statutory heads your country defines, then any bonus is added.
            </p>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Component</th>
                  <th className="text-right">Monthly</th>
                  <th className="text-right">Months</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {c.earningBreakup.map((row, index) => (
                  <tr key={`${row.code}-${index}`}>
                    <td className="font-medium text-ink">{row.label}</td>
                    <td className="text-right tabular">{formatMoney(row.monthly)}</td>
                    <td className="text-right tabular">{row.months}</td>
                    <td className="text-right tabular">{formatMoney(row.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-surface-sunken font-medium text-ink">
                <tr>
                  <td colSpan={3} className="px-3 py-2.5">Total earning</td>
                  <td className="px-3 py-2.5 text-right tabular">{formatMoney(c.totalEarning)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>

        {/* 3-5 ── exemption and slab ladder */}
        <Card>
          <CardHeader>
            <CardTitle>3 · Exemption and taxable income</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Line
              label={exemptionLabel(statement.config)}
              value={`− ${formatMoney(c.nonTaxable)}`}
            />
            <Line label="Total earning" value={formatMoney(c.totalEarning)} muted />
            <div className="border-t border-line pt-2">
              <Line label="Taxable income" value={formatMoney(c.taxable)} emphasis />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>4 · Progressive slabs</CardTitle>
            <p className="mt-0.5 text-xs text-ink-muted">
              Taxpayer category: {statement.categoryLabel ?? statement.category ?? 'General'}.
              Each band applies only to the portion of income that falls inside it.
            </p>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Band</th>
                  <th className="text-right">Rate</th>
                  <th className="text-right">Income in band</th>
                  <th className="text-right">Tax</th>
                </tr>
              </thead>
              <tbody>
                {c.slabWorking.map((row) => (
                  <tr key={row.seq} className={row.taxableInSlab === 0 ? 'opacity-50' : undefined}>
                    <td className="font-medium text-ink">{row.label}</td>
                    <td className="text-right tabular">{row.rate}%</td>
                    <td className="text-right tabular">{formatMoney(row.taxableInSlab)}</td>
                    <td className="text-right font-medium text-ink tabular">{formatMoney(row.tax)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-surface-sunken font-medium text-ink">
                <tr>
                  <td colSpan={3} className="px-3 py-2.5">Total tax before rebate</td>
                  <td className="px-3 py-2.5 text-right tabular">{formatMoney(c.totalTax)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>

        {/* 6-7 ── rebate and liability */}
        <Card>
          <CardHeader>
            <CardTitle>5 · Rebate and net liability</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Line
              label={`Allowable investment — ${statement.config?.investmentAllowancePct ?? 20}% of taxable income`}
              value={formatMoney(c.allowableInvestment)}
              muted
            />
            <Line
              label="Declared investment"
              value={c.actualInvestment > 0 ? formatMoney(c.actualInvestment) : 'none declared'}
              muted
            />
            <Line
              label={`Investment rebate — ${statement.config?.rebatePct ?? 10}% of allowable investment`}
              value={`− ${formatMoney(c.rebate)}`}
            />
            {c.advanceIncomeTax > 0 ? (
              <Line label="Advance income tax already deposited" value={`− ${formatMoney(c.advanceIncomeTax)}`} />
            ) : null}
            <div className="border-t border-line pt-2">
              <Line label="Annual liability" value={formatMoney(c.liability)} emphasis />
            </div>
            {c.minimumTaxApplied ? (
              <p className="flex items-start gap-1.5 rounded-lg bg-warning-subtle px-2.5 py-2 text-2xs text-serious">
                <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
                The computed tax fell below the statutory minimum of{' '}
                {formatMoney(statement.config?.minimumTax ?? 0)}, so the minimum applies.
              </p>
            ) : null}
          </CardContent>
        </Card>

        {/* 8-9 ── ledger */}
        <Card>
          <CardHeader>
            <CardTitle>6 · Deducted at source, and what remains</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {c.paymentLedger.length === 0 ? (
              <p className="text-xs text-ink-muted">
                No tax has been deducted for this fiscal year yet.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {c.paymentLedger.map((payment) => (
                  <li
                    key={`${payment.year}-${payment.month}`}
                    className="flex items-center justify-between py-1.5 text-sm"
                  >
                    <span className="text-ink-secondary">
                      {MONTHS[payment.month - 1]} {payment.year}
                    </span>
                    <span className="font-medium text-ink tabular">{formatMoney(payment.amount)}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="space-y-2 border-t border-line pt-2">
              <Line label="Paid to date" value={formatMoney(c.paidToDate)} muted />
              <Line label="Remaining liability" value={formatMoney(c.remainingLiability)} emphasis />
              <Line
                label={`Spread over ${countOf(c.remainingMonths, 'remaining month')}`}
                value={`${formatMoney(c.monthlyLiability)} / month`}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right rail: the monthly restatement, plus the employee header. */}
      {/* Sticky: the taxpayer identity and the monthly×months reference are
          what you check against while reading the ledger, and a static rail
          left a thousand pixels of empty column beside it. */}
      <div className="space-y-4 xl:sticky xl:top-4">
        <Card>
          <CardHeader>
            <CardTitle>Taxpayer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="font-medium text-ink">{statement.employee.fullName}</p>
            <p className="text-xs text-ink-secondary">
              {statement.employee.designation ?? '—'}
              {statement.employee.grade ? ` (${statement.employee.grade})` : ''}
            </p>
            <dl className="space-y-1.5 border-t border-line pt-2 text-xs">
              <Row label="Employee ID" value={statement.employee.employeeVisibleId} />
              <Row label="TIN" value={statement.employee.tinNumber ?? 'not on record'} />
              <Row label="Department" value={statement.employee.department ?? '—'} />
              <Row label="Category" value={statement.categoryLabel ?? '—'} />
              <Row
                label="Fiscal year"
                value={
                  statement.fiscalYearStart
                    ? `${formatDate(statement.fiscalYearStart, 'short')} – ${formatDate(statement.fiscalYearEnd!, 'short')}`
                    : statement.fiscalYear
                }
              />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Monthly × months = total</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {c.earningBreakup.map((row, index) => (
                <li key={`${row.code}-rail-${index}`} className="text-xs">
                  <p className="truncate font-medium text-ink">{row.label}</p>
                  <p className="mt-0.5 text-ink-muted tabular">
                    {formatMoney(row.monthly)} × {row.months} ={' '}
                    <span className="font-medium text-ink-secondary">{formatMoney(row.total)}</span>
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <div className="rounded-card border border-brand/20 bg-brand-subtle p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-ink">
            <Info className="size-3.5" aria-hidden />
            Why these numbers are trustworthy
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-brand-ink/80">
            The slab ladder, the exemption and the rebate percentages all live in the database,
            versioned per fiscal year and per filing category — nothing is hardcoded, and the
            engine never learns which country it is running. Superseding a budget means adding
            rows, not changing code.
          </p>
        </div>
      </div>
    </div>
  );
}

function Line({
  label,
  value,
  emphasis,
  muted,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={cn('text-xs', muted ? 'text-ink-muted' : 'text-ink-secondary')}>{label}</span>
      <span
        className={cn(
          'shrink-0 tabular',
          emphasis ? 'text-base font-semibold text-ink' : muted ? 'text-xs text-ink-muted' : 'text-sm font-medium text-ink',
        )}
      >
        {value}
      </span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="truncate text-right font-medium text-ink-secondary">{value}</dd>
    </div>
  );
}

function ordinal(divisor: number): string {
  if (divisor === 3) return 'third';
  if (divisor === 2) return 'half';
  if (divisor === 4) return 'quarter';
  return `1/${divisor}`;
}

// ── slab configuration ───────────────────────────────────────────────

function SlabConfiguration({ fiscalYear }: { fiscalYear: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['tax', 'configuration', fiscalYear],
    queryFn: () =>
      api.get<{
        fiscalYear: string;
        categories: {
          category: string; categoryLabel: string;
          nonTaxableDivisor: number; nonTaxableCap: number; nonTaxableFlat: number | null;
          investmentAllowancePct: number; rebatePct: number; minimumTax: number;
          effectiveFrom: string; effectiveTo: string | null; notes: string | null;
          slabs: { seq: number; label: string | null; slabAmount: number | null; rate: number }[];
        }[];
      }>('/tax/configuration', { fiscalYear }),
    enabled: Boolean(fiscalYear),
  });

  if (isLoading) return <div className="h-64 skeleton" />;
  if (!data || data.categories.length === 0) {
    return (
      <Card>
        <EmptyState title="No configuration published" description={`Nothing is set up for ${fiscalYear}.`} />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-card border border-line bg-surface p-4">
        <p className="text-xs leading-relaxed text-ink-secondary">
          {data.categories[0].notes ??
            'Slabs are stored per fiscal year and per taxpayer category.'}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {data.categories.map((category) => (
          <Card key={category.category}>
            <CardHeader>
              <CardTitle>{category.categoryLabel}</CardTitle>
              <p className="mt-0.5 text-xs text-ink-muted">
                Exemption: one third of earnings capped at {formatMoney(category.nonTaxableCap)} ·
                rebate {category.rebatePct}% of {category.investmentAllowancePct}% of taxable ·
                minimum tax {formatMoney(category.minimumTax)}
              </p>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Band</th>
                    <th className="text-right">Width</th>
                    <th className="text-right">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {category.slabs.map((slab) => (
                    <tr key={slab.seq}>
                      <td className="text-xs">{slab.label ?? `Band ${slab.seq}`}</td>
                      <td className="text-right tabular">
                        {slab.slabAmount === null ? 'balance' : formatNumber(slab.slabAmount)}
                      </td>
                      <td className="text-right">
                        <Badge tone={slab.rate === 0 ? 'good' : slab.rate >= 25 ? 'critical' : 'neutral'}>
                          {slab.rate}%
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── company summary ──────────────────────────────────────────────────

function CompanySummary({ fiscalYear }: { fiscalYear: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['tax', 'company-summary', fiscalYear],
    queryFn: () =>
      api.get<{
        fiscalYear: string;
        employeeCount: number;
        totals: {
          totalEarning: number; taxable: number; totalTax: number; rebate: number;
          liability: number; paidToDate: number; remaining: number;
        };
        employees: {
          employee: { id: number; employeeVisibleId: string; fullName: string; initials: string; designation: { name: string } | null; department: { name: string } | null };
          category: string; totalEarning: number; taxable: number; totalTax: number;
          rebate: number; liability: number; paidToDate: number; remainingLiability: number;
          monthlyLiability: number;
        }[];
      }>('/tax/company-summary', { fiscalYear }),
    enabled: Boolean(fiscalYear),
  });

  const columns: Column<NonNullable<typeof data>['employees'][number]>[] = [
    {
      key: 'employee',
      header: 'Employee',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{row.employee.fullName}</p>
          <p className="truncate text-2xs text-ink-muted">
            #{row.employee.employeeVisibleId} · {row.employee.department?.name ?? '—'}
          </p>
        </div>
      ),
    },
    { key: 'category', header: 'Category', hideBelow: 'md', render: (row) => <Badge>{row.category}</Badge> },
    { key: 'earning', header: 'Total earning', align: 'right', render: (row) => formatMoney(row.totalEarning) },
    { key: 'taxable', header: 'Taxable', align: 'right', hideBelow: 'sm', render: (row) => formatMoney(row.taxable) },
    { key: 'tax', header: 'Total tax', align: 'right', hideBelow: 'md', render: (row) => formatMoney(row.totalTax) },
    { key: 'rebate', header: 'Rebate', align: 'right', hideBelow: 'lg', render: (row) => formatMoney(row.rebate) },
    {
      key: 'liability',
      header: 'Liability',
      align: 'right',
      render: (row) => <span className="font-medium text-ink">{formatMoney(row.liability)}</span>,
    },
    { key: 'paid', header: 'Paid', align: 'right', hideBelow: 'sm', render: (row) => formatMoney(row.paidToDate) },
    {
      key: 'monthly',
      header: 'Monthly',
      align: 'right',
      render: (row) => formatMoney(row.monthlyLiability),
    },
  ];

  if (isLoading) return <div className="h-96 skeleton" />;
  if (!data) return null;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Employees in scope" value={data.employeeCount} icon={Building2} />
        <StatTile label="Total taxable" value={formatMoney(data.totals.taxable)} icon={Calculator} />
        <StatTile label="Total liability" value={formatMoney(data.totals.liability)} icon={Receipt} tone="warning" />
        <StatTile label="Still to collect" value={formatMoney(data.totals.remaining)} tone="critical" />
      </div>

      <DataTable
        columns={columns}
        rows={data.employees}
        keyOf={(row) => row.employee.id}
        emptyTitle="No tax statements for this year"
      />
    </>
  );
}
