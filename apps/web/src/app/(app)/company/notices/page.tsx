'use client';

import { useQuery } from '@tanstack/react-query';
import { FileText, Pin } from 'lucide-react';
import { useState } from 'react';

import { PageHeader } from '@/components/shared/page-header';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LinkTabs } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import type { Paginated } from '@/lib/types';
import { formatDate, formatRelative } from '@/lib/utils';
import { COMPANY_TABS } from '@/lib/tabs';

interface Notice {
  id: number;
  title: string;
  body: string;
  isPinned: boolean;
  publishAt: string;
  expiresAt: string | null;
  attachmentPath: string | null;
  author: { id: number; fullName: string; initials: string; avatarUrl: string | null } | null;
}

export default function NoticesPage() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['notices', page],
    queryFn: () => api.get<Paginated<Notice>>('/notices', { page, pageSize: 20 }),
  });

  return (
    <>
      <PageHeader
        title="Notice board"
        description="Company announcements. Pinned notices stay at the top."
        breadcrumbs={[{ label: 'Company', href: '/company' }, { label: 'Notices' }]}
      />

      <LinkTabs tabs={COMPANY_TABS} />

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((index) => (
            <div key={index} className="h-32 skeleton rounded-card" />
          ))}
        </div>
      ) : (data?.data.length ?? 0) === 0 ? (
        <Card>
          <EmptyState icon={FileText} title="No active notices" />
        </Card>
      ) : (
        <>
          <div className="space-y-3">
            {data!.data.map((notice) => (
              <Card key={notice.id}>
                <CardContent>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                      {notice.isPinned ? (
                        <Pin className="size-3.5 shrink-0 rotate-45 text-brand" aria-hidden />
                      ) : null}
                      {notice.title}
                    </h2>
                    <div className="flex items-center gap-2">
                      {notice.isPinned ? <Badge tone="brand">pinned</Badge> : null}
                      <span className="text-2xs text-ink-muted">
                        {formatRelative(notice.publishAt)}
                      </span>
                    </div>
                  </div>

                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-secondary">
                    {notice.body}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-2.5 text-2xs text-ink-muted">
                    {notice.author ? (
                      <span className="flex items-center gap-1.5">
                        <Avatar
                          name={notice.author.fullName}
                          initials={notice.author.initials}
                          src={notice.author.avatarUrl}
                          size="xs"
                        />
                        {notice.author.fullName}
                      </span>
                    ) : null}
                    <span>Published {formatDate(notice.publishAt)}</span>
                    {notice.expiresAt ? <span>Expires {formatDate(notice.expiresAt)}</span> : null}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {data!.meta.totalPages > 1 ? (
            <div className="flex items-center justify-center gap-2">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <span className="text-xs text-ink-secondary tabular">
                {data!.meta.page} / {data!.meta.totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= data!.meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
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
