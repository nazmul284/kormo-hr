'use client';

import { PageHeader } from '@/components/shared/page-header';
import { ProfileView } from '@/components/shared/profile-view';
import { useSession } from '@/lib/session';

export default function MyProfilePage() {
  const { user, isLoading } = useSession();

  if (isLoading || !user) {
    return (
      <>
        <div className="h-8 w-48 skeleton" />
        <div className="h-40 skeleton rounded-card" />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="My profile"
        breadcrumbs={[{ label: 'Overview' }, { label: 'My Profile' }]}
        className="sr-only"
      />
      <ProfileView employeeId={user.id} />
    </>
  );
}
