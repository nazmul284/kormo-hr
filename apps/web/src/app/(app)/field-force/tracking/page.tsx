'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BatteryLow, Clock, Info, MapPin, Route, ShieldAlert, ShieldCheck, Smartphone,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { TrackingMap } from '@/components/charts/tracking-map';
import { DataTable, FilterBar, type Column } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { StatTile } from '@/components/shared/stat-tile';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import { LinkTabs, SegmentedTabs } from '@/components/ui/tabs';
import { ApiError, api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { formatDate, formatDateTime, formatMoneyCompact, formatNumber, minutesToHm } from '@/lib/utils';
import { FIELD_TABS } from '@/lib/tabs';

interface Session {
  id: number;
  employee: {
    id: number; employeeVisibleId: string; fullName: string; initials: string;
    designation: { name: string } | null; department: { name: string } | null;
  };
  startedAt: string;
  endedAt: string | null;
  status: string;
  distanceKm: number;
  pointCount: number;
  batteryStart: number | null;
  batteryEnd: number | null;
  deviceInfo: string | null;
  lastPoint: { lat: number; lng: number; recordedAt: string; speedKph: number | null } | null;
  durationMinutes: number;
}

export default function TrackingPage() {
  const { can } = useSession();
  const canSeeTeam = can('tracking.read.team', 'tracking.read.all');

  const [tab, setTab] = useState<'overview' | 'report' | 'consent'>(
    canSeeTeam ? 'overview' : 'consent',
  );
  const [scope, setScope] = useState<'ongoing' | 'previous'>('ongoing');
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <>
      <PageHeader
        title="Employee tracking"
        description="Location tracking of staff is legally sensitive. It runs only with the employee's explicit consent, only inside working hours, and breadcrumbs are purged after the retention window."
        breadcrumbs={[{ label: 'Field Force' }, { label: 'Employee Tracking' }]}
      />

      <LinkTabs tabs={FIELD_TABS} />

      <div className="flex items-start gap-2 rounded-card border border-brand/20 bg-brand-subtle px-4 py-3">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
        <p className="text-xs leading-relaxed text-brand-ink">
          <strong>How consent works here.</strong> Nobody is tracked by default. An employee turns
          tracking on themselves and can withdraw it at any time; both transitions are timestamped.
          Points recorded outside the configured working-hours window are discarded, and the whole
          session is purged once past its retention period.
        </p>
      </div>

      <SegmentedTabs
        value={tab}
        onChange={setTab}
        options={[
          ...(canSeeTeam
            ? [
                { value: 'overview' as const, label: 'Overview' },
                { value: 'report' as const, label: 'Report' },
              ]
            : []),
          { value: 'consent' as const, label: 'My consent' },
        ]}
      />

      {tab === 'overview' ? (
        <Overview scope={scope} setScope={setScope} selected={selected} onSelect={setSelected} />
      ) : tab === 'report' ? (
        <TrackingReport />
      ) : (
        <ConsentPanel />
      )}
    </>
  );
}

