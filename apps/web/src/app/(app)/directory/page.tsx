'use client';

import { useQuery } from '@tanstack/react-query';
import { Building2, Mail, Phone, Search, Users } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { FilterBar } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Input, Select } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import type { EmployeeSummary, Paginated } from '@/lib/types';

export default function DirectoryPage() {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: departments } = useQuery({
    queryKey: ['tenancy', 'departments'],
    queryFn: () => api.get<{ id: number; name: string; headcount: number }[]>('/tenancy/departments'),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['directory', debounced, departmentId, page],
    queryFn: () =>
      api.get<Paginated<EmployeeSummary>>('/employees/directory', {
        search: debounced || undefined,
        departmentId: departmentId || undefined,
        page,
        pageSize: 48,
      }),
  });

  return (
    <>
      <PageHeader
        title="Co-workers"
        description="Contact directory for everyone in the organisation. Read-only — personal details stay on each person's own profile."
        breadcrumbs={[{ label: 'Overview' }, { label: 'Co-Workers' }]}
      />

      <FilterBar
        actions={
          data ? (
            <span className="text-xs text-ink-muted tabular">
              {data.meta.total.toLocaleString('en-US')} people
            </span>
          ) : null
        }
      >
        <Field label="Search" className="min-w-56">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-muted" aria-hidden />
            <Input
              className="pl-8"
              placeholder="Name, ID, email, phone or designation…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
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
              <option key={department.id} value={department.id}>
                {department.name} ({department.headcount})
              </option>
            ))}
          </Select>
        </Field>
      </FilterBar>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 12 }).map((_, index) => (
            <div key={index} className="h-32 skeleton rounded-card" />
          ))}
        </div>
      ) : (data?.data.length ?? 0) === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title="No co-worker matches"
            description={debounced ? `Nothing found for “${debounced}”.` : 'Try a different department.'}
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {data!.data.map((employee) => (
              <Card key={employee.id} className="p-4 transition-shadow hover:shadow-raised">
                <div className="flex items-start gap-3">
                  <Avatar name={employee.fullName} initials={employee.initials} size="md" />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/profile/${employee.id}`}
                      className="block truncate text-sm font-semibold text-ink hover:text-brand"
                    >
                      {employee.fullName}
                    </Link>
                    <p className="truncate text-xs text-ink-secondary">
                      {employee.designation?.name ?? '—'}
                    </p>
                    <p className="mt-0.5 truncate text-2xs text-ink-muted">
                      #{employee.employeeVisibleId}
                      {employee.department ? ` · ${employee.department.name}` : ''}
                    </p>
                  </div>
                </div>

                <dl className="mt-3 space-y-1.5 border-t border-line pt-2.5 text-xs">
                  {employee.officialContact ? (
                    <div className="flex items-center gap-1.5">
                      <Phone className="size-3 shrink-0 text-ink-muted" aria-hidden />
                      <a
                        href={`tel:${employee.officialContact}`}
                        className="truncate text-ink-secondary hover:text-brand tabular"
                      >
                        {employee.officialContact}
                      </a>
                    </div>
                  ) : null}
                  <div className="flex items-center gap-1.5">
                    <Mail className="size-3 shrink-0 text-ink-muted" aria-hidden />
                    <a
                      href={`mailto:${employee.officialEmail ?? employee.email}`}
                      className="truncate text-ink-secondary hover:text-brand"
                    >
                      {employee.officialEmail ?? employee.email}
                    </a>
                  </div>
                  {employee.location ? (
                    <div className="flex items-center gap-1.5">
                      <Building2 className="size-3 shrink-0 text-ink-muted" aria-hidden />
                      <span className="truncate text-ink-muted">{employee.location.name}</span>
                    </div>
                  ) : null}
                </dl>
              </Card>
            ))}
          </div>

          {data!.meta.totalPages > 1 ? (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
              >
                Previous
              </Button>
              <span className="text-xs text-ink-secondary tabular">
                Page {data!.meta.page} of {data!.meta.totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= data!.meta.totalPages}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </Button>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
