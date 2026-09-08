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
    const target = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
    return [{ source: '/api/:path*', destination: `${target}/api/:path*` }];
  },

  async headers() {
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
