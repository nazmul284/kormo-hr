'use client';

import { useMutation } from '@tanstack/react-query';
import { Check, KeyRound, ShieldCheck, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { ApiError, api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { cn, formatDateTime } from '@/lib/utils';

/** Mirrors the server-side strength rules exactly, so nothing surprises on submit. */
const RULES = [
  { label: 'At least 8 characters', test: (value: string) => value.length >= 8 },
  { label: 'Contains a letter', test: (value: string) => /[A-Za-z]/.test(value) },
  { label: 'Contains a digit', test: (value: string) => /\d/.test(value) },
];

export default function SecurityPage() {
  const { user } = useSession();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const change = useMutation({
    mutationFn: () => api.post('/auth/change-password', { currentPassword, newPassword }),
    onSuccess: () => {
      toast.success('Password changed', {
        description: 'Every other session has been signed out.',
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: (error) => {
      toast.error('Could not change your password', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
  });

  const rulesPassed = RULES.every((rule) => rule.test(newPassword));
  const matches = newPassword.length > 0 && newPassword === confirmPassword;
  const canSubmit = currentPassword.length > 0 && rulesPassed && matches;

  return (
    <>
      <PageHeader
        title="Password & security"
        description="Changing your password signs out every other device."
        breadcrumbs={[{ label: 'My Profile', href: '/profile' }, { label: 'Security' }]}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Change password</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                change.mutate();
              }}
            >
              <Field label="Current password" htmlFor="current" required>
                <Input
                  id="current"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
              </Field>

              <Field label="New password" htmlFor="new" required>
                <Input
                  id="new"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />
              </Field>

              <ul className="space-y-1">
                {RULES.map((rule) => {
                  const passed = rule.test(newPassword);
                  return (
                    <li
                      key={rule.label}
                      className={cn(
                        'flex items-center gap-1.5 text-xs',
                        newPassword.length === 0
                          ? 'text-ink-muted'
                          : passed
                            ? 'text-good-ink'
                            : 'text-ink-secondary',
                      )}
                    >
                      {passed ? <Check className="size-3.5" aria-hidden /> : <X className="size-3.5" aria-hidden />}
                      {rule.label}
                    </li>
                  );
                })}
              </ul>

              <Field
                label="Confirm new password"
                htmlFor="confirm"
                required
                error={
                  confirmPassword.length > 0 && !matches ? 'The two passwords do not match.' : undefined
                }
              >
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </Field>

              <Button type="submit" className="w-full" loading={change.isPending} disabled={!canSubmit}>
                <KeyRound />
                Change password
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>How your session is protected</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-ink-secondary">
            <p className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-good-ink" aria-hidden />
              <span>
                Your tokens are held in <strong className="text-ink">httpOnly cookies</strong>, never in
                browser storage — so a script injected into a page cannot read them.
              </span>
            </p>
            <p className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-good-ink" aria-hidden />
              <span>
                The access token lasts 15 minutes and refreshes silently. Refresh tokens rotate on
                every use; presenting an already-used one revokes the whole session, which is how a
                stolen token gets caught.
              </span>
            </p>
            <p className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-good-ink" aria-hidden />
              <span>
                Your permissions are re-read from the database on every single request, so a change
                HR makes takes effect at once rather than when your token happens to expire.
              </span>
            </p>

            <dl className="space-y-1.5 border-t border-line pt-3 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-ink-muted">Username</dt>
                <dd className="font-medium text-ink">{user?.username}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-muted">Roles</dt>
                <dd className="font-medium text-ink">{user?.roles.join(', ')}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-muted">Granted permissions</dt>
                <dd className="font-medium text-ink tabular">{user?.permissions.length}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-muted">Last sign-in</dt>
                <dd className="font-medium text-ink">{formatDateTime(user?.lastLoginAt)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
