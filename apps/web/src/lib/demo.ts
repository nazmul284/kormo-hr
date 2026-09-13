/**
 * Read-only demo mode.
 *
 * Enabled by `NEXT_PUBLIC_DEMO_MODE=1` at build time, which is how the
 * GitHub Pages deployment is produced. There is no API in that build —
 * `next build` runs with `output: 'export'` and the result is a folder of
 * static files — so every request is answered from a bundle of JSON
 * fixtures captured from a real, seeded backend.
 *
 * Why fixtures rather than a mock layer written by hand: a hand-written
 * mock drifts from the API the moment either changes, and the drift is
 * invisible until someone reports that the demo shows something the
 * product does not. These files are recorded from the real server by
 * `scripts/capture-demo.mjs` driving a real browser through every route,
 * so what the demo shows is by construction what the product returned.
 */

export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === '1';

/** Where the fixture bundle sits, honouring a GitHub Pages sub-path. */
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const DEMO_ROOT = `${BASE_PATH}/demo-data`;

const ROLE_STORAGE_KEY = 'kormo-demo-role';
export const DEFAULT_DEMO_ROLE = 'md';

/**
 * What a demo visitor is told when they try to change something.
 *
 * Surfaced as an ordinary 403 `ApiError` (see `demoFetch` in api.ts) so
 * the thirty-odd pages that already render a failed mutation's message
 * need no demo-specific branch — they show this sentence in the place
 * they would have shown the server's refusal.
 */
export const DEMO_READ_ONLY_MESSAGE =
  'This is a read-only demo, so approvals and edits are disabled. '
  + 'Clone the repository and run it locally to try the write paths.';

export function currentDemoRole(): string {
  if (typeof window === 'undefined') return DEFAULT_DEMO_ROLE;
  try {
    return window.localStorage.getItem(ROLE_STORAGE_KEY) || DEFAULT_DEMO_ROLE;
  } catch {
    // Storage blocked (private window, embedded frame). The default role
    // still produces a complete demo, so this is not worth surfacing.
    return DEFAULT_DEMO_ROLE;
  }
}

export function setDemoRole(role: string): void {
  try {
    window.localStorage.setItem(ROLE_STORAGE_KEY, role);
  } catch {
    // Same as above — the session just will not survive a reload.
  }
}

/**
 * Stable key for a request, matching what the capture script writes.
 *
 * Query parameters are sorted so `?month=9&year=2026` and
 * `?year=2026&month=9` resolve to the same fixture — the app builds these
 * strings in several places and the order is not guaranteed.
 */
export function fixtureKey(path: string, query?: string): string {
  const [rawPath, inlineQuery] = path.split('?');
  const params = new URLSearchParams(inlineQuery ?? '');
  for (const [k, v] of new URLSearchParams((query ?? '').replace(/^\?/, ''))) {
    params.set(k, v);
  }
  params.delete('_');
  const sorted = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  const search = sorted.map(([k, v]) => `${k}=${v}`).join('&');
  return search ? `${rawPath}?${search}` : rawPath;
}

/** Filesystem-safe name for a key. Mirrors `slugForKey` in the capture script. */
export function fixtureFile(key: string): string {
  return (
    key
      .replace(/^\//, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 180) || 'root'
  );
}

interface DemoManifest {
  role: string;
  capturedAt: string;
  /** Every key the capture saw, so a miss can be diagnosed. */
  keys: string[];
  /**
   * Path → the key captured for it, for requests whose query the capture
   * never saw (a month the visitor paged to, say). Falling back to a
   * neighbouring month is far better than an empty screen.
   */
  byPath: Record<string, string>;
}

const manifestCache = new Map<string, Promise<DemoManifest | null>>();
const payloadCache = new Map<string, Promise<unknown>>();

async function loadManifest(role: string): Promise<DemoManifest | null> {
  let pending = manifestCache.get(role);
  if (!pending) {
    pending = fetch(`${DEMO_ROOT}/${role}/manifest.json`)
      .then((r) => (r.ok ? (r.json() as Promise<DemoManifest>) : null))
      .catch(() => null);
    manifestCache.set(role, pending);
  }
  return pending;
}

async function loadPayload(role: string, file: string): Promise<unknown> {
  const cacheKey = `${role}/${file}`;
  let pending = payloadCache.get(cacheKey);
  if (!pending) {
    pending = fetch(`${DEMO_ROOT}/${role}/${file}.json`)
      .then((r) => (r.ok ? r.json() : undefined))
      .catch(() => undefined);
    payloadCache.set(cacheKey, pending);
  }
  return pending;
}

/**
 * Resolves a request against the fixture bundle.
 *
 * Three attempts, in order of fidelity:
 *   1. the exact path + query that was captured;
 *   2. the same path with whatever query the capture did see — this is
 *      what makes the month arrows on the attendance grid keep working
 *      instead of emptying the page;
 *   3. `undefined`, which the caller turns into an empty result.
 */
export async function resolveDemoResponse(
  path: string,
  query?: string,
): Promise<{ hit: boolean; data: unknown }> {
  const role = currentDemoRole();
  const key = fixtureKey(path, query);

  const exact = await loadPayload(role, fixtureFile(key));
  if (exact !== undefined) return { hit: true, data: exact };

  const manifest = await loadManifest(role);
  const fallbackKey = manifest?.byPath?.[key.split('?')[0]];
  if (fallbackKey) {
    const near = await loadPayload(role, fixtureFile(fallbackKey));
    if (near !== undefined) return { hit: true, data: near };
  }

  return { hit: false, data: undefined };
}

/**
 * A shape that will not crash a component expecting a list or an object.
 *
 * The pages are written against real API responses, so handing one
 * `undefined` throws inside a `.map()`. An empty paginated envelope
 * satisfies both the list and the object readers, and the pages already
 * render a proper empty state for it.
 */
export function emptyDemoResponse(): unknown {
  return { items: [], data: [], rows: [], total: 0, page: 1, pageSize: 0, meta: { total: 0 } };
}
