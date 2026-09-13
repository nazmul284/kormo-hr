/**
 * The GitHub Pages demo is the same app with no server behind it:
 * `output: 'export'` writes a folder of static files, and the API client
 * answers from a recorded fixture bundle instead (see src/lib/demo.ts).
 *
 * Two Next features are unavailable in that mode and are therefore
 * omitted rather than left to fail at build time: `rewrites` (there is no
 * proxy — every request is served from disk) and `headers` (no server to
 * set them; the equivalents are set by GitHub Pages or not at all).
 */
const isDemoExport = process.env.NEXT_PUBLIC_DEMO_MODE === '1';

/**
 * GitHub Pages serves a project site from `/<repo>`, so every asset and
 * route needs that prefix. Left empty for a custom domain or a local
 * preview, where the app sits at the root.
 *
 * NOTE: `distDir` does not fully isolate an export build — Next still
 * writes its manifests and trace files to `.next` even when `distDir` is
 * set elsewhere, and those carry `basePath` baked in. A `next dev` that
 * is running at the time then starts serving `/<repo>/_next/...` URLs it
 * cannot answer. `build:demo` therefore deletes `.next` when it
 * finishes, and you should stop `next dev` before running it.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  /*
   * `next build` writes to `.next` by default, which clobbers a running
   * `next dev` and leaves its chunk map stale — every route then 500s with
   * MODULE_NOT_FOUND until dev is restarted. The build script sets
   * NEXT_DIST_DIR so the two can coexist.
   */
  distDir: process.env.NEXT_DIST_DIR || '.next',

  // The shared domain package is consumed straight from source.
  transpilePackages: ['@kormo/shared'],

  ...(isDemoExport
    ? {
        output: 'export',
        basePath,
        assetPrefix: basePath || undefined,
        // Pages has no image optimiser, and every image in the app is
        // either an SVG from brand/ or a data URI, so there is nothing
        // being given up here.
        images: { unoptimized: true },
        // Emit `/leave/index.html` rather than `/leave.html`, which is
        // what Pages needs to serve a clean URL without a redirect.
        trailingSlash: true,
      }
    : {}),

  /**
   * Proxy the API onto this app's own origin.
   *
   * The system this replaces served its API from a non-standard port
   * (`:46002`), which made every single request a cross-origin one and
   * paid for a CORS preflight before it. Same-origin removes that
   * round-trip entirely and lets the auth cookies be plain `sameSite=lax`
   * rather than third-party.
   */
  async rewrites() {
    if (isDemoExport) return [];
    const target = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
    return [{ source: '/api/:path*', destination: `${target}/api/:path*` }];
  },

  async headers() {
    if (isDemoExport) return [];
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
        ],
      },
    ];
  },

  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
