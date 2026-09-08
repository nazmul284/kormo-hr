'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Building2, ChevronDown, Headset, KeyRound, LogOut, Menu, Search, UserCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import type { EmployeeSummary, Paginated } from '@/lib/types';
import { NotificationBell } from './notification-bell';
import { ThemeToggle } from './theme-toggle';

export function Topbar({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const { user } = useSession();
  const router = useRouter();

  const logout = useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSettled: () => {
      // Full reload so every cached query and the session context are gone.
      window.location.href = '/login';
    },
  });

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-line
                       bg-surface/95 px-3 backdrop-blur sm:px-4">
      <button
        type="button"
        onClick={onOpenMobileNav}
        className="rounded-lg p-2 text-ink-secondary transition-colors hover:bg-surface-sunken lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="size-4" />
      </button>

      <EmployeeSearch />

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <div className="hidden sm:block">
          <ThemeToggle />
        </div>

        <Link
          href="/helpdesk"
          className="rounded-lg p-2 text-ink-secondary transition-colors hover:bg-surface-sunken hover:text-ink"
          title="Help desk"
        >
          <Headset className="size-4" aria-hidden />
          <span className="sr-only">Help desk</span>
        </Link>

        <NotificationBell />

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-1.5 transition-colors
                         hover:bg-surface-sunken"
            >
              <Avatar name={user?.fullName} src={user?.avatarUrl} size="sm" />
              <span className="hidden min-w-0 text-left sm:block">
                <span className="block truncate text-xs font-medium leading-tight text-ink">
                  {user?.firstName ?? '—'}
                </span>
                <span className="block truncate text-2xs leading-tight text-ink-muted">
                  {user?.designation ?? ''}
                </span>
              </span>
              <ChevronDown className="size-3.5 shrink-0 text-ink-muted" aria-hidden />
            </button>
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={8}
              className="z-50 w-64 overflow-hidden rounded-card border border-line bg-surface
                         py-1 shadow-pop data-[state=open]:animate-in data-[state=open]:fade-in-0
                         data-[state=open]:zoom-in-95"
            >
              <div className="border-b border-line px-3 py-2.5">
                <p className="truncate text-sm font-medium text-ink">{user?.fullName}</p>
                <p className="truncate text-xs text-ink-secondary">{user?.officialEmail ?? user?.email}</p>
                <p className="mt-1 flex items-center gap-1 text-2xs text-ink-muted">
                  <Building2 className="size-3" aria-hidden />
                  <span className="truncate">{user?.company.name}</span>
                </p>
                {user?.lastLoginAt ? (
                  <p className="mt-1.5 text-2xs text-ink-muted">
                    Employee ID {user.employeeVisibleId} · {user.roles.join(', ')}
                  </p>
                ) : null}
              </div>

              <DropdownMenu.Item asChild>
                <Link
                  href="/profile"
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-ink-secondary
                             outline-none transition-colors data-[highlighted]:bg-surface-sunken
                             data-[highlighted]:text-ink"
                >
                  <UserCircle className="size-4" aria-hidden />
                  My profile
                </Link>
              </DropdownMenu.Item>

              <DropdownMenu.Item asChild>
                <Link
                  href="/profile/security"
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-ink-secondary
                             outline-none transition-colors data-[highlighted]:bg-surface-sunken
                             data-[highlighted]:text-ink"
                >
                  <KeyRound className="size-4" aria-hidden />
                  Change password
                </Link>
              </DropdownMenu.Item>

              <div className="my-1 h-px bg-line sm:hidden" />
              <div className="px-3 py-2 sm:hidden">
                <ThemeToggle />
              </div>

              <div className="my-1 h-px bg-line" />

              <DropdownMenu.Item
                onSelect={() => logout.mutate()}
                className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-critical-ink
                           outline-none transition-colors data-[highlighted]:bg-critical-subtle"
              >
                <LogOut className="size-4" aria-hidden />
                Sign out
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </header>
  );
}

/** Typeahead over the co-worker directory. */
function EmployeeSearch() {
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounced so typing does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term.trim()), 250);
    return () => clearTimeout(timer);
  }, [term]);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: ['directory', 'search', debounced],
    queryFn: () =>
      api.get<Paginated<EmployeeSummary>>('/employees/directory', {
        search: debounced,
        pageSize: 6,
      }),
    enabled: debounced.length >= 2,
  });

  return (
    <div ref={boxRef} className="relative w-full max-w-xs">
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-muted"
        aria-hidden
      />
      <input
        type="search"
        value={term}
        onChange={(event) => {
          setTerm(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search co-workers…"
        aria-label="Search co-workers"
        className="h-9 w-full rounded-lg border border-line bg-surface-sunken pl-8 pr-3 text-sm
                   text-ink placeholder:text-ink-muted focus:border-brand focus:bg-surface
                   focus:outline-none focus:ring-2 focus:ring-brand/20"
      />

      {open && debounced.length >= 2 ? (
        <div className="absolute left-0 top-full z-40 mt-1.5 w-[min(22rem,90vw)] overflow-hidden
                        rounded-card border border-line bg-surface shadow-pop">
          {isFetching && !data ? (
            <p className="px-3 py-4 text-xs text-ink-muted">Searching…</p>
          ) : (data?.data.length ?? 0) === 0 ? (
            <p className="px-3 py-4 text-xs text-ink-muted">
              No co-worker matches “{debounced}”.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {data!.data.map((employee) => (
                <li key={employee.id}>
                  <Link
                    href={`/profile/${employee.id}`}
                    onClick={() => {
                      setOpen(false);
                      setTerm('');
                    }}
                    className="flex items-center gap-2.5 px-3 py-2.5 transition-colors hover:bg-surface-sunken"
                  >
                    <Avatar name={employee.fullName} initials={employee.initials} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">
                        {employee.fullName}
                      </span>
                      <span className="block truncate text-2xs text-ink-muted">
                        {employee.designation?.name ?? '—'}
                        {employee.department ? ` · ${employee.department.name}` : ''}
                      </span>
                    </span>
                    <span className="shrink-0 text-2xs text-ink-muted tabular">
                      #{employee.employeeVisibleId}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
