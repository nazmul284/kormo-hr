'use client';

import { useParams } from 'next/navigation';

import { ProfileView } from '@/components/shared/profile-view';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';

export function EmployeeProfilePage() {
  const params = useParams<{ id: string }>();
  const raw = params?.id;

  // Guard the exact failure the reference system shipped: it built URLs
  // straight from client state and fired live requests to /undefined.
  const employeeId = /^\d+$/.test(String(raw)) ? Number(raw) : null;

  if (employeeId === null) {
    return (
      <Card>
        <EmptyState
          title="That is not a valid employee link"
          description={`Expected a numeric employee ID, but the URL contained “${String(raw)}”.`}
        />
      </Card>
    );
  }

  return <ProfileView employeeId={employeeId} />;
}
