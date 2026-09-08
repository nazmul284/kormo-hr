'use client';

import { useQuery } from '@tanstack/react-query';
import { Banknote, Download, Receipt, TrendingDown, Wallet } from 'lucide-react';
import { useState } from 'react';

import { ColumnChart } from '@/components/charts/bars';
import { DataTable, DetailList, FilterBar, type Column } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { StatTile } from '@/components/shared/stat-tile';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Field, Select } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import { SegmentedTabs } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { MONTHS, MONTHS_SHORT, formatDate, formatMoney, formatMoneyCompact } from '@/lib/utils';

interface PayslipRow {
  sn: number;
  id: number;
  month: number;
  year: number;
  monthLabel: string;
  salaryDate: string;
  gs: number; ba: number; cam: number; tax: number; pf: number;
  dfa: number; ta: number; mb: number; bonus: number; overtime: number;
  netPayable: number;
  runStatus: string;
  isFinal: boolean;
}

export default function PayrollPage() {
  const { can } = useSession();
  const isAdmin = can('payroll.run', 'payslip.read.all');

  const [tab, setTab] = useState<'mine' | 'runs'>('mine');
  const [year, setYear] = useState<string>('');
  const [detailId, setDetailId] = useState<number | null>(null);

  const payslips = useQuery({
    queryKey: ['payroll', 'payslips', year],
    queryFn: () =>
      api.get<{ data: PayslipRow[]; meta: any; availableYears: number[] }>('/payroll/payslips', {
        year: year || undefined,
        pageSize: 50,
      }),
    enabled: tab === 'mine',
  });

  const columns: Column<PayslipRow>[] = [
    { key: 'sn', header: 'SN', align: 'right', width: '3.5rem', render: (row) => row.sn },
    {
      key: 'month',
      header: 'Month',
      render: (row) => <span className="whitespace-nowrap font-medium text-ink">{row.monthLabel}</span>,
    },
    {
      key: 'salaryDate',
      header: 'Salary date',
      hideBelow: 'sm',
      render: (row) => <span className="whitespace-nowrap text-xs">{formatDate(row.salaryDate)}</span>,
    },
    { key: 'gs', header: 'GS', align: 'right', render: (row) => formatMoney(row.gs) },
    { key: 'ba', header: 'BA', align: 'right', hideBelow: 'md', render: (row) => formatMoney(row.ba) },
    { key: 'cam', header: 'CAM', align: 'right', hideBelow: 'lg', render: (row) => formatMoney(row.cam) },
    {
      key: 'tax',
      header: 'Tax',
      align: 'right',
      // Plain ink, not a status colour: every row carries tax, so painting
      // the column red made eight of eight rows read as errors and told the
      // reader nothing. The header already says this is a deduction.
      render: (row) => (row.tax > 0 ? formatMoney(row.tax) : '—'),
    },
    { key: 'pf', header: 'PF', align: 'right', hideBelow: 'md', render: (row) => (row.pf > 0 ? formatMoney(row.pf) : '—') },
    {
      key: 'dfa',
      header: 'DFA',
      align: 'right',
      hideBelow: 'lg',
      render: (row) => (row.dfa > 0 ? formatMoney(row.dfa) : '—'),
    },
    { key: 'ta', header: 'TA', align: 'right', hideBelow: 'lg', render: (row) => (row.ta > 0 ? formatMoney(row.ta) : '—') },
    { key: 'mb', header: 'MB', align: 'right', hideBelow: 'lg', render: (row) => (row.mb > 0 ? formatMoney(row.mb) : '—') },
    {
      key: 'net',
      header: 'Net payable',
      align: 'right',
      render: (row) => <span className="font-semibold text-ink">{formatMoney(row.netPayable)}</span>,
    },
    {
      key: 'action',
      header: '',
      align: 'right',
      render: (row) => (
        <div className="flex items-center justify-end gap-1.5">
          {!row.isFinal ? <Badge tone="warning">{row.runStatus.toLowerCase()}</Badge> : null}
          <Button variant="ghost" size="sm" onClick={() => setDetailId(row.id)}>
            <Receipt />
            View
          </Button>
        </div>
      ),
    },
  ];

  const rows = payslips.data?.data ?? [];
  const ytd = rows.filter((row) => row.year === (year ? Number(year) : new Date().getUTCFullYear()));

  return (
    <>
      <PageHeader
        title="Payroll"
        description="GS = gross salary · BA = basic + allowance · CAM = conveyance / allowance / medical · PF = provident fund · DFA = deduction for absence · TA = transport allowance · MB = mobile bill."
        breadcrumbs={[{ label: 'Pay & Tax' }, { label: 'Payroll' }]}
      />

      {isAdmin ? (
        <SegmentedTabs
          value={tab}
          onChange={setTab}
          options={[
            { value: 'mine', label: 'My payslips' },
            { value: 'runs', label: 'Payroll runs' },
          ]}
        />
      ) : null}

      {tab === 'mine' ? (
        <>
          <FilterBar>
            <Field label="Year">
              <Select value={year} onChange={(event) => setYear(event.target.value)}>
                <option value="">All years</option>
                {(payslips.data?.availableYears ?? []).map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </Select>
            </Field>
          </FilterBar>

          {ytd.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile
                label="Gross paid (selected)"
                value={formatMoneyCompact(ytd.reduce((sum, row) => sum + row.gs, 0))}
                icon={Wallet}
              />
              <StatTile
                label="Net received"
                value={formatMoneyCompact(ytd.reduce((sum, row) => sum + row.netPayable, 0))}
                icon={Banknote}
                tone="good"
              />
              <StatTile
                label="Tax deducted"
                value={formatMoneyCompact(ytd.reduce((sum, row) => sum + row.tax, 0))}
                icon={TrendingDown}
                tone="warning"
              />
              <StatTile
                label="Provident fund"
                value={formatMoneyCompact(ytd.reduce((sum, row) => sum + row.pf, 0))}
              />
            </div>
          ) : null}

          {rows.length > 1 ? (
            <Card>
              <CardHeader>
                <CardTitle>Net pay by month</CardTitle>
                <p className="mt-0.5 text-xs text-ink-muted">Hover a column for the exact figure</p>
              </CardHeader>
              <CardContent>
                <ColumnChart
                  data={rows
                    .slice()
                    .reverse()
                    .map((row) => ({
                      key: `${row.year}-${row.month}`,
                      label: `${MONTHS_SHORT[row.month - 1]}`,
                      value: row.netPayable,
                    }))}
                  height={140}
                  formatValue={(value) => formatMoney(value)}
                />
              </CardContent>
            </Card>
          ) : null}

          <DataTable
            columns={columns}
            rows={rows}
            keyOf={(row) => row.id}
            loading={payslips.isLoading}
            emptyTitle="No payslips yet"
            emptyDescription="Payslips appear once payroll has been run for a month you were employed in."
          />
        </>
      ) : (
        <PayrollRuns />
      )}

      <PayslipDialog payslipId={detailId} onClose={() => setDetailId(null)} />
    </>
  );
}

