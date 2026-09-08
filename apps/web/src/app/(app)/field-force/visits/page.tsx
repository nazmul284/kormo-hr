'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Plus, Store, TrendingUp, Users } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { ColumnChart, RankedBars } from '@/components/charts/bars';
import { Donut } from '@/components/charts/donut';
import { DataTable, FilterBar, type Column } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { StatTile } from '@/components/shared/stat-tile';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { CountedTextarea, Field, Input, Select } from '@/components/ui/input';
import { LinkTabs, SegmentedTabs } from '@/components/ui/tabs';
import { ApiError, api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { MONTHS, cn, formatDate, formatDateTime, formatMoney, formatMoneyCompact, yearOptions } from '@/lib/utils';
import { FIELD_TABS } from '@/lib/tabs';

/** Contact level is an ordered tier, so it uses one hue light→dark. */
const LEVEL_COLOR: Record<string, string> = {
  A_PLUS: 'rgb(var(--series-1))',
  A: 'color-mix(in srgb, rgb(var(--series-1)) 78%, white)',
  B: 'color-mix(in srgb, rgb(var(--series-1)) 56%, white)',
  C: 'color-mix(in srgb, rgb(var(--series-1)) 36%, white)',
  D: 'color-mix(in srgb, rgb(var(--series-1)) 20%, white)',
};

const LEVEL_LABEL: Record<string, string> = {
  A_PLUS: 'A+', A: 'A', B: 'B', C: 'C', D: 'D',
};

export default function VisitsPage() {
  const { can, hasFeature } = useSession();
  const canSeeDashboard = can('visit.read.all') && hasFeature('hasCustomerVisitOverviewAccess');

  const now = new Date();
  const [view, setView] = useState<'mine' | 'dashboard'>(canSeeDashboard ? 'dashboard' : 'mine');
  const [month, setMonth] = useState(now.getUTCMonth() + 1);
  const [year, setYear] = useState(now.getUTCFullYear());
  const [logging, setLogging] = useState(false);

  return (
    <>
      <PageHeader
        title="Customer visits"
        description="Field visits with GPS verification — the distance between the check-in and the customer's registered location is recorded on every visit."
        breadcrumbs={[{ label: 'Field Force' }, { label: 'Customer Visits' }]}
        actions={
          can('visit.create') ? (
            <Button onClick={() => setLogging(true)}>
              <Plus />
              Log a visit
            </Button>
          ) : null
        }
      />

      <LinkTabs tabs={FIELD_TABS} />

      <FilterBar>
        <Field label="Month">
          <Select value={month} onChange={(event) => setMonth(Number(event.target.value))}>
            {MONTHS.map((label, index) => (
              <option key={label} value={index + 1}>{label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Year">
          <Select value={year} onChange={(event) => setYear(Number(event.target.value))}>
            {yearOptions(2, 0).map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </Select>
        </Field>
        {canSeeDashboard ? (
          <div className="pb-0.5">
            <SegmentedTabs
              size="sm"
              value={view}
              onChange={setView}
              options={[
                { value: 'dashboard', label: 'Dashboard' },
                { value: 'mine', label: 'My visits' },
              ]}
            />
          </div>
        ) : null}
      </FilterBar>

      {view === 'dashboard' ? (
        <VisitDashboard month={month} year={year} />
      ) : (
        <MyVisits month={month} year={year} />
      )}

      <LogVisitDialog open={logging} onClose={() => setLogging(false)} />
    </>
  );
}

function VisitDashboard({ month, year }: { month: number; year: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['field', 'visit-dashboard', month, year],
    queryFn: () =>
      api.get<{
        summary: { totalVisits: number; totalOrderValue: number; activeReps: number; customersVisited: number };
        topCustomers: { customerId: number; name: string; city: string | null; contactLevel: string; visits: number; orderValue: number }[];
        topEmployees: { employeeId: number; fullName: string; initials: string; designation: string | null; visits: number; orderValue: number }[];
        byContactLevel: { contactLevel: string; visits: number }[];
        dailyTrend: { date: string; visits: number }[];
        jointVisits: {
          visitId: number; customerName: string; address: string; visitDate: string;
          personVisited: string | null; visitedBy: string[];
        }[];
      }>('/field-force/visits/dashboard', { month, year }),
  });

  if (isLoading) return <div className="h-96 skeleton rounded-card" />;
  if (!data) return null;

  const jointColumns: Column<NonNullable<typeof data>['jointVisits'][number]>[] = [
    { key: 'customer', header: 'Customer name', render: (row) => <span className="font-medium text-ink">{row.customerName}</span> },
    { key: 'address', header: 'Address', hideBelow: 'md', render: (row) => <span className="text-xs">{row.address || '—'}</span> },
    { key: 'date', header: 'Visit date', render: (row) => <span className="whitespace-nowrap">{formatDate(row.visitDate)}</span> },
    { key: 'person', header: 'Person visited', hideBelow: 'sm', render: (row) => row.personVisited ?? '—' },
    {
      key: 'by',
      header: 'Visited by',
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.visitedBy.map((name) => (
            <Badge key={name} tone="neutral">{name}</Badge>
          ))}
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Total visits" value={data.summary.totalVisits.toLocaleString('en-US')} icon={MapPin} tone="brand" />
        <StatTile label="Order value" value={formatMoneyCompact(data.summary.totalOrderValue)} icon={TrendingUp} tone="good" />
        <StatTile label="Active reps" value={data.summary.activeReps} icon={Users} />
        <StatTile label="Customers visited" value={data.summary.customersVisited} icon={Store} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top 20 visited customers</CardTitle>
          </CardHeader>
          <CardContent>
            <RankedBars
              data={data.topCustomers.map((row) => ({
                key: String(row.customerId),
                label: row.name,
                value: row.visits,
                secondary: row.orderValue > 0 ? formatMoneyCompact(row.orderValue) : undefined,
              }))}
              maxRows={20}
              formatValue={(value) => `${value} visit${value === 1 ? '' : 's'}`}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top 20 employees by visit</CardTitle>
          </CardHeader>
          <CardContent>
            <RankedBars
              data={data.topEmployees.map((row) => ({
                key: String(row.employeeId),
                label: row.fullName,
                value: row.visits,
                secondary: row.orderValue > 0 ? formatMoneyCompact(row.orderValue) : undefined,
              }))}
              maxRows={20}
              color="rgb(var(--series-3))"
              formatValue={(value) => `${value} visit${value === 1 ? '' : 's'}`}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Visits by customer contact level</CardTitle>
            <p className="mt-0.5 text-xs text-ink-muted">
              A tier is ordered, so it reads as one hue getting darker — not five unrelated colours.
            </p>
          </CardHeader>
          <CardContent>
            <Donut
              slices={data.byContactLevel.map((row) => ({
                key: row.contactLevel,
                label: `Level ${LEVEL_LABEL[row.contactLevel] ?? row.contactLevel}`,
                value: row.visits,
                color: LEVEL_COLOR[row.contactLevel] ?? 'rgb(var(--ink-muted))',
              }))}
              heroValue={data.summary.totalVisits.toLocaleString('en-US')}
              heroLabel="Visits"
              emptyLabel="No visits this month"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Daily visit trend</CardTitle>
            <p className="mt-0.5 text-xs text-ink-muted">Hover a column for the exact count</p>
          </CardHeader>
          <CardContent>
            <ColumnChart
              data={data.dailyTrend.map((row) => ({
                key: row.date,
                label: String(new Date(row.date).getUTCDate()),
                value: row.visits,
              }))}
              height={180}
              formatValue={(value) => `${value} visit${value === 1 ? '' : 's'}`}
              emptyLabel="No visits this month"
            />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">Customer-wise joint visits</h2>
        <DataTable
          columns={jointColumns}
          rows={data.jointVisits}
          keyOf={(row) => row.visitId}
          emptyTitle="No joint visits this month"
          emptyDescription="A joint visit is one where more than one employee attended the same customer."
        />
      </div>
    </>
  );
}

function MyVisits({ month, year }: { month: number; year: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['field', 'my-visits', month, year],
    queryFn: () =>
      api.get<{
        data: {
          id: number; visitDate: string; checkInAt: string | null; checkOutAt: string | null;
          personVisited: string | null; purpose: string | null; outcome: string | null;
          orderValue: number | null; distanceM: number | null; isJointVisit: boolean;
          customer: { id: number; name: string; address: string | null; city: string | null; contactLevel: string; orgType: string | null };
          jointWith: { id: number; fullName: string }[];
        }[];
        meta: any;
        summary: { visitCount: number; totalOrderValue: number; uniqueCustomers: number };
      }>('/field-force/visits/mine', { month, year, pageSize: 100 }),
  });

  const columns: Column<NonNullable<typeof data>['data'][number]>[] = [
    { key: 'date', header: 'Date', render: (row) => <span className="whitespace-nowrap font-medium text-ink">{formatDate(row.visitDate)}</span> },
    {
      key: 'customer',
      header: 'Customer',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{row.customer.name}</p>
          <p className="truncate text-2xs text-ink-muted">
            {row.customer.city ?? '—'}
            {row.customer.orgType ? ` · ${row.customer.orgType}` : ''}
            {' · level '}{LEVEL_LABEL[row.customer.contactLevel] ?? row.customer.contactLevel}
          </p>
        </div>
      ),
    },
    { key: 'person', header: 'Met', hideBelow: 'sm', render: (row) => row.personVisited ?? '—' },
    { key: 'purpose', header: 'Purpose', hideBelow: 'md', render: (row) => <span className="line-clamp-2 max-w-xs text-xs">{row.purpose ?? '—'}</span> },
    { key: 'outcome', header: 'Outcome', hideBelow: 'lg', render: (row) => <span className="text-xs">{row.outcome ?? '—'}</span> },
    {
      key: 'order',
      header: 'Order value',
      align: 'right',
      render: (row) => (row.orderValue ? formatMoney(row.orderValue) : <span className="text-ink-muted">—</span>),
    },
    {
      key: 'gps',
      header: 'GPS',
      align: 'right',
      hideBelow: 'md',
      render: (row) =>
        row.distanceM === null ? (
          <span className="text-ink-muted">—</span>
        ) : (
          <Badge tone={row.distanceM <= 100 ? 'good' : row.distanceM <= 500 ? 'warning' : 'critical'}>
            {row.distanceM} m
          </Badge>
        ),
    },
    {
      key: 'joint',
      header: 'Joint with',
      hideBelow: 'lg',
      render: (row) =>
        row.jointWith.length === 0 ? (
          <span className="text-ink-muted">—</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {row.jointWith.map((person) => (
              <Badge key={person.id} tone="neutral">{person.fullName}</Badge>
            ))}
          </div>
        ),
    },
  ];

  return (
    <>
      {data?.summary ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile label="Visits this month" value={data.summary.visitCount} icon={MapPin} tone="brand" />
          <StatTile label="Order value" value={formatMoneyCompact(data.summary.totalOrderValue)} tone="good" />
          <StatTile label="Unique customers" value={data.summary.uniqueCustomers} icon={Store} />
        </div>
      ) : null}

      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        keyOf={(row) => row.id}
        loading={isLoading}
        emptyTitle="No visits logged this month"
        emptyDescription="Log a visit after each customer call so it counts toward your plan."
      />
    </>
  );
}

function LogVisitDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [customerId, setCustomerId] = useState('');
  const [personVisited, setPersonVisited] = useState('');
  const [purpose, setPurpose] = useState('');
  const [outcome, setOutcome] = useState('');
  const [orderValue, setOrderValue] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  const customers = useQuery({
    queryKey: ['field', 'customers'],
    queryFn: () =>
      api.get<{ data: { id: number; name: string; city: string | null }[] }>('/field-force/customers', {
        pageSize: 200,
      }),
    enabled: open,
  });

  function captureLocation() {
    if (!('geolocation' in navigator)) {
      setGeoError('This browser cannot provide a location.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
        setGeoError(null);
      },
      (error) => setGeoError(error.message || 'Location permission was declined.'),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  const submit = useMutation({
    mutationFn: () =>
      api.post('/field-force/visits', {
        customerId: Number(customerId),
        visitDate: new Date().toISOString().slice(0, 10),
        personVisited: personVisited || undefined,
        purpose: purpose || undefined,
        outcome: outcome || undefined,
        orderValue: orderValue ? Number(orderValue) : undefined,
        lat: coords?.lat,
        lng: coords?.lng,
      }),
    onSuccess: () => {
      toast.success('Visit logged');
      void queryClient.invalidateQueries({ queryKey: ['field'] });
      setCustomerId('');
      setPersonVisited('');
      setPurpose('');
      setOutcome('');
      setOrderValue('');
      setCoords(null);
      onClose();
    },
    onError: (error) => {
      toast.error('Could not log the visit', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Log a customer visit</DialogTitle>
          <DialogDescription>
            Capturing your location records how far the check-in was from the customer's
            registered address.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <Field label="Customer" required>
            <Select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
              <option value="">Select a customer…</option>
              {(customers.data?.data ?? []).map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Person visited">
            <Input
              value={personVisited}
              onChange={(event) => setPersonVisited(event.target.value)}
              placeholder="Dr. Rahman"
            />
          </Field>

          <Field label="Purpose">
            <Input
              value={purpose}
              onChange={(event) => setPurpose(event.target.value)}
              placeholder="Product detailing — new SKU introduction"
            />
          </Field>

          <Field label="Outcome">
            <Input
              value={outcome}
              onChange={(event) => setOutcome(event.target.value)}
              placeholder="Order placed"
            />
          </Field>

          <Field label="Order value" hint="Leave blank if no order was placed.">
            <Input
              type="number"
              min={0}
              value={orderValue}
              onChange={(event) => setOrderValue(event.target.value)}
              placeholder="25000"
            />
          </Field>

          <div className="rounded-lg border border-line p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-ink-secondary">GPS check-in</span>
              <Button variant="secondary" size="sm" onClick={captureLocation}>
                <MapPin />
                {coords ? 'Re-capture' : 'Capture location'}
              </Button>
            </div>
            {coords ? (
              <p className="mt-1.5 text-2xs text-good-ink tabular">
                {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
              </p>
            ) : geoError ? (
              <p className="mt-1.5 text-2xs text-serious">{geoError} The visit can still be logged without it.</p>
            ) : (
              <p className="mt-1.5 text-2xs text-ink-muted">Optional, but it verifies the visit.</p>
            )}
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => submit.mutate()} loading={submit.isPending} disabled={!customerId}>
            <MapPin />
            Log visit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
