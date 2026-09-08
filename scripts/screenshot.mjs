#!/usr/bin/env node
/**
 * Visual verification harness.
 *
 * Drives the real app in the system Chrome: signs in as a chosen demo
 * account, walks a list of routes, and writes a full-page screenshot of
 * each. Console errors and failed requests are collected per route so a
 * silently broken page cannot pass as "it rendered".
 *
 * Usage:
 *   node scripts/screenshot.mjs --user manager --out ./shots \
 *     --routes /dashboard,/attendance,/leave
 *   node scripts/screenshot.mjs --user employee --theme dark
 */
import { mkdir, writeFile } from 'node:fs/promises';
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
const USER = arg('user', 'manager');
const PASSWORD = arg('password', 'Kormo@123');
const OUT = resolve(arg('out', './.screenshots'));
const THEME = arg('theme', 'light');
const WIDTH = Number(arg('width', 1440));
const HEIGHT = Number(arg('height', 960));
const ROUTES = arg('routes', '/dashboard').split(',').map((r) => r.trim()).filter(Boolean);

/** Console noise that is not worth failing a page over. */
const IGNORED = [
  /Download the React DevTools/i,
  /favicon/i,
  /Extra attributes from the server/i,
  /was preloaded using link preload/i,
  // /auth/me returns 401 before sign-in — that is the expected answer.
  /status of 401/i,
];

await mkdir(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1440,960'],
});

const page = await browser.newPage();
await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 2 });

// Set this explicitly for BOTH values: headless Chrome's default is not
// guaranteed, and a run that silently renders the other palette is a
// screenshot that verifies the wrong thing.
await page.emulateMediaFeatures([
  { name: 'prefers-color-scheme', value: THEME === 'dark' ? 'dark' : 'light' },
]);

/*
 * Light is the product default and is stamped on the root before first
 * paint, so `prefers-color-scheme` alone can no longer produce a dark
 * render. Seed the stored preference the way a real viewer's toggle would,
 * before any page script runs.
 */
await page.evaluateOnNewDocument((theme) => {
  try {
    localStorage.setItem('kormo-theme', theme);
  } catch {
    // Storage blocked — the default stamp applies.
  }
}, THEME === 'dark' ? 'dark' : 'light');

let problems = [];
let currentRoute = 'startup';

page.on('console', (message) => {
  if (message.type() !== 'error' && message.type() !== 'warning') return;
  const text = message.text();
  if (IGNORED.some((pattern) => pattern.test(text))) return;
  problems.push({ route: currentRoute, kind: `console.${message.type()}`, text: text.slice(0, 400) });
});

page.on('pageerror', (error) => {
  problems.push({ route: currentRoute, kind: 'pageerror', text: String(error).slice(0, 400) });
});

page.on('requestfailed', (request) => {
  const failure = request.failure()?.errorText ?? 'unknown';
  if (/net::ERR_ABORTED/.test(failure)) return; // navigation churn
  problems.push({ route: currentRoute, kind: 'requestfailed', text: `${request.url()} — ${failure}` });
});

page.on('response', (response) => {
  const status = response.status();
  if (status < 400) return;
  // 401 on /auth/me before sign-in is expected.
  if (status === 401 && response.url().includes('/auth/')) return;
  problems.push({ route: currentRoute, kind: `http${status}`, text: response.url() });
});

// ── sign in ───────────────────────────────────────────────────────────
currentRoute = '/login';
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2', timeout: 60_000 });
await page.screenshot({ path: join(OUT, `00-login-${THEME}.png`), fullPage: true });

// Wait for React to hydrate before typing. Until it has, keystrokes land in
// the DOM but never reach component state, so the form looks filled while the
// submit button stays disabled — which is exactly how this failed silently at
// narrow viewports, where the first paint beats hydration by a wider margin.
await page.waitForSelector('#identifier', { timeout: 60_000 });
await page.waitForFunction(
  () => {
    const field = document.querySelector('#identifier');
    return !!field && Object.keys(field).some((key) => key.startsWith('__react'));
  },
  { timeout: 60_000, polling: 100 },
);

await page.type('#identifier', USER);
await page.type('#password', PASSWORD);

