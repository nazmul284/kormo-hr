'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Building2, ChevronDown, ChevronRight, Download, Network, Search, Users,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { FilterBar } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Input } from '@/components/ui/input';
import { SegmentedTabs } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { EmployeeSummary, Paginated } from '@/lib/types';
import { cn } from '@/lib/utils';

interface TreeNode {
  id: number;
  employeeVisibleId: string;
  fullName: string;
  initials: string;
  avatarUrl: string | null;
  designation: string | null;
  grade: string | null;
  level: number;
  department: string | null;
  company: string;
  children: TreeNode[];
  hasChildren: boolean;
}

export default function OrgChartPage() {
  const { user } = useSession();
  const [view, setView] = useState<'employee' | 'department'>('employee');
  const [rootId, setRootId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  // Default the root to the top of the caller's own chain.
  const effectiveRoot = rootId ?? user?.id ?? null;

  return (
    <>
      <PageHeader
        title="Organization tree"
        description="Expands one level at a time rather than downloading the whole hierarchy — a deep organisation stays fast to browse."
        breadcrumbs={[{ label: 'Overview' }, { label: 'Organization Tree' }]}
        actions={
          <Button variant="secondary" asChild>
            <a href="/reports?type=OrgTree">
              <Download />
              Export
            </a>
          </Button>
        }
      />

      <FilterBar>
        <div className="pb-0.5">
          <SegmentedTabs
            size="sm"
            value={view}
            onChange={setView}
            options={[
              { value: 'employee', label: 'Employee tree' },
              { value: 'department', label: 'Department tree' },
            ]}
          />
        </div>
        {view === 'employee' ? (
          <Field label="Root employee" className="min-w-56">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-muted" aria-hidden />
              <Input
                className="pl-8"
                placeholder="Search to change the root…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </Field>
        ) : null}
      </FilterBar>

      {view === 'employee' && debounced.length >= 2 ? (
        <RootPicker
          search={debounced}
          onPick={(id) => {
            setRootId(id);
            setSearch('');
          }}
        />
      ) : null}

      {view === 'employee' ? (
        effectiveRoot === null ? (
          <div className="h-64 skeleton" />
        ) : (
          <EmployeeTree rootId={effectiveRoot} onChangeRoot={setRootId} />
        )
      ) : (
        <DepartmentTree />
      )}
    </>
  );
}

function RootPicker({ search, onPick }: { search: string; onPick: (id: number) => void }) {
  const { data } = useQuery({
    queryKey: ['directory', 'root-picker', search],
    queryFn: () =>
      api.get<Paginated<EmployeeSummary>>('/employees/directory', { search, pageSize: 6 }),
  });

  if (!data || data.data.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Set the tree root</CardTitle>
      </CardHeader>
      <ul className="divide-y divide-line">
        {data.data.map((employee) => (
          <li key={employee.id}>
            <button
              type="button"
              onClick={() => onPick(employee.id)}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-surface-sunken"
            >
              <Avatar name={employee.fullName} initials={employee.initials} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{employee.fullName}</span>
                <span className="block truncate text-2xs text-ink-muted">
                  {employee.designation?.name ?? '—'}
                  {employee.department ? ` · ${employee.department.name}` : ''}
                </span>
              </span>
              <ChevronRight className="size-3.5 shrink-0 text-ink-muted" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function EmployeeTree({
  rootId,
  onChangeRoot,
}: {
  rootId: number;
  onChangeRoot: (id: number) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['org-chart', 'employee', rootId],
    queryFn: () =>
      api.get<{ root: TreeNode; upperChain: TreeNode[]; maxLevel: number }>(
        `/employees/${rootId}/hierarchy`,
        { maxLevel: 3, generateUpperTree: true },
      ),
  });

  if (isLoading) return <div className="h-96 skeleton" />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      {data.upperChain.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Reports up through</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-wrap items-center gap-1.5">
              {[...data.upperChain].reverse().map((node, index) => (
                <li key={node.id} className="flex items-center gap-1.5">
                  {index > 0 ? <ChevronRight className="size-3 text-ink-muted" aria-hidden /> : null}
                  <button
                    type="button"
                    onClick={() => onChangeRoot(node.id)}
                    className="flex items-center gap-1.5 rounded-full border border-line px-2 py-1
                               transition-colors hover:border-brand/40 hover:bg-brand-subtle"
                  >
                    <Avatar name={node.fullName} initials={node.initials} size="xs" />
                    <span className="text-xs font-medium text-ink">{node.fullName}</span>
                    <span className="text-2xs text-ink-muted">{node.designation ?? ''}</span>
                  </button>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Reporting structure</CardTitle>
          <p className="mt-0.5 text-xs text-ink-muted">
            Click a node with reports to drill into it; the chevron expands in place.
          </p>
        </CardHeader>
        <div className="overflow-x-auto p-4">
          <div className="min-w-max">
            <TreeBranch node={data.root} depth={0} onChangeRoot={onChangeRoot} defaultOpen />
          </div>
        </div>
      </Card>
    </div>
  );
}

function TreeBranch({
  node,
  depth,
  onChangeRoot,
  defaultOpen = false,
}: {
  node: TreeNode;
  depth: number;
  onChangeRoot: (id: number) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen || depth < 2);

  // Children beyond the fetched depth are loaded on demand.
  const needsFetch = open && node.hasChildren && node.children.length === 0;
  const { data: fetched, isLoading } = useQuery({
    queryKey: ['org-chart', 'employee', node.id, 'expand'],
    queryFn: () =>
      api.get<{ root: TreeNode }>(`/employees/${node.id}/hierarchy`, { maxLevel: 2 }),
    enabled: needsFetch,
  });

  const children = node.children.length > 0 ? node.children : fetched?.root.children ?? [];

  return (
    <div className={cn(depth > 0 && 'border-l border-line pl-4')}>
      <div className="flex items-center gap-1.5 py-1">
        {node.hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
            className="rounded p-0.5 text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
            aria-label={open ? 'Collapse' : 'Expand'}
          >
            {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </button>
        ) : (
          <span className="size-[1.125rem]" aria-hidden />
        )}

        <div
          className={cn(
            // Fixed width, not min-width: sized to content the nodes ended at a
            // different x on every row and the tree read as ragged rather than
            // as a hierarchy.
            'flex w-[19rem] max-w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-colors',
            depth === 0 ? 'border-brand/30 bg-brand-subtle' : 'border-line bg-surface hover:bg-surface-sunken',
          )}
        >
          <Avatar name={node.fullName} initials={node.initials} src={node.avatarUrl} size="sm" />
          <div className="min-w-0 flex-1">
            <Link
              href={`/profile/${node.id}`}
              className="block truncate text-sm font-medium text-ink hover:text-brand"
            >
              {node.fullName}
            </Link>
            <p className="truncate text-2xs text-ink-muted">
              {node.designation ?? '—'}
              {node.grade ? ` (${node.grade})` : ''}
              {node.department ? ` · ${node.department}` : ''}
            </p>
          </div>
          {node.hasChildren ? (
            <button
              type="button"
              onClick={() => onChangeRoot(node.id)}
              title="Make this the tree root"
              className="shrink-0 rounded p-1 text-ink-muted transition-colors hover:bg-surface hover:text-brand"
            >
              <Network className="size-3.5" aria-hidden />
            </button>
          ) : null}
        </div>
      </div>

      {open ? (
        isLoading ? (
          <div className="ml-6 py-1">
            <div className="h-10 w-64 skeleton" />
          </div>
        ) : (
          <div className="ml-3">
            {children.map((child) => (
              <TreeBranch key={child.id} node={child} depth={depth + 1} onChangeRoot={onChangeRoot} />
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}

interface DepartmentNode {
  id: number;
  name: string;
  code: string | null;
  headcount: number;
  head: { id: number; fullName: string; initials: string; designation: string | null } | null;
  children: DepartmentNode[];
}

function DepartmentTree() {
  const { data, isLoading } = useQuery({
    queryKey: ['org-chart', 'department'],
    queryFn: () =>
      api.get<{ tree: DepartmentNode[]; totalDepartments: number; totalHeadcount: number }>(
        '/employees/hierarchy/department',
      ),
  });

  if (isLoading) return <div className="h-96 skeleton" />;
  if (!data || data.tree.length === 0) {
    return (
      <Card>
        <EmptyState icon={Building2} title="No departments configured" />
      </Card>
    );
  }

  const max = Math.max(...flatten(data.tree).map((node) => node.headcount), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Departments</CardTitle>
        <p className="mt-0.5 text-xs text-ink-muted">
          {data.totalDepartments} departments · {data.totalHeadcount} active employees
        </p>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {data.tree.map((node) => (
            <DepartmentRow key={node.id} node={node} depth={0} max={max} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function flatten(nodes: DepartmentNode[]): DepartmentNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children)]);
}

function DepartmentRow({ node, depth, max }: { node: DepartmentNode; depth: number; max: number }) {
  return (
    <li className={cn(depth > 0 && 'ml-5 border-l border-line pl-4')}>
      <div className="rounded-lg border border-line p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate text-sm font-medium text-ink">
              {node.name}
              {node.code ? <Badge tone="neutral">{node.code}</Badge> : null}
            </p>
            {node.head ? (
              <p className="mt-0.5 flex items-center gap-1.5 text-2xs text-ink-muted">
                <Avatar name={node.head.fullName} initials={node.head.initials} size="xs" />
                <Link href={`/profile/${node.head.id}`} className="hover:text-brand">
                  {node.head.fullName}
                </Link>
                <span>· {node.head.designation ?? 'Head'}</span>
              </p>
            ) : (
              <p className="mt-0.5 text-2xs text-ink-muted">No department head assigned</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Users className="size-3.5 text-ink-muted" aria-hidden />
            <span className="text-sm font-semibold text-ink tabular">{node.headcount}</span>
          </div>
        </div>

        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
          <div
            className="h-full rounded-full bg-series-1"
            style={{ width: `${Math.max((node.headcount / max) * 100, node.headcount > 0 ? 2 : 0)}%` }}
          />
        </div>
      </div>

      {node.children.length > 0 ? (
        <ul className="mt-2 space-y-2">
          {node.children.map((child) => (
            <DepartmentRow key={child.id} node={child} depth={depth + 1} max={max} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
