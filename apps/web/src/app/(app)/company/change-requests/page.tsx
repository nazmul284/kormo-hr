'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, UserCog, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';

import { DataTable, type Column } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { CountedTextarea, Field } from '@/components/ui/input';
import { LinkTabs } from '@/components/ui/tabs';
import { ApiError, api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { COMPANY_TABS } from '@/lib/tabs';

interface ChangeRequest {
  id: number;
  fieldPath: string;
  currentValue: string | null;
  requestedValue: string;
  reason: string | null;
  requestedAt: string;
  employee: {
    id: number; employeeVisibleId: string; fullName: string; initials: string;
    department: { name: string } | null;
    designation: { name: string } | null;
  };
}

export default function ChangeRequestsPage() {
  const queryClient = useQueryClient();
  const [reviewing, setReviewing] = useState<{ request: ChangeRequest; decision: 'APPROVED' | 'REJECTED' } | null>(null);
  const [note, setNote] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['employee', 'change-requests', 'pending'],
    queryFn: () => api.get<ChangeRequest[]>('/employees/change-requests/pending'),
  });

  const review = useMutation({
    mutationFn: () =>
      api.patch(`/employees/change-requests/${reviewing!.request.id}`, {
        decision: reviewing!.decision,
        reviewNote: note.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success(
        reviewing!.decision === 'APPROVED' ? 'Change applied' : 'Change request rejected',
        { description: 'The employee has been notified.' },
      );
      void queryClient.invalidateQueries({ queryKey: ['employee'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setNote('');
      setReviewing(null);
    },
    onError: (error) => {
      toast.error('Could not record the decision', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
  });

  const columns: Column<ChangeRequest>[] = [
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
            <p className="truncate text-2xs text-ink-muted">
              #{row.employee.employeeVisibleId}
              {row.employee.department ? ` · ${row.employee.department.name}` : ''}
            </p>
          </div>
        </div>
      ),
    },
    { key: 'field', header: 'Field', render: (row) => <code className="text-xs text-ink">{row.fieldPath}</code> },
    {
      key: 'change',
      header: 'Change',
      render: (row) => (
        <div className="min-w-0 max-w-sm text-xs">
          <p className="truncate text-ink-muted line-through">{row.currentValue ?? 'not set'}</p>
          <p className="truncate font-medium text-ink">{row.requestedValue}</p>
        </div>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      hideBelow: 'md',
      render: (row) => <span className="line-clamp-2 max-w-xs text-xs">{row.reason ?? '—'}</span>,
    },
    {
      key: 'requested',
      header: 'Requested',
      align: 'right',
      hideBelow: 'sm',
      render: (row) => <span className="whitespace-nowrap text-xs">{formatDate(row.requestedAt, 'short')}</span>,
    },
    {
      key: 'action',
      header: '',
      align: 'right',
      render: (row) => (
        <div className="flex justify-end gap-1.5">
          <Button
            variant="success"
            size="sm"
            onClick={() => {
              setReviewing({ request: row, decision: 'APPROVED' });
              setNote('');
            }}
          >
            <Check />
            Approve
          </Button>
          <Button
            variant="danger-outline"
            size="sm"
            onClick={() => {
              setReviewing({ request: row, decision: 'REJECTED' });
              setNote('');
            }}
          >
            <X />
            Reject
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Profile change requests"
        description="Self-service edits that need HR review. Approving writes the value straight onto the employee record."
        breadcrumbs={[{ label: 'Company', href: '/company' }, { label: 'Change requests' }]}
      />

      <LinkTabs tabs={COMPANY_TABS} />

      {isLoading ? (
        <div className="h-64 skeleton rounded-card" />
      ) : (data?.length ?? 0) === 0 ? (
        <Card>
          <EmptyState
            icon={UserCog}
            tone="good"
            title="No change requests awaiting review"
            description="Low-risk fields apply immediately and never reach this queue."
          />
        </Card>
      ) : (
        <DataTable columns={columns} rows={data!} keyOf={(row) => row.id} />
      )}

      <Dialog open={reviewing !== null} onOpenChange={(open) => !open && setReviewing(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>
              {reviewing?.decision === 'APPROVED' ? 'Approve' : 'Reject'} change request
            </DialogTitle>
            <DialogDescription>
              {reviewing
                ? `${reviewing.request.employee.fullName} · ${reviewing.request.fieldPath} → ${reviewing.request.requestedValue}`
                : ''}
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            <Field
              label="Review note"
              required={reviewing?.decision === 'REJECTED'}
              hint={
                reviewing?.decision === 'REJECTED'
                  ? 'The employee sees this, so say what they need to do.'
                  : 'Optional.'
              }
            >
              <CountedTextarea
                maxLength={255}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={
                  reviewing?.decision === 'REJECTED'
                    ? 'Please attach supporting documentation and re-submit.'
                    : 'Verified against the submitted document.'
                }
              />
            </Field>
          </DialogBody>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setReviewing(null)}>Cancel</Button>
            <Button
              variant={reviewing?.decision === 'APPROVED' ? 'success' : 'danger'}
              onClick={() => review.mutate()}
              loading={review.isPending}
              disabled={reviewing?.decision === 'REJECTED' && note.trim().length < 5}
            >
              {reviewing?.decision === 'APPROVED' ? <Check /> : <X />}
              {reviewing?.decision === 'APPROVED' ? 'Approve & apply' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
