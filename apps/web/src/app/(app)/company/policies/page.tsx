'use client';

import { useQuery } from '@tanstack/react-query';
import { FileCheck2, FileText } from 'lucide-react';

import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LinkTabs } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { COMPANY_TABS } from '@/lib/tabs';

interface Policy {
  id: number;
  title: string;
  category: string | null;
  version: string;
  summary: string | null;
  documentPath: string | null;
  effectiveFrom: string;
  isLatest: boolean;
  requiresAck: boolean;
}

export default function PoliciesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['policies'],
    queryFn: () =>
      api.get<{
        policies: Policy[];
        latest: Policy | null;
        requiringAcknowledgement: Policy[];
        byCategory: { category: string; items: Policy[] }[];
      }>('/policies'),
  });

  return (
    <>
      <PageHeader
        title="Office policies"
        description="The current version of every policy, grouped by the team that owns it."
        breadcrumbs={[{ label: 'Company', href: '/company' }, { label: 'Policies' }]}
      />

      <LinkTabs tabs={COMPANY_TABS} />

      {isLoading ? (
        <div className="h-64 skeleton rounded-card" />
      ) : (data?.policies.length ?? 0) === 0 ? (
        <Card>
          <EmptyState icon={FileText} title="No policies published" />
        </Card>
      ) : (
        <>
          {(data?.requiringAcknowledgement.length ?? 0) > 0 ? (
            <div className="rounded-card border border-warning/30 bg-warning-subtle px-4 py-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                <FileCheck2 className="size-3.5 text-serious" aria-hidden />
                {data!.requiringAcknowledgement.length} policy(ies) require your acknowledgement
              </p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {data!.requiringAcknowledgement.map((policy) => (
                  <li key={policy.id}>
                    <Badge tone="warning">{policy.title}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            {data!.byCategory.map((group) => (
              <Card key={group.category}>
                <CardHeader>
                  <CardTitle>{group.category}</CardTitle>
                  <p className="mt-0.5 text-xs text-ink-muted">{group.items.length} policy(ies)</p>
                </CardHeader>
                <ul className="divide-y divide-line">
                  {group.items.map((policy) => (
                    <li key={policy.id} className="flex items-start gap-3 px-4 py-3">
                      <FileText className="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-ink">
                          {policy.title}
                          <Badge tone="neutral">v{policy.version}</Badge>
                          {policy.isLatest ? <Badge tone="brand">latest</Badge> : null}
                          {policy.requiresAck ? <Badge tone="warning">acknowledgement needed</Badge> : null}
                        </p>
                        {policy.summary ? (
                          <p className="mt-1 text-xs leading-relaxed text-ink-secondary">
                            {policy.summary}
                          </p>
                        ) : null}
                        <p className="mt-1 text-2xs text-ink-muted">
                          Effective {formatDate(policy.effectiveFrom)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </>
      )}
    </>
  );
}