function Overview({
  scope,
  setScope,
  selected,
  onSelect,
}: {
  scope: 'ongoing' | 'previous';
  setScope: (value: 'ongoing' | 'previous') => void;
  selected: number | null;
  onSelect: (id: number | null) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['field', 'tracking', 'overview', scope],
    queryFn: () =>
      api.get<{
        scope: string;
        sessions: Session[];
        withoutConsent: { id: number; fullName: string; designation: string | null }[];
      }>('/field-force/tracking/overview', { scope }),
    // Live sessions move; poll while the ongoing tab is open.
    refetchInterval: scope === 'ongoing' ? 60_000 : false,
  });

  const detail = useQuery({
    queryKey: ['field', 'tracking', 'session', selected],
    queryFn: () =>
      api.get<{
        session: Session & { points: { lat: number; lng: number; recordedAt: string; speedKph: number | null }[] };
        purged: boolean;
        message?: string;
      }>(`/field-force/tracking/sessions/${selected}`),
    enabled: selected !== null,
  });

  const markers = useMemo(
    () =>
      (data?.sessions ?? [])
        .filter((session) => session.lastPoint)
        .map((session) => ({
          id: session.id,
          lat: session.lastPoint!.lat,
          lng: session.lastPoint!.lng,
          label: session.employee.fullName,
          sublabel: `${session.distanceKm.toFixed(1)} km · last seen ${formatDateTime(session.lastPoint!.recordedAt)}`,
          color: session.status === 'ONGOING' ? 'rgb(12,163,12)' : 'rgb(79,70,229)',
        })),
    [data?.sessions],
  );

  const polylines = useMemo(() => {
    if (!detail.data || detail.data.purged) return [];
    return [
      {
        id: detail.data.session.id,
        points: detail.data.session.points.map((point) => [point.lat, point.lng] as [number, number]),
        color: 'rgb(79,70,229)',
        label: detail.data.session.employee.fullName,
      },
    ];
  }, [detail.data]);

  const columns: Column<Session>[] = [
    {
      key: 'employee',
      header: 'Employee',
      render: (row) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={row.employee.fullName} initials={row.employee.initials} size="sm" />
          <div className="min-w-0">
            <Link
              href={`/profile/${row.employee.id}`}
              className="block truncate text-sm font-medium text-ink hover:text-brand"
            >
              {row.employee.fullName}
            </Link>
            <p className="truncate text-2xs text-ink-muted">{row.employee.designation?.name ?? '—'}</p>
          </div>
        </div>
      ),
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    { key: 'started', header: 'Started', hideBelow: 'sm', render: (row) => <span className="whitespace-nowrap text-xs">{formatDateTime(row.startedAt)}</span> },
    { key: 'duration', header: 'Duration', align: 'right', render: (row) => minutesToHm(row.durationMinutes) },
    {
      key: 'distance',
      header: 'Distance',
      align: 'right',
      render: (row) => <span className="font-medium text-ink">{row.distanceKm.toFixed(1)} km</span>,
    },
    { key: 'points', header: 'Pings', align: 'right', hideBelow: 'md', render: (row) => row.pointCount },
    {
      key: 'battery',
      header: 'Battery',
      align: 'right',
      hideBelow: 'lg',
      render: (row) =>
        row.batteryEnd !== null ? (
          <span className={row.batteryEnd < 20 ? 'flex items-center justify-end gap-1 text-critical-ink' : ''}>
            {row.batteryEnd < 20 ? <BatteryLow className="size-3.5" aria-hidden /> : null}
            {row.batteryEnd}%
          </span>
        ) : row.batteryStart !== null ? (
          `${row.batteryStart}% at start`
        ) : (
          '—'
        ),
    },
    {
      key: 'device',
      header: 'Device',
      hideBelow: 'lg',
      render: (row) => (
        <span className="flex items-center gap-1.5 text-xs">
          <Smartphone className="size-3 shrink-0 text-ink-muted" aria-hidden />
          <span className="truncate">{row.deviceInfo ?? '—'}</span>
        </span>
      ),
    },
    {
      key: 'action',
      header: '',
      align: 'right',
      render: (row) => (
        <Button
          variant={selected === row.id ? 'subtle' : 'ghost'}
          size="sm"
          onClick={() => onSelect(selected === row.id ? null : row.id)}
        >
          <Route />
          {selected === row.id ? 'Hide route' : 'Show route'}
        </Button>
      ),
    },
  ];

  return (
    <>
      <FilterBar>
        <div className="pb-0.5">
          <SegmentedTabs
            size="sm"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'ongoing', label: 'Ongoing', count: scope === 'ongoing' ? data?.sessions.length : undefined },
              { value: 'previous', label: 'Previous' },
            ]}
          />
        </div>
      </FilterBar>

      {data ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile
            label={scope === 'ongoing' ? 'Live sessions' : 'Recent sessions'}
            value={data.sessions.length}
            icon={MapPin}
            tone={scope === 'ongoing' ? 'good' : 'brand'}
          />
          <StatTile
            label="Distance covered"
            value={`${data.sessions.reduce((sum, s) => sum + s.distanceKm, 0).toFixed(1)} km`}
            icon={Route}
          />
          <StatTile
            label="Not consented"
            value={data.withoutConsent.length}
            icon={ShieldAlert}
            tone={data.withoutConsent.length > 0 ? 'warning' : 'neutral'}
            hint="not tracked, by their choice"
          />
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>
            {selected && detail.data && !detail.data.purged
              ? `Route — ${detail.data.session.employee.fullName}`
              : scope === 'ongoing'
                ? 'Live positions'
                : 'Last known positions'}
          </CardTitle>
          <p className="mt-0.5 text-xs text-ink-muted">
            {selected
              ? 'Green marks the start of the session, red the latest ping.'
              : 'Each marker is the most recent ping for that session. Pick a row to draw its full route.'}
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-[420px] skeleton rounded-lg" />
          ) : detail.data?.purged ? (
            <EmptyState
              icon={Info}
              title="Breadcrumbs purged"
              description={detail.data.message}
            />
          ) : markers.length === 0 && polylines.length === 0 ? (
            <EmptyState
              icon={MapPin}
              title={scope === 'ongoing' ? 'No live sessions right now' : 'No recent sessions'}
              description="A session starts when a consenting employee opens the mobile app during working hours."
            />
          ) : (
            <TrackingMap markers={selected ? [] : markers} polylines={polylines} height={420} />
          )}
        </CardContent>
      </Card>

      <DataTable
        columns={columns}
        rows={data?.sessions ?? []}
        keyOf={(row) => row.id}
        loading={isLoading}
        emptyTitle={scope === 'ongoing' ? 'Nobody is tracking right now' : 'No sessions in the last fortnight'}
      />

      {(data?.withoutConsent.length ?? 0) > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Not being tracked</CardTitle>
            <p className="mt-0.5 text-xs text-ink-muted">
              Listed explicitly rather than silently left off the map — these people have not
              given consent, which is their right.
            </p>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-wrap gap-2">
              {data!.withoutConsent.map((person) => (
                <li key={person.id}>
                  <Badge tone="neutral" size="md">
                    <ShieldAlert aria-hidden />
                    {person.fullName}
                    {person.designation ? ` · ${person.designation}` : ''}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

function TrackingReport() {
  const [from, setFrom] = useState(
    new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10),
  );
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));

  const { data, isLoading } = useQuery({
    queryKey: ['field', 'tracking', 'report', from, to],
    queryFn: () =>
      api.get<{
        from: string;
        to: string;
        rows: {
          employee: { id: number; employeeVisibleId: string; fullName: string; initials: string; designation: { name: string } | null; department: { name: string } | null } | null;
          sessions: number; distanceKm: number; pointCount: number;
          visitCount: number; orderValue: number; kmPerVisit: number | null;
        }[];
      }>('/field-force/tracking/report', { from, to }),
  });

  const columns: Column<NonNullable<typeof data>['rows'][number]>[] = [
    {
      key: 'employee',
      header: 'Employee',
      render: (row) =>
        row.employee ? (
          <div className="flex items-center gap-2.5">
            <Avatar name={row.employee.fullName} initials={row.employee.initials} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{row.employee.fullName}</p>
              <p className="truncate text-2xs text-ink-muted">
                {row.employee.designation?.name ?? '—'}
                {row.employee.department ? ` · ${row.employee.department.name}` : ''}
              </p>
            </div>
          </div>
        ) : (
          <span className="text-ink-muted">Unknown</span>
        ),
    },
    { key: 'sessions', header: 'Sessions', align: 'right', render: (row) => row.sessions },
    {
      key: 'distance',
      header: 'Distance',
      align: 'right',
      render: (row) => <span className="font-medium text-ink">{formatNumber(row.distanceKm, 1)} km</span>,
    },
    { key: 'visits', header: 'Visits', align: 'right', render: (row) => row.visitCount },
    {
      key: 'kmPerVisit',
      header: 'km / visit',
      align: 'right',
      hideBelow: 'sm',
      render: (row) =>
        row.kmPerVisit === null ? (
          <span className="text-ink-muted">—</span>
        ) : (
          formatNumber(row.kmPerVisit, 1)
        ),
    },
    {
      key: 'order',
      header: 'Order value',
      align: 'right',
      hideBelow: 'md',
      render: (row) => (row.orderValue > 0 ? formatMoneyCompact(row.orderValue) : '—'),
    },
    { key: 'pings', header: 'Pings', align: 'right', hideBelow: 'lg', render: (row) => formatNumber(row.pointCount) },
  ];

  return (
    <>
      <FilterBar>
        <Field label="From">
          <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </Field>
        <Field label="To">
          <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </Field>
      </FilterBar>

      <p className="text-xs text-ink-secondary">
        Distance is read against visits, not on its own — a high figure with few visits usually
        means territory design, not effort.
      </p>

      <DataTable
        columns={columns}
        rows={data?.rows ?? []}
        keyOf={(row) => row.employee?.id ?? Math.random()}
        loading={isLoading}
        emptyTitle="No tracking data in this range"
      />
    </>
  );
}

function ConsentPanel() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['field', 'tracking', 'config'],
    queryFn: () =>
      api.get<{
        employeeId: number; enabled: boolean;
        consentGivenAt: string | null; consentRevokedAt: string | null;
        windowStart: string; windowEnd: string;
        pingIntervalSec: number; retentionDays: number;
      }>('/field-force/tracking/config'),
  });

  const setConsent = useMutation({
    mutationFn: (enabled: boolean) => api.patch('/field-force/tracking/config', { enabled }),
    onSuccess: (_result, enabled) => {
      toast.success(enabled ? 'Tracking enabled' : 'Tracking disabled', {
        description: enabled
          ? 'Your location is recorded only during the working-hours window.'
          : 'No further location data will be recorded.',
      });
      void queryClient.invalidateQueries({ queryKey: ['field', 'tracking'] });
    },
    onError: (error) => {
      toast.error('Could not update your consent', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
  });

  if (isLoading || !data) return <div className="h-64 skeleton rounded-card" />;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>My tracking consent</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-line p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">
                {data.enabled ? 'Tracking is on' : 'Tracking is off'}
              </p>
              <p className="mt-0.5 text-xs text-ink-secondary">
                {data.enabled
                  ? `Recording between ${data.windowStart} and ${data.windowEnd}, every ${Math.round(data.pingIntervalSec / 60)} minutes.`
                  : 'No location data is being recorded for you.'}
              </p>
            </div>
            <Button
              variant={data.enabled ? 'danger-outline' : 'primary'}
              onClick={() => setConsent.mutate(!data.enabled)}
              loading={setConsent.isPending}
            >
              {data.enabled ? 'Withdraw consent' : 'Give consent'}
            </Button>
          </div>

          <dl className="space-y-2 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-ink-muted">Consent given</dt>
              <dd className="font-medium text-ink">
                {data.consentGivenAt ? formatDateTime(data.consentGivenAt) : 'never'}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-ink-muted">Consent withdrawn</dt>
              <dd className="font-medium text-ink">
                {data.consentRevokedAt ? formatDateTime(data.consentRevokedAt) : '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-ink-muted">Working-hours window</dt>
              <dd className="font-medium text-ink tabular">
                {data.windowStart} – {data.windowEnd}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-ink-muted">Retention</dt>
              <dd className="font-medium text-ink">{data.retentionDays} days, then purged</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What is and is not recorded</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-ink-secondary">
          <p className="flex items-start gap-2">
            <Clock className="mt-0.5 size-4 shrink-0 text-good-ink" aria-hidden />
            <span>
              Only inside the working-hours window above. A ping outside it is discarded rather
              than stored.
            </span>
          </p>
          <p className="flex items-start gap-2">
            <MapPin className="mt-0.5 size-4 shrink-0 text-good-ink" aria-hidden />
            <span>
              A coarse breadcrumb every {Math.round(data.pingIntervalSec / 60)} minutes — enough
              to see a route, not a continuous feed.
            </span>
          </p>
          <p className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-good-ink" aria-hidden />
            <span>
              Visible to your line manager and to HR, for territory planning and visit
              verification. Not to your colleagues.
            </span>
          </p>
          <p className="flex items-start gap-2">
            <Info className="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden />
            <span>
              Withdrawing consent stops collection immediately. Existing sessions age out under
              the {data.retentionDays}-day retention policy.
            </span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
