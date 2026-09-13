/**
 * API client.
 *
 * Requests go to `/api` on this app's own origin (Next rewrites them to
 * the backend), so the auth cookies are first-party and no CORS
 * preflight is ever issued.
 *
 * A 401 triggers exactly one refresh attempt, and concurrent 401s share
 * that single attempt — otherwise a dashboard firing eight parallel
 * requests would kick off eight competing token rotations and the
 * reuse-detection would revoke the whole session.
 */

import {
  DEMO_MODE,
  DEMO_READ_ONLY_MESSAGE,
  emptyDemoResponse,
  resolveDemoResponse,
} from './demo';

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isAuthError(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

/** Drops empty values so `?month=&year=` never reaches the server. */
export function buildQuery(params?: Query): string {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

let refreshPromise: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  // Coalesce: every caller awaits the same in-flight rotation.
  refreshPromise ??= (async () => {
    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      // Cleared on the next tick so a burst of 401s all see this promise.
      setTimeout(() => { refreshPromise = null; }, 0);
    }
  })();
  return refreshPromise;
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  query?: Query;
  /** Internal: prevents an infinite refresh loop. */
  _retried?: boolean;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, query, _retried, headers, ...rest } = options;

  // In the static demo build there is no server to talk to. See lib/demo.ts.
  if (DEMO_MODE) return demoFetch<T>(path, options);

  const response = await fetch(`${API_BASE}${path}${buildQuery(query)}`, {
    ...rest,
    credentials: 'include',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (response.status === 401 && !_retried && !path.startsWith('/auth/')) {
    const refreshed = await refreshSession();
    if (refreshed) {
      return apiFetch<T>(path, { ...options, _retried: true });
    }
  }

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    let details: unknown;
    let requestId: string | undefined;
    try {
      const payload = await response.json();
      details = payload;
      requestId = payload?.requestId;
      const raw = payload?.message;
      // class-validator returns an array of messages.
      message = Array.isArray(raw) ? raw.join(' ') : (raw ?? message);
    } catch {
      // Non-JSON error body (a proxy failure, say) — keep the generic text.
    }
    throw new ApiError(response.status, message, details, requestId);
  }

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return (await response.text()) as unknown as T;
  }
  return response.json() as Promise<T>;
}

/**
 * Answers a request from the recorded fixture bundle.
 *
 * Writes are refused rather than faked. A demo that appears to approve a
 * leave request and then forgets it on reload is worse than one that says
 * plainly it cannot — the visitor is left unsure whether they hit a bug.
 */
async function demoFetch<T>(path: string, options: RequestOptions): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();

  if (method !== 'GET') {
    // Signing out is the one state change that works: it only clears the
    // locally-stored role, which is all a demo session is.
    if (path === '/auth/logout') return undefined as T;
    throw new ApiError(403, DEMO_READ_ONLY_MESSAGE);
  }

  const search = buildQuery(options.query);
  const { hit, data } = await resolveDemoResponse(path, search);

  if (!hit) {
    // An unrecorded endpoint renders as an empty state rather than an
    // error banner. The route still works; it just has nothing to show.
    if (path.startsWith('/auth/')) {
      throw new ApiError(401, 'Not signed in to the demo.');
    }
    return emptyDemoResponse() as T;
  }

  return data as T;
}

export const api = {
  get: <T>(path: string, query?: Query) => apiFetch<T>(path, { method: 'GET', query }),
  post: <T>(path: string, body?: unknown, query?: Query) =>
    apiFetch<T>(path, { method: 'POST', body, query }),
  patch: <T>(path: string, body?: unknown, query?: Query) =>
    apiFetch<T>(path, { method: 'PATCH', body, query }),
  put: <T>(path: string, body?: unknown, query?: Query) =>
    apiFetch<T>(path, { method: 'PUT', body, query }),
  delete: <T>(path: string, query?: Query) => apiFetch<T>(path, { method: 'DELETE', query }),
};
