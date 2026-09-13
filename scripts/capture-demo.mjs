#!/usr/bin/env node
/**
 * Records the fixture bundle that drives the static GitHub Pages demo.
 *
 * Signs into a *running local stack* as each demo role, walks every route
 * in a real browser, and writes out the JSON of every `/api/*` response
 * the app actually asked for. The output is committed, so the published
 * demo is a recording of a real backend rather than a mock somebody wrote
 * by hand and forgot to update.
 *
 * Driving a real browser rather than curl-ing a list of endpoints is the
 * point: the app is the only thing that knows which endpoints it calls,
 * with which query parameters, in which order. A hand-maintained list
 * goes stale the first time a page adds a filter.
 *
 * Prerequisites: `npm run dev` (or `npm start`) with a seeded database.
 *
 * Usage:
 *   node scripts/capture-demo.mjs
 *   node scripts/capture-demo.mjs --roles md,employee --base http://localhost:3000
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const CHROME =
  process.env.CHROME_PATH ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const BASE = arg('base', 'http://localhost:3000');
const PASSWORD = arg('password', 'Kormo@123');
const OUT = resolve(arg('out', 'apps/web/public/demo-data'));

/**
 * Roles to record, and the routes worth recording for each.
 *
 * Not every role gets every route: a plain employee has no approval inbox
 * and no payroll register, and recording the 403 they get would only bulk
 * out the bundle with error pages. Each list is what that role's sidebar
 * actually offers them.
 */
const SELF_SERVICE = [
  '/dashboard', '/profile', '/profile/security', '/directory', '/org-chart',
  '/attendance', '/leave', '/holidays', '/tax', '/performance',
  // Payroll is self-service too: everyone can see their own payslips, even
  // though only payroll and above see the runs and the register. Leaving it
  // out of this list left three roles with a Payroll page and no payslips.
  '/payroll',
  '/space-booking', '/food', '/helpdesk',
  '/company', '/company/notices', '/company/policies',
];

const MANAGER_EXTRA = [
  '/attendance/approvals', '/attendance/shift-calendar', '/attendance/overtime',
  '/attendance/compensation', '/leave/approval', '/leave/report', '/leave/colleagues',
  '/performance/team', '/performance/job-confirmation',
];

const ADMIN_EXTRA = [
  '/reports', '/onboarding',
  '/resignation', '/resignation/approvals', '/resignation/clearance',
  '/company/change-requests',
];

const FIELD_EXTRA = ['/field-force/visits', '/field-force/tracking'];

const ROLE_ROUTES = {
  md: [...SELF_SERVICE, ...MANAGER_EXTRA, ...ADMIN_EXTRA, ...FIELD_EXTRA],
  hr: [...SELF_SERVICE, ...MANAGER_EXTRA, ...ADMIN_EXTRA],
  manager: [...SELF_SERVICE, ...MANAGER_EXTRA],
  payroll: [...SELF_SERVICE, '/reports'],
  field: [...SELF_SERVICE, ...FIELD_EXTRA],
  employee: SELF_SERVICE,
};

/** Sign-in username per recorded role. */
const ROLE_USERNAME = {
  md: 'md',
  hr: 'hr.admin',
  manager: 'manager',
  payroll: 'payroll',
  field: 'field',
  employee: 'employee',
};

const ROLES = arg('roles', Object.keys(ROLE_ROUTES).join(','))
  .split(',').map((r) => r.trim()).filter(Boolean);

/** Mirrors `fixtureKey` in apps/web/src/lib/demo.ts. */
function fixtureKey(pathname, search) {
  const params = new URLSearchParams(search ?? '');
  params.delete('_');
  const sorted = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  const query = sorted.map(([k, v]) => `${k}=${v}`).join('&');
  return query ? `${pathname}?${query}` : pathname;
}

