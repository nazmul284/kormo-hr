'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useMemo } from 'react';

import { api, ApiError } from './api';
import type { SessionUser } from './types';

interface SessionContextValue {
  user: SessionUser | null;
  isLoading: boolean;
  error: ApiError | null;
  /** UI hint only — the API re-authorises every request. */
  can: (...permissions: string[]) => boolean;
  canAll: (...permissions: string[]) => boolean;
  hasFeature: (flag: string) => boolean;
  hasRole: (...roles: string[]) => boolean;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({
  children,
  initialUser,
}: {
  children: React.ReactNode;
  initialUser?: SessionUser | null;
}) {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['session'],
    queryFn: () => api.get<SessionUser>('/auth/me'),
    initialData: initialUser ?? undefined,
    // The identity blob rarely changes mid-session; refetch on focus so a
    // permission change lands without a reload.
    staleTime: 60_000,
    retry: (count, err) => !(err instanceof ApiError && err.isAuthError) && count < 2,
  });

  const permissionSet = useMemo(
    () => new Set(data?.permissions ?? []),
    [data?.permissions],
  );

  const can = useCallback(
    (...permissions: string[]) =>
      permissions.length === 0 || permissions.some((p) => permissionSet.has(p)),
    [permissionSet],
  );

  const canAll = useCallback(
    (...permissions: string[]) => permissions.every((p) => permissionSet.has(p)),
    [permissionSet],
  );

  const hasFeature = useCallback(
    (flag: string) => data?.features?.[flag] === true,
    [data?.features],
  );

  const hasRole = useCallback(
    (...roles: string[]) => roles.some((role) => data?.roles?.includes(role)),
    [data?.roles],
  );

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['session'] });
  }, [queryClient]);

  const value = useMemo<SessionContextValue>(
    () => ({
      user: data ?? null,
      isLoading,
      error: error instanceof ApiError ? error : null,
      can,
      canAll,
      hasFeature,
      hasRole,
      refresh,
    }),
    [data, isLoading, error, can, canAll, hasFeature, hasRole, refresh],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used inside a SessionProvider.');
  }
  return context;
}

/** Convenience for the common "is this me?" check. */
export function useIsSelf(employeeId: number | string | null | undefined): boolean {
  const { user } = useSession();
  if (!user || employeeId === null || employeeId === undefined) return false;
  return Number(employeeId) === user.id;
}
