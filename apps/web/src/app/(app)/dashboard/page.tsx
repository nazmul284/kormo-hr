'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertCircle, CalendarHeart, ClipboardList, Sun } from 'lucide-react';
import Link from 'next/link';

import {
  ApprovalInbox, AttendanceWidget, CelebrationsWidget, CurrentWeekWidget, IdentityCard,
  LeaveBalanceWidget, MiniCalendar, NoticeBoard, PolicyWidget,
} from '@/components/dashboard/widgets';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SkeletonCard } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { DashboardData } from '@/lib/types';
import { countOf, formatDate } from '@/lib/utils';

export default function DashboardPage() {
  const { user } = useSession();
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardData>('/dashboard'),
    staleTime: 60_000,
  });

  if (isLoading || !data) {
    return (
      <>
        <div className="h-8 w-64 skeleton" />
        <div className="grid gap-4 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <SkeletonCard key={index} rows={index % 2 === 0 ? 5 : 3} />
          ))}
        </div>
        {error ? (
          <Card>
            <CardContent className="flex items-start gap-2 text-sm text-critical-ink">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>We could not load your dashboard. Please refresh, or contact the help desk.</span>
            </CardContent>
          </Card>
        ) : null}
      </>
    );
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">
            {greeting}, {user?.firstName ?? data.identity.firstName}
          </h1>
          <p className="page-subtitle">
            {data.identity.company.name}
            {data.identity.location ? ` · ${data.identity.location.name}` : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {data.myOnboardingTasks > 0 ? (
            <Button asChild variant="secondary" size="sm">
              <Link href="/onboarding">
                <ClipboardList />
                {countOf(data.myOnboardingTasks, 'onboarding task')}
              </Link>
            </Button>
          ) : null}
          <Button asChild size="sm">
            <Link href="/leave">
              <CalendarHeart />
              Apply for leave
            </Link>
          </Button>
        </div>
      </div>

      {data.upcomingHoliday ? (
        <div className="flex flex-wrap items-center gap-2 rounded-card border border-accent/25
                        bg-accent-subtle px-4 py-2.5 text-sm">
          <Sun className="size-4 shrink-0 text-accent" aria-hidden />
          <span className="font-medium text-ink">{data.upcomingHoliday.name}</span>
          <span className="text-ink-secondary">
            {formatDate(data.upcomingHoliday.startDate)}
            {data.upcomingHoliday.duration > 1
              ? ` – ${formatDate(data.upcomingHoliday.endDate)}`
              : ''}
          </span>
          <Badge tone="info">
            {data.upcomingHoliday.duration} day{data.upcomingHoliday.duration > 1 ? 's' : ''}
          </Badge>
          <Link href="/holidays" className="ml-auto text-xs font-medium text-accent hover:underline">
            Holiday calendar
          </Link>
        </div>
      ) : null}

      {/*
        Three columns on wide screens; the widgets are ordered so the
        most-used ones (attendance, leave) sit in the middle column where
        the eye lands first, and so the three columns end at roughly the
        same depth — an unbalanced grid reads as a broken page.
      */}
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4">
          <IdentityCard data={data} />
          <CurrentWeekWidget data={data} />
          <PolicyWidget data={data} />
        </div>

        <div className="space-y-4">
          <AttendanceWidget data={data} />
          <MiniCalendar data={data} />
          <CelebrationsWidget data={data} />
        </div>

        <div className="space-y-4">
          <LeaveBalanceWidget data={data} />
          <ApprovalInbox data={data} />
          <NoticeBoard data={data} />
        </div>
      </div>
    </>
  );
}