/** Mirrors `fixtureFile` in apps/web/src/lib/demo.ts. */
function fixtureFile(key) {
  return (
    key
      .replace(/^\//, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 180) || 'root'
  );
}

async function waitForSettled(page) {
  /*
   * Wait for the data, not for a fixed delay. A sleep would happily
   * record a page of loading skeletons, producing a bundle whose fixtures
   * are the *absence* of the responses we came for.
   */
  for (let attempt = 0; attempt < 80; attempt++) {
    const state = await page.evaluate(() => ({
      skeletons: document.querySelectorAll('.skeleton').length,
      hasHeading: Boolean(document.querySelector('h1')),
    }));
    if (state.skeletons === 0 && state.hasHeading) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function captureRole(browser, role) {
  const username = ROLE_USERNAME[role];
  const routes = ROLE_ROUTES[role];
  const dir = join(OUT, role);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  /*
   * A fresh, isolated browser context per role.
   *
   * Sharing one context carries the previous role's auth cookie forward,
   * so `/login` immediately redirects to the dashboard and the sign-in
   * form never appears — every role after the first then times out
   * waiting for a field that is not on the page.
   */
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1440, height: 960 });

  /** key → parsed JSON body. */
  const captured = new Map();
  /** path → the first key seen for it, for query fallback. */
  const byPath = {};

  page.on('response', async (response) => {
    const request = response.request();
    if (request.method() !== 'GET') return;
    if (!response.ok()) return;

    const url = new URL(response.url());
    if (url.origin !== new URL(BASE).origin) return;
    if (!url.pathname.startsWith('/api/')) return;

    // `/api/auth/refresh` and friends are POSTs; anything left is a read.
    const apiPath = url.pathname.replace(/^\/api/, '');
    const key = fixtureKey(apiPath, url.search);
    if (captured.has(key)) return;

    try {
      const body = await response.json();
      captured.set(key, body);
      if (!byPath[apiPath]) byPath[apiPath] = key;
    } catch {
      // Not JSON (a file download, an XLSX export). The demo cannot serve
      // those anyway, so skipping is the right answer rather than an error.
    }
  });

  // ── sign in ─────────────────────────────────────────────────────────
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2', timeout: 60_000 });
  await page.waitForSelector('#identifier', { timeout: 60_000 });
  // Typing before hydration lands in the DOM but never reaches React
  // state, leaving the submit button disabled and the form apparently
  // filled — wait for the fibre to exist first.
  await page.waitForFunction(
    () => {
      const field = document.querySelector('#identifier');
      return !!field && Object.keys(field).some((k) => k.startsWith('__react'));
    },
    { timeout: 60_000, polling: 100 },
  );
  await page.type('#identifier', username);
  await page.type('#password', PASSWORD);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60_000 }),
    page.click('button[type="submit"]'),
  ]);

  if (new URL(page.url()).pathname === '/login') {
    throw new Error(`sign-in failed for "${username}"`);
  }

  // ── walk the routes ─────────────────────────────────────────────────
  let stuck = 0;
  for (const route of routes) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle2', timeout: 60_000 });
    const settled = await waitForSettled(page);
    if (!settled) stuck += 1;
    // Let deferred queries (charts, lazy tabs) fire before moving on.
    await new Promise((r) => setTimeout(r, 600));
  }

  /*
   * The month arrows on the attendance, payroll and leave grids are the
   * most-used control in the demo, so the two months either side of the
   * seeded "today" are recorded explicitly rather than left to the
   * path-level fallback.
   */
  const now = new Date();
  for (let back = 1; back <= 2; back++) {
    const when = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    const qs = `month=${when.getUTCMonth() + 1}&year=${when.getUTCFullYear()}`;
    for (const route of ['/attendance', '/leave/report'].filter((r) => routes.includes(r))) {
      await page.goto(`${BASE}${route}?${qs}`, { waitUntil: 'networkidle2', timeout: 60_000 });
      await waitForSettled(page);
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  /*
   * ── Second pass: endpoints the route walk cannot reach ─────────────
   *
   * Walking routes captures what each page loads on arrival. It does not
   * capture what sits behind a tab nobody clicked, or the detail
   * endpoints for a colleague nobody opened — and those are exactly the
   * things a visitor clicks first. Clicking every tab in the browser
   * would be slow and brittle (a renamed label silently stops capturing),
   * so these are fetched directly from the authenticated page instead.
   * The response listener above records them the same way.
   */
  await prefetch(page, captured, byPath, routes);
  const gaps = await ensureEssentials(page, captured);

  await page.close();
  await context.close();

  // ── write the bundle ────────────────────────────────────────────────
  let bytes = 0;
  for (const [key, body] of captured) {
    const json = JSON.stringify(body);
    bytes += json.length;
    await writeFile(join(dir, `${fixtureFile(key)}.json`), json);
  }

  await writeFile(
    join(dir, 'manifest.json'),
    JSON.stringify(
      {
        role,
        username,
        capturedAt: new Date().toISOString(),
        routes,
        keys: [...captured.keys()].sort(),
        byPath,
      },
      null,
      2,
    ),
  );

  return { role, files: captured.size, kb: Math.round(bytes / 1024), stuck, gaps };
}

/**
 * Endpoints without which a role's bundle is not usable at all.
 *
 * The route walk usually picks these up on its own, but "usually" turned
 * out to matter: the browser serves a repeat request from its own cache,
 * puppeteer cannot then read the body, and the fixture is silently
 * missing. A role whose `/auth/me` did not record renders the app shell
 * signed-out and every page after it as an error — so these are fetched
 * explicitly and their absence fails the run rather than shipping.
 */
const ESSENTIAL = [
  '/auth/me',
  '/dashboard',
  '/notifications/unread-count',
  '/leave/balances',
  '/tenancy/departments',
  '/employees/directory?page=1&pageSize=48',
];

async function ensureEssentials(page, captured) {
  const missing = [];
  for (const path of ESSENTIAL) {
    const [pathname, search] = path.split('?');
    const key = fixtureKey(pathname, search);
    if (captured.has(key)) continue;
    await pull(page, path);
    if (!(await waitForKey(captured, key))) missing.push(key);
  }
  return missing;
}

/** Fetches a path from inside the authenticated page, ignoring failures. */
async function pull(page, path) {
  await page.evaluate(async (p) => {
    try {
      // `cache: 'no-store'` on purpose: a response the browser serves from
      // its own cache never reaches the network layer, so puppeteer cannot
      // read its body and the fixture goes missing without a word.
      await fetch(p, { credentials: 'include', cache: 'no-store' });
    } catch {
      // A 403 for a role without the permission is a legitimate answer,
      // not an error worth failing the capture over.
    }
  }, `/api${path}`);
}

/**
 * Waits for the response listener to finish recording a key.
 *
 * `pull` resolves when the in-page `fetch` settles, but the listener
 * parses the body in its own async handler — so reading the map straight
 * after a pull can miss a response that is a millisecond away.
 */
async function waitForKey(captured, key, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (!captured.has(key) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50));
  }
  return captured.has(key);
}

