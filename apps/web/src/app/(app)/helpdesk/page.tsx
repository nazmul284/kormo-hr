'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, LifeBuoy, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { DataTable, FilterBar, type Column } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { CountedTextarea, Field, Input, Select } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import { SegmentedTabs } from '@/components/ui/tabs';
import { ApiError, api } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { Paginated } from '@/lib/types';
import { formatDate, formatRelative } from '@/lib/utils';

interface Ticket {
  id: number;
  category: string;
  subject: string;
  body: string;
  priority: string;
  status: string;
  resolutionNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
  ageDays: number;
  requester: { id: number; employeeVisibleId: string; fullName: string; initials: string };
  assignee: { id: number; fullName: string } | null;
}

const PRIORITY_TONE = {
  LOW: 'neutral',
  MEDIUM: 'info',
  HIGH: 'warning',
  URGENT: 'critical',
} as const;

export default function HelpdeskPage() {
  const { can } = useSession();
  const canResolve = can('helpdesk.resolve');

  const [scope, setScope] = useState<'mine' | 'assigned' | 'all'>('mine');
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['helpdesk', scope, status],
    queryFn: () =>
      api.get<Paginated<Ticket>>('/helpdesk', {
        scope,
        status: status || undefined,
        pageSize: 50,
      }),
  });

  const queryClient = useQueryClient();
  const resolve = useMutation({
    mutationFn: ({ id, nextStatus }: { id: number; nextStatus: string }) =>
      api.patch(`/helpdesk/${id}`, {
        status: nextStatus,
        resolutionNote: nextStatus === 'RESOLVED' ? 'Resolved — please confirm if it recurs.' : undefined,
      }),
    onSuccess: () => {
      toast.success('Ticket updated');
      void queryClient.invalidateQueries({ queryKey: ['helpdesk'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (error) => {
      toast.error('Could not update the ticket', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
  });

  const columns: Column<Ticket>[] = [
    {
      key: 'subject',
      header: 'Ticket',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{row.subject}</p>
          <p className="line-clamp-2 max-w-lg text-2xs text-ink-secondary">{row.body}</p>
          {row.resolutionNote ? (
            <p className="mt-1 text-2xs text-good-ink">{row.resolutionNote}</p>
          ) : null}
        </div>
      ),
    },
    { key: 'category', header: 'Category', render: (row) => <Badge tone="neutral">{row.category}</Badge> },
    {
      key: 'priority',
      header: 'Priority',
      render: (row) => (
        <Badge tone={PRIORITY_TONE[row.priority as keyof typeof PRIORITY_TONE] ?? 'neutral'}>
          {row.priority.toLowerCase()}
        </Badge>
      ),
    },
    {
      key: 'requester',
      header: 'Raised by',
      hideBelow: 'md',
      render: (row) => (
        <div className="flex items-center gap-2">
          <Avatar name={row.requester.fullName} initials={row.requester.initials} size="xs" />
          <span className="truncate text-xs">{row.requester.fullName}</span>
        </div>
      ),
    },
    {
      key: 'assignee',
      header: 'Assigned to',
      hideBelow: 'lg',
      render: (row) => row.assignee?.fullName ?? <span className="text-ink-muted">unassigned</span>,
    },
    {
      key: 'age',
      header: 'Age',
      align: 'right',
      hideBelow: 'sm',
      render: (row) => (
        <span className={row.ageDays > 7 && row.status === 'OPEN' ? 'text-critical-ink' : ''}>
          {row.ageDays}d
        </span>
      ),
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'action',
      header: '',
      align: 'right',
      render: (row) =>
        canResolve && ['OPEN', 'IN_PROGRESS'].includes(row.status) ? (
          <div className="flex justify-end gap-1.5">
            {row.status === 'OPEN' ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => resolve.mutate({ id: row.id, nextStatus: 'IN_PROGRESS' })}
              >
                Start
              </Button>
            ) : null}
            <Button
              variant="success"
              size="sm"
              onClick={() => resolve.mutate({ id: row.id, nextStatus: 'RESOLVED' })}
            >
              <CheckCircle2 />
              Resolve
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader
        title="Help desk"
        description="Tickets are routed automatically to whoever owns the chosen category — HR, IT, Payroll or Facilities."
        breadcrumbs={[{ label: 'Workplace' }, { label: 'Help Desk' }]}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus />
            Raise a ticket
          </Button>
        }
      />

      <FilterBar>
        <Field label="Status">
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All statuses</option>
            {['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].map((option) => (
              <option key={option} value={option}>{option.replace(/_/g, ' ').toLowerCase()}</option>
            ))}
          </Select>
        </Field>
        <div className="pb-0.5">
          <SegmentedTabs
            size="sm"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'mine', label: 'Raised by me' },
              { value: 'assigned', label: 'Assigned to me' },
              ...(canResolve ? [{ value: 'all' as const, label: 'All tickets' }] : []),
            ]}
          />
        </div>
      </FilterBar>

      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        keyOf={(row) => row.id}
        loading={isLoading}
        emptyTitle={
          scope === 'mine' ? 'You have not raised any tickets' : 'No tickets in this view'
        }
        emptyDescription="Raise one for anything HR, IT, Payroll or Facilities needs to action."
        emptyAction={
          <Button onClick={() => setCreating(true)}>
            <Plus />
            Raise a ticket
          </Button>
        }
      />

      <CreateTicketDialog open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

function CreateTicketDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [category, setCategory] = useState('IT');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState('MEDIUM');

  const submit = useMutation({
    mutationFn: () => api.post('/helpdesk', { category, subject, body, priority }),
    onSuccess: () => {
      toast.success('Ticket raised', {
        description: `Routed to the ${category} team.`,
      });
      void queryClient.invalidateQueries({ queryKey: ['helpdesk'] });
      setSubject('');
      setBody('');
      onClose();
    },
    onError: (error) => {
      toast.error('Could not raise the ticket', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Raise a help desk ticket</DialogTitle>
          <DialogDescription>
            It goes straight to whoever owns the category you pick.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category" required>
              <Select value={category} onChange={(event) => setCategory(event.target.value)}>
                {['IT', 'HR', 'Payroll', 'Facilities'].map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </Select>
            </Field>
            <Field label="Priority" required>
              <Select value={priority} onChange={(event) => setPriority(event.target.value)}>
                {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((option) => (
                  <option key={option} value={option}>{option.toLowerCase()}</option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Subject" required>
            <Input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Cannot log in to the VPN from home"
            />
          </Field>

          <Field label="Details" required hint="What happened, and what you expected instead.">
            <CountedTextarea
              maxLength={2000}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="The VPN client rejects my credentials since yesterday evening. Works fine on the office network."
            />
          </Field>
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => submit.mutate()}
            loading={submit.isPending}
            disabled={subject.trim().length < 5 || body.trim().length < 10}
          >
            <LifeBuoy />
            Raise ticket
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
