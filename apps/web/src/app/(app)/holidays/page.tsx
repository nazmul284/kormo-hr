'use client';

import { useQuery } from '@tanstack/react-query';
import { CalendarDays, CircleDot, Sun } from 'lucide-react';
import { useState } from 'react';

import { DataTable, FilterBar, type Column } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { StatTile } from '@/components/shared/stat-tile';
import { Badge } from '@/components/ui/badge';
import { Field, Select } from '@/components/ui/input';
import { api } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';

interface Holiday {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  duration: number;
  description: string | null;
  isOptional: boolean;
  religion: string | null;
  location: { id: number; name: string } | null;
  isPast: boolean;
  isUpcoming: boolean;
  isOngoing: boolean;
}

export default function HolidaysPage() {
  const [year, setYear] = useState<string>('');

  const years = useQuery({
    queryKey: ['holidays', 'years'],
    queryFn: () => api.get<number[]>('/holidays/years'),
  });

  const activeYear = year || String(years.data?.[0] ?? new Date().getUTCFullYear());

  const { data, isLoading } = useQuery({
    queryKey: ['holidays', activeYear],
    queryFn: () =>
      api.get<{
        year: number;
        holidays: Holiday[];
        summary: { count: number; mandatoryDays: number; optionalCount: number; upcoming: number };
      }>('/holidays', { year: activeYear }),
    enabled: Boolean(activeYear),
  });

  const columns: Column<Holiday>[] = [
    {
      key: 'sn',
      header: 'SN',
      align: 'right',
      width: '3.5rem',
      render: (_row, index) => index + 1,
    },
    {
      key: 'name',
      header: 'Holiday name',
      render: (row) => (
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-sm font-medium text-ink">
            {row.name}
            {row.isOngoing ? <Badge tone="good">today</Badge> : null}
            {row.isOptional ? <Badge tone="neutral">optional</Badge> : null}
          </p>
          {row.location ? (
            <p className="truncate text-2xs text-ink-muted">{row.location.name} only</p>
          ) : null}
        </div>
      ),
    },
    { key: 'sd', header: 'SD', render: (row) => <span className="whitespace-nowrap">{formatDate(row.startDate)}</span> },
    {
      key: 'ed',
      header: 'ED',
      hideBelow: 'sm',
      render: (row) =>
        row.duration > 1 ? (
          <span className="whitespace-nowrap">{formatDate(row.endDate)}</span>
        ) : (
          <span className="text-ink-muted">—</span>
        ),
    },
    {
      key: 'duration',
      header: 'Duration',
      align: 'right',
      render: (row) => (
        <span className="font-medium text-ink">
          {row.duration} day{row.duration > 1 ? 's' : ''}
        </span>
      ),
    },
    {
      key: 'religion',
      header: 'Observance',
      hideBelow: 'md',
      render: (row) => row.religion ?? <span className="text-ink-muted">National</span>,
    },
    {
      key: 'description',
      header: 'Description',
      hideBelow: 'lg',
      render: (row) => <span className="line-clamp-2 max-w-md text-xs">{row.description ?? '—'}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Holiday calendar"
        description="Gazetted holidays for the year. Religious observances are marked; optional ones are not deducted from anyone's attendance unless they take them."
        breadcrumbs={[{ label: 'Time & Attendance' }, { label: 'Holidays' }]}
      />

      <FilterBar>
        <Field label="Year">
          <Select value={activeYear} onChange={(event) => setYear(event.target.value)}>
            {(years.data ?? []).map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </Select>
        </Field>
      </FilterBar>

      {data ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Holidays" value={data.summary.count} icon={CalendarDays} />
          <StatTile label="Mandatory days off" value={data.summary.mandatoryDays} icon={Sun} tone="brand" />
          <StatTile label="Optional observances" value={data.summary.optionalCount} icon={CircleDot} />
          <StatTile label="Still to come" value={data.summary.upcoming} tone="good" />
        </div>
      ) : null}

      <DataTable
        columns={columns}
        rows={data?.holidays ?? []}
        keyOf={(row) => row.id}
        loading={isLoading}
        rowClassName={(row) => cn(row.isPast && 'opacity-55')}
        emptyTitle={`No holidays published for ${activeYear}`}
        emptyDescription="HR publishes the gazetted calendar at the start of each year."
      />
    </>
  );
}