/** Reads a captured body back out, for chaining one fetch off another. */
function captureOf(captured, byPath, apiPath) {
  const key = byPath[apiPath];
  return key ? captured.get(key) : undefined;
}

async function prefetch(page, captured, byPath, routes) {
  const has = (route) => routes.includes(route);
  const now = new Date();
  const month = now.getUTCMonth() + 1;
  const year = now.getUTCFullYear();

  // Tab-gated lists. Each is the second or third tab of a page whose
  // first tab the walk already captured.
  const queues = [
    '/attendance/overtime/queue?pageSize=50&status=PENDING',
    '/attendance/compensation/queue?pageSize=50&status=PENDING',
    '/leave/approvals/archive?pageSize=25',
    '/employees/change-requests/mine',
    '/notifications?page=1&pageSize=20',
    '/helpdesk?pageSize=50&scope=all',
    `/field-force/customers?page=1&pageSize=50`,
    `/attendance/roster?month=${month}&year=${year}&subordinates=true`,
  ];
  for (const path of queues) await pull(page, path);

  // Tax: the statement only loads once the fiscal-year list has resolved,
  // which is a second wave the walk's settle check can outrun.
  const fiscalYears = captureOf(captured, byPath, '/tax/fiscal-years');
  const fy = fiscalYears?.current;
  if (fy && has('/tax')) {
    for (const path of [
      `/tax/statement?fiscalYear=${fy}`,
      `/tax/payments?fiscalYear=${fy}`,
      `/tax/configuration?fiscalYear=${fy}`,
      `/tax/company-summary?fiscalYear=${fy}`,
    ]) await pull(page, path);
  }

  // Payroll: runs, the cost trend, and the first few payslips in detail —
  // opening a payslip is the first thing anyone does on that page.
  if (has('/payroll')) {
    await pull(page, '/payroll/runs?pageSize=25');
    await pull(page, '/payroll/cost-trend');
    const payslips = captureOf(captured, byPath, '/payroll/payslips');
    const items = payslips?.items ?? payslips?.data ?? [];
    for (const slip of items.slice(0, 8)) await pull(page, `/payroll/payslips/${slip.id}`);
  }

  if (has('/reports')) await pull(page, '/reports/types');

  /*
   * Colleague profiles — every one of them, on every page.
   *
   * The directory is the most-clicked page in the demo and every card
   * opens a profile. Two things went wrong here before, and both are
   * worth stating because both looked fine until someone clicked:
   *
   *   1. Capturing only a screenful meant the pre-rendered route did not
   *      exist for anyone further down.
   *   2. Asking for one huge page (`pageSize=500`) exceeded the API's own
   *      validation cap, so the request 400'd and was never recorded at
   *      all — leaving the second page of the directory empty.
   *
   * So: walk the pages at the size the UI itself uses, and take the page
   * count from the server rather than assuming one.
   */
  const DIRECTORY_PAGE_SIZE = 48; // what the directory page itself requests
  const people = [];
  const firstPage = captureOf(captured, byPath, '/employees/directory');
  const totalPages = firstPage?.meta?.totalPages ?? 1;

  for (let pageNo = 1; pageNo <= totalPages; pageNo++) {
    const query = `page=${pageNo}&pageSize=${DIRECTORY_PAGE_SIZE}`;
    const key = fixtureKey('/employees/directory', query);
    if (!captured.has(key)) {
      await pull(page, `/employees/directory?${query}`);
      // The response listener parses the body asynchronously, so the
      // entry is not in the map the instant `pull` resolves.
      await waitForKey(captured, key);
    }
    const body = captured.get(key);
    people.push(...(body?.items ?? body?.data ?? []));
  }
  for (const person of people) {
    for (const suffix of [
      '',
      '/personal-details',
      '/education-experience',
      '/nominees',
      '/documents',
      '/compensation',
      '/hierarchy?generateUpperTree=true&maxLevel=3',
    ]) {
      await pull(page, `/employees/${person.id}${suffix}`);
    }
  }

  // Give the in-flight fetches a moment to land before the page closes.
  await new Promise((r) => setTimeout(r, 2500));
}

