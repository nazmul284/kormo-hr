'use client';

import { useQuery } from '@tanstack/react-query';
import { Palmtree, Search } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { DataTable, FilterBar, type Column } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Field, Input, Select } from '@/components/ui/input';
import { LinkTabs } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { formatDate, leaveColor } from '@/lib/utils';
import { LEAVE_TABS } from '@/lib/tabs';

interface OnLeaveRow {
  employee: {
    id: number; employeeVisibleId: string; fullName: string; initials: string;
    officialContact: string | null; officialEmail: string | null;
  };
  department: string | null;
  designation: string | null;
  company: string;
  status: string;
  leaveType: { key: string; label: string; colorHex: string };
  startDate: string;
  endDate: string;
  returnsOn: string;
  isLastDay: boolean;
}

export default function ColleaguesOnLeavePage() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [page, setPage] = useState(1);

  const { data: departments } = useQuery({
    queryKey: ['tenancy', 'departments'],
    queryFn: () => api.get<{ id: number; name: string }[]>('/tenancy/departments'),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['leave', 'colleagues', date, search, departmentId, page],
    queryFn: () =>
      api.get<{ date: string; data: OnLeaveRow[]; meta: any }>('/leave/colleagues-on-leave', {
        date,
        search: search || undefined,
        departmentId: departmentId || undefined,
        page,
        pageSize: 25,
      }),
  });

  const columns: Column<OnLeaveRow>[] = [
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
            <p className="truncate text-2xs text-ink-muted">#{row.employee.employeeVisibleId}</p>
          </div>
        </div>
      ),
    },
    { key: 'department', header: 'Department', hideBelow: 'sm', render: (row) => row.department ?? '—' },
    { key: 'designation', header: 'Designation', hideBelow: 'md', render: (row) => row.designation ?? '—' },
    { key: 'company', header: 'Company', hideBelow: 'lg', render: (row) => row.company },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2 shrink-0 rounded-sm" style={{ backgroundColor: leaveColor(row.leaveType.key) }} />
          <span className="text-xs font-medium text-ink">{row.status}</span>
        </span>
      ),
    },
    {
      key: 'until',
      header: 'Back on',
      align: 'right',
      render: (row) => (
        <div className="flex flex-col items-end gap-0.5">
          <span className="whitespace-nowrap text-xs">{formatDate(row.returnsOn, 'short')}</span>
          {row.isLastDay ? <Badge tone="good">last day</Badge> : null}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Co-workers on leave"
        description="Who is away on a given date, across the organisation — useful before you plan your own leave or a meeting."
        breadcrumbs={[{ label: 'Leaves', href: '/leave' }, { label: 'Co-Workers on Leave' }]}
      />

      <LinkTabs tabs={LEAVE_TABS} />

      <FilterBar>
        <Field label="Date">
          <Input
            type="date"
            value={date}
            onChange={(event) => {
              setDate(event.target.value);
              setPage(1);
            }}
          />
        </Field>
        <Field label="Department">
          <Select
            value={departmentId}
            onChange={(event) => {
              setDepartmentId(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All departments</option>
            {(departments ?? []).map((department) => (
              <option key={department.id} value={department.id}>{department.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Search">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-muted" aria-hidden />
            <Input
              className="pl-8"
              placeholder="Name…"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>
        </Field>
      </FilterBar>

      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        keyOf={(row) => `${row.employee.id}-${row.startDate}`}
        loading={isLoading}
        meta={data?.meta}
        onPageChange={setPage}
        emptyTitle={`Nobody is on leave on ${formatDate(date)}`}
        emptyDescription="Everyone in the selected scope is at work that day."
      />
    </>
  );
}
