'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Building2, ClipboardList, LogOut, TrendingDown, UserMinus, UserPlus, Users,
} from 'lucide-react';
import Link from 'next/link';

import { Donut } from '@/components/charts/donut';
import { RankedBars } from '@/components/charts/bars';
import { PageHeader } from '@/components/shared/page-header';
import { StatTile } from '@/components/shared/stat-tile';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LinkTabs } from '@/components/ui/tabs';
import { STATUS_COLOR, statusLabel } from '@/components/ui/status-badge';
import { api } from '@/lib/api';
import { formatPercent } from '@/lib/utils';
import { COMPANY_TABS } from '@/lib/tabs';

export default function CompanyOverviewPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'company-overview'],
    queryFn: () =>
      api.get<{
        available: boolean;
        headcount?: number;
        joinersThisMonth?: number;
        leaversThisMonth?: number;
        onProbation?: number;
        openTickets?: number;
        pendingResignations?: number;
        attritionRateAnnualised?: number;
        byDepartment?: { departmentId: number | null; department: string; headcount: number }[];
        byEmploymentStatus?: { status: string; count: number }[];
        todayAttendance?: { status: string; count: number }[];
      }>('/dashboard/company-overview'),
  });

  return (
    <>
      <PageHeader
        title="Company"
        description="Organisation-level KPIs. Separate from your personal dashboard so an ordinary employee never pays for these queries."
        breadcrumbs={[{ label: 'Workplace' }, { label: 'Company' }]}
      />

      <LinkTabs tabs={COMPANY_TABS} />

      {isLoading ? (
        <div className="h-64 skeleton rounded-card" />
      ) : !data?.available ? (
        <Card>
          <EmptyState
            icon={Building2}
            title="Company-wide figures are not available to you"
            description="These KPIs need company-wide read access. Your own dashboard is unaffected."
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Active headcount" value={data.headcount ?? 0} icon={Users} tone="brand" />
            <StatTile label="Joined this month" value={data.joinersThisMonth ?? 0} icon={UserPlus} tone="good" />
            <StatTile
              label="Left this month"
              value={data.leaversThisMonth ?? 0}
              icon={UserMinus}
              tone={(data.leaversThisMonth ?? 0) > 0 ? 'warning' : 'neutral'}
            />
            <StatTile
              label="Attrition (annualised)"
              value={formatPercent(data.attritionRateAnnualised ?? 0)}
              icon={TrendingDown}
              hint="from this month's leavers"
              tone={(data.attritionRateAnnualised ?? 0) > 15 ? 'critical' : 'neutral'}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile label="On probation" value={data.onProbation ?? 0} icon={ClipboardList} />
            <StatTile
              label="Resignations in flight"
              value={data.pendingResignations ?? 0}
              icon={LogOut}
              tone={(data.pendingResignations ?? 0) > 0 ? 'warning' : 'neutral'}
            />
            <StatTile label="Open help desk tickets" value={data.openTickets ?? 0} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Headcount by department</CardTitle>
              </CardHeader>
              <CardContent>
                <RankedBars
                  data={(data.byDepartment ?? []).map((row) => ({
                    key: String(row.departmentId ?? row.department),
                    label: row.department,
                    value: row.headcount,
                  }))}
                  formatValue={(value) => `${value} people`}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Attendance today</CardTitle>
                <p className="mt-0.5 text-xs text-ink-muted">
                  States, not categories — so these wear the reserved status colours.
                </p>
              </CardHeader>
              <CardContent>
                <Donut
                  slices={(data.todayAttendance ?? [])
                    .filter((row) => !['WEEKEND', 'HOLIDAY'].includes(row.status))
                    .map((row) => ({
                      key: row.status,
                      label: statusLabel(row.status),
                      value: row.count,
                      color: STATUS_COLOR[row.status] ?? 'rgb(var(--ink-muted))',
                    }))}
                  heroLabel="Working"
                  emptyLabel="No attendance recorded for today yet"
                />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Employment status mix</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {(data.byEmploymentStatus ?? []).map((row) => (
                  <div key={row.status} className="rounded-lg border border-line p-3">
                    <p className="text-2xs font-medium uppercase tracking-wide text-ink-muted">
                      {statusLabel(row.status)}
                    </p>
                    <p className="mt-1 text-xl font-semibold text-ink tabular">{row.count}</p>
                    <p className="mt-0.5 text-2xs text-ink-muted">
                      {formatPercent(((row.count / Math.max(data.headcount ?? 1, 1)) * 100))} of headcount
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
