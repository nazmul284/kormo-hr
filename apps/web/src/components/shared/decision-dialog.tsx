'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { CountedTextarea, Field } from '@/components/ui/input';
import { ApiError, api } from '@/lib/api';

export interface DecisionTarget {
  id: number | string;
  /** PATCH endpoint that takes `{ decision, note }`. */
  endpoint: string;
  title: string;
  summary: React.ReactNode;
  /** Query keys to invalidate on success. */
  invalidate?: string[][];
}

/**
 * Approve / reject dialog shared by every approval queue.
 *
 * A rejection always requires a note — an unexplained rejection is the
 * single most common complaint about approval workflows, and the person
 * on the other end has no way to ask.
 */
export function DecisionDialog({
  target,
  decision,
  onClose,
  noteFieldLabel = 'Note',
}: {
  target: DecisionTarget | null;
  decision: 'APPROVED' | 'REJECTED' | null;
  onClose: () => void;
  noteFieldLabel?: string;
}) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');

  const isRejection = decision === 'REJECTED';

  const submit = useMutation({
    mutationFn: () =>
      api.patch(target!.endpoint, { decision, note: note.trim() || undefined }),
    onSuccess: () => {
      toast.success(isRejection ? 'Request rejected' : 'Request approved', {
        description: 'The employee has been notified.',
      });
      for (const key of target?.invalidate ?? []) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setNote('');
      onClose();
    },
    onError: (error) => {
      toast.error('Could not record the decision', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
  });

  const open = target !== null && decision !== null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setNote('');
          onClose();
        }
      }}
    >
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{isRejection ? 'Reject' : 'Approve'} — {target?.title}</DialogTitle>
          <DialogDescription>{target?.summary}</DialogDescription>
        </DialogHeader>

        <DialogBody>
          <Field
            label={noteFieldLabel}
            required={isRejection}
            hint={
              isRejection
                ? 'The employee sees this, so say what would need to change.'
                : 'Optional — shared with the employee.'
            }
          >
            <CountedTextarea
              maxLength={255}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={
                isRejection
                  ? 'Team is short-handed that week — please re-plan for later in the month.'
                  : 'Approved. Please complete the handover before you leave.'
              }
            />
          </Field>
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant={isRejection ? 'danger' : 'success'}
            onClick={() => submit.mutate()}
            loading={submit.isPending}
            // A rejection with no reason is not allowed.
            disabled={isRejection && note.trim().length < 5}
          >
            {isRejection ? <X /> : <Check />}
            {isRejection ? 'Reject request' : 'Approve request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The approve/reject button pair used in every queue row. */
export function DecisionButtons({
  onApprove,
  onReject,
  disabled,
}: {
  onApprove: () => void;
  onReject: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex justify-end gap-1.5">
      <Button variant="success" size="sm" onClick={onApprove} disabled={disabled}>
        <Check />
        Approve
      </Button>
      <Button variant="danger-outline" size="sm" onClick={onReject} disabled={disabled}>
        <X />
        Reject
      </Button>
    </div>
  );
}