// ── run ───────────────────────────────────────────────────────────────
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const summary = [];
let failed = false;

/**
 * A role's bundle is only useful if it is complete, so the script exits
 * non-zero on any failure. An earlier version reported six failed roles
 * and still exited 0 — which, wired into a deploy, publishes a demo of
 * empty screens and tells nobody.
 */
for (const role of ROLES) {
  if (!ROLE_ROUTES[role]) {
    console.error(`✗ unknown role "${role}" — known: ${Object.keys(ROLE_ROUTES).join(', ')}`);
    failed = true;
    continue;
  }
  try {
    const result = await captureRole(browser, role);
    summary.push(result);
    const warn = result.stuck > 0 ? `  ⚠ ${result.stuck} route(s) never finished loading` : '';
    const broken = result.gaps.length > 0;
    console.log(
      `${broken ? '✗' : '✓'} ${role.padEnd(9)} ${String(result.files).padStart(4)} fixtures`
      + `  ${String(result.kb).padStart(5)} KB${warn}`,
    );
    if (broken) console.error(`    missing essential endpoints: ${result.gaps.join(', ')}`);
    if (result.stuck > 0 || broken) failed = true;
  } catch (error) {
    console.error(`✗ ${role}: ${error.message}`);
    failed = true;
  }
}

await browser.close();

const totalKb = summary.reduce((sum, r) => sum + r.kb, 0);
console.log(`\n  ${summary.length} roles · ${summary.reduce((s, r) => s + r.files, 0)} fixtures · ${totalKb} KB total`);
console.log(`  written to ${OUT}`);

process.exit(failed ? 1 : 0);
