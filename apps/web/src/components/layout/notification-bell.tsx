'use client';

import * as Popover from '@radix-ui/react-popover';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { api } from '@/lib/api';
import { cn, formatRelative } from '@/lib/utils';

interface Notification {
  id: number;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

const KIND_TONE: Record<string, string> = {
  LEAVE: 'bg-brand',
  ATTENDANCE: 'bg-warning',
  PAYROLL: 'bg-good',
  PERFORMANCE: 'bg-series-3',
  ONBOARDING: 'bg-series-2',
  RESIGNATION: 'bg-critical',
  BOOKING: 'bg-series-5',
  ANNOUNCEMENT: 'bg-accent',
  APPROVAL: 'bg-brand',
  SYSTEM: 'bg-ink-muted',
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: counts } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => api.get<{ total: number }>('/notifications/unread-count'),
    // Polling, not a socket, for the badge: it is one small query and it
    // avoids holding a connection open for every signed-in tab.
    refetchInterval: 60_000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () =>
      api.get<{ data: Notification[]; unreadCount: number }>('/notifications', { pageSize: 12 }),
    enabled: open,
  });

  const markRead = useMutation({
    mutationFn: (ids?: number[]) =>
      api.patch('/notifications/read', ids ? { notificationIds: ids.map(String) } : {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const unread = counts?.total ?? 0;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="relative rounded-lg p-2 text-ink-secondary transition-colors
                     hover:bg-surface-sunken hover:text-ink"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        >
          <Bell className="size-4" aria-hidden />
          {unread > 0 ? (
            <span
              className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full
                         bg-critical px-1 text-[9px] font-bold leading-4 text-white"
            >
              {unread > 99 ? '99+' : unread}
            </span>
          ) : null}
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-card border
                     border-line bg-surface shadow-pop data-[state=open]:animate-in
                     data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <p className="text-sm font-semibold text-ink">
              Notifications
              {unread > 0 ? <span className="ml-1.5 text-xs font-normal text-ink-muted">{unread} unread</span> : null}
            </p>
            {unread > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => markRead.mutate(undefined)}
                loading={markRead.isPending}
              >
                <CheckCheck />
                Mark all read
              </Button>
            ) : null}
          </div>

          <div className="max-h-[26rem] overflow-y-auto">
            {isLoading ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2, 3].map((index) => (
                  <div key={index} className="skeleton h-12" />
                ))}
              </div>
            ) : (data?.data.length ?? 0) === 0 ? (
              <EmptyState
                icon={Bell}
                title="You're all caught up"
                description="Approvals, payslips and announcements will show up here."
              />
            ) : (
              <ul className="divide-y divide-line">
                {data!.data.map((notification) => {
                  const body = (
                    <div className="flex gap-2.5">
                      <span
                        aria-hidden
                        className={cn(
                          'mt-1.5 size-1.5 shrink-0 rounded-full',
                          KIND_TONE[notification.kind] ?? 'bg-ink-muted',
                          notification.readAt ? 'opacity-30' : '',
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            'text-sm leading-snug',
                            notification.readAt ? 'text-ink-secondary' : 'font-medium text-ink',
                          )}
                        >
                          {notification.title}
                        </p>
                        {notification.body ? (
                          <p className="mt-0.5 line-clamp-2 text-xs text-ink-secondary">
                            {notification.body}
                          </p>
                        ) : null}
                        <p className="mt-1 text-2xs text-ink-muted">
                          {formatRelative(notification.createdAt)}
                        </p>
                      </div>
                    </div>
                  );

                  return (
                    <li key={notification.id} className="transition-colors hover:bg-surface-sunken/60">
                      {notification.link ? (
                        <Link
                          href={notification.link}
                          className="block px-4 py-3"
                          onClick={() => {
                            if (!notification.readAt) markRead.mutate([notification.id]);
                            setOpen(false);
                          }}
                        >
                          {body}
                        </Link>
                      ) : (
                        <div className="px-4 py-3">{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