// The button enables only once both values are in state, so this is the
// assertion that the typing actually took.
await page.waitForFunction(
  () => document.querySelector('button[type="submit"]')?.disabled === false,
  { timeout: 15_000, polling: 100 },
).catch(() => {
  throw new Error('the sign-in form never became submittable — typing did not reach React state');
});

await Promise.all([
  page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60_000 }),
  page.click('button[type="submit"]'),
]);

const landed = new URL(page.url()).pathname;
if (landed === '/login') {
  const message = await page
    .$eval('[role="alert"]', (element) => element.textContent)
    .catch(() => 'unknown reason');
  console.error(`✗ sign-in failed for "${USER}": ${message}`);
  await page.screenshot({ path: join(OUT, '00-login-failed.png'), fullPage: true });
  await browser.close();
  process.exit(1);
}
console.log(`✓ signed in as ${USER} → ${landed}`);

// ── walk the routes ───────────────────────────────────────────────────
const results = [];
for (const [index, route] of ROUTES.entries()) {
  currentRoute = route;
  const before = problems.length;
  try {
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle2', timeout: 60_000 });

    /*
     * Wait for the data to actually arrive rather than for a fixed delay.
     * A fixed sleep silently screenshots loading skeletons, which is a
     * check that passes while showing nothing — so poll until no
     * skeleton placeholders remain (or give up and report it).
     */
    let settled = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      const state = await page.evaluate(() => ({
        skeletons: document.querySelectorAll('.skeleton').length,
        // An h1 only exists once the real page content has mounted, so
        // this also catches the app shell's own loading gate.
        hasHeading: Boolean(document.querySelector('h1')),
      }));
      if (state.skeletons === 0 && state.hasHeading) { settled = true; break; }
      await new Promise((r) => setTimeout(r, 250));
    }
    // Let chart transitions land once the data is in.
    await new Promise((r) => setTimeout(r, settled ? 500 : 1500));
    if (!settled) {
      problems.push({
        route,
        kind: 'stuck-loading',
        text: 'still loading after 15s — a query never resolved, or no <h1> rendered',
      });
    }

    const slug = route.replace(/^\//, '').replace(/[/?=&]/g, '-') || 'root';
    const file = `${String(index + 1).padStart(2, '0')}-${slug}-${THEME}.png`;
    await page.screenshot({ path: join(OUT, file), fullPage: true });

    // Catch the "renders but is empty" case explicitly.
    const probe = await page.evaluate(() => ({
      title: document.querySelector('h1')?.textContent?.trim() ?? null,
      textLength: document.body.innerText.trim().length,
      skeletons: document.querySelectorAll('.skeleton').length,
      hasErrorBoundary: /Application error|Unhandled Runtime Error/i.test(document.body.innerText),
    }));

    const routeProblems = problems.slice(before);
    results.push({ route, file, ...probe, problems: routeProblems.length });

    const flag = probe.hasErrorBoundary
      ? '✗ runtime error'
      : routeProblems.length > 0
        ? `⚠ ${routeProblems.length} issue(s)`
        : probe.textLength < 200
          ? '⚠ nearly empty'
          : '✓';
    console.log(`${flag}  ${route.padEnd(40)} h1="${probe.title ?? '—'}" text=${probe.textLength}`);
  } catch (error) {
    results.push({ route, error: String(error).slice(0, 200) });
    console.log(`✗  ${route.padEnd(40)} ${String(error).slice(0, 120)}`);
  }
}

await writeFile(
  join(OUT, `report-${USER}-${THEME}.json`),
  JSON.stringify({ user: USER, theme: THEME, results, problems }, null, 2),
);

await browser.close();

console.log(`\nscreenshots → ${OUT}`);
if (problems.length > 0) {
  console.log(`\n${problems.length} problem(s):`);
  const seen = new Set();
  for (const problem of problems) {
    const key = `${problem.route}|${problem.kind}|${problem.text.slice(0, 120)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(`  [${problem.route}] ${problem.kind}: ${problem.text.slice(0, 200)}`);
  }
  process.exit(1);
}
console.log('\n✓ no console errors, failed requests, or 4xx/5xx responses');
