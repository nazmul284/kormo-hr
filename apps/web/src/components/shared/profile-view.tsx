'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, Banknote, BookOpen, Briefcase, Building2, CheckCircle2, FileText,
  KeyRound, Mail, MapPin, Phone, Shield, Users, XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';

import { DetailList } from '@/components/shared/data-table';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { CountedTextarea, Field, Input, Select } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { SegmentedTabs } from '@/components/ui/tabs';
import { ApiError, api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { cn, formatDate, formatDays, formatMoney } from '@/lib/utils';

const TABS = [
  { value: 'company', label: 'Company' },
  { value: 'personal', label: 'Personal' },
  { value: 'compensation', label: 'Compensation' },
  { value: 'nominee', label: 'Nominee' },
  { value: 'education', label: 'Education' },
  { value: 'documents', label: 'Documents' },
  { value: 'changes', label: 'Changes' },
] as const;

type Tab = (typeof TABS)[number]['value'];

export function ProfileView({ employeeId }: { employeeId: number }) {
  const { user } = useSession();
  const [tab, setTab] = useState<Tab>('company');
  const isSelf = user?.id === employeeId;

  const profile = useQuery({
    queryKey: ['employee', employeeId],
    queryFn: () => api.get<any>(`/employees/${employeeId}`),
  });

  if (profile.isLoading) {
    return (
      <>
        <div className="h-40 skeleton rounded-card" />
        <div className="h-64 skeleton rounded-card" />
      </>
    );
  }

  if (profile.error instanceof ApiError) {
    return (
      <Card>
        <EmptyState
          icon={Shield}
          title={profile.error.isForbidden ? 'You do not have access to this profile' : 'Profile not found'}
          description={profile.error.message}
          action={
            <Button asChild variant="secondary">
              <Link href="/directory">Back to the directory</Link>
            </Button>
          }
        />
      </Card>
    );
  }

  const data = profile.data;
  const visibleTabs = TABS.filter((entry) => {
    if (entry.value === 'compensation') return data.capabilities.canViewCompensation;
    if (entry.value === 'documents') return data.capabilities.canViewDocuments;
    if (entry.value === 'changes') return isSelf;
    return true;
  });

  return (
    <>
      <ProfileHeader data={data} isSelf={isSelf} />

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <SegmentedTabs
            value={tab}
            onChange={setTab}
            options={visibleTabs.map((entry) => ({ value: entry.value, label: entry.label }))}
            // Scrolls rather than wraps: eight tabs wrapped left one lonely
            // tab on a second row, which reads as a layout accident.
            className="no-scrollbar overflow-x-auto"
          />

          {tab === 'company' ? <CompanyTab data={data} /> : null}
          {tab === 'personal' ? <PersonalTab employeeId={employeeId} /> : null}
          {tab === 'compensation' ? <CompensationTab employeeId={employeeId} /> : null}
          {tab === 'nominee' ? <NomineeTab employeeId={employeeId} /> : null}
          {tab === 'education' ? <EducationTab employeeId={employeeId} /> : null}
          {tab === 'documents' ? <DocumentsTab employeeId={employeeId} /> : null}
          {tab === 'changes' ? <ChangeRequestsTab /> : null}
        </div>

        <EmergencyRail data={data} />
      </div>
    </>
  );
}

// ── header ────────────────────────────────────────────────────────────

function ProfileHeader({ data, isSelf }: { data: any; isSelf: boolean }) {
  return (
    <Card className="overflow-hidden">
      <div className="banner-wash h-16 border-b border-line" />

      <CardContent className="-mt-8 pt-0">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-end gap-4">
            <span className="inline-block rounded-full bg-surface ring-4 ring-surface">
              <Avatar name={data.fullName} src={data.thumbnailsPath01} size="xl" />
            </span>
            <div className="pb-1">
              <h1 className="text-lg font-semibold tracking-tight text-ink">{data.fullName}</h1>
              <p className="text-sm text-ink-secondary">
                {data.designation?.name ?? '—'}
                {data.designation?.grade ? (
                  <span className="text-ink-muted"> ({data.designation.grade})</span>
                ) : null}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <StatusBadge status={data.employmentStatus} />
                <Badge tone="neutral">{data.employmentType?.toLowerCase()}</Badge>
                {!data.active ? <Badge tone="critical">inactive</Badge> : null}
                {data.directReportCount > 0 ? (
                  <Badge tone="brand">
                    <Users aria-hidden />
                    {data.directReportCount} report{data.directReportCount > 1 ? 's' : ''}
                  </Badge>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pb-1">
            <Button asChild variant="secondary" size="sm">
              <Link href={`/org-chart?root=${data.id}`}>View in org tree</Link>
            </Button>
            {isSelf ? (
              <Button asChild variant="secondary" size="sm">
                <Link href="/profile/security">
                  <KeyRound />
                  Change password
                </Link>
              </Button>
            ) : null}
          </div>
        </div>

        <dl className="mt-5 grid gap-4 border-t border-line pt-4 sm:grid-cols-2 lg:grid-cols-4">
          <HeaderStat label="Employee ID" value={data.employeeVisibleId} />
          <HeaderStat label="Department" value={data.department?.name ?? '—'} />
          <HeaderStat label="Joined" value={formatDate(data.joiningDate)} />
          <HeaderStat label="Service length" value={data.serviceLength?.label ?? '—'} />
        </dl>
      </CardContent>
    </Card>
  );
}

function HeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-2xs font-medium uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium text-ink">{value}</dd>
    </div>
  );
}

// ── tabs ──────────────────────────────────────────────────────────────

function CompanyTab({ data }: { data: any }) {
  const person = (value: any) =>
    value ? (
      <Link href={`/profile/${value.id}`} className="text-brand hover:underline">
        {value.firstName} {value.lastName}
        {value.designation?.name ? (
          <span className="text-ink-muted"> · {value.designation.name}</span>
        ) : null}
      </Link>
    ) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Company details</CardTitle>
      </CardHeader>
      <CardContent>
        <DetailList
          items={[
            { label: 'Employee ID', value: data.employeeVisibleId },
            { label: 'Unique tag', value: data.uniqueTag },
            { label: 'Company', value: data.company?.name },
            { label: 'Location', value: data.location?.name },
            { label: 'Department', value: data.department?.name },
            { label: 'Designation', value: data.designation?.name },
            { label: 'Grade', value: data.designation?.grade },
            { label: 'Employment status', value: <StatusBadge status={data.employmentStatus} /> },
            { label: 'Employment type', value: data.employmentType?.replace(/_/g, ' ').toLowerCase() },
            { label: 'Payroll type', value: data.payrollType?.toLowerCase() },
            { label: 'Joining date', value: formatDate(data.joiningDate) },
            { label: 'Probation start', value: data.probationStartDate ? formatDate(data.probationStartDate) : null },
            { label: 'Confirmation date', value: data.confirmationDate ? formatDate(data.confirmationDate) : null },
            { label: 'Contract end', value: data.contractEndDate ? formatDate(data.contractEndDate) : null },
            {
              label: 'Service length',
              value: data.serviceLength
                ? `${data.serviceLength.years}y ${data.serviceLength.months}m ${data.serviceLength.days}d`
                : null,
            },
            { label: 'Notice period', value: `${data.noticePeriodDays} days` },
            { label: 'Official email', value: data.officialEmail },
            { label: 'Official contact', value: data.officialContact },
            { label: 'RFID', value: data.rfid },
            { label: 'Line manager', value: person(data.lineManager) },
            { label: 'Dotted manager 1', value: person(data.dottedManager1) },
            { label: 'Dotted manager 2', value: person(data.dottedManager2) },
            { label: 'Head of department', value: person(data.headOfDepartment) },
            { label: 'Referred by', value: person(data.referringEmployee) },
            { label: 'Attendance roster', value: data.roster?.name },
            { label: 'Leave policy', value: data.leavePolicy?.name },
            ...(data.separationDate
              ? [{ label: 'Separation date', value: formatDate(data.separationDate) }]
              : []),
          ]}
        />
      </CardContent>
    </Card>
  );
}

