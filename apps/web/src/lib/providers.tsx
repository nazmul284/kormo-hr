'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { Toaster } from 'sonner';

import { ApiError } from './api';
import { SessionProvider } from './session';
import type { SessionUser } from './types';

export function Providers({
  children,
  initialUser,
}: {
  children: React.ReactNode;
  initialUser?: SessionUser | null;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: false,
            // Never retry an auth or authorisation failure — the answer
            // will not change, and retrying masks the real problem.
            retry: (count, error) => {
              if (error instanceof ApiError) {
                if (error.isAuthError || error.isForbidden || error.isNotFound) return false;
                if (error.status >= 400 && error.status < 500) return false;
              }
              return count < 2;
            },
          },
          mutations: { retry: false },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider initialUser={initialUser}>
        {children}
        <Toaster
          position="top-right"
          closeButton
          toastOptions={{
            classNames: {
              toast: 'card !shadow-raised',
              title: '!text-ink !font-medium',
              description: '!text-ink-secondary',
            },
          }}
        />
      </SessionProvider>
    </QueryClientProvider>
  );
}