function PayrollRuns() {
  const runs = useQuery({
    queryKey: ['payroll', 'runs'],
    queryFn: () =>
      api.get<{
        id: number; month: number; year: number; monthLabel: string; status: string;
        salaryDate: string | null; headcount: number; totalGross: number; totalNet: number;
        totalTax: number; payslipCount: number; isEditable: boolean; notes: string | null;
      }[]>('/payroll/runs'),
  });

  const trend = useQuery({
    queryKey: ['payroll', 'cost-trend'],
    queryFn: () =>
      api.get<{ month: number; year: number; label: string; headcount: number; gross: number; net: number; tax: number }[]>(
        '/payroll/cost-trend',
        { months: 12 },
      ),
  });

  const columns: Column<NonNullable<typeof runs.data>[number]>[] = [
    { key: 'month', header: 'Period', render: (row) => <span className="whitespace-nowrap font-medium text-ink">{row.monthLabel}</span> },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    { key: 'salaryDate', header: 'Salary date', hideBelow: 'sm', render: (row) => (row.salaryDate ? formatDate(row.salaryDate) : '—') },
    { key: 'headcount', header: 'Headcount', align: 'right', render: (row) => row.headcount },
    { key: 'gross', header: 'Total gross', align: 'right', render: (row) => formatMoney(row.totalGross) },
    { key: 'tax', header: 'Total tax', align: 'right', hideBelow: 'md', render: (row) => formatMoney(row.totalTax) },
    {
      key: 'net',
      header: 'Total net',
      align: 'right',
      render: (row) => <span className="font-semibold text-ink">{formatMoney(row.totalNet)}</span>,
    },
    {
      key: 'notes',
      header: 'Notes',
      hideBelow: 'lg',
      render: (row) => <span className="line-clamp-2 max-w-xs text-xs">{row.notes ?? '—'}</span>,
    },
  ];

  return (
    <>
      {trend.data && trend.data.length > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>Monthly payroll cost</CardTitle>
            <p className="mt-0.5 text-xs text-ink-muted">
              Total net disbursed per run, last {trend.data.length} closed months
            </p>
          </CardHeader>
          <CardContent>
            <ColumnChart
              data={trend.data.map((row) => ({
                key: `${row.year}-${row.month}`,
                label: row.label,
                value: row.net,
              }))}
              height={160}
              formatValue={(value) => formatMoney(value)}
            />
          </CardContent>
        </Card>
      ) : null}

      <DataTable
        columns={columns}
        rows={runs.data ?? []}
        keyOf={(row) => row.id}
        loading={runs.isLoading}
        emptyTitle="No payroll runs"
      />
    </>
  );
}