function PersonalTab({ employeeId }: { employeeId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['employee', employeeId, 'personal'],
    queryFn: () => api.get<any>(`/employees/${employeeId}/personal-details`),
  });

  if (isLoading || !data) return <div className="h-64 skeleton rounded-card" />;

  const address = (value: any) =>
    value
      ? [value.buildingNo, value.streetNo, value.village, value.city, value.state, value.postalCode, value.country]
          .filter(Boolean)
          .join(', ')
      : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Personal details</CardTitle>
        </CardHeader>
        <CardContent>
          <DetailList
            items={[
              { label: "Father's name", value: data.fatherName },
              { label: "Mother's name", value: data.motherName },
              { label: 'Date of birth (certificate)', value: data.birthDate ? formatDate(data.birthDate) : null },
              {
                label: 'Original date of birth',
                value:
                  data.actualBirthDate && data.actualBirthDate !== data.birthDate ? (
                    <span className="flex items-center gap-1.5">
                      {formatDate(data.actualBirthDate)}
                      <Badge tone="warning">differs from certificate</Badge>
                    </span>
                  ) : data.actualBirthDate ? (
                    formatDate(data.actualBirthDate)
                  ) : null,
              },
              { label: 'Gender', value: data.gender?.toLowerCase() },
              { label: 'Nationality', value: data.nationality },
              { label: 'Country of birth', value: data.countryOfBirth },
              { label: 'Religion', value: data.religion },
              { label: 'Marital status', value: data.maritalStatus?.toLowerCase() },
              { label: 'Blood group', value: data.bloodGroup?.replace('_POS', '+').replace('_NEG', '−') },
              { label: 'Spouse name', value: data.spouseName },
              { label: 'Spouse date of birth', value: data.spouseDateOfBirth ? formatDate(data.spouseDateOfBirth) : null },
              { label: 'Personal email', value: data.personalEmail },
              { label: 'Alternate email', value: data.alternateEmail },
              { label: 'Alternate number', value: data.alternateNumber },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Statutory identifiers</CardTitle>
        </CardHeader>
        <CardContent>
          <DetailList
            columns={3}
            items={[
              { label: 'National ID (NID)', value: data.nidNumber },
              { label: 'TIN', value: data.tinNumber },
              { label: 'Passport number', value: data.passportNo },
              { label: 'Driving licence', value: data.drivingLicenseNo },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Addresses</CardTitle>
        </CardHeader>
        <CardContent>
          <DetailList
            columns={1}
            items={[
              {
                label: 'Present address',
                value: address(data.presentAddress) ? (
                  <span className="flex items-start gap-1.5">
                    <MapPin className="mt-0.5 size-3.5 shrink-0 text-ink-muted" aria-hidden />
                    {address(data.presentAddress)}
                  </span>
                ) : null,
              },
              {
                label: 'Permanent address',
                value: address(data.permanentAddress) ? (
                  <span className="flex items-start gap-1.5">
                    <MapPin className="mt-0.5 size-3.5 shrink-0 text-ink-muted" aria-hidden />
                    {address(data.permanentAddress)}
                  </span>
                ) : null,
              },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}

const BENEFIT_LABELS: Record<string, string> = {
  isTransportUser: 'Transport user',
  isTaxApplicable: 'Tax applicable',
  advanceIncomeTax: 'Advance income tax',
  hasInvestment: 'Has investment',
  hasProvidentFund: 'Provident fund',
  hasLfa: 'Leave fare assistance',
  hasGratuity: 'Gratuity',
  hasDormitory: 'Dormitory',
  hasBonus: 'Festival bonus',
  hasLifeInsurance: 'Life insurance',
  hasLunchAllowance: 'Lunch allowance',
  hasMedicalInsurance: 'Medical insurance',
  hasMobileAllowance: 'Mobile allowance',
};

function CompensationTab({ employeeId }: { employeeId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['employee', employeeId, 'compensation'],
    queryFn: () => api.get<any>(`/employees/${employeeId}/compensation`),
  });

  if (isLoading || !data) return <div className="h-64 skeleton rounded-card" />;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Bank information</CardTitle>
        </CardHeader>
        {data.bankAccounts.length === 0 ? (
          <EmptyState icon={Banknote} title="No bank account on record" />
        ) : (
          <CardContent className="space-y-4">
            {data.bankAccounts.map((bank: any) => (
              <DetailList
                key={bank.id}
                columns={3}
                items={[
                  { label: 'Bank', value: bank.bankName },
                  { label: 'Branch', value: bank.branchName },
                  { label: 'Account name', value: bank.accountName },
                  { label: 'Account number', value: <span className="tabular">{bank.accountNo}</span> },
                  { label: 'Routing number', value: <span className="tabular">{bank.routingNo}</span> },
                  { label: 'Transaction type', value: bank.txnType },
                ]}
              />
            ))}
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Benefit eligibility</CardTitle>
          <p className="mt-0.5 text-xs text-ink-muted">
            These flags drive payroll components and feed the tax engine.
          </p>
        </CardHeader>
        <CardContent>
          {data.benefit ? (
            <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(BENEFIT_LABELS).map(([key, label]) => {
                const enabled = data.benefit[key] === true;
                return (
                  <li
                    key={key}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs',
                      enabled ? 'border-good/25 bg-good-subtle text-ink' : 'border-line text-ink-muted',
                    )}
                  >
                    {/* Icon + label, so the state never rests on colour alone. */}
                    {enabled ? (
                      <CheckCircle2 className="size-3.5 shrink-0 text-good-ink" aria-hidden />
                    ) : (
                      <XCircle className="size-3.5 shrink-0 text-ink-muted" aria-hidden />
                    )}
                    <span className="truncate">{label}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-ink-muted">No benefit record configured.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Salary history</CardTitle>
          <p className="mt-0.5 text-xs text-ink-muted">
            Append-only — the tax engine segments the fiscal year on these effective dates.
          </p>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Effective from</th>
                <th className="text-right">Gross</th>
                <th className="text-right">Basic</th>
                <th className="text-right">House rent</th>
                <th className="text-right">Increment</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.salaryHistory.map((row: any) => (
                <tr key={row.id}>
                  <td className="font-medium text-ink">{formatDate(row.effectiveFrom)}</td>
                  <td className="text-right font-medium text-ink tabular">{formatMoney(row.gross)}</td>
                  <td className="text-right tabular">{formatMoney(row.basic)}</td>
                  <td className="text-right tabular">{formatMoney(row.houseRent)}</td>
                  <td className="text-right tabular">
                    {row.incrementPct !== null ? (
                      <span className="text-good-ink">
                        +{Number(row.incrementPct).toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                  </td>
                  <td><Badge tone={row.status === 'PROMOTION' ? 'brand' : 'neutral'}>{row.status.toLowerCase()}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {data.promotionHistory.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Promotion history</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Effective from</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Status</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {data.promotionHistory.map((row: any) => (
                  <tr key={row.id}>
                    <td className="font-medium text-ink">{formatDate(row.effectiveFrom)}</td>
                    <td>{row.fromDesignation ?? '—'}</td>
                    <td>{row.designation?.name ?? '—'}</td>
                    <td><Badge tone="brand">{row.status.toLowerCase()}</Badge></td>
                    <td className="text-xs">{row.remarks ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function NomineeTab({ employeeId }: { employeeId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['employee', employeeId, 'nominees'],
    queryFn: () => api.get<any>(`/employees/${employeeId}/nominees`),
  });

  if (isLoading || !data) return <div className="h-48 skeleton rounded-card" />;

  return (
    <Card>
      <CardHeader
        action={
          data.nominees.length > 0 ? (
            <Badge tone={data.isValid ? 'good' : 'critical'}>
              {data.isValid ? (
                <CheckCircle2 aria-hidden />
              ) : (
                <AlertTriangle aria-hidden />
              )}
              {formatDays(data.totalSharePct)}% allocated
            </Badge>
          ) : null
        }
      >
        <CardTitle>Nominees</CardTitle>
        <p className="mt-0.5 text-xs text-ink-muted">
          For provident fund, gratuity and life insurance payouts. Shares must total 100%.
        </p>
      </CardHeader>

      {data.nominees.length === 0 ? (
        <EmptyState
          title="No nominee on record"
          description="A nomination is needed before a provident fund or gratuity payout can be processed."
        />
      ) : (
        <>
          {!data.isValid ? (
            <div className="mx-4 mt-4 flex items-start gap-2 rounded-lg border border-critical/25 bg-critical-subtle px-3 py-2.5 text-xs text-critical-ink">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                Nominee shares total {formatDays(data.totalSharePct)}%, not 100%. A payout would
                stall on this — raise a change request with HR.
              </span>
            </div>
          ) : null}
          <CardContent className="space-y-4">
            {data.nominees.map((nominee: any) => (
              <div key={nominee.id} className="rounded-lg border border-line p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-ink">{nominee.name}</p>
                  <Badge tone="brand">{formatDays(nominee.sharePct)}%</Badge>
                </div>
                <DetailList
                  className="mt-3"
                  columns={3}
                  items={[
                    { label: 'Relation', value: nominee.relation },
                    { label: 'NID', value: nominee.nid },
                    { label: 'Phone', value: nominee.phone },
                    { label: 'Date of birth', value: nominee.dateOfBirth ? formatDate(nominee.dateOfBirth) : null },
                    { label: 'Address', value: nominee.address, span: true },
                  ]}
                />
              </div>
            ))}
          </CardContent>
        </>
      )}
    </Card>
  );
}

function EducationTab({ employeeId }: { employeeId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['employee', employeeId, 'education'],
    queryFn: () => api.get<any>(`/employees/${employeeId}/education-experience`),
  });

  if (isLoading || !data) return <div className="h-64 skeleton rounded-card" />;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Education</CardTitle>
        </CardHeader>
        {data.education.length === 0 ? (
          <EmptyState icon={BookOpen} title="No education records" />
        ) : (
          <ul className="divide-y divide-line">
            {data.education.map((row: any) => (
              <li key={row.id} className="flex items-start gap-3 px-4 py-3">
                <BookOpen className="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-ink">
                    {row.degree}
                    {row.isHighest ? <Badge tone="brand">highest</Badge> : null}
                  </p>
                  <p className="text-xs text-ink-secondary">{row.institute}</p>
                  <p className="mt-0.5 text-2xs text-ink-muted">
                    {[row.major, row.result, row.passingYear].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Prior experience</CardTitle>
        </CardHeader>
        {data.experience.length === 0 ? (
          <EmptyState icon={Briefcase} title="No prior experience on record" />
        ) : (
          <ul className="divide-y divide-line">
            {data.experience.map((row: any) => (
              <li key={row.id} className="flex items-start gap-3 px-4 py-3">
                <Briefcase className="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{row.designation}</p>
                  <p className="text-xs text-ink-secondary">{row.companyName}</p>
                  <p className="mt-0.5 text-2xs text-ink-muted">
                    {formatDate(row.fromDate, 'short')} – {row.toDate ? formatDate(row.toDate, 'short') : 'present'}
                  </p>
                  {row.responsibilities ? (
                    <p className="mt-1 text-xs text-ink-secondary">{row.responsibilities}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

const DOC_LABELS: Record<string, string> = {
  cv: 'Curriculum vitae',
  nid: 'National ID',
  passport: 'Passport',
  offer_letter: 'Offer letter',
  appointment_letter: 'Appointment letter',
  agreement: 'Agreement',
  clearance_letter: 'Clearance letter',
  resignation_letter: 'Resignation letter',
  certificate: 'Certificate',
};

function DocumentsTab({ employeeId }: { employeeId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['employee', employeeId, 'documents'],
    queryFn: () => api.get<any[]>(`/employees/${employeeId}/documents`),
  });

  if (isLoading) return <div className="h-48 skeleton rounded-card" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Documents</CardTitle>
      </CardHeader>
      {(data?.length ?? 0) === 0 ? (
        <EmptyState icon={FileText} title="No documents uploaded" />
      ) : (
        <ul className="divide-y divide-line">
          {data!.map((document) => (
            <li key={document.id} className="flex items-center gap-3 px-4 py-3">
              <FileText className="size-4 shrink-0 text-ink-muted" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink">{document.title}</p>
                <p className="text-2xs text-ink-muted">
                  {DOC_LABELS[document.kind] ?? document.kind} · uploaded{' '}
                  {formatDate(document.uploadedAt, 'short')}
                  {document.sizeBytes ? ` · ${Math.round(document.sizeBytes / 1024)} KB` : ''}
                </p>
              </div>
              <Badge tone="neutral">{document.mimeType?.split('/')[1] ?? 'file'}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ChangeRequestsTab() {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);

  const { user } = useSession();

  const allowed = useQuery({
    queryKey: ['employee', user?.id, 'allowed-fields'],
    queryFn: () =>
      api.get<{ allowedFields: string[]; autoApprove: string[]; requiresApproval: string[] }>(
        `/employees/${user!.id}/allowed-fields`,
      ),
    enabled: Boolean(user),
  });

  const requests = useQuery({
    queryKey: ['employee', 'change-requests', 'mine'],
    queryFn: () => api.get<any[]>('/employees/change-requests/mine'),
  });

  return (
    <>
      <Card>
        <CardHeader
          action={
            <Button size="sm" onClick={() => setCreating(true)}>
              Request a change
            </Button>
          }
        >
          <CardTitle>Change requests</CardTitle>
          <p className="mt-0.5 text-xs text-ink-muted">
            Low-risk fields apply immediately; the rest queue for HR review.
          </p>
        </CardHeader>

        {(requests.data?.length ?? 0) === 0 ? (
          <EmptyState
            title="No change requests"
            description="Ask HR to update anything not in the self-service list."
          />
        ) : (
          <ul className="divide-y divide-line">
            {requests.data!.map((request) => (
              <li key={request.id} className="px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">{request.fieldPath}</p>
                    <p className="mt-0.5 text-xs text-ink-secondary">
                      <span className="text-ink-muted line-through">{request.currentValue ?? 'not set'}</span>
                      {' → '}
                      <span className="font-medium text-ink">{request.requestedValue}</span>
                    </p>
                    {request.reason ? (
                      <p className="mt-1 text-2xs text-ink-muted">{request.reason}</p>
                    ) : null}
                    {request.reviewNote ? (
                      <p className="mt-1 text-2xs text-serious">{request.reviewNote}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge status={request.status} />
                    <span className="text-2xs text-ink-muted">
                      {formatDate(request.requestedAt, 'short')}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Dialog open={creating} onOpenChange={(open) => !open && setCreating(false)}>
        <DialogContent size="sm">
          <ChangeRequestForm
            allowedFields={allowed.data?.allowedFields ?? []}
            autoApprove={allowed.data?.autoApprove ?? []}
            onDone={() => {
              void queryClient.invalidateQueries({ queryKey: ['employee'] });
              setCreating(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function ChangeRequestForm({
  allowedFields,
  autoApprove,
  onDone,
}: {
  allowedFields: string[];
  autoApprove: string[];
  onDone: () => void;
}) {
  const [fieldPath, setFieldPath] = useState(allowedFields[0] ?? '');
  const [requestedValue, setRequestedValue] = useState('');
  const [reason, setReason] = useState('');

  const submit = useMutation({
    mutationFn: () => api.post('/employees/change-requests', { fieldPath, requestedValue, reason }),
    onSuccess: () => {
      toast.success(
        autoApprove.includes(fieldPath) ? 'Change applied' : 'Change request submitted',
        {
          description: autoApprove.includes(fieldPath)
            ? 'This field is self-serviceable, so it took effect immediately.'
            : 'HR will review it.',
        },
      );
      onDone();
    },
    onError: (error) => {
      toast.error('Could not submit', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
  });

  const isImmediate = autoApprove.includes(fieldPath);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Request a profile change</DialogTitle>
        <DialogDescription>
          Only fields HR has opened for self-service can be requested here.
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="space-y-4">
        <Field label="Field" required>
          <Select value={fieldPath} onChange={(event) => setFieldPath(event.target.value)}>
            {allowedFields.map((field) => (
              <option key={field} value={field}>
                {field}
                {autoApprove.includes(field) ? ' (applies immediately)' : ' (needs HR approval)'}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="New value" required>
          <Input
            value={requestedValue}
            onChange={(event) => setRequestedValue(event.target.value)}
            placeholder="The corrected value"
          />
        </Field>

        <Field label="Reason" hint="Helps HR verify the change.">
          <CountedTextarea
            maxLength={255}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Recently changed — please update my record."
          />
        </Field>

        <p className="rounded-lg bg-surface-sunken px-3 py-2 text-xs text-ink-secondary">
          {isImmediate
            ? 'This field is self-serviceable, so the change applies as soon as you submit.'
            : 'This field needs HR approval; you will be notified of the outcome.'}
        </p>
      </DialogBody>

      <DialogFooter>
        <Button variant="secondary" onClick={onDone}>Cancel</Button>
        <Button
          onClick={() => submit.mutate()}
          loading={submit.isPending}
          disabled={!fieldPath || requestedValue.trim().length === 0}
        >
          Submit
        </Button>
      </DialogFooter>
    </>
  );
}

// ── emergency rail ────────────────────────────────────────────────────

function EmergencyRail({ data }: { data: any }) {
  const contacts = data.emergencyContacts ?? [];

  return (
    // Sticky, because the tabbed detail beside it is several screens long and
    // an emergency contact is no use once it has scrolled away.
    <div className="space-y-4 xl:sticky xl:top-4">
      <Card>
        <CardHeader>
          <CardTitle>Emergency contact</CardTitle>
          <p className="mt-0.5 text-xs text-ink-muted">Always visible, by design.</p>
        </CardHeader>
        {contacts.length === 0 ? (
          <EmptyState
            tone="warning"
            icon={AlertTriangle}
            title="No emergency contact"
            description="This is the one field nobody should be missing."
          />
        ) : (
          <CardContent className="space-y-4">
            {contacts.map((contact: any) => (
              <div key={contact.id} className="space-y-2">
                <div>
                  <p className="text-sm font-medium text-ink">{contact.name}</p>
                  <p className="text-xs text-ink-muted">{contact.relation}</p>
                </div>
                <a
                  href={`tel:${contact.phone}`}
                  className="flex items-center gap-2 rounded-lg bg-surface-sunken px-2.5 py-2 text-sm
                             font-medium text-ink transition-colors hover:bg-brand-subtle hover:text-brand"
                >
                  <Phone className="size-3.5 shrink-0" aria-hidden />
                  <span className="tabular">{contact.phone}</span>
                </a>
                {contact.email ? (
                  <p className="flex items-center gap-2 text-xs text-ink-secondary">
                    <Mail className="size-3.5 shrink-0 text-ink-muted" aria-hidden />
                    <span className="truncate">{contact.email}</span>
                  </p>
                ) : null}
                {contact.address ? (
                  <p className="flex items-start gap-2 text-xs text-ink-secondary">
                    <MapPin className="mt-0.5 size-3.5 shrink-0 text-ink-muted" aria-hidden />
                    {contact.address}
                  </p>
                ) : null}
              </div>
            ))}
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reporting line</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2.5">
          {[
            { label: 'Line manager', person: data.lineManager },
            { label: 'Dotted manager 1', person: data.dottedManager1 },
            { label: 'Dotted manager 2', person: data.dottedManager2 },
            { label: 'Head of department', person: data.headOfDepartment },
          ]
            .filter((entry) => entry.person)
            .map((entry) => (
              <div key={entry.label}>
                <p className="text-2xs font-medium uppercase tracking-wide text-ink-muted">
                  {entry.label}
                </p>
                <Link
                  href={`/profile/${entry.person.id}`}
                  className="mt-1 flex items-center gap-2 hover:text-brand"
                >
                  <Avatar
                    name={`${entry.person.firstName} ${entry.person.lastName}`}
                    size="xs"
                  />
                  <span className="truncate text-sm text-ink">
                    {entry.person.firstName} {entry.person.lastName}
                  </span>
                </Link>
              </div>
            ))}
          {!data.lineManager && !data.headOfDepartment ? (
            <p className="text-xs text-ink-muted">
              No reporting line configured — approvals cannot be routed until HR sets one.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
