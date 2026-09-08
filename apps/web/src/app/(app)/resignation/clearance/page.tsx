'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ClipboardCheck, Info } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/shared/page-header';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { CountedTextarea, Field, Input, Select } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import { LinkTabs } from '@/components/ui/tabs';
import { ApiError, api } from '@/lib/api';
import { cn, formatDate, formatMoney } from '@/lib/utils';
import { RESIGNATION_TABS } from '@/lib/tabs';

interface ClearanceItem {
  id: number;
  status: string;
  duesAmount: number | null;
  remarks: string | null;
  checklistState: { item: string; returned: boolean }[] | null;
  clearedAt: string | null;
  lastWorkingDay: string;
  awaitingMyAction: boolean;
  department: { id: number; name: string; checklist: string[] };
  owner: { id: number; firstName: string; lastName: string } | null;
  employee: {
    id: number; employeeVisibleId: string; fullName: string; initials: string;
    designation: { name: string } | null; department: { name: string } | null;
  };
}

export default function ClearancePage() {
  const [signing, setSigning] = useState<ClearanceItem | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['resignation', 'clearance'],
    queryFn: () => api.get<ClearanceItem[]>('/resignation/clearance'),
  });

  // Group by the leaver, since that is how clearance is actually chased.
  const grouped = (data ?? []).reduce<Record<string, ClearanceItem[]>>((acc, item) => {
    const key = String(item.employee.id);
    acc[key] = [...(acc[key] ?? []), item];
    return acc;
  }, {});

  return (
    <>
      <PageHeader
        title="Clearance"
        description="Every department signs off before an exit completes. When the last line clears, the employee is deactivated and the settlement is recorded net of dues and un-served notice."
        breadcrumbs={[{ label: 'E-Resignation', href: '/resignation' }, { label: 'Clearance' }]}
      />

      <LinkTabs tabs={RESIGNATION_TABS} />

      {isLoading ? (
        <div className="h-64 skeleton rounded-card" />
      ) : Object.keys(grouped).length === 0 ? (
        <Card>
          <EmptyState
            icon={ClipboardCheck}
            tone="good"
            title="No clearance lines waiting"
            description="Lines appear once a resignation reaches the clearance stage."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {Object.values(grouped).map((items) => {
            const employee = items[0].employee;
            const cleared = items.filter((item) => item.status === 'APPROVED').length;
            const totalDues = items.reduce((sum, item) => sum + Number(item.duesAmount ?? 0), 0);

            return (
              <Card key={employee.id}>
                <CardHeader
                  action={
                    <div className="flex items-center gap-2">
                      {totalDues > 0 ? (
                        <Badge tone="critical">{formatMoney(totalDues)} dues</Badge>
                      ) : null}
                      <Badge tone={cleared === items.length ? 'good' : 'warning'}>
                        {cleared} / {items.length} cleared
                      </Badge>
                    </div>
                  }
                >
                  <div className="flex items-center gap-2.5">
                    <Avatar name={employee.fullName} initials={employee.initials} size="sm" />
                    <div className="min-w-0">
                      <Link
                        href={`/profile/${employee.id}`}
                        className="block truncate text-sm font-semibold text-ink hover:text-brand"
                      >
                        {employee.fullName}
                      </Link>
                      <p className="truncate text-2xs text-ink-muted">
                        {employee.designation?.name ?? '—'}
                        {employee.department ? ` · ${employee.department.name}` : ''}
                        {` · last working day ${formatDate(items[0].lastWorkingDay)}`}
                      </p>
                    </div>
                  </div>
                </CardHeader>

                <ul className="divide-y divide-line">
                  {items.map((item) => (
                    <li key={item.id} className="px-4 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
                            {item.department.name}
                            <StatusBadge status={item.status} />
                          </p>
                          {item.checklistState ? (
                            <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                              {item.checklistState.map((entry) => (
                                <li
                                  key={entry.item}
                                  className={cn(
                                    'flex items-center gap-1 text-2xs',
                                    entry.returned ? 'text-good-ink' : 'text-ink-muted',
                                  )}
                                >
                                  <CheckCircle2
                                    className={cn('size-3', entry.returned ? '' : 'opacity-30')}
                                    aria-hidden
                                  />
                                  {entry.item}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                          {item.remarks ? (
                            <p className="mt-1 text-2xs text-ink-secondary">{item.remarks}</p>
                          ) : null}
                          <p className="mt-1 text-2xs text-ink-muted">
                            Owner:{' '}
                            {item.owner ? `${item.owner.firstName} ${item.owner.lastName}` : 'unassigned'}
                            {item.duesAmount ? ` · dues ${formatMoney(item.duesAmount)}` : ''}
                            {item.clearedAt ? ` · cleared ${formatDate(item.clearedAt, 'short')}` : ''}
                          </p>
                        </div>

                        {item.awaitingMyAction ? (
                          <Button size="sm" onClick={() => setSigning(item)}>
                            Sign off
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      )}

      <SignOffDialog item={signing} onClose={() => setSigning(null)} />
    </>
  );
}

function SignOffDialog({ item, onClose }: { item: ClearanceItem | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [remarks, setRemarks] = useState('');
  const [duesAmount, setDuesAmount] = useState('');
  const [checklist, setChecklist] = useState<{ item: string; returned: boolean }[]>([]);

  useEffect(() => {
    if (!item) return;
    setChecklist(
      item.checklistState ??
        item.department.checklist.map((entry) => ({ item: entry, returned: false })),
    );
    setRemarks('');
    setDuesAmount('');
    setStatus('APPROVED');
  }, [item]);

  const submit = useMutation({
    mutationFn: () =>
      api.patch(`/resignation/clearance/${item!.id}`, {
        status,
        remarks: remarks || undefined,
        duesAmount: duesAmount ? Number(duesAmount) : undefined,
        checklistState: checklist,
      }),
    onSuccess: () => {
      toast.success('Clearance recorded');
      void queryClient.invalidateQueries({ queryKey: ['resignation'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    },
    onError: (error) => {
      toast.error('Could not record the clearance', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
  });

  const allReturned = checklist.every((entry) => entry.returned);

  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Clearance sign-off</DialogTitle>
          <DialogDescription>
            {item ? `${item.department.name} · ${item.employee.fullName}` : ''}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-medium text-ink-secondary">Checklist</p>
            <ul className="space-y-1.5">
              {checklist.map((entry, index) => (
                <li key={entry.item}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-2.5 py-2 text-sm transition-colors hover:bg-surface-sunken">
                    <input
                      type="checkbox"
                      checked={entry.returned}
                      onChange={(event) =>
                        setChecklist((current) =>
                          current.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, returned: event.target.checked } : row,
                          ),
                        )
                      }
                      className="size-4 rounded border-line text-brand focus:ring-brand"
                    />
                    <span className={entry.returned ? 'text-ink' : 'text-ink-secondary'}>
                      {entry.item}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {!allReturned ? (
              <p className="mt-2 flex items-start gap-1.5 text-2xs text-serious">
                <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
                Not everything is ticked. You can still clear the line, but note why below.
              </p>
            ) : null}
          </div>

          <Field label="Decision" required>
            <Select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
              <option value="APPROVED">Clear this department</option>
              <option value="REJECTED">Cannot clear yet</option>
            </Select>
          </Field>

          <Field label="Outstanding dues" hint="Recovered from the final settlement. Leave blank if none.">
            <Input
              type="number"
              min={0}
              value={duesAmount}
              onChange={(event) => setDuesAmount(event.target.value)}
              placeholder="0"
            />
          </Field>

          <Field label="Remarks">
            <CountedTextarea
              maxLength={500}
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
              placeholder="All items verified and returned."
            />
          </Field>
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant={status === 'APPROVED' ? 'success' : 'danger'}
            onClick={() => submit.mutate()}
            loading={submit.isPending}
          >
            <ClipboardCheck />
            Record clearance
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
