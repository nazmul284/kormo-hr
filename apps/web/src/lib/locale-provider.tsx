'use client';

import { useSession } from './session';
import { setActiveLocale } from './locale';

/**
 * Publishes the signed-in tenant's formatting settings.
 *
 * Deliberately sets them during render rather than in an effect: an
 * effect runs *after* the first paint, so every figure on the dashboard
 * would render once in the fallback currency and then swap. Doing it
 * here is a synchronous module write with no subscription, which React
 * tolerates because nothing re-renders as a result — the session query
 * settling is what triggers the re-render, and by then the value is
 * already in place.
 */
export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const { user } = useSession();
  setActiveLocale(user?.locale);
  return <>{children}</>;
}
