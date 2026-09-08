'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileSpreadsheet, Loader2, Play } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { DataTable, type Column } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Select } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import { ApiError, api } from '@/lib/api';
import { MONTHS, formatDateTime, formatNumber, yearOptions } from '@/lib/utils';

interface Job {
  id: string;
  reportType: string;
  format: string;
  params: Record<string, unknown> | null;
  status: string;
  progressPct: number;
  filePath: string | null;
  fileSizeBytes: number | null;
  rowCount: number | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
  expiresAt: string | null;
}

/** Which parameters each report actually takes. */
const REPORT_PARAMS: Record<string, ('month' | 'year' | 'fiscalYear')[]> = {
  EmployeeDirectory: [],
  EmployeeTax: ['fiscalYear'],
  Payslips: ['month', 'year'],
  PayrollRegister: ['month', 'year'],
  AttendanceMonthly: ['month', 'year'],
  LeaveLedger: ['year'],
  LeaveBalance: ['year'],
  CustomerVisits: ['month', 'year'],
  OnboardingStatus: [],
};

const REPORT_LABEL: Record<string, string> = {
  EmployeeDirectory: 'Employee directory',
  EmployeeTax: 'Employee tax statement',
  Payslips: 'Payslips',
  PayrollRegister: 'Payroll register',
  AttendanceMonthly: 'Attendance (monthly detail)',
  LeaveLedger: 'Leave ledger',
  LeaveBalance: 'Leave balances',
  CustomerVisits: 'Customer visits',
  OnboardingStatus: 'Onboarding status',
};

function ReportsView() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const now = new Date();

  const [reportType, setReportType] = useState(searchParams.get('type') ?? 'EmployeeDirectory');
  const [month, setMonth] = useState(now.getUTCMonth() + 1);
  const [year, setYear] = useState(now.getUTCFullYear());
  const [fiscalYear, setFiscalYear] = useState('');

  const fiscalYears = useQuery({
    queryKey: ['tax', 'fiscal-years'],
    queryFn: () => api.get<{ current: string; years: string[] }>('/tax/fiscal-years'),
  });

  useEffect(() => {
    if (!fiscalYear && fiscalYears.data?.current) setFiscalYear(fiscalYears.data.current);
  }, [fiscalYear, fiscalYears.data?.current]);

  const jobs = useQuery({
    queryKey: ['reports', 'mine'],
    queryFn: () => api.get<Job[]>('/reports/mine'),
    // Poll while anything is still running.
    refetchInterval: (query) =>
      (query.state.data ?? []).some((job) => ['QUEUED', 'RUNNING'].includes(job.status))
        ? 2_000
        : false,
  });

  const queue = useMutation({
    mutationFn: () => {
      const needed = REPORT_PARAMS[reportType] ?? [];
      const params: Record<string, unknown> = {};
      if (needed.includes('month')) params.month = month;
      if (needed.includes('year')) params.year = year;
      if (needed.includes('fiscalYear')) params.fiscalYear = fiscalYear;
      return api.post<{ jobId: string }>('/reports', { reportType, format: 'xlsx', params });
    },
    onSuccess: () => {
      toast.success('Export queued', {
        description: 'It runs in the background — you can leave this page.',
      });
      void queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
    onError: (error) => {
      toast.error('Could not queue the export', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
  });

  const needed = REPORT_PARAMS[reportType] ?? [];

  const columns: Column<Job>[] = [
    {
      key: 'type',
      header: 'Report',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">
            {REPORT_LABEL[row.reportType] ?? row.reportType}
          </p>
          <p className="truncate text-2xs text-ink-muted">
            {row.params && Object.keys(row.params).length > 0
              ? Object.entries(row.params)
                  .map(([key, value]) => `${key}: ${String(value)}`)
                  .join(' · ')
              : 'no parameters'}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge status={row.status} />
          {row.status === 'RUNNING' ? (
            <span className="flex items-center gap-1 text-2xs text-ink-muted">
              <Loader2 className="size-3 animate-spin" aria-hidden />
              {row.progressPct}%
            </span>
          ) : null}
          {row.error ? (
            <span className="max-w-xs truncate text-2xs text-critical-ink">{row.error}</span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'rows',
      header: 'Rows',
      align: 'right',
      render: (row) => (row.rowCount !== null ? formatNumber(row.rowCount) : '—'),
    },
    {
      key: 'size',
      header: 'Size',
      align: 'right',
      hideBelow: 'sm',
      render: (row) =>
        row.fileSizeBytes ? `${Math.round(row.fileSizeBytes / 1024)} KB` : '—',
    },
    {
      key: 'created',
      header: 'Requested',
      hideBelow: 'md',
      render: (row) => <span className="whitespace-nowrap text-xs">{formatDateTime(row.createdAt)}</span>,
    },
    {
      key: 'expires',
      header: 'Expires',
      hideBelow: 'lg',
      render: (row) =>
        row.expiresAt ? (
          <span className="whitespace-nowrap text-xs text-ink-muted">
            {formatDateTime(row.expiresAt)}
          </span>
        ) : (
          '—'
        ),
    },
    {
      key: 'action',
      header: '',
      align: 'right',
      render: (row) =>
        row.status === 'READY' ? (
          <Button variant="secondary" size="sm" asChild>
            <a href={`/api/reports/${row.id}/download`}>
              <Download />
              Download
            </a>
          </Button>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader
        title="Reports"
        description="Exports run in the background so a twenty-thousand-row payroll register never blocks the page. Generated files expire after a week."
        breadcrumbs={[{ label: 'Workplace' }, { label: 'Reports' }]}
      />

      <Card>
        <CardHeader>
          <CardTitle>Generate an export</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Report" className="min-w-56">
              <Select value={reportType} onChange={(event) => setReportType(event.target.value)}>
                {Object.keys(REPORT_PARAMS).map((type) => (
                  <option key={type} value={type}>{REPORT_LABEL[type] ?? type}</option>
                ))}
              </Select>
            </Field>

            {needed.includes('month') ? (
              <Field label="Month">
                <Select value={month} onChange={(event) => setMonth(Number(event.target.value))}>
                  {MONTHS.map((label, index) => (
                    <option key={label} value={index + 1}>{label}</option>
                  ))}
                </Select>
              </Field>
            ) : null}

            {needed.includes('year') ? (
              <Field label="Year">
                <Select value={year} onChange={(event) => setYear(Number(event.target.value))}>
                  {yearOptions(3, 0).map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </Select>
              </Field>
            ) : null}

            {needed.includes('fiscalYear') ? (
              <Field label="Fiscal year">
                <Select value={fiscalYear} onChange={(event) => setFiscalYear(event.target.value)}>
                  {(fiscalYears.data?.years ?? []).map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </Select>
              </Field>
            ) : null}

            <Button onClick={() => queue.mutate()} loading={queue.isPending}>
              <Play />
              Generate
            </Button>
          </div>

          {needed.length === 0 ? (
            <p className="mt-2 text-2xs text-ink-muted">
              This report takes no parameters — it exports everything in your visibility scope.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <FileSpreadsheet className="size-4 text-ink-muted" aria-hidden />
          My exports
        </h2>
        <DataTable
          columns={columns}
          rows={jobs.data ?? []}
          keyOf={(row) => row.id}
          loading={jobs.isLoading}
          emptyTitle="No exports yet"
          emptyDescription="Generate one above; it will appear here as it runs."
        />
      </div>
    </>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<div className="h-96 skeleton rounded-card" />}>
      <ReportsView />
    </Suspense>
  );
}