function PayslipDialog({ payslipId, onClose }: { payslipId: number | null; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['payroll', 'payslip', payslipId],
    queryFn: () => api.get<any>(`/payroll/payslips/${payslipId}`),
    enabled: payslipId !== null,
  });

  return (
    <Dialog open={payslipId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Payslip</DialogTitle>
          <DialogDescription>
            {data ? `${MONTHS[data.month - 1]} ${data.year} · paid ${formatDate(data.salaryDate)}` : ''}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {isLoading || !data ? (
            <div className="space-y-3">
              <div className="h-6 skeleton" />
              <div className="h-32 skeleton" />
            </div>
          ) : (
            <div className="space-y-5">
              <div className="rounded-lg bg-surface-sunken p-3">
                <DetailList
                  columns={2}
                  items={[
                    { label: 'Employee', value: `${data.employee.fullName} (#${data.employee.employeeVisibleId})` },
                    { label: 'Designation', value: data.employee.designation?.name ?? '—' },
                    { label: 'Department', value: data.employee.department?.name ?? '—' },
                    { label: 'Company', value: data.employee.company.name },
                    {
                      label: 'Bank',
                      value: data.employee.bankAccounts[0]
                        ? `${data.employee.bankAccounts[0].bankName} · ${data.employee.bankAccounts[0].accountNo}`
                        : '—',
                    },
                    { label: 'Transaction type', value: data.employee.bankAccounts[0]?.txnType ?? '—' },
                  ]}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-ink-muted">
                    Earnings
                  </p>
                  <ul className="divide-y divide-line rounded-lg border border-line">
                    {(data.breakdown?.earnings ?? []).map((item: any) => (
                      <li key={item.code} className="flex items-center justify-between px-3 py-2 text-sm">
                        <span className="text-ink-secondary">{item.label}</span>
                        <span className="font-medium text-ink tabular">{formatMoney(item.amount)}</span>
                      </li>
                    ))}
                    <li className="flex items-center justify-between bg-good-subtle px-3 py-2 text-sm">
                      <span className="font-medium text-ink">Total earnings</span>
                      <span className="font-semibold text-good-ink tabular">
                        {formatMoney(data.totals.totalEarnings)}
                      </span>
                    </li>
                  </ul>
                </div>

                <div>
                  <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-ink-muted">
                    Deductions
                  </p>
                  <ul className="divide-y divide-line rounded-lg border border-line">
                    {(data.breakdown?.deductions ?? []).length === 0 ? (
                      <li className="px-3 py-2 text-sm text-ink-muted">No deductions</li>
                    ) : (
                      (data.breakdown?.deductions ?? []).map((item: any) => (
                        <li key={item.code} className="flex items-center justify-between px-3 py-2 text-sm">
                          <span className="text-ink-secondary">{item.label}</span>
                          <span className="font-medium text-ink tabular">{formatMoney(item.amount)}</span>
                        </li>
                      ))
                    )}
                    <li className="flex items-center justify-between bg-critical-subtle px-3 py-2 text-sm">
                      <span className="font-medium text-ink">Total deductions</span>
                      <span className="font-semibold text-critical-ink tabular">
                        {formatMoney(data.totals.totalDeductions)}
                      </span>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-brand-subtle px-4 py-3">
                <span className="text-sm font-medium text-brand-ink">Net payable</span>
                <span className="text-xl font-semibold text-brand-ink tabular">
                  {formatMoney(data.totals.netPayable)}
                </span>
              </div>

              {data.breakdown?.attendance ? (
                <div>
                  <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-ink-muted">
                    Attendance basis for this run
                  </p>
                  <DetailList
                    columns={3}
                    items={[
                      { label: 'Working days', value: data.breakdown.attendance.workingDays },
                      { label: 'Present', value: data.breakdown.attendance.presentDays },
                      { label: 'Late', value: data.breakdown.attendance.lateDays },
                      { label: 'Absent', value: data.breakdown.attendance.absentDays },
                      { label: 'On leave', value: data.breakdown.attendance.leaveDays },
                      { label: 'Overtime', value: `${Math.round((data.breakdown.attendance.overtimeMinutes / 60) * 10) / 10} h` },
                    ]}
                  />
                </div>
              ) : null}
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
